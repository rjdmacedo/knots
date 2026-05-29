/**
 * Property-based tests for the notification dispatch service.
 *
 * Feature: group-push-notifications
 * - Property 7: Participant-based notification filtering
 * - Property 8: Notification dispatch reaches all eligible subscriptions
 * - Property 10: Subscription cleanup on HTTP 410/404 only
 *
 * Validates: Requirements 5.2, 5.3, 6.1, 6.4, 6.5
 */

import { ActivityType } from '@prisma/client'
import fc from 'fast-check'

// --- Mocks ---

const mockSendNotification = jest.fn()
jest.mock('web-push', () => {
  class WebPushError extends Error {
    statusCode: number
    constructor(message: string, statusCode: number) {
      super(message)
      this.name = 'WebPushError'
      this.statusCode = statusCode
    }
  }
  return {
    __esModule: true,
    default: {
      setVapidDetails: jest.fn(),
      sendNotification: (...args: unknown[]) => mockSendNotification(...args),
    },
    WebPushError,
  }
})

const mockFindMany = jest.fn()
const mockFindUniqueGroup = jest.fn()
const mockFindUniqueExpense = jest.fn()
const mockDelete = jest.fn()

jest.mock('../../prisma', () => ({
  prisma: {
    pushSubscription: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
    group: {
      findUnique: (...args: unknown[]) => mockFindUniqueGroup(...args),
    },
    expense: {
      findUnique: (...args: unknown[]) => mockFindUniqueExpense(...args),
    },
  },
}))

jest.mock('../../env', () => ({
  env: {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'test-vapid-public-key',
    VAPID_PRIVATE_KEY: 'test-vapid-private-key',
    NEXT_PUBLIC_BASE_URL: 'https://example.com',
  },
}))

import { dispatchNotifications } from '../dispatch-notifications'

const MockWebPushError = jest.requireMock('web-push').WebPushError as new (
  message: string,
  statusCode: number,
) => Error & { statusCode: number }

// --- Constants ---

const PBT_NUM_RUNS = 30

const ACTIVITY_TYPES = [
  ActivityType.CREATE_EXPENSE,
  ActivityType.UPDATE_EXPENSE,
  ActivityType.DELETE_EXPENSE,
  ActivityType.UPDATE_GROUP,
] as const

// --- Generators ---

const arbActivityType = fc.constantFrom(...ACTIVITY_TYPES)

const arbSubscription = (groupId: string) =>
  fc.record({
    id: fc.uuid(),
    endpoint: fc.webUrl(),
    p256dh: fc.base64String({ minLength: 10, maxLength: 50 }),
    auth: fc.base64String({ minLength: 10, maxLength: 20 }),
    groupId: fc.constant(groupId),
    participantName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), {
      nil: null,
    }),
    createdAt: fc.constant(new Date()),
    updatedAt: fc.constant(new Date()),
  })

const arbSubscriptions = (groupId: string) =>
  fc.array(arbSubscription(groupId), { minLength: 1, maxLength: 10 })

// --- Tests ---

