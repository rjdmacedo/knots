/**
 * Focused unit tests for the account-preference gate added to the email digest
 * (task 7.5). Verifies that a recipient with the master switch off is skipped,
 * and that a recipient whose mapped category has email disabled is not emailed,
 * WITHOUT changing the existing per-group member/event filters.
 */

jest.mock('@/lib/auth/email-service', () => ({
  emailService: {
    sendGroupActivityDigestEmail: jest.fn(),
  },
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    activity: { findMany: jest.fn() },
    groupMembership: { count: jest.fn(), findMany: jest.fn() },
    groupEmailDigestPending: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    user: { findUnique: jest.fn() },
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

import { emailService } from '@/lib/auth/email-service'
import { processDueGroupEmailDigests } from '@/lib/email/group-activity-digest'
import { prisma } from '@/lib/prisma'

const mockFindManyMemberships = prisma.groupMembership.findMany as jest.Mock
const mockFindManyPending = prisma.groupEmailDigestPending.findMany as jest.Mock
const mockDeletePending = prisma.groupEmailDigestPending.delete as jest.Mock
const mockFindUser = prisma.user.findUnique as jest.Mock
const mockFindManyActivities = prisma.activity.findMany as jest.Mock
const mockSend = emailService.sendGroupActivityDigestEmail as jest.Mock

function seedDuePending() {
  mockFindManyPending.mockResolvedValue([
    {
      groupId: 'group-1',
      lastActorUserId: 'alice',
      sendAfter: new Date('2026-08-21T12:00:00.000Z'),
      createdAt: new Date('2026-08-21T11:55:00.000Z'),
      group: { id: 'group-1', name: 'Trip' },
    },
  ])
  mockFindManyActivities.mockResolvedValue([
    { activityType: 'CREATE_EXPENSE', participantId: 'alice' },
  ])
  mockFindUser.mockResolvedValue({ id: 'alice', name: 'Alice' })
  mockFindManyMemberships.mockResolvedValue([
    {
      userId: 'bob',
      notifyAllMembers: true,
      includedUserIds: [],
      notifyOnCreate: true,
      notifyOnUpdate: true,
      notifyOnDelete: true,
      user: {
        id: 'bob',
        email: 'bob@example.com',
        emailVerified: new Date(),
        name: 'Bob',
      },
    },
  ])
  mockDeletePending.mockResolvedValue({})
  mockSend.mockResolvedValue({ ok: true })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXTAUTH_URL = 'http://localhost:3000'
})

describe('email digest honors account preferences', () => {
  it('skips a recipient whose master switch is off', async () => {
    seedDuePending()
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

    const result = await processDueGroupEmailDigests(
      new Date('2026-08-21T12:05:00.000Z'),
    )

    expect(mockSend).not.toHaveBeenCalled()
    expect(mockDeletePending).toHaveBeenCalled()
    expect(result.skipped).toBe(1)
  })

  it('skips email when the mapped category email flag is false', async () => {
    seedDuePending()
    mockGetPrefsForUsers.mockResolvedValue(
      new Map([
        [
          'bob',
          {
            notificationsEnabled: true,
            categories: { 'expense-created': { email: false, push: true } },
          },
        ],
      ]),
    )

    const result = await processDueGroupEmailDigests(
      new Date('2026-08-21T12:05:00.000Z'),
    )

    expect(mockSend).not.toHaveBeenCalled()
    expect(result.skipped).toBe(1)
  })

  it('delivers when master is on and the category email flag is true', async () => {
    seedDuePending()
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

    const result = await processDueGroupEmailDigests(
      new Date('2026-08-21T12:05:00.000Z'),
    )

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(result.sent).toBe(1)
  })
})
