/**
 * Integration tests for activity querying with changes.
 *
 * Validates: Requirements 7.1, 7.2
 * - 7.1: getActivities returns activities with their associated changes included
 * - 7.2: Each activity in the response includes a changes array (may be empty for older activities)
 */

import { ActivityType } from '@prisma/client'

// --- Mocks ---

const mockActivityFindMany = jest.fn()
const mockExpenseFindMany = jest.fn()

jest.mock('../prisma', () => ({
  prisma: {
    activity: {
      findMany: (...args: unknown[]) => mockActivityFindMany(...args),
    },
    expense: {
      findMany: (...args: unknown[]) => mockExpenseFindMany(...args),
    },
  },
}))

jest.mock('nanoid', () => ({
  nanoid: () => 'mock-id-123',
}))

import { getActivities } from '../api'

describe('getActivities with changes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockExpenseFindMany.mockResolvedValue([])
  })

  describe('Requirement 7.1: activities include their associated changes', () => {
    it('includes changes in the Prisma query via include option', async () => {
      mockActivityFindMany.mockResolvedValue([])

      await getActivities('group-1')

      expect(mockActivityFindMany).toHaveBeenCalledTimes(1)
      const callArgs = mockActivityFindMany.mock.calls[0][0]
      expect(callArgs.include).toEqual(
        expect.objectContaining({ changes: true }),
      )
    })

    it('returns activities with their associated changes data', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          groupId: 'group-1',
          time: new Date('2024-01-15T10:00:00Z'),
          activityType: ActivityType.UPDATE_EXPENSE,
          participantId: 'participant-1',
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
            {
              id: 'change-2',
              activityId: 'activity-1',
              field: 'amount',
              oldValue: '5000',
              newValue: '7500',
            },
          ],
        },
      ]

      mockActivityFindMany.mockResolvedValue(mockActivities)

      const result = await getActivities('group-1')

      expect(result).toHaveLength(1)
      expect(result[0].changes).toHaveLength(2)
      expect(result[0].changes[0]).toEqual({
        id: 'change-1',
        activityId: 'activity-1',
        field: 'title',
        oldValue: 'Dinner',
        newValue: 'Lunch',
      })
      expect(result[0].changes[1]).toEqual({
        id: 'change-2',
        activityId: 'activity-1',
        field: 'amount',
        oldValue: '5000',
        newValue: '7500',
      })
    })

    it('returns multiple activities each with their own changes', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          groupId: 'group-1',
          time: new Date('2024-01-15T10:00:00Z'),
          activityType: ActivityType.UPDATE_EXPENSE,
          participantId: 'participant-1',
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
        {
          id: 'activity-2',
          groupId: 'group-1',
          time: new Date('2024-01-14T10:00:00Z'),
          activityType: ActivityType.UPDATE_GROUP,
          participantId: 'participant-2',
          expenseId: null,
          data: null,
          changes: [
            {
              id: 'change-2',
              activityId: 'activity-2',
              field: 'name',
              oldValue: 'Old Group',
              newValue: 'New Group',
            },
            {
              id: 'change-3',
              activityId: 'activity-2',
              field: 'currency',
              oldValue: 'USD',
              newValue: 'EUR',
            },
          ],
        },
      ]

      mockActivityFindMany.mockResolvedValue(mockActivities)

      const result = await getActivities('group-1')

      expect(result).toHaveLength(2)
      expect(result[0].changes).toHaveLength(1)
      expect(result[0].changes[0].field).toBe('title')
      expect(result[1].changes).toHaveLength(2)
      expect(result[1].changes[0].field).toBe('name')
      expect(result[1].changes[1].field).toBe('currency')
    })
  })

  describe('Requirement 7.2: older activities return empty changes array', () => {
    it('returns empty changes array for activities without any changes', async () => {
      const mockActivities = [
        {
          id: 'activity-old',
          groupId: 'group-1',
          time: new Date('2023-06-01T10:00:00Z'),
          activityType: ActivityType.CREATE_EXPENSE,
          participantId: 'participant-1',
          expenseId: 'expense-old',
          data: 'Old Expense',
          changes: [],
        },
      ]

      mockActivityFindMany.mockResolvedValue(mockActivities)

      const result = await getActivities('group-1')

      expect(result).toHaveLength(1)
      expect(result[0].changes).toEqual([])
      expect(Array.isArray(result[0].changes)).toBe(true)
    })

    it('handles mix of activities with and without changes', async () => {
      const mockActivities = [
        {
          id: 'activity-new',
          groupId: 'group-1',
          time: new Date('2024-01-15T10:00:00Z'),
          activityType: ActivityType.UPDATE_EXPENSE,
          participantId: 'participant-1',
          expenseId: 'expense-1',
          data: 'Updated Expense',
          changes: [
            {
              id: 'change-1',
              activityId: 'activity-new',
              field: 'amount',
              oldValue: '1000',
              newValue: '2000',
            },
          ],
        },
        {
          id: 'activity-old-1',
          groupId: 'group-1',
          time: new Date('2023-06-01T10:00:00Z'),
          activityType: ActivityType.CREATE_EXPENSE,
          participantId: 'participant-1',
          expenseId: 'expense-2',
          data: 'Old Expense 1',
          changes: [],
        },
        {
          id: 'activity-old-2',
          groupId: 'group-1',
          time: new Date('2023-05-01T10:00:00Z'),
          activityType: ActivityType.UPDATE_GROUP,
          participantId: 'participant-2',
          expenseId: null,
          data: null,
          changes: [],
        },
      ]

      mockActivityFindMany.mockResolvedValue(mockActivities)

      const result = await getActivities('group-1')

      expect(result).toHaveLength(3)
      // New activity has changes
      expect(result[0].changes).toHaveLength(1)
      expect(result[0].changes[0].field).toBe('amount')
      // Older activities have empty changes arrays
      expect(result[1].changes).toEqual([])
      expect(result[2].changes).toEqual([])
    })

    it('returns empty changes array (not null or undefined) for pre-feature activities', async () => {
      const mockActivities = [
        {
          id: 'activity-legacy',
          groupId: 'group-1',
          time: new Date('2022-01-01T10:00:00Z'),
          activityType: ActivityType.UPDATE_GROUP,
          participantId: null,
          expenseId: null,
          data: null,
          changes: [],
        },
      ]

      mockActivityFindMany.mockResolvedValue(mockActivities)

      const result = await getActivities('group-1')

      expect(result[0].changes).toBeDefined()
      expect(result[0].changes).not.toBeNull()
      expect(result[0].changes).toEqual([])
    })
  })
})
