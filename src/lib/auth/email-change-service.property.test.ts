/**
 * Property-based tests for the email-change confirmation flow.
 *
 * Feature: account-settings-page, Property 1: A code is accepted once.
 * Uses fast-check for property-based testing with a minimum of 100 iterations.
 *
 * **Validates: Requirements 5.5, 5.6, 5.7**
 *
 * Property 1 — across generated emails and codes:
 *  - A matching code succeeds exactly once (a second confirm fails).
 *  - A wrong code repeated past the attempt cap fails.
 *  - An expired challenge fails.
 * In every failing case, `User.email` is left unchanged.
 *
 * The test drives the real `createEmailChangeService` against a small
 * in-memory fake of the Prisma client, so the email swap, the attempt cap,
 * and expiry are exercised as real behavior (no stubbing of the service).
 */

import type { EmailService } from '@/lib/auth/email-service'
import type { RateLimiter } from '@/lib/auth/rate-limiter'
import { prisma } from '@/lib/prisma'
import fc from 'fast-check'
import { normalizeEmail } from './email-address'
import { createEmailChangeService } from './email-change-service'

// --- In-memory Prisma fake ------------------------------------------------

/**
 * Minimal shapes mirroring the columns the service reads and writes.
 */
type UserRow = { id: string; email: string; emailVerified: Date | null }
type ChallengeRow = {
  id: string
  userId: string
  newEmail: string
  codeHash: string
  expiresAt: Date
  attempts: number
  createdAt: Date
}

/**
 * A tiny in-memory store that backs the mocked Prisma methods. It models the
 * two tables the email-change flow touches and the transaction semantics the
 * service relies on (an array of prepared operations run together).
 */
class FakeDb {
  users: UserRow[] = []
  challenges: ChallengeRow[] = []
  private seq = 0

  private nextId(prefix: string): string {
    this.seq += 1
    return `${prefix}-${this.seq}`
  }

  userFindUnique(args: { where: { email?: string; id?: string } }) {
    const { where } = args
    return (
      this.users.find(
        (u) =>
          (where.email !== undefined && u.email === where.email) ||
          (where.id !== undefined && u.id === where.id),
      ) ?? null
    )
  }

  userUpdate(args: {
    where: { id: string }
    data: { email?: string; emailVerified?: Date }
  }) {
    const user = this.users.find((u) => u.id === args.where.id)
    if (!user) throw new Error('user not found')
    if (args.data.email !== undefined) {
      // Enforce the unique email constraint the same way Postgres would.
      const collision = this.users.find(
        (u) => u.id !== user.id && u.email === args.data.email,
      )
      if (collision) {
        throw Object.assign(new Error('Unique constraint failed'), {
          code: 'P2002',
        })
      }
      user.email = args.data.email
    }
    if (args.data.emailVerified !== undefined) {
      user.emailVerified = args.data.emailVerified
    }
    return { ...user }
  }

  challengeCreate(args: {
    data: {
      userId: string
      newEmail: string
      codeHash: string
      expiresAt: Date
    }
  }) {
    const row: ChallengeRow = {
      id: this.nextId('challenge'),
      attempts: 0,
      createdAt: new Date(),
      ...args.data,
    }
    this.challenges.push(row)
    return { ...row }
  }

