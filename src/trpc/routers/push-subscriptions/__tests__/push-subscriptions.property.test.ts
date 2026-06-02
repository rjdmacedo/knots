/**
 * Property-based tests for tRPC push subscriptions router.
 *
 * Feature: group-push-notifications
 * - Property 5: Subscription upsert idempotence
 * - Property 11: tRPC input validation rejects invalid subscription data
 * - Property 12: Idempotent delete
 * - Property 13: List subscriptions returns correct set for endpoint
 *
 * Validates: Requirements 3.4, 8.1, 8.2, 8.4, 8.5
 */

import fc from 'fast-check'
import { z } from 'zod'

// --- Schemas (mirroring the router's Zod schemas for validation testing) ---

const preferencesSchema = z
  .object({
    subscriberUserId: z.string().min(1).max(200),
    notifyAllMembers: z.boolean(),
    includedUserIds: z.array(z.string().min(1).max(200)).max(50),
    notifyOnCreate: z.boolean(),
    notifyOnUpdate: z.boolean(),
    notifyOnDelete: z.boolean(),
  })
  .refine((p) => p.notifyAllMembers || p.includedUserIds.length > 0)

const createInputSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  groupId: z.string().min(1),
  preferences: preferencesSchema,
})

const deleteInputSchema = z.object({
  endpoint: z.string().max(2048),
  groupId: z.string().min(1),
})

const listInputSchema = z.object({
  endpoint: z.string().max(2048),
})

// --- Mocks ---

const mockUpsert = jest.fn()
const mockDeleteMany = jest.fn()
const mockFindMany = jest.fn()
const mockFindUnique = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    pushSubscription: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    group: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
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

import { createTRPCContext } from '@/trpc/init'
import { pushSubscriptionsRouter } from '../index'

// --- Constants ---

const PBT_NUM_RUNS = 100

// --- Generators ---

const arbValidEndpoint = fc
  .webUrl({ withFragments: false, withQueryParameters: false })
  .filter((url) => url.length <= 2048)

const arbValidKeys = fc.record({
  p256dh: fc.base64String({ minLength: 1, maxLength: 50 }),
  auth: fc.base64String({ minLength: 1, maxLength: 20 }),
})

const arbGroupId = fc.string({ minLength: 1, maxLength: 30 })

const arbPreferences = fc
  .record({
    subscriberUserId: fc.string({ minLength: 1, maxLength: 50 }),
    notifyAllMembers: fc.boolean(),
    includedUserIds: fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
      maxLength: 5,
    }),
    notifyOnCreate: fc.boolean(),
    notifyOnUpdate: fc.boolean(),
    notifyOnDelete: fc.boolean(),
  })
  .filter(
    (p) =>
      (p.notifyAllMembers || p.includedUserIds.length > 0) &&
      (p.notifyOnCreate || p.notifyOnUpdate || p.notifyOnDelete),
  )

const arbValidCreateInput = fc.record({
  endpoint: arbValidEndpoint,
  keys: arbValidKeys,
  groupId: arbGroupId,
  preferences: arbPreferences,
})

// --- Helper to create a caller ---

async function createCaller() {
  const ctx = await createTRPCContext()
  return pushSubscriptionsRouter.createCaller(ctx)
}

// --- Tests ---

