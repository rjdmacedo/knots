import type { EmailService } from '@/lib/auth/email-service'
import type { RateLimiter } from '@/lib/auth/rate-limiter'
import { prisma } from '@/lib/prisma'
import {
  createEmailChangeService,
  hashEmailChangeCode,
} from './email-change-service'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    emailChangeChallenge: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockUserUpdate = prisma.user.update as jest.Mock
const mockChallengeCreate = prisma.emailChangeChallenge.create as jest.Mock
const mockChallengeFindFirst = prisma.emailChangeChallenge
  .findFirst as jest.Mock
const mockChallengeUpdate = prisma.emailChangeChallenge.update as jest.Mock
const mockChallengeDelete = prisma.emailChangeChallenge.delete as jest.Mock
const mockChallengeDeleteMany = prisma.emailChangeChallenge
  .deleteMany as jest.Mock
const mockTransaction = prisma.$transaction as jest.Mock

const userId = 'user-1'
const currentEmail = 'current@example.com'
const newEmail = 'new@example.com'

function makeLimiter(allowed = true): RateLimiter {
  return {
    checkLimit: jest
      .fn()
      .mockResolvedValue({ allowed, remainingAttempts: 5, resetAt: null }),
    recordAttempt: jest.fn().mockResolvedValue(undefined),
    resetAttempts: jest.fn().mockResolvedValue(undefined),
  }
}

function makeEmailService(sendResult: unknown = { ok: true }): EmailService {
  return {
    sendEmailChangeCodeEmail: jest.fn().mockResolvedValue(sendResult),
  } as unknown as EmailService
}

beforeEach(() => {
  jest.clearAllMocks()
  // Default: $transaction runs the array of promises
  mockTransaction.mockImplementation(async (ops: unknown) => {
    if (Array.isArray(ops)) return Promise.all(ops)
    return ops
  })
})

describe('requestEmailChange', () => {
  it('rejects an invalid new address without sending or writing', async () => {
    const email = makeEmailService()
    const service = createEmailChangeService(email, makeLimiter())

    const result = await service.requestEmailChange({
      userId,
      currentEmail,
      newEmail: 'not-an-email',
    })

    expect(result).toEqual({ ok: false, error: 'INVALID_EMAIL' })
    expect(email.sendEmailChangeCodeEmail).not.toHaveBeenCalled()
    expect(mockChallengeCreate).not.toHaveBeenCalled()
  })

  it('rejects the current address as SAME_EMAIL', async () => {
    const service = createEmailChangeService(makeEmailService(), makeLimiter())
    const result = await service.requestEmailChange({
      userId,
      currentEmail,
      newEmail: 'CURRENT@example.com',
    })
    expect(result).toEqual({ ok: false, error: 'SAME_EMAIL' })
  })

  it('rejects an address in use by another user as EMAIL_IN_USE', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'someone-else' })
    const service = createEmailChangeService(makeEmailService(), makeLimiter())

    const result = await service.requestEmailChange({
      userId,
      currentEmail,
      newEmail,
    })

    expect(result).toEqual({ ok: false, error: 'EMAIL_IN_USE' })
    expect(mockChallengeCreate).not.toHaveBeenCalled()
  })

  it('returns RATE_LIMITED when the send limit is exhausted', async () => {
    const service = createEmailChangeService(
      makeEmailService(),
      makeLimiter(false),
    )
    const result = await service.requestEmailChange({
      userId,
      currentEmail,
      newEmail,
    })
    expect(result).toEqual({ ok: false, error: 'RATE_LIMITED' })
  })

  it('fails with EMAIL_SEND_FAILED and creates no challenge when delivery fails', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const email = makeEmailService({ ok: false, error: 'no api key' })
    const service = createEmailChangeService(email, makeLimiter())

    const result = await service.requestEmailChange({
      userId,
      currentEmail,
      newEmail,
    })

    expect(result).toEqual({ ok: false, error: 'EMAIL_SEND_FAILED' })
    expect(mockChallengeCreate).not.toHaveBeenCalled()
  })

  it('fails with EMAIL_SEND_FAILED when the email service throws', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const email = {
      sendEmailChangeCodeEmail: jest
        .fn()
        .mockRejectedValue(new Error('RESEND_API_KEY is not set')),
    } as unknown as EmailService
    const service = createEmailChangeService(email, makeLimiter())

    const result = await service.requestEmailChange({
      userId,
      currentEmail,
      newEmail,
    })

    expect(result).toEqual({ ok: false, error: 'EMAIL_SEND_FAILED' })
    expect(mockChallengeCreate).not.toHaveBeenCalled()
  })

  it('sends the code and replaces any previous challenge on success', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const email = makeEmailService()
    const limiter = makeLimiter()
    const service = createEmailChangeService(email, limiter)

    const result = await service.requestEmailChange({
      userId,
      currentEmail,
      newEmail,
    })

    expect(result).toEqual({ ok: true })
    // A 6-digit code is sent to the normalized new email.
    const sendMock = email.sendEmailChangeCodeEmail as jest.Mock
    expect(sendMock).toHaveBeenCalledTimes(1)
    const [sentTo, sentCode] = sendMock.mock.calls[0]
    expect(sentTo).toBe(newEmail)
    expect(sentCode).toMatch(/^\d{6}$/)
    // Previous challenges for the user are cleared inside the transaction.
    expect(mockChallengeDeleteMany).toHaveBeenCalledWith({
      where: { userId },
    })
    // The stored value is a hash, never the plaintext code.
    const createArg = mockChallengeCreate.mock.calls[0][0]
    expect(createArg.data.codeHash).toBe(hashEmailChangeCode(sentCode))
    expect(createArg.data).not.toHaveProperty('code')
    expect(limiter.recordAttempt).toHaveBeenCalledTimes(1)
  })
})

