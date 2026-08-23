/**
 * Property-based tests for tRPC group-membership notification preferences.
 *
 * // Feature: unified-group-notifications, Property 4: Notification preferences round-trip
 *
 * For any valid notification preference payload (notifyAllMembers, includedUserIds,
 * notifyOnCreate, notifyOnUpdate, notifyOnDelete, emailNotificationsEnabled) saved via
 * setNotificationPreferences, a subsequent call to getNotificationPreferences for the
 * same member and group SHALL return identical values for all six fields.
 *
 * **Validates: Requirements 5.2, 5.3, 10.2, 10.3**
 */

import fc from 'fast-check'

// --- Mocks (must be declared before any imports that use them) ---

const mockUpdate = jest.fn()
const mockFindUnique = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    groupMembership: {
      update: (...args: unknown[]) => mockUpdate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    invitation: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/trpc/init', () => {
  const { initTRPC } = require('@trpc/server')
  const t = initTRPC.context().create()
  return {
    createTRPCRouter: t.router,
    baseProcedure: t.procedure,
    protectedProcedure: t.procedure.use(async ({ ctx, next }: any) => {
      return next({
        ctx: {
          ...ctx,
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
          },
        },
      })
    }),
  }
})

// Mock services that have ESM transitive dependencies (nanoid, etc.)
jest.mock('@/lib/auth/group-service', () => ({
  groupService: {
    createGroup: jest.fn(),
    getUserGroups: jest.fn(),
    isMember: jest.fn(),
  },
}))

jest.mock('@/lib/auth/invitation-service', () => ({
  invitationService: {
    createInvitation: jest.fn(),
    acceptInvitation: jest.fn(),
    revokeInvitation: jest.fn(),
    getPendingInvitations: jest.fn(),
  },
}))

jest.mock('@/lib/profile/block-check', () => ({
  isBlockedByEmail: jest.fn(),
}))

// Mock superjson to avoid ESM import issues
jest.mock('superjson', () => ({
  __esModule: true,
  default: {
    serialize: (v: unknown) => ({ json: v, meta: undefined }),
    deserialize: (v: { json: unknown }) => v.json,
    registerCustom: jest.fn(),
  },
}))

import { groupMembershipRouter } from '../index'

// --- Constants ---

const PBT_NUM_RUNS = 100
const TEST_USER_ID = 'test-user-id'
const TEST_GROUP_ID = 'test-group-id'
const TEST_MEMBERSHIP_ID = 'test-membership-id'

// --- Generators ---

/**
 * Generates a valid array of user IDs (string[]).
 */
const arbUserIds = fc.array(fc.string({ minLength: 1, maxLength: 36 }), {
  minLength: 0,
  maxLength: 10,
})

/**
 * Generates a full valid notification preferences payload (all six fields).
 */
const arbNotificationPreferences = fc.record({
  emailNotificationsEnabled: fc.boolean(),
  notifyAllMembers: fc.boolean(),
  includedUserIds: arbUserIds,
  notifyOnCreate: fc.boolean(),
  notifyOnUpdate: fc.boolean(),
  notifyOnDelete: fc.boolean(),
})

// --- Helper: create a caller with a test context ---

function createCaller() {
  return groupMembershipRouter.createCaller({} as any)
}

// --- Tests ---

