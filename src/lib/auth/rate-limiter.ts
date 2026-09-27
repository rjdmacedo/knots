/**
 * Database-backed rate limiter for login attempts,
 * password resets, and email resends.
 */

import { prisma } from '@/lib/prisma'
import { createHmac } from 'node:crypto'

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

/** Rate limit config for magic-link sign-in emails: 10 attempts per 1 hour (matching Spliit Cloud) */
export const MAGIC_LINK_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 10,
  windowMs: 60 * 60 * 1000,
}

/** Rate limit config for email resend requests: 5 attempts per 1 hour */
export const EMAIL_RESEND_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 5,
  windowMs: 60 * 60 * 1000,
}

/** Rate limit config for email-change code sends: 5 attempts per 1 hour */
export const EMAIL_CHANGE_SEND_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 5,
  windowMs: 60 * 60 * 1000,
}

/** Rate limit config for email-change code confirmations: 10 attempts per 15 minutes */
export const EMAIL_CHANGE_CONFIRM_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 10,
  windowMs: 15 * 60 * 1000,
}

type Bucket = { count: number; resetAt: number }

export type RateLimitDecision = {
  allowed: boolean
  /** Seconds until the window resets; 0 when the request is allowed. */
  retryAfterSeconds: number
}

/**
 * Process-local fixed-window rate limiter matching Spliit Cloud.
 * Counters are intentionally kept in memory: they are a best-effort abuse brake
 * for a single replica, not a globally consistent quota. The map is bounded —
 * expired buckets are evicted first, then the soonest-resetting ones — so it
 * cannot grow without limit as new client IPs or accounts appear.
 */
export class FixedWindowLimiter {
  private readonly buckets = new Map<string, Bucket>()

  constructor(
    private readonly options: {
      limit: number
      windowMs: number
      maxKeys?: number
    },
  ) {}

  hit(
    key: string,
    now: number = Date.now(),
    cost: number = 1,
  ): RateLimitDecision {
    if (!Number.isSafeInteger(cost) || cost <= 0) {
      throw new RangeError('Rate-limit cost must be a positive safe integer')
    }
    this.evict(now)
    const existing = this.buckets.get(key)
    const bucket: Bucket =
      !existing || existing.resetAt <= now
        ? { count: 0, resetAt: now + this.options.windowMs }
        : existing
    bucket.count += cost
    this.buckets.set(key, bucket)
    if (bucket.count > this.options.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((bucket.resetAt - now) / 1000),
        ),
      }
    }
    return { allowed: true, retryAfterSeconds: 0 }
  }

  get size(): number {
    return this.buckets.size
  }

  clear(): void {
    this.buckets.clear()
  }

  private evict(now: number): void {
    const maxKeys = this.options.maxKeys ?? 10_000
    if (this.buckets.size < maxKeys) return
    this.buckets.forEach((bucket, key) => {
      if (bucket.resetAt <= now) this.buckets.delete(key)
    })
    if (this.buckets.size < maxKeys) return
    const overflow = this.buckets.size - maxKeys + 1
    const soonest = Array.from(this.buckets.entries())
      .sort((a, b) => a[1].resetAt - b[1].resetAt)
      .slice(0, overflow)
    soonest.forEach(([key]) => this.buckets.delete(key))
  }
}

/** Keep abuse logs and rate limit keys correlatable without recording raw accounts or emails. */
export function hashRateLimitIdentity(value: string): string {
  const secret = process.env.AUTH_SECRET || 'knots-rate-limit-secret'
  return createHmac('sha256', secret).update(value).digest('hex').slice(0, 16)
}

/**
 * In-memory recipient-based rate limiter matching Spliit Cloud:
 * 10 emails per 1 hour window.
 */
export const authEmailRecipientLimiter = new FixedWindowLimiter({
  limit: 10,
  windowMs: 60 * 60 * 1000,
})
