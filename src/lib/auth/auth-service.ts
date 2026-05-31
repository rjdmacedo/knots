/**
 * Auth Service Layer — central orchestrator for authentication operations.
 * Delegates session management to NextAuth but handles registration,
 * verification, password reset, and rate limiting.
 */

import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import {
  emailService as realEmailService,
  type EmailService,
} from './email-service'
import { hashPassword, validatePassword, verifyPassword } from './password'
import {
  EMAIL_RESEND_RATE_LIMIT,
  PASSWORD_RESET_RATE_LIMIT,
  rateLimiter,
} from './rate-limiter'
import { tokenManager } from './token-manager'

export interface RegisterInput {
  name: string
  email: string
  password: string
}

export interface ResetPasswordInput {
  token: string
  newPassword: string
}

export interface AuthService {
  register(
    input: RegisterInput,
  ): Promise<{ ok: true; userId: string } | { ok: false; error: AuthError }>
  verifyEmail(
    token: string,
  ): Promise<{ ok: true } | { ok: false; error: AuthError }>
  resendVerification(
    email: string,
  ): Promise<{ ok: true } | { ok: false; error: AuthError }>
  validateCredentials(
    email: string,
    password: string,
  ): Promise<{ id: string; email: string; emailVerified: Date | null } | null>
  requestPasswordReset(
    email: string,
  ): Promise<{ ok: true } | { ok: false; error: AuthError }>
  resetPassword(
    input: ResetPasswordInput,
  ): Promise<{ ok: true } | { ok: false; error: AuthError }>
}

export type AuthError =
  | { code: 'INVALID_EMAIL'; message: string }
  | {
      code: 'INVALID_PASSWORD'
      message: string
      errors: string[]
    }
  | { code: 'EMAIL_EXISTS'; message: string }
  | { code: 'INVALID_CREDENTIALS'; message: string }
  | { code: 'EMAIL_NOT_VERIFIED'; message: string }
  | { code: 'RATE_LIMITED'; message: string; retryAfter: Date }
  | { code: 'TOKEN_EXPIRED'; message: string }
  | { code: 'TOKEN_USED'; message: string }
  | { code: 'TOKEN_INVALID'; message: string }
  | { code: 'SESSION_EXPIRED'; message: string }
  | { code: 'NOT_MEMBER'; message: string }
  | { code: 'GROUP_LIMIT_REACHED'; message: string }
  | { code: 'INVITATION_INVALID'; message: string }
  | { code: 'EMAIL_DELIVERY_FAILED'; message: string }

const emailSchema = z.string().email()

/**
 * Placeholder email service used until task 7.1 implements the real one.
 * Logs the email action and returns success.
 */
const placeholderEmailService: EmailService = {
  async sendVerificationEmail(to: string, _token: string) {
    console.log(`[EmailService] Would send verification email to ${to}`)
    return { ok: true as const }
  },
  async sendPasswordResetEmail(to: string, _token: string) {
    console.log(`[EmailService] Would send password reset email to ${to}`)
    return { ok: true as const }
  },
  async sendInvitationEmail(
    to: string,
    groupName: string,
    _inviteLink: string,
  ) {
    console.log(
      `[EmailService] Would send invitation email to ${to} for group ${groupName}`,
    )
    return { ok: true as const }
  },
}