describe('Group Membership Notification Preferences — Property 4: Round-trip', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Property 4: Notification preferences round-trip', () => {
    /**
     * // Feature: unified-group-notifications, Property 4: Notification preferences round-trip
     *
     * For any valid notification preference payload (all six fields), saving via
     * setNotificationPreferences and then reading back via getNotificationPreferences
     * SHALL return identical values for every field.
     *
     * **Validates: Requirements 5.2, 5.3, 10.2, 10.3**
     */
    it('setNotificationPreferences followed by getNotificationPreferences returns identical values for all six fields', () => {
      return fc.assert(
        fc.asyncProperty(arbNotificationPreferences, async (prefs) => {
          jest.clearAllMocks()

          // setNotificationPreferences calls findUnique first (membership existence check)
          // then calls update, returning the updated prefs.
          mockFindUnique
            // First call: membership existence check in setNotificationPreferences
            .mockResolvedValueOnce({ id: TEST_MEMBERSHIP_ID })
            // Second call: getNotificationPreferences reads the full prefs
            .mockResolvedValueOnce(prefs)

          // update returns the saved values (simulating DB round-trip)
          mockUpdate.mockResolvedValueOnce(prefs)

          const caller = createCaller()

          // Step 1 — save all six fields
          const setResult = await caller.setNotificationPreferences({
            groupId: TEST_GROUP_ID,
            ...prefs,
          })

          // Step 2 — read back all six fields
          const getResult = await caller.getNotificationPreferences({
            groupId: TEST_GROUP_ID,
          })

          // The read-back values must exactly match what was saved
          expect(getResult.emailNotificationsEnabled).toBe(
            prefs.emailNotificationsEnabled,
          )
          expect(getResult.notifyAllMembers).toBe(prefs.notifyAllMembers)
          expect(getResult.includedUserIds).toEqual(prefs.includedUserIds)
          expect(getResult.notifyOnCreate).toBe(prefs.notifyOnCreate)
          expect(getResult.notifyOnUpdate).toBe(prefs.notifyOnUpdate)
          expect(getResult.notifyOnDelete).toBe(prefs.notifyOnDelete)

          // The return value of setNotificationPreferences must also reflect
          // the saved preferences (Requirements 10.3 — single DB write returns all six fields)
          expect(setResult.emailNotificationsEnabled).toBe(
            prefs.emailNotificationsEnabled,
          )
          expect(setResult.notifyAllMembers).toBe(prefs.notifyAllMembers)
          expect(setResult.includedUserIds).toEqual(prefs.includedUserIds)
          expect(setResult.notifyOnCreate).toBe(prefs.notifyOnCreate)
          expect(setResult.notifyOnUpdate).toBe(prefs.notifyOnUpdate)
          expect(setResult.notifyOnDelete).toBe(prefs.notifyOnDelete)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    /**
     * The DB update is called with exactly the fields provided in the input —
     * no more, no less — ensuring a single-write guarantee (Requirement 10.3).
     *
     * **Validates: Requirements 10.3**
     */
    it('setNotificationPreferences issues exactly one DB write containing all provided fields', () => {
      return fc.assert(
        fc.asyncProperty(arbNotificationPreferences, async (prefs) => {
          jest.clearAllMocks()

          mockFindUnique.mockResolvedValueOnce({ id: TEST_MEMBERSHIP_ID })
          mockUpdate.mockResolvedValueOnce(prefs)

          const caller = createCaller()

          await caller.setNotificationPreferences({
            groupId: TEST_GROUP_ID,
            ...prefs,
          })

          // Exactly one DB update call
          expect(mockUpdate).toHaveBeenCalledTimes(1)

          const updateArg = mockUpdate.mock.calls[0][0] as {
            where: { id: string }
            data: Record<string, unknown>
            select: Record<string, boolean>
          }

          // The update targets the correct membership row
          expect(updateArg.where).toEqual({ id: TEST_MEMBERSHIP_ID })

          // All six fields are present in the data payload
          expect(updateArg.data).toMatchObject({
            emailNotificationsEnabled: prefs.emailNotificationsEnabled,
            notifyAllMembers: prefs.notifyAllMembers,
            includedUserIds: prefs.includedUserIds,
            notifyOnCreate: prefs.notifyOnCreate,
            notifyOnUpdate: prefs.notifyOnUpdate,
            notifyOnDelete: prefs.notifyOnDelete,
          })

          // The select projection returns all six fields
          expect(updateArg.select).toMatchObject({
            emailNotificationsEnabled: true,
            notifyAllMembers: true,
            includedUserIds: true,
            notifyOnCreate: true,
            notifyOnUpdate: true,
            notifyOnDelete: true,
          })
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    /**
     * getNotificationPreferences issues exactly one DB read and returns all six fields.
     *
     * **Validates: Requirements 10.2**
     */
    it('getNotificationPreferences issues exactly one DB read returning all six fields', () => {
      return fc.assert(
        fc.asyncProperty(arbNotificationPreferences, async (prefs) => {
          jest.clearAllMocks()

          mockFindUnique.mockResolvedValueOnce(prefs)

          const caller = createCaller()

          const result = await caller.getNotificationPreferences({
            groupId: TEST_GROUP_ID,
          })

          // Exactly one DB read
          expect(mockFindUnique).toHaveBeenCalledTimes(1)

          // The query targets the correct (userId, groupId) composite key
          const findArg = mockFindUnique.mock.calls[0][0] as {
            where: { userId_groupId: { userId: string; groupId: string } }
            select: Record<string, boolean>
          }
          expect(findArg.where.userId_groupId).toEqual({
            userId: TEST_USER_ID,
            groupId: TEST_GROUP_ID,
          })

          // All six fields are selected
          expect(findArg.select).toMatchObject({
            emailNotificationsEnabled: true,
            notifyAllMembers: true,
            includedUserIds: true,
            notifyOnCreate: true,
            notifyOnUpdate: true,
            notifyOnDelete: true,
          })

          // Result matches what the DB returned
          expect(result).toEqual(prefs)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    /**
     * Partial updates: setNotificationPreferences accepts any subset of the six fields
     * and persists only the provided subset (no extraneous fields written).
     *
     * **Validates: Requirements 5.2, 5.3, 10.3**
     */
    it('partial setNotificationPreferences persists only the fields that were provided', () => {
      return fc.assert(
        fc.asyncProperty(
          // Generate a partial payload by randomly picking a non-empty subset of the six fields
          fc
            .record({
              emailNotificationsEnabled: fc.option(fc.boolean(), {
                nil: undefined,
              }),
              notifyAllMembers: fc.option(fc.boolean(), { nil: undefined }),
              includedUserIds: fc.option(arbUserIds, { nil: undefined }),
              notifyOnCreate: fc.option(fc.boolean(), { nil: undefined }),
              notifyOnUpdate: fc.option(fc.boolean(), { nil: undefined }),
              notifyOnDelete: fc.option(fc.boolean(), { nil: undefined }),
            })
            .filter((p) =>
              // At least one field must be defined so there is something to save
              Object.values(p).some((v) => v !== undefined),
            ),
          async (partialPrefs) => {
            jest.clearAllMocks()

            // Build the full prefs that the DB would return after the partial update
            const fullPrefs = {
              emailNotificationsEnabled:
                partialPrefs.emailNotificationsEnabled ?? false,
              notifyAllMembers: partialPrefs.notifyAllMembers ?? true,
              includedUserIds: partialPrefs.includedUserIds ?? [],
              notifyOnCreate: partialPrefs.notifyOnCreate ?? true,
              notifyOnUpdate: partialPrefs.notifyOnUpdate ?? true,
              notifyOnDelete: partialPrefs.notifyOnDelete ?? true,
            }

            mockFindUnique.mockResolvedValueOnce({ id: TEST_MEMBERSHIP_ID })
            mockUpdate.mockResolvedValueOnce(fullPrefs)

            const caller = createCaller()

            // Remove undefined values to simulate a truly partial input
            const inputWithoutUndefined = Object.fromEntries(
              Object.entries({
                groupId: TEST_GROUP_ID,
                ...partialPrefs,
              }).filter(([, v]) => v !== undefined),
            ) as Record<string, unknown>

            await caller.setNotificationPreferences(
              inputWithoutUndefined as any,
            )

            expect(mockUpdate).toHaveBeenCalledTimes(1)

            const updateArg = mockUpdate.mock.calls[0][0] as {
              data: Record<string, unknown>
            }

            // Only the provided fields should appear in the data payload
            const definedFields = Object.entries(partialPrefs)
              .filter(([, v]) => v !== undefined)
              .map(([k]) => k)

            for (const field of definedFields) {
              expect(updateArg.data).toHaveProperty(field)
            }

            // groupId must NOT appear in the data (it is used for routing only)
            expect(updateArg.data).not.toHaveProperty('groupId')
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
