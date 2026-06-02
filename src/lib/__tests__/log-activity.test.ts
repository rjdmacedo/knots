/**
 * Unit tests for logActivity changes persistence.
 *
 * Validates: Requirements 4.2, 4.3
 * - 4.2: When changes is provided and non-empty, ActivityChange records are created
 * - 4.3: When changes is undefined or empty, no ActivityChange records are created (backward compatible)
 */

import { ActivityType } from '@prisma/client'

// --- Mocks ---

const mockCreate = jest.fn()

jest.mock('../prisma', () => ({
  prisma: {
    activity: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}))

jest.mock('nanoid', () => ({
  nanoid: () => 'mock-id-123',
}))

import { logActivity } from '../api'

describe('logActivity changes persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreate.mockResolvedValue({
      id: 'mock-id-123',
      groupId: 'group-1',
      activityType: ActivityType.UPDATE_EXPENSE,
      participantId: null,
      expenseId: null,
      data: null,
      changes: [],
    })
  })

  describe('Requirement 4.2: providing changes creates ActivityChange records', () => {
    it('creates correct number of ActivityChange records via nested createMany', async () => {
      const changes = [
        { field: 'title', oldValue: 'Dinner', newValue: 'Lunch' },
        { field: 'amount', oldValue: '5000', newValue: '7500' },
        {
          field: 'paidBy',
          oldValue: 'participant-1',
          newValue: 'participant-2',
        },
      ]

      mockCreate.mockResolvedValue({
        id: 'mock-id-123',
        groupId: 'group-1',
        activityType: ActivityType.UPDATE_EXPENSE,
        participantId: 'participant-1',
        expenseId: 'expense-1',
        data: 'Lunch',
        changes,
      })

      await logActivity('group-1', ActivityType.UPDATE_EXPENSE, {
        userId: 'participant-1',
        expenseId: 'expense-1',
        data: 'Lunch',
        changes,
      })

      expect(mockCreate).toHaveBeenCalledTimes(1)
      const callArgs = mockCreate.mock.calls[0][0]

      // Verify nested createMany is present with correct data
      expect(callArgs.data.changes).toBeDefined()
      expect(callArgs.data.changes.createMany).toBeDefined()
      expect(callArgs.data.changes.createMany.data).toHaveLength(3)
      expect(callArgs.data.changes.createMany.data).toEqual([
        { field: 'title', oldValue: 'Dinner', newValue: 'Lunch' },
        { field: 'amount', oldValue: '5000', newValue: '7500' },
        {
          field: 'paidBy',
          oldValue: 'participant-1',
          newValue: 'participant-2',
        },
      ])
    })

    it('creates a single ActivityChange record when one change is provided', async () => {
      const changes = [
        { field: 'title', oldValue: 'Old Title', newValue: 'New Title' },
      ]

      mockCreate.mockResolvedValue({
        id: 'mock-id-123',
        groupId: 'group-1',
        activityType: ActivityType.UPDATE_GROUP,
        changes,
      })

      await logActivity('group-1', ActivityType.UPDATE_GROUP, { changes })

      const callArgs = mockCreate.mock.calls[0][0]
      expect(callArgs.data.changes.createMany.data).toHaveLength(1)
      expect(callArgs.data.changes.createMany.data[0]).toEqual({
        field: 'title',
        oldValue: 'Old Title',
        newValue: 'New Title',
      })
    })

    it('handles changes with null oldValue (creation scenario)', async () => {
      const changes = [
        { field: 'title', oldValue: null, newValue: 'New Expense' },
        { field: 'amount', oldValue: null, newValue: '5000' },
      ]

      mockCreate.mockResolvedValue({
        id: 'mock-id-123',
        groupId: 'group-1',
        activityType: ActivityType.CREATE_EXPENSE,
        changes,
      })

      await logActivity('group-1', ActivityType.CREATE_EXPENSE, {
        expenseId: 'expense-1',
        data: 'New Expense',
        changes,
      })

      const callArgs = mockCreate.mock.calls[0][0]
      expect(callArgs.data.changes.createMany.data).toEqual([
        { field: 'title', oldValue: null, newValue: 'New Expense' },
        { field: 'amount', oldValue: null, newValue: '5000' },
      ])
    })

    it('handles changes with null newValue (deletion scenario)', async () => {
      const changes = [
        { field: 'title', oldValue: 'Deleted Expense', newValue: null },
        { field: 'amount', oldValue: '3000', newValue: null },
      ]

      mockCreate.mockResolvedValue({
        id: 'mock-id-123',
        groupId: 'group-1',
        activityType: ActivityType.DELETE_EXPENSE,
        changes,
      })

      await logActivity('group-1', ActivityType.DELETE_EXPENSE, {
        expenseId: 'expense-1',
        data: 'Deleted Expense',
        changes,
      })

      const callArgs = mockCreate.mock.calls[0][0]
      expect(callArgs.data.changes.createMany.data).toEqual([
        { field: 'title', oldValue: 'Deleted Expense', newValue: null },
        { field: 'amount', oldValue: '3000', newValue: null },
      ])
    })

    it('includes changes relation in the query result via include', async () => {
      const changes = [{ field: 'currency', oldValue: 'USD', newValue: 'EUR' }]

      mockCreate.mockResolvedValue({
        id: 'mock-id-123',
        groupId: 'group-1',
        activityType: ActivityType.UPDATE_GROUP,
        changes,
      })

      await logActivity('group-1', ActivityType.UPDATE_GROUP, { changes })

      const callArgs = mockCreate.mock.calls[0][0]
      expect(callArgs.include).toEqual({ changes: true })
    })
  })

  describe('Requirement 4.3: backward compatibility when no changes provided', () => {
    it('does not include changes in Prisma call when changes is undefined', async () => {
      await logActivity('group-1', ActivityType.UPDATE_EXPENSE, {
        userId: 'participant-1',
        expenseId: 'expense-1',
      })

      const callArgs = mockCreate.mock.calls[0][0]
      expect(callArgs.data.changes).toBeUndefined()
    })

    it('does not include changes in Prisma call when extra is undefined', async () => {
      await logActivity('group-1', ActivityType.UPDATE_EXPENSE)

      const callArgs = mockCreate.mock.calls[0][0]
      expect(callArgs.data.changes).toBeUndefined()
    })

    it('does not include changes in Prisma call when changes is an empty array', async () => {
      await logActivity('group-1', ActivityType.UPDATE_EXPENSE, {
        userId: 'participant-1',
        changes: [],
      })

      const callArgs = mockCreate.mock.calls[0][0]
      expect(callArgs.data.changes).toBeUndefined()
    })

    it('still creates the activity record with other extra fields when no changes', async () => {
      await logActivity('group-1', ActivityType.CREATE_EXPENSE, {
        userId: 'participant-1',
        expenseId: 'expense-1',
        data: 'Test Expense',
      })

      const callArgs = mockCreate.mock.calls[0][0]
      expect(callArgs.data.groupId).toBe('group-1')
      expect(callArgs.data.activityType).toBe(ActivityType.CREATE_EXPENSE)
      expect(callArgs.data.participantId).toBe('participant-1')
      expect(callArgs.data.expenseId).toBe('expense-1')
      expect(callArgs.data.data).toBe('Test Expense')
      expect(callArgs.data.changes).toBeUndefined()
    })
  })
})