describe('confirmEmailChange', () => {
  const validCode = '123456'
  const codeHash = hashEmailChangeCode(validCode)

  function futureChallenge(overrides: Record<string, unknown> = {}) {
    return {
      id: 'challenge-1',
      userId,
      newEmail,
      codeHash,
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      ...overrides,
    }
  }

  it('returns RATE_LIMITED when the confirm limit is exhausted', async () => {
    const service = createEmailChangeService(
      makeEmailService(),
      makeLimiter(false),
    )
    const result = await service.confirmEmailChange({
      userId,
      newEmail,
      code: validCode,
    })
    expect(result).toEqual({ ok: false, error: 'RATE_LIMITED' })
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('returns INVALID_OTP when there is no challenge', async () => {
    mockChallengeFindFirst.mockResolvedValue(null)
    const service = createEmailChangeService(makeEmailService(), makeLimiter())
    const result = await service.confirmEmailChange({
      userId,
      newEmail,
      code: validCode,
    })
    expect(result).toEqual({ ok: false, error: 'INVALID_OTP' })
  })

  it('returns OTP_EXPIRED and deletes the challenge when expired', async () => {
    mockChallengeFindFirst.mockResolvedValue(
      futureChallenge({ expiresAt: new Date(Date.now() - 1000) }),
    )
    const service = createEmailChangeService(makeEmailService(), makeLimiter())
    const result = await service.confirmEmailChange({
      userId,
      newEmail,
      code: validCode,
    })
    expect(result).toEqual({ ok: false, error: 'OTP_EXPIRED' })
    expect(mockChallengeDelete).toHaveBeenCalled()
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('increments attempts on a wrong code without changing the email', async () => {
    mockChallengeFindFirst.mockResolvedValue(futureChallenge({ attempts: 1 }))
    const service = createEmailChangeService(makeEmailService(), makeLimiter())

    const result = await service.confirmEmailChange({
      userId,
      newEmail,
      code: '000000',
    })

    expect(result).toEqual({ ok: false, error: 'INVALID_OTP' })
    expect(mockChallengeUpdate).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: { attempts: 2 },
    })
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('invalidates the challenge once the attempt cap is reached', async () => {
    // attempts already at 4; a 5th wrong attempt caps and deletes it.
    mockChallengeFindFirst.mockResolvedValue(futureChallenge({ attempts: 4 }))
    const service = createEmailChangeService(makeEmailService(), makeLimiter())

    const result = await service.confirmEmailChange({
      userId,
      newEmail,
      code: '000000',
    })

    expect(result).toEqual({ ok: false, error: 'INVALID_OTP' })
    expect(mockChallengeDelete).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
    })
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('rejects a code once the challenge is already at the cap', async () => {
    mockChallengeFindFirst.mockResolvedValue(futureChallenge({ attempts: 5 }))
    const service = createEmailChangeService(makeEmailService(), makeLimiter())

    const result = await service.confirmEmailChange({
      userId,
      newEmail,
      code: validCode,
    })

    expect(result).toEqual({ ok: false, error: 'INVALID_OTP' })
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('swaps the email and sets emailVerified on the correct code', async () => {
    mockChallengeFindFirst.mockResolvedValue(futureChallenge())
    const service = createEmailChangeService(makeEmailService(), makeLimiter())

    const result = await service.confirmEmailChange({
      userId,
      newEmail,
      code: validCode,
    })

    expect(result).toEqual({ ok: true })
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: userId },
      data: expect.objectContaining({ email: newEmail }),
    })
    const updateData = mockUserUpdate.mock.calls[0][0].data
    expect(updateData.emailVerified).toBeInstanceOf(Date)
    expect(mockChallengeDeleteMany).toHaveBeenCalledWith({ where: { userId } })
  })

  it('maps a unique collision during the swap to EMAIL_IN_USE', async () => {
    mockChallengeFindFirst.mockResolvedValue(futureChallenge())
    mockTransaction.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    )
    const service = createEmailChangeService(makeEmailService(), makeLimiter())

    const result = await service.confirmEmailChange({
      userId,
      newEmail,
      code: validCode,
    })

    expect(result).toEqual({ ok: false, error: 'EMAIL_IN_USE' })
  })
})
