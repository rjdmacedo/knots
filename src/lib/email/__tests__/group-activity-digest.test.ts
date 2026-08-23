/**
 * Unit tests for debounced group email digests.
 */

jest.mock('@/lib/auth/email-service', () => ({
  emailService: {
    sendGroupActivityDigestEmail: jest.fn(),
  },
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    activity: {
      findMany: jest.fn(),
    },
    groupMembership: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    groupEmailDigestPending: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}))

import { emailService } from '@/lib/auth/email-service'
import {
  GROUP_EMAIL_DIGEST_DELAY_MS,
  processDueGroupEmailDigests,
  scheduleGroupEmailDigest,
  scheduleGroupEmailDigestOnActivity,
} from '@/lib/email/group-activity-digest'
import { prisma } from '@/lib/prisma'

const mockCount = prisma.groupMembership.count as jest.Mock
const mockFindManyMemberships = prisma.groupMembership.findMany as jest.Mock
const mockUpsert = prisma.groupEmailDigestPending.upsert as jest.Mock
const mockFindManyPending = prisma.groupEmailDigestPending.findMany as jest.Mock
const mockDeletePending = prisma.groupEmailDigestPending.delete as jest.Mock
const mockFindUser = prisma.user.findUnique as jest.Mock
const mockFindManyActivities = prisma.activity.findMany as jest.Mock
const mockSend = emailService.sendGroupActivityDigestEmail as jest.Mock

describe('scheduleGroupEmailDigest', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-08-21T12:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('does nothing when no other members opted in', async () => {
    mockCount.mockResolvedValue(0)

    await scheduleGroupEmailDigest('group-1', 'actor-1')

    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('upserts pending row and resets sendAfter to now + 5 minutes', async () => {
    mockCount.mockResolvedValue(2)

    await scheduleGroupEmailDigest('group-1', 'actor-1')

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { groupId: 'group-1' },
      create: {
        groupId: 'group-1',
        lastActorUserId: 'actor-1',
        sendAfter: new Date(
          new Date('2026-08-21T12:00:00.000Z').getTime() +
            GROUP_EMAIL_DIGEST_DELAY_MS,
        ),
      },
      update: {
        lastActorUserId: 'actor-1',
        sendAfter: new Date(
          new Date('2026-08-21T12:00:00.000Z').getTime() +
            GROUP_EMAIL_DIGEST_DELAY_MS,
        ),
      },
    })
  })

  it('resets the timer when called again before sendAfter', async () => {
    mockCount.mockResolvedValue(1)

    await scheduleGroupEmailDigest('group-1', 'actor-1')

    jest.setSystemTime(new Date('2026-08-21T12:03:00.000Z'))
    await scheduleGroupEmailDigest('group-1', 'actor-2')

    expect(mockUpsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: {
          lastActorUserId: 'actor-2',
          sendAfter: new Date('2026-08-21T12:08:00.000Z'),
        },
      }),
    )
  })
})

describe('scheduleGroupEmailDigestOnActivity', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-08-21T12:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('schedules a digest but does not send immediately', async () => {
    mockCount.mockResolvedValue(1)

    scheduleGroupEmailDigestOnActivity('group-1', 'actor-1')
    await Promise.resolve()

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect(mockFindManyPending).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('processDueGroupEmailDigests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
  })

  it('sends digest emails and clears the pending row', async () => {
    mockFindManyPending.mockResolvedValue([
      {
        groupId: 'group-1',
        lastActorUserId: 'actor-1',
        sendAfter: new Date('2026-08-21T12:00:00.000Z'),
        createdAt: new Date('2026-08-21T11:55:00.000Z'),
        group: { id: 'group-1', name: 'Trip' },
      },
    ])
    mockFindManyActivities.mockResolvedValue([
      { activityType: 'CREATE_EXPENSE', participantId: 'actor-1' },
    ])
    mockFindUser.mockResolvedValue({ id: 'actor-1', name: 'Alice' })
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
    mockSend.mockResolvedValue({ ok: true })
    mockDeletePending.mockResolvedValue({})

    const result = await processDueGroupEmailDigests(
      new Date('2026-08-21T12:05:00.000Z'),
    )

    expect(mockSend).toHaveBeenCalledWith(
      'bob@example.com',
      'Alice',
      'Trip',
      'http://localhost:3000/groups/group-1/activity',
    )
    expect(mockDeletePending).toHaveBeenCalledWith({
      where: { groupId: 'group-1' },
    })
    expect(result).toEqual({
      processed: 1,
      sent: 1,
      skipped: 0,
      errors: 0,
    })
  })

  it('skips unverified recipients but still clears pending', async () => {
    mockFindManyPending.mockResolvedValue([
      {
        groupId: 'group-1',
        lastActorUserId: 'actor-1',
        sendAfter: new Date('2026-08-21T12:00:00.000Z'),
        createdAt: new Date('2026-08-21T11:55:00.000Z'),
        group: { id: 'group-1', name: 'Trip' },
      },
    ])
    mockFindManyActivities.mockResolvedValue([
      { activityType: 'CREATE_EXPENSE', participantId: 'actor-1' },
    ])
    mockFindUser.mockResolvedValue({ id: 'actor-1', name: 'Alice' })
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
          emailVerified: null,
          name: 'Bob',
        },
      },
    ])
    mockDeletePending.mockResolvedValue({})

    const result = await processDueGroupEmailDigests()

    expect(mockSend).not.toHaveBeenCalled()
    expect(mockDeletePending).toHaveBeenCalled()
    expect(result.skipped).toBe(1)
  })
})