  challengeFindFirst(args: {
    where: { userId: string; newEmail: string }
    orderBy?: { createdAt: 'desc' | 'asc' }
  }) {
    const matches = this.challenges
      .filter(
        (c) =>
          c.userId === args.where.userId && c.newEmail === args.where.newEmail,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return matches[0] ? { ...matches[0] } : null
  }

  challengeUpdate(args: { where: { id: string }; data: { attempts: number } }) {
    const row = this.challenges.find((c) => c.id === args.where.id)
    if (!row) throw new Error('challenge not found')
    row.attempts = args.data.attempts
    return { ...row }
  }

  challengeDelete(args: { where: { id: string } }) {
    this.challenges = this.challenges.filter((c) => c.id !== args.where.id)
    return {}
  }

  challengeDeleteMany(args: { where: { userId: string } }) {
    const before = this.challenges.length
    this.challenges = this.challenges.filter(
      (c) => c.userId !== args.where.userId,
    )
    return { count: before - this.challenges.length }
  }
}

// A single instance the mocked prisma delegates to; reset before each run.
let db: FakeDb

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

/** Wire the mocked prisma methods to the current FakeDb instance. */
function bindPrismaToDb(current: FakeDb) {
  mockUserFindUnique.mockImplementation(async (args) =>
    current.userFindUnique(args),
  )
  mockUserUpdate.mockImplementation(async (args) => current.userUpdate(args))
  mockChallengeCreate.mockImplementation(async (args) =>
    current.challengeCreate(args),
  )
  mockChallengeFindFirst.mockImplementation(async (args) =>
    current.challengeFindFirst(args),
  )
  mockChallengeUpdate.mockImplementation(async (args) =>
    current.challengeUpdate(args),
  )
  mockChallengeDelete.mockImplementation(async (args) =>
    current.challengeDelete(args),
  )
  mockChallengeDeleteMany.mockImplementation(async (args) =>
    current.challengeDeleteMany(args),
  )
  // The service passes an array of prepared operations; run them together and
  // surface any rejection (e.g. the P2002 unique collision) to the caller.
  mockTransaction.mockImplementation(async (ops: unknown) => {
    if (Array.isArray(ops)) return Promise.all(ops)
    return ops
  })
}

// --- Test doubles for the injected collaborators --------------------------

/** A rate limiter that always allows, so the property exercises the flow. */
function makeAllowingLimiter(): RateLimiter {
  return {
    checkLimit: jest.fn().mockResolvedValue({
      allowed: true,
      remainingAttempts: 5,
      resetAt: null,
    }),
    recordAttempt: jest.fn().mockResolvedValue(undefined),
    resetAttempts: jest.fn().mockResolvedValue(undefined),
  }
}

/**
 * An email service that captures the code it was asked to deliver, so the
 * test can confirm with the exact code the service generated.
 */
function makeCapturingEmailService(): {
  service: EmailService
  lastCode: () => string | undefined
} {
  let captured: string | undefined
  const service = {
    sendEmailChangeCodeEmail: jest.fn(async (_to: string, code: string) => {
      captured = code
      return { ok: true as const }
    }),
  } as unknown as EmailService
  return { service, lastCode: () => captured }
}

// --- Generators -----------------------------------------------------------

const PBT_NUM_RUNS = 100

/** A syntactically valid, lower-cased email built from safe local parts. */
const arbEmail = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{1,10}$/),
    fc.constantFrom('example.com', 'test.org', 'mail.co', 'knots.app'),
  )
  .map(([local, domain]) => `${local}@${domain}`)

/**
 * A distinct pair (current, next) of valid emails that normalize differently,
 * so `prepareNewEmail` treats them as a real change rather than SAME_EMAIL.
 */
const arbEmailPair = fc
  .tuple(arbEmail, arbEmail)
  .filter(([current, next]) => normalizeEmail(current) !== normalizeEmail(next))

/** A 6-digit code distinct from the correct one, used for wrong-code branches. */
const arbWrongCode = (correct: string) =>
  fc
    .integer({ min: 0, max: 999_999 })
    .map((n) => n.toString().padStart(6, '0'))
    .filter((code) => code !== correct)

// --- Helpers --------------------------------------------------------------

/** Seed a single user and return the service under test wired to the db. */
function setup(currentEmail: string) {
  db = new FakeDb()
  db.users.push({ id: 'user-1', email: currentEmail, emailVerified: null })
  bindPrismaToDb(db)
  const { service, lastCode } = makeCapturingEmailService()
  const emailChangeService = createEmailChangeService(
    service,
    makeAllowingLimiter(),
  )
  return { service: emailChangeService, lastCode }
}

