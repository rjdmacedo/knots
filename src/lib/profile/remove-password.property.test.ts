/**
 * Property-based tests for the remove-password gate.
 *
 * Feature: account-settings-page, Property 2: Password removal requires
 * another sign-in method.
 * Uses fast-check for property-based testing with a minimum of 100 iterations.
 *
 * **Validates: Requirements 6.3, 6.4, 7.7**
 *
 * Property 2 — across generated (passwordMatches, passkeyCount) combinations:
 *  - `removePassword` succeeds and clears `passwordHash` IF AND ONLY IF the
 *    current password matches AND `passkeyCount >= 1`.
 *  - In every other case it fails and leaves `passwordHash` unchanged.
 *
 * The test drives the real `removePassword` against a small in-memory fake of
 * the Prisma client and a stubbed `verifyPassword`, so the mismatch gate and
 * the alternative-sign-in gate are exercised as real behavior, deterministically.
 */

import { verifyPassword } from '@/lib/auth/password'
import { prisma } from '@/lib/prisma'
import fc from 'fast-check'
import { removePassword } from './profile-service'

// --- In-memory Prisma fake ------------------------------------------------

/** Minimal shape mirroring the columns removePassword reads and writes. */
type UserRow = { id: string; passwordHash: string | null }

/**
 * A tiny in-memory store backing the mocked Prisma methods: one user row and
 * a configurable passkey count for that user.
 */
class FakeDb {
  users: UserRow[] = []
  passkeyCount = 0

  userFindUnique(args: { where: { id: string } }) {
    return this.users.find((u) => u.id === args.where.id) ?? null
  }

  userUpdate(args: {
    where: { id: string }
    data: { passwordHash?: string | null }
  }) {
    const user = this.users.find((u) => u.id === args.where.id)
    if (!user) throw new Error('user not found')
    if (args.data.passwordHash !== undefined) {
      user.passwordHash = args.data.passwordHash
    }
    return { ...user }
  }

  passkeyCountFor() {
    return this.passkeyCount
  }
}

let db: FakeDb

// `profile-service` transitively imports `nanoid` (ESM) via the profile-image
// helper, which Jest's default transform leaves untransformed. This flow never
// generates an id, so a tiny stub keeps the module graph loadable.
jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    passkey: {
      count: jest.fn(),
    },
  },
}))

jest.mock('@/lib/auth/password', () => ({
  verifyPassword: jest.fn(),
}))

const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockUserUpdate = prisma.user.update as jest.Mock
const mockPasskeyCount = prisma.passkey.count as jest.Mock
const mockVerifyPassword = verifyPassword as jest.Mock

/** Wire the mocked prisma methods to the current FakeDb instance. */
function bindPrismaToDb(current: FakeDb) {
  mockUserFindUnique.mockImplementation(async (args) =>
    current.userFindUnique(args),
  )
  mockUserUpdate.mockImplementation(async (args) => current.userUpdate(args))
  mockPasskeyCount.mockImplementation(async () => current.passkeyCountFor())
}

// --- Generators -----------------------------------------------------------

const PBT_NUM_RUNS = 100

const STORED_HASH = 'stored-hash'

/** Seed a single user with a stored password hash and a passkey count. */
function setup(passkeyCount: number, passwordMatches: boolean) {
  db = new FakeDb()
  db.users.push({ id: 'user-1', passwordHash: STORED_HASH })
  db.passkeyCount = passkeyCount
  bindPrismaToDb(db)
  mockVerifyPassword.mockResolvedValue(passwordMatches)
}

// --- Property -------------------------------------------------------------

describe('Property 2: password removal requires another sign-in method', () => {
  it('removes the password iff the current password matches and passkeyCount >= 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.integer({ min: 0, max: 5 }),
        async (passwordMatches, passkeyCount) => {
          setup(passkeyCount, passwordMatches)

          const result = await removePassword('user-1', 'current-password')

          const shouldSucceed = passwordMatches && passkeyCount >= 1

          expect(result.ok).toBe(shouldSucceed)

          if (shouldSucceed) {
            // On success the hash is cleared so credentials sign-in fails and
            // only the passkey path remains.
            expect(db.users[0].passwordHash).toBeNull()
          } else {
            // On any failure the stored hash is left untouched.
            expect(db.users[0].passwordHash).toBe(STORED_HASH)
            if (!result.ok) {
              // A wrong password reports mismatch; a matching password with no
              // passkey reports the alternative-sign-in gate.
              expect(result.error.code).toBe(
                passwordMatches
                  ? 'NO_ALTERNATIVE_SIGN_IN'
                  : 'CURRENT_PASSWORD_MISMATCH',
              )
            }
          }
        },
      ),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})
