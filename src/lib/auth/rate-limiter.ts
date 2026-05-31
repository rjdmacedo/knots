/**
 * Database-backed rate limiter for login attempts,
 * password resets, and email resends.
 */

import { prisma } from '@/lib/prisma'

export interface RateLimitConfig {
  maxAttempts: number
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  remainingAttempts: number
  resetAt: Date | null
}

export interface RateLimiter {
  checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult>
  recordAttempt(key: string, config: RateLimitConfig): Promise<void>
  resetAttempts(key: string): Promise<void>
}

class DatabaseRateLimiter implements RateLimiter {
  async checkLimit(
    key: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const windowStart = new Date(Date.now() - config.windowMs)

    const attempts = await prisma.rateLimitAttempt.count({
      where: {
        key,
        createdAt: { gte: windowStart },
      },
    })

    const allowed = attempts < config.maxAttempts
    const remainingAttempts = Math.max(0, config.maxAttempts - attempts)

    let resetAt: Date | null = null
    if (!allowed) {
      const oldestAttempt = await prisma.rateLimitAttempt.findFirst({
        where: {
          key,
          createdAt: { gte: windowStart },
        },
        orderBy: { createdAt: 'asc' },
      })
      if (oldestAttempt) {
        resetAt = new Date(oldestAttempt.createdAt.getTime() + config.windowMs)
      }
    }

    return { allowed, remainingAttempts, resetAt }
  }

  async recordAttempt(key: string, _config: RateLimitConfig): Promise<void> {
    await prisma.rateLimitAttempt.create({
      data: { key },
    })
  }

  async resetAttempts(key: string): Promise<void> {
    await prisma.rateLimitAttempt.deleteMany({
      where: { key },
    })
  }
}

/** Singleton rate limiter instance */
export const rateLimiter: RateLimiter = new DatabaseRateLimiter()

/** Rate limit config for login attempts: 5 attempts per 15 minutes */
export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
}

/** Rate limit config for password reset requests: 3 attempts per 15 minutes */
export const PASSWORD_RESET_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 3,
  windowMs: 15 * 60 * 1000,
}

/** Rate limit config for email resend requests: 5 attempts per 1 hour */
export const EMAIL_RESEND_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 5,
  windowMs: 60 * 60 * 1000,
}