/** Issue a challenge and return the plaintext code the service generated. */
async function requestChange(
  service: ReturnType<typeof setup>['service'],
  lastCode: () => string | undefined,
  currentEmail: string,
  newEmail: string,
): Promise<string> {
  const result = await service.requestEmailChange({
    userId: 'user-1',
    currentEmail,
    newEmail,
  })
  expect(result).toEqual({ ok: true })
  const code = lastCode()
  expect(code).toMatch(/^\d{6}$/)
  return code as string
}

// --- Property -------------------------------------------------------------

describe('Property 1: a code is accepted once', () => {
  it('accepts a matching code exactly once and never on second confirm', async () => {
    await fc.assert(
      fc.asyncProperty(arbEmailPair, async ([currentEmail, rawNew]) => {
        const { service, lastCode } = setup(currentEmail)
        const normalizedNew = normalizeEmail(rawNew)

        const code = await requestChange(
          service,
          lastCode,
          currentEmail,
          rawNew,
        )

        // First confirm with the correct code succeeds and swaps the email.
        const first = await service.confirmEmailChange({
          userId: 'user-1',
          newEmail: normalizedNew,
          code,
        })
        expect(first).toEqual({ ok: true })
        expect(db.users[0].email).toBe(normalizedNew)
        expect(db.users[0].emailVerified).toBeInstanceOf(Date)

        // The challenge was consumed, so a second confirm cannot succeed and
        // the (already swapped) email stays put.
        const emailAfterFirst = db.users[0].email
        const second = await service.confirmEmailChange({
          userId: 'user-1',
          newEmail: normalizedNew,
          code,
        })
        expect(second.ok).toBe(false)
        expect(db.users[0].email).toBe(emailAfterFirst)
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })

  it('rejects a wrong code repeated past the attempt cap and leaves the email unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEmailPair,
        fc.integer({ min: 5, max: 8 }),
        async ([currentEmail, rawNew], attempts) => {
          const { service, lastCode } = setup(currentEmail)
          const normalizedNew = normalizeEmail(rawNew)
          const code = await requestChange(
            service,
            lastCode,
            currentEmail,
            rawNew,
          )
          const wrong = fc.sample(arbWrongCode(code), 1)[0]

          // Hammer the challenge with a wrong code past the cap of 5.
          for (let i = 0; i < attempts; i++) {
            const res = await service.confirmEmailChange({
              userId: 'user-1',
              newEmail: normalizedNew,
              code: wrong,
            })
            expect(res).toEqual({ ok: false, error: 'INVALID_OTP' })
          }

          // The email never changed, and even the correct code no longer works
          // because the capped challenge was invalidated.
          expect(db.users[0].email).toBe(currentEmail)
          const afterCap = await service.confirmEmailChange({
            userId: 'user-1',
            newEmail: normalizedNew,
            code,
          })
          expect(afterCap.ok).toBe(false)
          expect(db.users[0].email).toBe(currentEmail)
        },
      ),
      { numRuns: PBT_NUM_RUNS },
    )
  })

  it('rejects an expired challenge and leaves the email unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(arbEmailPair, async ([currentEmail, rawNew]) => {
        const { service, lastCode } = setup(currentEmail)
        const normalizedNew = normalizeEmail(rawNew)
        const code = await requestChange(
          service,
          lastCode,
          currentEmail,
          rawNew,
        )

        // Force the stored challenge to be expired.
        db.challenges.forEach((c) => {
          c.expiresAt = new Date(Date.now() - 1000)
        })

        const result = await service.confirmEmailChange({
          userId: 'user-1',
          newEmail: normalizedNew,
          code,
        })
        expect(result).toEqual({ ok: false, error: 'OTP_EXPIRED' })
        expect(db.users[0].email).toBe(currentEmail)
        expect(db.users[0].emailVerified).toBeNull()
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})