describe('Push Subscriptions Router Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Property 5: Subscription upsert idempotence', () => {
    /**
     * Feature: group-push-notifications, Property 5: Subscription upsert idempotence
     *
     * Validates: Requirements 3.4, 8.2
     *
     * For any subscription data, creating a subscription with the same (endpoint, groupId)
     * pair multiple times SHALL result in exactly one database record, with the keys and
     * preferences reflecting the most recent call.
     */
    it('calling create multiple times with same endpoint+groupId results in a single upsert each time', () => {
      return fc.assert(
        fc.asyncProperty(
          arbValidCreateInput,
          fc.integer({ min: 2, max: 5 }),
          async (input, repeatCount) => {
            jest.clearAllMocks()
            mockFindUnique.mockResolvedValue({ id: 'group-exists' })
            mockUpsert.mockResolvedValue({ id: 'sub-1' })

            const caller = await createCaller()

            // Call create multiple times with the same input
            for (let i = 0; i < repeatCount; i++) {
              await caller.create(input)
            }

            // Upsert should be called exactly repeatCount times (once per call)
            expect(mockUpsert).toHaveBeenCalledTimes(repeatCount)

            // Each upsert call should use the unique constraint [endpoint, groupId]
            for (const call of mockUpsert.mock.calls) {
              const upsertArgs = call[0] as {
                where: {
                  endpoint_groupId: { endpoint: string; groupId: string }
                }
                create: { subscriberUserId: string }
                update: { p256dh: string; auth: string; subscriberUserId: string }
              }
              expect(upsertArgs.where.endpoint_groupId).toEqual({
                endpoint: input.endpoint,
                groupId: input.groupId,
              })
              expect(upsertArgs.update.p256dh).toBe(input.keys.p256dh)
              expect(upsertArgs.update.auth).toBe(input.keys.auth)
              expect(upsertArgs.update.subscriberUserId).toBe(
                input.preferences.subscriberUserId,
              )
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('upsert always stores the most recent keys and preferences', () => {
      return fc.assert(
        fc.asyncProperty(
          arbValidEndpoint,
          arbGroupId,
          arbValidKeys,
          arbValidKeys,
          arbPreferences,
          arbPreferences,
          async (endpoint, groupId, keys1, keys2, prefs1, prefs2) => {
            jest.clearAllMocks()
            mockFindUnique.mockResolvedValue({ id: 'group-exists' })
            mockUpsert.mockResolvedValue({ id: 'sub-1' })

            const caller = await createCaller()

            await caller.create({
              endpoint,
              keys: keys1,
              groupId,
              preferences: prefs1,
            })

            await caller.create({
              endpoint,
              keys: keys2,
              groupId,
              preferences: prefs2,
            })

            const lastCall = mockUpsert.mock.calls[1][0] as {
              update: { p256dh: string; auth: string; notifyOnCreate: boolean }
            }
            expect(lastCall.update.p256dh).toBe(keys2.p256dh)
            expect(lastCall.update.auth).toBe(keys2.auth)
            expect(lastCall.update.notifyOnCreate).toBe(prefs2.notifyOnCreate)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  describe('Property 11: tRPC input validation rejects invalid subscription data', () => {
    /**
     * Feature: group-push-notifications, Property 11: tRPC input validation rejects invalid subscription data
     *
     * Validates: Requirements 8.1
     *
     * For any input to the create subscription procedure, the request SHALL be rejected if
     * the endpoint exceeds 2048 characters, is not a valid URL, keys.p256dh or keys.auth
     * are empty, or groupId is empty. Valid inputs SHALL be accepted.
     */
    it('rejects endpoints that are not valid URLs', () => {
      return fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }).filter((s) => {
            // Filter to strings that are NOT valid URLs
            try {
              new URL(s)
              return false
            } catch {
              return true
            }
          }),
          arbValidKeys,
          arbGroupId,
          (invalidEndpoint, keys, groupId) => {
            const result = createInputSchema.safeParse({
              endpoint: invalidEndpoint,
              keys,
              groupId,
            })
            expect(result.success).toBe(false)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('rejects endpoints exceeding 2048 characters', () => {
      return fc.assert(
        fc.property(
          fc
            .string({ minLength: 2049, maxLength: 3000 })
            .map((s) => `https://example.com/${s}`),
          arbValidKeys,
          arbGroupId,
          (longEndpoint, keys, groupId) => {
            // Ensure the endpoint is actually > 2048 chars
            fc.pre(longEndpoint.length > 2048)
            const result = createInputSchema.safeParse({
              endpoint: longEndpoint,
              keys,
              groupId,
            })
            expect(result.success).toBe(false)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('rejects empty p256dh key', () => {
      return fc.assert(
        fc.property(arbValidEndpoint, arbGroupId, (endpoint, groupId) => {
          const result = createInputSchema.safeParse({
            endpoint,
            keys: { p256dh: '', auth: 'valid-auth' },
            groupId,
          })
          expect(result.success).toBe(false)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('rejects empty auth key', () => {
      return fc.assert(
        fc.property(arbValidEndpoint, arbGroupId, (endpoint, groupId) => {
          const result = createInputSchema.safeParse({
            endpoint,
            keys: { p256dh: 'valid-p256dh', auth: '' },
            groupId,
          })
          expect(result.success).toBe(false)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('rejects empty groupId', () => {
      return fc.assert(
        fc.property(arbValidEndpoint, arbValidKeys, (endpoint, keys) => {
          const result = createInputSchema.safeParse({
            endpoint,
            keys,
            groupId: '',
          })
          expect(result.success).toBe(false)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('accepts valid inputs', () => {
      return fc.assert(
        fc.property(arbValidCreateInput, (input) => {
          const result = createInputSchema.safeParse(input)
          expect(result.success).toBe(true)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  describe('Property 12: Idempotent delete', () => {
    /**
     * Feature: group-push-notifications, Property 12: Idempotent delete
     *
     * Validates: Requirements 8.4
     *
     * For any (endpoint, groupId) pair that does not match an existing subscription,
     * calling the delete procedure SHALL complete successfully without error and
     * without modifying any database records.
     */
    it('delete completes successfully even when no matching subscription exists', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 2048 }),
          arbGroupId,
          async (endpoint, groupId) => {
            jest.clearAllMocks()
            // deleteMany returns count: 0 when nothing matches
            mockDeleteMany.mockResolvedValue({ count: 0 })

            const caller = await createCaller()
            const result = await caller.delete({ endpoint, groupId })

            // Should complete without throwing
            expect(result).toEqual({ success: true })

            // deleteMany should be called with the correct where clause
            expect(mockDeleteMany).toHaveBeenCalledWith({
              where: {
                endpoint,
                groupId,
              },
            })
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('calling delete multiple times for the same pair always succeeds', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 2048 }),
          arbGroupId,
          fc.integer({ min: 2, max: 5 }),
          async (endpoint, groupId, repeatCount) => {
            jest.clearAllMocks()
            mockDeleteMany.mockResolvedValue({ count: 0 })

            const caller = await createCaller()

            // Call delete multiple times
            for (let i = 0; i < repeatCount; i++) {
              const result = await caller.delete({ endpoint, groupId })
              expect(result).toEqual({ success: true })
            }

            // deleteMany should be called exactly repeatCount times
            expect(mockDeleteMany).toHaveBeenCalledTimes(repeatCount)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  describe('Property 13: List subscriptions returns correct set for endpoint', () => {
    /**
     * Feature: group-push-notifications, Property 13: List subscriptions returns correct set for endpoint
     *
     * Validates: Requirements 8.5
     *
     * For any endpoint with subscriptions to groups G1, G2, ..., Gn, the list query
     * SHALL return exactly those n records with their corresponding groupId and
     * preference values.
     */
    it('list returns exactly the subscriptions stored for the given endpoint', () => {
      return fc.assert(
        fc.asyncProperty(
          arbValidEndpoint,
          fc.array(
            fc.record({
              groupId: arbGroupId,
              subscriberUserId: fc.string({ minLength: 1, maxLength: 50 }),
              notifyAllMembers: fc.boolean(),
              includedUserIds: fc.constant([]),
              notifyOnCreate: fc.boolean(),
              notifyOnUpdate: fc.boolean(),
              notifyOnDelete: fc.boolean(),
            }),
            { minLength: 0, maxLength: 10 },
          ),
          async (endpoint, subscriptions) => {
            jest.clearAllMocks()
            mockFindMany.mockResolvedValue(subscriptions)

            const caller = await createCaller()
            const result = await caller.list({ endpoint })

            expect(result).toEqual(subscriptions)
            expect(result).toHaveLength(subscriptions.length)

            expect(mockFindMany).toHaveBeenCalledWith({
              where: { endpoint },
              select: {
                groupId: true,
                subscriberUserId: true,
                notifyAllMembers: true,
                includedUserIds: true,
                notifyOnCreate: true,
                notifyOnUpdate: true,
                notifyOnDelete: true,
              },
            })
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('list returns empty array when no subscriptions exist for endpoint', () => {
      return fc.assert(
        fc.asyncProperty(arbValidEndpoint, async (endpoint) => {
          jest.clearAllMocks()
          mockFindMany.mockResolvedValue([])

          const caller = await createCaller()
          const result = await caller.list({ endpoint })

          expect(result).toEqual([])
          expect(result).toHaveLength(0)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('list returns subscriptions with correct groupId and preferences for each record', () => {
      return fc.assert(
        fc.asyncProperty(
          arbValidEndpoint,
          fc.array(
            fc.record({
              groupId: arbGroupId,
              subscriberUserId: fc.string({ minLength: 1, maxLength: 50 }),
              notifyAllMembers: fc.constant(true),
              includedUserIds: fc.constant([]),
              notifyOnCreate: fc.constant(true),
              notifyOnUpdate: fc.constant(true),
              notifyOnDelete: fc.constant(true),
            }),
            { minLength: 1, maxLength: 10 },
          ),
          async (endpoint, subscriptions) => {
            jest.clearAllMocks()
            mockFindMany.mockResolvedValue(subscriptions)

            const caller = await createCaller()
            const result = await caller.list({ endpoint })

            for (let i = 0; i < result.length; i++) {
              expect(result[i].groupId).toBe(subscriptions[i].groupId)
              expect(result[i].subscriberUserId).toBe(
                subscriptions[i].subscriberUserId,
              )
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
