/**
 * Token Manager for email verification and password reset tokens.
 * Session tokens are managed entirely by NextAuth.
 */

import { prisma } from '@/lib/prisma'
import { TokenType as PrismaTokenType } from '@prisma/client'
import crypto from 'crypto'

export type TokenType = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET'
export type TokenError = 'EXPIRED' | 'USED' | 'INVALID'

export type TokenValidationResult =
  | { ok: true; userId: string }
  | { ok: false; error: TokenError }

export interface TokenManager {
  createVerificationToken(userId: string): Promise<string>
  validateVerificationToken(token: string): Promise<TokenValidationResult>
  createPasswordResetToken(userId: string): Promise<string>
  validatePasswordResetToken(token: string): Promise<TokenValidationResult>
  invalidateUserTokens(userId: string, type: TokenType): Promise<void>
}

/** 24 hours in milliseconds */
const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000
/** 1 hour in milliseconds */
const PASSWORD_RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000

/**
 * Generates a cryptographically random token string.
 */
function generateRawToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Hashes a raw token using SHA-256 for secure storage.
 * The raw token is never stored in the database.
 */
function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

/**
 * Creates a token manager instance that uses Prisma for persistence.
 */
export function createTokenManager(): TokenManager {
  return {
    async createVerificationToken(userId: string): Promise<string> {
      const rawToken = generateRawToken()
      const hash = hashToken(rawToken)
      const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS)

      await prisma.token.create({
        data: {
          userId,
          type: PrismaTokenType.EMAIL_VERIFICATION,
          hash,
          expiresAt,
        },
      })

      return rawToken
    },

    async createPasswordResetToken(userId: string): Promise<string> {
      const rawToken = generateRawToken()
      const hash = hashToken(rawToken)
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MS)

      await prisma.token.create({
        data: {
          userId,
          type: PrismaTokenType.PASSWORD_RESET,
          hash,
          expiresAt,
        },
      })

      return rawToken
    },

    async validateVerificationToken(
      token: string,
    ): Promise<TokenValidationResult> {
      return validateToken(token, PrismaTokenType.EMAIL_VERIFICATION)
    },

    async validatePasswordResetToken(
      token: string,
    ): Promise<TokenValidationResult> {
      return validateToken(token, PrismaTokenType.PASSWORD_RESET)
    },

    async invalidateUserTokens(userId: string, type: TokenType): Promise<void> {
      await prisma.token.deleteMany({
        where: {
          userId,
          type: type as PrismaTokenType,
        },
      })
    },
  }
}

/**
 * Validates a token by hashing the raw input and looking up the hash in the database.
 * Checks that the token exists, has not been used, and has not expired.
 * On success, marks the token as used and returns the associated userId.
 */
async function validateToken(
  rawToken: string,
  expectedType: PrismaTokenType,
): Promise<TokenValidationResult> {
  const hash = hashToken(rawToken)

  const tokenRecord = await prisma.token.findUnique({
    where: { hash },
  })

  // Token isn't found or wrong type
  if (!tokenRecord || tokenRecord.type !== expectedType) {
    return { ok: false, error: 'INVALID' }
  }

  // Token already used
  if (tokenRecord.usedAt !== null) {
    return { ok: false, error: 'USED' }
  }

  // Token expired
  if (tokenRecord.expiresAt < new Date()) {
    return { ok: false, error: 'EXPIRED' }
  }

  // Mark as used
  await prisma.token.update({
    where: { id: tokenRecord.id },
    data: { usedAt: new Date() },
  })

  return { ok: true, userId: tokenRecord.userId }
}

/** Singleton token manager instance */
export const tokenManager = createTokenManager()
