/**
 * Focused unit tests for the account-preference gate added to push dispatch
 * (task 7.5). Verifies that dispatch skips a recipient whose master switch is
 * off, and skips push when the mapped category's push flag is false, WITHOUT
 * disturbing the existing per-group eligibility filter.
 */

const mockSendNotification = jest.fn()
jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
  WebPushError: class WebPushError extends Error {},
}))

const mockFindMany = jest.fn()
const mockFindUniqueGroup = jest.fn()
const mockFindUniqueExpense = jest.fn()

jest.mock('../../prisma', () => ({
  prisma: {
    pushSubscription: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      delete: jest.fn(),
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
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'pub',
    VAPID_PRIVATE_KEY: 'priv',
    NEXT_PUBLIC_BASE_URL: 'https://example.com',
  },
}))

const mockGetPrefsForUsers = jest.fn()
jest.mock('@/lib/notifications/notification-preferences-service', () => {
  const actual = jest.requireActual(
    '@/lib/notifications/notification-preferences-service',
  )
  return {
    ...actual,
    getNotificationPreferencesForUsers: (...args: unknown[]) =>
      mockGetPrefsForUsers(...args),
  }
})

import { ActivityType } from '@prisma/client'

import { dispatchNotifications } from '../dispatch-notifications'

function makeSub(id: string, subscriberUserId: string) {
  return {
    id,
    endpoint: `https://push.example.com/${id}`,
    p256dh: 'p256dh',
    auth: 'auth',
    groupId: 'group-1',
    subscriberUserId,
    notifyAllMembers: true,
    includedUserIds: [],
    notifyOnCreate: true,
    notifyOnUpdate: true,
    notifyOnDelete: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  mockFindUniqueGroup.mockResolvedValue({ name: 'Trip', memberships: [] })
  mockFindUniqueExpense.mockResolvedValue({ title: 'Lunch' })
  mockSendNotification.mockResolvedValue({})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('push dispatch honors account preferences', () => {
  it('skips a recipient whose master switch is off', async () => {
    mockFindMany.mockResolvedValue([makeSub('sub-1', 'bob')])
    mockGetPrefsForUsers.mockResolvedValue(
      new Map([
        [
          'bob',
          {
            notificationsEnabled: false,
            categories: { 'expense-created': { email: true, push: true } },
          },
        ],
      ]),
    )

    await dispatchNotifications('group-1', ActivityType.CREATE_EXPENSE, {
      userId: 'alice',
      expenseId: 'e1',
    })

    expect(mockSendNotification).not.toHaveBeenCalled()
  })

  it('skips push when the category push flag is false', async () => {
    mockFindMany.mockResolvedValue([makeSub('sub-1', 'bob')])
    mockGetPrefsForUsers.mockResolvedValue(
      new Map([
        [
          'bob',
          {
            notificationsEnabled: true,
            categories: { 'expense-created': { email: true, push: false } },
          },
        ],
      ]),
    )

    await dispatchNotifications('group-1', ActivityType.CREATE_EXPENSE, {
      userId: 'alice',
      expenseId: 'e1',
    })

    expect(mockSendNotification).not.toHaveBeenCalled()
  })

  it('delivers when the category push flag is true and master is on', async () => {
    mockFindMany.mockResolvedValue([makeSub('sub-1', 'bob')])
    mockGetPrefsForUsers.mockResolvedValue(
      new Map([
        [
          'bob',
          {
            notificationsEnabled: true,
            categories: { 'expense-created': { email: true, push: true } },
          },
        ],
      ]),
    )

    await dispatchNotifications('group-1', ActivityType.CREATE_EXPENSE, {
      userId: 'alice',
      expenseId: 'e1',
    })

    expect(mockSendNotification).toHaveBeenCalledTimes(1)
  })

  it('preserves current behavior for unmapped activity types (UPDATE_GROUP)', async () => {
    mockFindMany.mockResolvedValue([makeSub('sub-1', 'bob')])

    await dispatchNotifications('group-1', ActivityType.UPDATE_GROUP, {
      userId: 'alice',
    })

    // Unmapped types must not consult account preferences at all...
    expect(mockGetPrefsForUsers).not.toHaveBeenCalled()
    // ...and still dispatch to the group-eligible subscription.
    expect(mockSendNotification).toHaveBeenCalledTimes(1)
  })
})
