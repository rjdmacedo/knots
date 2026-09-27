/**
 * Email Change Service — handles the hashed one-time-code flow that lets a
 * signed-in user change their account email.
 *
 * Design (see design.md decision 4 and the Security section):
 * - A challenge stores only a SHA-256 hash of the 6-digit code, never the code.
 * - Sending a new code replaces any previous challenge for that user.
 * - The plaintext code is only ever passed to the email service; it is never
 *   logged or persisted.
 * - Send and confirm are both rate-limited per user with the shared auth
 *   rate limiter.
 * - Confirm compares the hash, checks expiry and the attempt cap, then swaps
 *   `User.email` and sets `emailVerified` inside a single transaction that
 *   also rejects a unique collision (EMAIL_IN_USE).
 */

import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { prepareNewEmail } from './email-address'
import {
  emailService as realEmailService,
  type EmailService,
} from './email-service'
import {
  EMAIL_CHANGE_CONFIRM_RATE_LIMIT,
  EMAIL_CHANGE_SEND_RATE_LIMIT,
  rateLimiter,
  type RateLimiter,
} from './rate-limiter'

/** 15 minutes in milliseconds */
const CHALLENGE_EXPIRY_MS = 15 * 60 * 1000

/** Maximum number of confirm attempts against a single challenge. */
const MAX_ATTEMPTS = 5

export type EmailChangeError =
  | 'INVALID_EMAIL'
  | 'SAME_EMAIL'
  | 'EMAIL_IN_USE'
  | 'INVALID_OTP'
  | 'OTP_EXPIRED'
  | 'RATE_LIMITED'
  | 'EMAIL_SEND_FAILED'

export type EmailChangeResult =
  | { ok: true }
  | { ok: false; error: EmailChangeError }

export interface RequestEmailChangeInput {
  userId: string
  currentEmail: string
  newEmail: string
}

export interface ConfirmEmailChangeInput {
  userId: string
  newEmail: string
  code: string
}

export interface EmailChangeService {
  requestEmailChange(input: RequestEmailChangeInput): Promise<EmailChangeResult>
  confirmEmailChange(input: ConfirmEmailChangeInput): Promise<EmailChangeResult>
}

/**
 * Generates a random 6-digit numeric code (000000–999999), zero-padded.
 * Uses crypto for uniform, unpredictable values.
 */
export function generateEmailChangeCode(): string {
  // crypto.randomInt is uniform over [0, 1_000_000)
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
}

/**
 * Hashes a code using SHA-256, matching how other auth tokens are hashed
 * (see token-manager.ts). The plaintext code is never stored.
 */
export function hashEmailChangeCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

/**
 * Detects a Prisma unique-constraint violation (error code P2002) without
 * relying on the concrete error class, which keeps this testable across
 * runtimes.
 */
function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  )
}

