/**
 * Tests for global activity querying across all user groups.
 */

import { ActivityType } from '@prisma/client'

const mockGroupMembershipFindMany = jest.fn()
const mockActivityFindMany = jest.fn()
const mockExpenseFindMany = jest.fn()
const mockGroupFindMany = jest.fn()

jest.mock('../prisma', () => ({
  prisma: {
    groupMembership: {
      findMany: (...args: unknown[]) => mockGroupMembershipFindMany(...args),
    },
    activity: {
      findMany: (...args: unknown[]) => mockActivityFindMany(...args),
    },
    expense: {
      findMany: (...args: unknown[]) => mockExpenseFindMany(...args),
    },
    group: {
      findMany: (...args: unknown[]) => mockGroupFindMany(...args),
    },
  },
}))

jest.mock('nanoid', () => ({
  nanoid: () => 'mock-id-123',
}))

import { getGlobalActivities } from '../api'

describe('getGlobalActivities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockExpenseFindMany.mockResolvedValue([])
    mockGroupFindMany.mockResolvedValue([])
  })

  it('returns empty array when user has no group memberships', async () => {
    mockGroupMembershipFindMany.mockResolvedValue([])

    const result = await getGlobalActivities('user-1')

    expect(result).toEqual([])
    expect(mockActivityFindMany).not.toHaveBeenCalled()
  })

  it('queries activities for all groups the user belongs to', async () => {
    mockGroupMembershipFindMany.mockResolvedValue([
      { groupId: 'group-1' },
      { groupId: 'group-2' },
    ])
    mockActivityFindMany.mockResolvedValue([])

    await getGlobalActivities('user-1')

    expect(mockGroupMembershipFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
    expect(mockActivityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: { in: ['group-1', 'group-2'] } },
        include: { changes: true },
        orderBy: [{ time: 'desc' }],
      }),
    )
  })

  it('includes changes in the Prisma query', async () => {
    mockGroupMembershipFindMany.mockResolvedValue([{ groupId: 'group-1' }])
    mockActivityFindMany.mockResolvedValue([])

    await getGlobalActivities('user-1')

    const callArgs = mockActivityFindMany.mock.calls[0][0]
    expect(callArgs.include).toEqual(expect.objectContaining({ changes: true }))
  })

  it('returns activities with expense and group data', async () => {
    mockGroupMembershipFindMany.mockResolvedValue([{ groupId: 'group-1' }])
    mockActivityFindMany.mockResolvedValue([
      {
        id: 'activity-1',
        groupId: 'group-1',
        time: new Date('2024-01-15T10:00:00Z'),
        activityType: ActivityType.UPDATE_EXPENSE,
        participantId: 'user-2',
        expenseId: 'expense-1',
        data: 'Lunch',
        changes: [
          {
            id: 'change-1',
            activityId: 'activity-1',
            field: 'title',
            oldValue: 'Dinner',
            newValue: 'Lunch',
          },
        ],
      },
    ])
    mockExpenseFindMany.mockResolvedValue([
      {
        id: 'expense-1',
        groupId: 'group-1',
        title: 'Lunch',
      },
    ])
    mockGroupFindMany.mockResolvedValue([
      {
        id: 'group-1',
        name: 'Trip',
        currency: '$',
        currencyCode: 'USD',
        memberships: [
          {
            user: {
              id: 'user-2',
              name: 'Alice',
              email: 'alice@example.com',
            },
          },
        ],
      },
    ])

    const result = await getGlobalActivities('user-1')

    expect(result).toHaveLength(1)
    expect(result[0].changes).toHaveLength(1)
    expect(result[0].expense).toEqual(
      expect.objectContaining({ id: 'expense-1', title: 'Lunch' }),
    )
    expect(result[0].group).toEqual({
      id: 'group-1',
      name: 'Trip',
      currency: '$',
      currencyCode: 'USD',
      participants: [
        { id: 'user-2', name: 'Alice', email: 'alice@example.com' },
      ],
    })
  })

  it('batch loads expenses and groups for multiple activities', async () => {
    mockGroupMembershipFindMany.mockResolvedValue([
      { groupId: 'group-1' },
      { groupId: 'group-2' },
    ])
    mockActivityFindMany.mockResolvedValue([
      {
        id: 'activity-1',
        groupId: 'group-1',
        time: new Date('2024-01-15T10:00:00Z'),
        activityType: ActivityType.CREATE_EXPENSE,
        participantId: 'user-1',
        expenseId: 'expense-1',
        data: 'Dinner',
        changes: [],
      },
      {
        id: 'activity-2',
        groupId: 'group-2',
        time: new Date('2024-01-14T10:00:00Z'),
        activityType: ActivityType.UPDATE_GROUP,
        participantId: 'user-1',
        expenseId: null,
        data: null,
        changes: [],
      },
    ])
    mockExpenseFindMany.mockResolvedValue([
      { id: 'expense-1', groupId: 'group-1', title: 'Dinner' },
    ])
    mockGroupFindMany.mockResolvedValue([
      {
        id: 'group-1',
        name: 'Trip',
        currency: '$',
        currencyCode: 'USD',
        memberships: [
          { user: { id: 'user-1', name: 'Bob', email: 'bob@example.com' } },
        ],
      },
      {
        id: 'group-2',
        name: 'Home',
        currency: '€',
        currencyCode: 'EUR',
        memberships: [
          { user: { id: 'user-1', name: 'Bob', email: 'bob@example.com' } },
        ],
      },
    ])

    await getGlobalActivities('user-1')

    expect(mockExpenseFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['expense-1'] } },
    })
    expect(mockGroupFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['group-1', 'group-2'] } },
      include: {
        memberships: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    })
  })

  it('respects offset and length options', async () => {
    mockGroupMembershipFindMany.mockResolvedValue([{ groupId: 'group-1' }])
    mockActivityFindMany.mockResolvedValue([])

    await getGlobalActivities('user-1', { offset: 10, length: 5 })

    expect(mockActivityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 5,
      }),
    )
  })
})
