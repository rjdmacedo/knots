/**
 * Magic-link token consumption and the request that sends the email.
 *
 * Unknown and unverified addresses get the same success response and no email.
 * A token that is expired, already used, or unknown cannot create a session.
 */

import { authService } from '@/lib/auth/auth-service'
import { emailService } from '@/lib/auth/email-service'
import { authEmailRecipientLimiter } from '@/lib/auth/rate-limiter'
import { tokenManager } from '@/lib/auth/token-manager'
import { prisma } from '@/lib/prisma'
import { TokenType } from '@prisma/client'

jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    token: { findUnique: jest.fn(), update: jest.fn() },
  },
}))

jest.mock('@/lib/auth/rate-limiter', () => {
  const actual = jest.requireActual('@/lib/auth/rate-limiter')
  return {
    ...actual,
    MAGIC_LINK_RATE_LIMIT: { maxAttempts: 10, windowMs: 60 * 60 * 1000 },
    EMAIL_RESEND_RATE_LIMIT: { maxAttempts: 5, windowMs: 60 * 60 * 1000 },
    PASSWORD_RESET_RATE_LIMIT: { maxAttempts: 3, windowMs: 15 * 60 * 1000 },
    rateLimiter: {
      checkLimit: jest.fn().mockResolvedValue({ allowed: true }),
      recordAttempt: jest.fn().mockResolvedValue(undefined),
    },
    authEmailRecipientLimiter: new actual.FixedWindowLimiter({
      limit: 10,
      windowMs: 60 * 60 * 1000,
    }),
  }
})

jest.mock('@/lib/auth/token-manager', () => ({
  tokenManager: {
    invalidateUserTokens: jest.fn().mockResolvedValue(undefined),
    createMagicLinkToken: jest.fn().mockResolvedValue('raw-token'),
    validateMagicLinkToken: jest.fn(),
  },
}))

jest.mock('@/lib/auth/email-service', () => ({
  emailService: {
    sendMagicLinkEmail: jest.fn().mockResolvedValue({ ok: true }),
  },
}))

const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockSend = emailService.sendMagicLinkEmail as jest.Mock
const mockInvalidate = tokenManager.invalidateUserTokens as jest.Mock
const mockCreate = tokenManager.createMagicLinkToken as jest.Mock

describe('requestMagicLink', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    authEmailRecipientLimiter.clear()
  })

  it('returns success and sends nothing for an unknown email', async () => {
    mockUserFindUnique.mockResolvedValue(null)

    const result = await authService.requestMagicLink('missing@example.com')

    expect(result).toEqual({ ok: true })
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns success and sends nothing when the email is not verified', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      emailVerified: null,
    })

    const result = await authService.requestMagicLink('rafael@example.com')

    expect(result).toEqual({ ok: true })
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockInvalidate).not.toHaveBeenCalled()
  })

  it('sends a link when the account exists and the email is verified', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      emailVerified: new Date('2026-01-01'),
    })

    const result = await authService.requestMagicLink(
      'Rafael@Example.com',
      '/account/settings',
    )

    expect(result).toEqual({ ok: true })
    expect(mockInvalidate).toHaveBeenCalledWith('user-1', 'MAGIC_LINK')
    expect(mockCreate).toHaveBeenCalledWith('user-1')
    expect(mockSend).toHaveBeenCalledWith(
      'rafael@example.com',
      'raw-token',
      '/account/settings',
    )
  })

  it('rate limits after 10 requests within 1 hour', async () => {
    mockUserFindUnique.mockResolvedValue(null)

    for (let i = 0; i < 10; i++) {
      const res = await authService.requestMagicLink('rate-test@example.com')
      expect(res).toEqual({ ok: true })
    }

    const blocked = await authService.requestMagicLink('rate-test@example.com')
    expect(blocked.ok).toBe(false)
    if (!blocked.ok && blocked.error.code === 'RATE_LIMITED') {
      expect(blocked.error.code).toBe('RATE_LIMITED')
      expect(blocked.error.message).toBe(
        'Too many email requests. Please try again later.',
      )
      expect(blocked.error.retryAfter).toBeInstanceOf(Date)
    }
  })
})

describe('validateMagicLinkToken', () => {
  const { createTokenManager } = jest.requireActual(
    '@/lib/auth/token-manager',
  ) as typeof import('@/lib/auth/token-manager')

  const manager = createTokenManager()
  const mockTokenFindUnique = prisma.token.findUnique as jest.Mock
  const mockTokenUpdate = prisma.token.update as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects an unknown token', async () => {
    mockTokenFindUnique.mockResolvedValue(null)

    const result = await manager.validateMagicLinkToken('missing')

    expect(result).toEqual({ ok: false, error: 'INVALID' })
    expect(mockTokenUpdate).not.toHaveBeenCalled()
  })

  it('rejects a token that was already used', async () => {
    mockTokenFindUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      type: TokenType.MAGIC_LINK,
      usedAt: new Date('2026-01-01'),
      expiresAt: new Date(Date.now() + 60_000),
    })

    const result = await manager.validateMagicLinkToken('used-token')

    expect(result).toEqual({ ok: false, error: 'USED' })
    expect(mockTokenUpdate).not.toHaveBeenCalled()
  })

  it('rejects an expired token', async () => {
    mockTokenFindUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      type: TokenType.MAGIC_LINK,
      usedAt: null,
      expiresAt: new Date(Date.now() - 60_000),
    })

    const result = await manager.validateMagicLinkToken('expired-token')

    expect(result).toEqual({ ok: false, error: 'EXPIRED' })
    expect(mockTokenUpdate).not.toHaveBeenCalled()
  })
})