describe('Dispatch Notifications Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFindUniqueGroup.mockResolvedValue({ name: 'Test Group' })
    mockFindUniqueExpense.mockResolvedValue({ title: 'Test Expense' })
    mockDelete.mockResolvedValue({})
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Property 7: Participant-based notification filtering', () => {
    /**
     * Validates: Requirements 5.2, 5.3
     *
     * For any subscription and activity pair, the notification SHALL be sent
     * if and only if the subscription has no associated participantName OR
     * the subscription's associated participant ID differs from the activity's participantId.
     */
    it('notifications are sent only when subscription has no participantName or participantName differs from activity participantId', () => {
      return fc.assert(
        fc.asyncProperty(
          arbActivityType,
          fc.string({ minLength: 1, maxLength: 50 }),
          arbSubscriptions('group-1'),
          fc.option(fc.string({ minLength: 1, maxLength: 50 }), {
            nil: undefined,
          }),
          async (activityType, groupId, subscriptions, participantId) => {
            jest.clearAllMocks()
            mockFindMany.mockResolvedValue(subscriptions)
            mockFindUniqueGroup.mockResolvedValue({ name: 'Test Group' })
            mockFindUniqueExpense.mockResolvedValue({ title: 'Test Expense' })
            mockSendNotification.mockResolvedValue({})

            await dispatchNotifications(groupId, activityType, {
              participantId,
              expenseId: 'expense-1',
            })

            // Determine which subscriptions should be eligible
            const eligible = subscriptions.filter(
              (sub) =>
                !sub.participantName ||
                !participantId ||
                sub.participantName !== participantId,
            )

            // Each eligible subscription should have received a notification
            expect(mockSendNotification).toHaveBeenCalledTimes(eligible.length)

            // Verify the endpoints that were called match the eligible subscriptions
            const calledEndpoints = mockSendNotification.mock.calls.map(
              (call) => (call[0] as { endpoint: string }).endpoint,
            )
            const eligibleEndpoints = eligible.map((sub) => sub.endpoint)
            expect(calledEndpoints.sort()).toEqual(eligibleEndpoints.sort())
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('subscriptions with participantName matching activity participantId are never notified', () => {
      return fc.assert(
        fc.asyncProperty(
          arbActivityType,
          fc.string({ minLength: 1, maxLength: 50 }),
          async (activityType, participantId) => {
            jest.clearAllMocks()

            // Create subscriptions where all have the same participantName as the activity
            const subscriptions = [
              {
                id: 'sub-1',
                endpoint: 'https://push.example.com/1',
                p256dh: 'key1',
                auth: 'auth1',
                groupId: 'group-1',
                participantName: participantId,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              {
                id: 'sub-2',
                endpoint: 'https://push.example.com/2',
                p256dh: 'key2',
                auth: 'auth2',
                groupId: 'group-1',
                participantName: participantId,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ]

            mockFindMany.mockResolvedValue(subscriptions)
            mockFindUniqueGroup.mockResolvedValue({ name: 'Test Group' })
            mockFindUniqueExpense.mockResolvedValue({ title: 'Test Expense' })
            mockSendNotification.mockResolvedValue({})

            await dispatchNotifications('group-1', activityType, {
              participantId,
              expenseId: 'expense-1',
            })

            // No notifications should be sent since all subscriptions match the participant
            expect(mockSendNotification).not.toHaveBeenCalled()
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  describe('Property 8: Notification dispatch reaches all eligible subscriptions', () => {
    /**
     * Validates: Requirements 6.1
     *
     * For any group with N active subscriptions and an activity logged with participantId P,
     * the number of push messages sent SHALL equal the count of subscriptions whose
     * associated participant ID is either null or different from P.
     */
    it('number of push messages equals count of eligible subscriptions', () => {
      return fc.assert(
        fc.asyncProperty(
          arbActivityType,
          fc.string({ minLength: 1, maxLength: 50 }),
          arbSubscriptions('group-1'),
          fc.option(fc.string({ minLength: 1, maxLength: 50 }), {
            nil: undefined,
          }),
          async (activityType, groupId, subscriptions, participantId) => {
            jest.clearAllMocks()
            mockFindMany.mockResolvedValue(subscriptions)
            mockFindUniqueGroup.mockResolvedValue({ name: 'Test Group' })
            mockFindUniqueExpense.mockResolvedValue({ title: 'Test Expense' })
            mockSendNotification.mockResolvedValue({})

            await dispatchNotifications(groupId, activityType, {
              participantId,
              expenseId: 'expense-1',
            })

            // Count eligible subscriptions
            const eligibleCount = subscriptions.filter(
              (sub) =>
                !sub.participantName ||
                !participantId ||
                sub.participantName !== participantId,
            ).length

            expect(mockSendNotification).toHaveBeenCalledTimes(eligibleCount)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('all eligible subscriptions receive the same payload', () => {
      return fc.assert(
        fc.asyncProperty(
          arbActivityType,
          arbSubscriptions('group-1'),
          async (activityType, subscriptions) => {
            jest.clearAllMocks()
            // Use no participantId so all subscriptions are eligible
            mockFindMany.mockResolvedValue(subscriptions)
            mockFindUniqueGroup.mockResolvedValue({ name: 'Test Group' })
            mockFindUniqueExpense.mockResolvedValue({ title: 'Test Expense' })
            mockSendNotification.mockResolvedValue({})

            await dispatchNotifications('group-1', activityType, {
              expenseId: 'expense-1',
            })

            // All subscriptions should receive the same payload string
            if (mockSendNotification.mock.calls.length > 1) {
              const firstPayload = mockSendNotification.mock.calls[0][1]
              for (const call of mockSendNotification.mock.calls) {
                expect(call[1]).toBe(firstPayload)
              }
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  describe('Property 10: Subscription cleanup on HTTP 410/404 only', () => {
    /**
     * Validates: Requirements 6.4, 6.5
     *
     * For any push delivery attempt, the subscription SHALL be deleted from the database
     * if and only if the push service responds with HTTP 410 or 404. For all other error
     * responses (network errors, 5xx, 4xx other than 404), the subscription SHALL remain
     * in the database.
     */
    it('subscriptions are deleted only when push delivery returns HTTP 410 or 404', () => {
      const arbStatusCode = fc.constantFrom(410, 404)

      return fc.assert(
        fc.asyncProperty(
          arbActivityType,
          arbSubscriptions('group-1'),
          arbStatusCode,
          async (activityType, subscriptions, statusCode) => {
            jest.clearAllMocks()
            mockFindMany.mockResolvedValue(subscriptions)
            mockFindUniqueGroup.mockResolvedValue({ name: 'Test Group' })
            mockFindUniqueExpense.mockResolvedValue({ title: 'Test Expense' })
            mockDelete.mockResolvedValue({})

            // Make all push sends fail with the given status code
            mockSendNotification.mockRejectedValue(
              new MockWebPushError(`HTTP ${statusCode}`, statusCode),
            )

            await dispatchNotifications('group-1', activityType, {
              expenseId: 'expense-1',
            })

            // All subscriptions should be deleted since all got 410/404
            expect(mockDelete).toHaveBeenCalledTimes(subscriptions.length)

            // Verify each deleted subscription matches one of the original subscriptions
            const deletedIds = mockDelete.mock.calls.map(
              (call) => (call[0] as { where: { id: string } }).where.id,
            )
            const subscriptionIds = subscriptions.map((sub) => sub.id)
            for (const deletedId of deletedIds) {
              expect(subscriptionIds).toContain(deletedId)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('subscriptions are NOT deleted for non-410/404 errors', () => {
      // Status codes that should NOT trigger deletion
      const arbNonDeleteStatusCode = fc.constantFrom(
        400,
        401,
        403,
        429,
        500,
        502,
        503,
      )

      return fc.assert(
        fc.asyncProperty(
          arbActivityType,
          arbSubscriptions('group-1'),
          arbNonDeleteStatusCode,
          async (activityType, subscriptions, statusCode) => {
            jest.clearAllMocks()
            mockFindMany.mockResolvedValue(subscriptions)
            mockFindUniqueGroup.mockResolvedValue({ name: 'Test Group' })
            mockFindUniqueExpense.mockResolvedValue({ title: 'Test Expense' })

            // Make all push sends fail with a non-410/404 status code
            mockSendNotification.mockRejectedValue(
              new MockWebPushError(`HTTP ${statusCode}`, statusCode),
            )

            await dispatchNotifications('group-1', activityType, {
              expenseId: 'expense-1',
            })

            // No subscriptions should be deleted
            expect(mockDelete).not.toHaveBeenCalled()
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('subscriptions are NOT deleted for generic (non-WebPushError) errors', () => {
      return fc.assert(
        fc.asyncProperty(
          arbActivityType,
          arbSubscriptions('group-1'),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (activityType, subscriptions, errorMessage) => {
            jest.clearAllMocks()
            mockFindMany.mockResolvedValue(subscriptions)
            mockFindUniqueGroup.mockResolvedValue({ name: 'Test Group' })
            mockFindUniqueExpense.mockResolvedValue({ title: 'Test Expense' })

            // Make all push sends fail with a generic error (no statusCode)
            mockSendNotification.mockRejectedValue(new Error(errorMessage))

            await dispatchNotifications('group-1', activityType, {
              expenseId: 'expense-1',
            })

            // No subscriptions should be deleted for generic errors
            expect(mockDelete).not.toHaveBeenCalled()
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