function createEmailChangeService(
  emailService: EmailService,
  limiter: RateLimiter,
): EmailChangeService {
  return {
    async requestEmailChange(
      input: RequestEmailChangeInput,
    ): Promise<EmailChangeResult> {
      // Normalize + validate the candidate against the current address.
      const prepared = prepareNewEmail(input.newEmail, input.currentEmail)
      if (!prepared.ok) {
        return { ok: false, error: prepared.error }
      }
      const newEmail = prepared.email

      // Rate-limit sends per user.
      const rateLimitKey = `email_change_send:${input.userId}`
      const limit = await limiter.checkLimit(
        rateLimitKey,
        EMAIL_CHANGE_SEND_RATE_LIMIT,
      )
      if (!limit.allowed) {
        return { ok: false, error: 'RATE_LIMITED' }
      }

      // Reject an address already used by another user.
      const existing = await prisma.user.findUnique({
        where: { email: newEmail },
      })
      if (existing && existing.id !== input.userId) {
        return { ok: false, error: 'EMAIL_IN_USE' }
      }

      const code = generateEmailChangeCode()
      const codeHash = hashEmailChangeCode(code)
      const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRY_MS)

      // Send the code first. If delivery is not configured or fails, do not
      // create the challenge and do not change anything.
      let sendResult: { ok: true } | { ok: false; error: string }
      try {
        sendResult = await emailService.sendEmailChangeCodeEmail(newEmail, code)
      } catch {
        // e.g. RESEND_API_KEY is not set — treat as a delivery failure.
        sendResult = { ok: false, error: 'delivery-unavailable' }
      }
      if (!sendResult.ok) {
        return { ok: false, error: 'EMAIL_SEND_FAILED' }
      }

      // Record the attempt only after a successful send.
      await limiter.recordAttempt(rateLimitKey, EMAIL_CHANGE_SEND_RATE_LIMIT)

      // Replace any previous challenge for this user, then create the new one.
      await prisma.$transaction([
        prisma.emailChangeChallenge.deleteMany({
          where: { userId: input.userId },
        }),
        prisma.emailChangeChallenge.create({
          data: {
            userId: input.userId,
            newEmail,
            codeHash,
            expiresAt,
          },
        }),
      ])

      return { ok: true }
    },

    async confirmEmailChange(
      input: ConfirmEmailChangeInput,
    ): Promise<EmailChangeResult> {
      const newEmail = input.newEmail.trim().toLowerCase()

      // Rate-limit confirmations per user.
      const rateLimitKey = `email_change_confirm:${input.userId}`
      const limit = await limiter.checkLimit(
        rateLimitKey,
        EMAIL_CHANGE_CONFIRM_RATE_LIMIT,
      )
      if (!limit.allowed) {
        return { ok: false, error: 'RATE_LIMITED' }
      }
      await limiter.recordAttempt(rateLimitKey, EMAIL_CHANGE_CONFIRM_RATE_LIMIT)

      const challenge = await prisma.emailChangeChallenge.findFirst({
        where: { userId: input.userId, newEmail },
        orderBy: { createdAt: 'desc' },
      })

      if (!challenge) {
        return { ok: false, error: 'INVALID_OTP' }
      }

      // Expired challenge: remove it and report expiry.
      if (challenge.expiresAt < new Date()) {
        await prisma.emailChangeChallenge.delete({
          where: { id: challenge.id },
        })
        return { ok: false, error: 'OTP_EXPIRED' }
      }

      // Attempt cap reached: invalidate and reject.
      if (challenge.attempts >= MAX_ATTEMPTS) {
        await prisma.emailChangeChallenge.delete({
          where: { id: challenge.id },
        })
        return { ok: false, error: 'INVALID_OTP' }
      }

      const codeHash = hashEmailChangeCode(input.code)
      if (codeHash !== challenge.codeHash) {
        // Wrong code: increment the attempt counter. If this exhausts the
        // cap, invalidate the challenge so it cannot be retried.
        const nextAttempts = challenge.attempts + 1
        if (nextAttempts >= MAX_ATTEMPTS) {
          await prisma.emailChangeChallenge.delete({
            where: { id: challenge.id },
          })
        } else {
          await prisma.emailChangeChallenge.update({
            where: { id: challenge.id },
            data: { attempts: nextAttempts },
          })
        }
        return { ok: false, error: 'INVALID_OTP' }
      }

      // Correct code: swap the email and mark it verified, then consume the
      // challenge, all in one transaction. A unique collision means another
      // user claimed the address between send and confirm.
      try {
        await prisma.$transaction([
          prisma.user.update({
            where: { id: input.userId },
            data: { email: newEmail, emailVerified: new Date() },
          }),
          prisma.emailChangeChallenge.deleteMany({
            where: { userId: input.userId },
          }),
        ])
      } catch (err) {
        // A Prisma unique-constraint violation (P2002) means another user
        // claimed the address between send and confirm.
        if (isUniqueConstraintError(err)) {
          return { ok: false, error: 'EMAIL_IN_USE' }
        }
        throw err
      }

      return { ok: true }
    },
  }
}

/** Singleton email change service instance */
export const emailChangeService: EmailChangeService = createEmailChangeService(
  realEmailService,
  rateLimiter,
)

export { createEmailChangeService }