function createAuthService(emailService: EmailService): AuthService {
  return {
    async register(
      input: RegisterInput,
    ): Promise<{ ok: true; userId: string } | { ok: false; error: AuthError }> {
      const normalizedEmail = input.email.toLowerCase().trim()

      // Validate email format
      const emailResult = emailSchema.safeParse(normalizedEmail)
      if (!emailResult.success) {
        return {
          ok: false,
          error: {
            code: 'INVALID_EMAIL',
            message: 'Please provide a valid email address.',
          },
        }
      }

      // Validate password
      const passwordResult = validatePassword(input.password)
      if (!passwordResult.valid) {
        return {
          ok: false,
          error: {
            code: 'INVALID_PASSWORD',
            message: 'Password does not meet requirements.',
            errors: passwordResult.errors,
          },
        }
      }

      // Check email uniqueness
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      })
      if (existingUser) {
        return {
          ok: false,
          error: {
            code: 'EMAIL_EXISTS',
            message: 'An account with this email already exists.',
          },
        }
      }

      // Hash password and create user
      const passwordHash = await hashPassword(input.password)
      const user = await prisma.user.create({
        data: {
          name: input.name.trim(),
          email: normalizedEmail,
          passwordHash,
        },
      })

      // Create verification token and send email
      const token = await tokenManager.createVerificationToken(user.id)
      const emailResult2 = await emailService.sendVerificationEmail(
        normalizedEmail,
        token,
      )

      if (!emailResult2.ok) {
        // User is created but email failed — log but still return success
        // The user can resend the verification email later
        console.error(
          `[AuthService] Failed to send verification email to ${normalizedEmail}`,
        )
      }

      return { ok: true, userId: user.id }
    },

    async validateCredentials(
      email: string,
      password: string,
    ): Promise<{
      id: string
      email: string
      emailVerified: Date | null
    } | null> {
      const normalizedEmail = email.toLowerCase().trim()

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      })

      if (!user) return null

      // Reject unverified accounts
      if (!user.emailVerified) return null

      const isValid = await verifyPassword(password, user.passwordHash)
      if (!isValid) return null

      return {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
      }
    },

    async verifyEmail(
      token: string,
    ): Promise<{ ok: true } | { ok: false; error: AuthError }> {
      const result = await tokenManager.validateVerificationToken(token)

      if (!result.ok) {
        const errorMap: Record<string, AuthError> = {
          EXPIRED: {
            code: 'TOKEN_EXPIRED',
            message:
              'This verification link has expired. Please request a new one.',
          },
          USED: {
            code: 'TOKEN_USED',
            message: 'This verification link has already been used.',
          },
          INVALID: {
            code: 'TOKEN_INVALID',
            message: 'This verification link is invalid.',
          },
        }
        return { ok: false, error: errorMap[result.error]! }
      }

      // Set emailVerified to current timestamp
      await prisma.user.update({
        where: { id: result.userId },
        data: { emailVerified: new Date() },
      })

      return { ok: true }
    },

    async resendVerification(
      email: string,
    ): Promise<{ ok: true } | { ok: false; error: AuthError }> {
      const normalizedEmail = email.toLowerCase().trim()

      // Check rate limit
      const rateLimitKey = `email_resend:${normalizedEmail}`
      const limitResult = await rateLimiter.checkLimit(
        rateLimitKey,
        EMAIL_RESEND_RATE_LIMIT,
      )

      if (!limitResult.allowed) {
        return {
          ok: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many resend attempts. Please try again later.',
            retryAfter: limitResult.resetAt!,
          },
        }
      }

      // Look up user
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      })

      // If user doesn't exist or is already verified, return success silently
      // to avoid leaking account existence
      if (!user || user.emailVerified) {
        return { ok: true }
      }

      // Record the attempt
      await rateLimiter.recordAttempt(rateLimitKey, EMAIL_RESEND_RATE_LIMIT)

      // Invalidate old verification tokens and create a new one
      await tokenManager.invalidateUserTokens(user.id, 'EMAIL_VERIFICATION')
      const token = await tokenManager.createVerificationToken(user.id)

      const emailResult = await emailService.sendVerificationEmail(
        normalizedEmail,
        token,
      )

      if (!emailResult.ok) {
        return {
          ok: false,
          error: {
            code: 'EMAIL_DELIVERY_FAILED',
            message:
              'Verification email could not be sent. Please try again later.',
          },
        }
      }

      return { ok: true }
    },

    async requestPasswordReset(
      email: string,
    ): Promise<{ ok: true } | { ok: false; error: AuthError }> {
      const normalizedEmail = email.toLowerCase().trim()

      // Check rate limit
      const rateLimitKey = `password_reset:${normalizedEmail}`
      const limitResult = await rateLimiter.checkLimit(
        rateLimitKey,
        PASSWORD_RESET_RATE_LIMIT,
      )

      if (!limitResult.allowed) {
        return {
          ok: false,
          error: {
            code: 'RATE_LIMITED',
            message:
              'Too many password reset attempts. Please try again later.',
            retryAfter: limitResult.resetAt!,
          },
        }
      }

      // Record the attempt
      await rateLimiter.recordAttempt(rateLimitKey, PASSWORD_RESET_RATE_LIMIT)

      // Look up user by email
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      })

      // If user exists, invalidate old tokens, create new one, and send email
      if (user) {
        await tokenManager.invalidateUserTokens(user.id, 'PASSWORD_RESET')
        const token = await tokenManager.createPasswordResetToken(user.id)
        await emailService.sendPasswordResetEmail(normalizedEmail, token)
      }

      // Always return success to prevent email enumeration
      return { ok: true }
    },

    async resetPassword(
      input: ResetPasswordInput,
    ): Promise<{ ok: true } | { ok: false; error: AuthError }> {
      // Validate the token
      const tokenResult = await tokenManager.validatePasswordResetToken(
        input.token,
      )

      if (!tokenResult.ok) {
        const errorMap: Record<string, AuthError> = {
          EXPIRED: {
            code: 'TOKEN_EXPIRED',
            message:
              'This password reset link has expired. Please request a new one.',
          },
          USED: {
            code: 'TOKEN_USED',
            message: 'This password reset link has already been used.',
          },
          INVALID: {
            code: 'TOKEN_INVALID',
            message: 'This password reset link is invalid.',
          },
        }
        return { ok: false, error: errorMap[tokenResult.error]! }
      }

      // Validate the new password
      const passwordResult = validatePassword(input.newPassword)
      if (!passwordResult.valid) {
        return {
          ok: false,
          error: {
            code: 'INVALID_PASSWORD',
            message: 'Password does not meet requirements.',
            errors: passwordResult.errors,
          },
        }
      }

      // Hash the new password
      const passwordHash = await hashPassword(input.newPassword)

      // Update the user's password
      await prisma.user.update({
        where: { id: tokenResult.userId },
        data: { passwordHash },
      })

      // Invalidate all password reset tokens for this user
      await tokenManager.invalidateUserTokens(
        tokenResult.userId,
        'PASSWORD_RESET',
      )

      // Delete all sessions for this user
      await prisma.session.deleteMany({
        where: { userId: tokenResult.userId },
      })

      return { ok: true }
    },
  }
}

/** Singleton auth service instance */
export const authService: AuthService = createAuthService(realEmailService)
