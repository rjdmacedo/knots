import { TRPCError } from '@trpc/server'
import { createExpense, updateExpense } from '../api'
import type { ExpenseFormValues } from '../schemas'

// Mock nanoid
jest.mock('nanoid', () => ({
  nanoid: () => 'mocked-nanoid',
}))

// Mock prisma
const mockGroupFindUnique = jest.fn()
const mockExpenseCreate = jest.fn()
const mockExpenseUpdate = jest.fn()
const mockExpenseFindFirst = jest.fn()
const mockActivityCreate = jest.fn()
const mockRecurringExpenseLinkFindMany = jest.fn()
const mockExpenseFindMany = jest.fn()

jest.mock('../prisma', () => ({
  prisma: {
    group: {
      findUnique: (...args: unknown[]) => mockGroupFindUnique(...args),
    },
    expense: {
      create: (...args: unknown[]) => mockExpenseCreate(...args),
      update: (...args: unknown[]) => mockExpenseUpdate(...args),
      findFirst: (...args: unknown[]) => mockExpenseFindFirst(...args),
      findMany: (...args: unknown[]) => mockExpenseFindMany(...args),
    },
    activity: {
      create: (...args: unknown[]) => mockActivityCreate(...args),
    },
    recurringExpenseLink: {
      findMany: (...args: unknown[]) =>
        mockRecurringExpenseLinkFindMany(...args),
    },
    expenseCategoryMapping: {
      upsert: jest.fn(),
    },
  },
}))

// Mock rrule to avoid import issues
jest.mock('rrule', () => ({
  RRule: class {
    static fromString() {
      return { after: () => new Date() }
    }
  },
}))

// Mock payments module
jest.mock('../payments', () => ({
  assertPaymentEditable: jest.fn(),
}))

const GROUP_ID = 'group-1'
const MEMBER_A = 'member-a'
const MEMBER_B = 'member-b'
const MEMBER_C = 'member-c'
const NON_MEMBER = 'non-member-user'

function mockGroup(participantIds: string[]) {
  mockGroupFindUnique.mockResolvedValue({
    id: GROUP_ID,
    memberships: participantIds.map((id) => ({
      user: { id, name: id, email: `${id}@test.com` },
    })),
    participants: participantIds.map((id) => ({
      id,
      name: id,
      email: `${id}@test.com`,
    })),
  })
}

function makeExpenseFormValues(
  overrides: Partial<ExpenseFormValues> = {},
): ExpenseFormValues {
  return {
    expenseDate: new Date('2024-06-15'),
    title: 'Test Expense',
    category: 1,
    amount: 10000,
    paidBy: [{ participant: MEMBER_A, amount: 10000 }],
    paidFor: [
      { participant: MEMBER_A, shares: 1 },
      { participant: MEMBER_B, shares: 1 },
    ],
    splitMode: 'EVENLY',
    isReimbursement: false,
    documents: [],
    notes: '',
    saveDefaultSplittingOptions: false,
    saveDefaultPaidByOptions: false,
    recurrenceRule: 'NONE',
    ...overrides,
  } as ExpenseFormValues
}

describe('createExpense multi-payer validation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGroup([MEMBER_A, MEMBER_B, MEMBER_C])
    mockActivityCreate.mockResolvedValue({ id: 'activity-1', changes: [] })
    mockRecurringExpenseLinkFindMany.mockResolvedValue([])
    mockExpenseCreate.mockResolvedValue({ id: 'expense-1' })
  })

  describe('rejects invalid input', () => {
    it('rejects non-member userId with BAD_REQUEST', async () => {
      const values = makeExpenseFormValues({
        paidBy: [{ participant: NON_MEMBER, amount: 10000 }],
      })

      await expect(createExpense(values, GROUP_ID)).rejects.toThrow(TRPCError)
      await expect(createExpense(values, GROUP_ID)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: `User ${NON_MEMBER} is not a group member`,
      })
    })

    it('rejects when payer amounts do not sum to expense total', async () => {
      const values = makeExpenseFormValues({
        amount: 10000,
        paidBy: [
          { participant: MEMBER_A, amount: 6000 },
          { participant: MEMBER_B, amount: 3000 }, // sum = 9000, not 10000
        ],
      })

      await expect(createExpense(values, GROUP_ID)).rejects.toThrow(TRPCError)
      await expect(createExpense(values, GROUP_ID)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Payer amounts must sum to expense total',
      })
    })

    it('rejects duplicate payer userId with BAD_REQUEST', async () => {
      const values = makeExpenseFormValues({
        amount: 10000,
        paidBy: [
          { participant: MEMBER_A, amount: 5000 },
          { participant: MEMBER_A, amount: 5000 }, // duplicate
        ],
      })

      await expect(createExpense(values, GROUP_ID)).rejects.toThrow(TRPCError)
      await expect(createExpense(values, GROUP_ID)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: `Duplicate payer: ${MEMBER_A}`,
      })
    })

    it('rejects when group is not found', async () => {
      mockGroupFindUnique.mockResolvedValue(null)
      const values = makeExpenseFormValues()

      await expect(createExpense(values, 'nonexistent-group')).rejects.toThrow(
        TRPCError,
      )
      await expect(
        createExpense(values, 'nonexistent-group'),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Group not found: nonexistent-group',
      })
    })
  })

  describe('accepts valid input', () => {
    it('accepts valid multi-payer expense', async () => {
      const values = makeExpenseFormValues({
        amount: 10000,
        paidBy: [
          { participant: MEMBER_A, amount: 6000 },
          { participant: MEMBER_B, amount: 4000 },
        ],
      })

      await createExpense(values, GROUP_ID)

      expect(mockExpenseCreate).toHaveBeenCalledTimes(1)
      expect(mockExpenseCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 10000,
            paidById: MEMBER_A, // deprecated field set to first payer
            payers: {
              createMany: {
                data: [
                  { userId: MEMBER_A, amount: 6000 },
                  { userId: MEMBER_B, amount: 4000 },
                ],
              },
            },
          }),
        }),
      )
    })

    it('accepts valid single-payer expense', async () => {
      const values = makeExpenseFormValues({
        amount: 5000,
        paidBy: [{ participant: MEMBER_A, amount: 5000 }],
      })

      await createExpense(values, GROUP_ID)

      expect(mockExpenseCreate).toHaveBeenCalledTimes(1)
      expect(mockExpenseCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 5000,
            paidById: MEMBER_A,
            payers: {
              createMany: {
                data: [{ userId: MEMBER_A, amount: 5000 }],
              },
            },
          }),
        }),
      )
    })

    it('accepts three payers with amounts summing to total', async () => {
      const values = makeExpenseFormValues({
        amount: 9000,
        paidBy: [
          { participant: MEMBER_A, amount: 3000 },
          { participant: MEMBER_B, amount: 3000 },
          { participant: MEMBER_C, amount: 3000 },
        ],
        paidFor: [
          { participant: MEMBER_A, shares: 1 },
          { participant: MEMBER_B, shares: 1 },
          { participant: MEMBER_C, shares: 1 },
        ],
      })

      await createExpense(values, GROUP_ID)

      expect(mockExpenseCreate).toHaveBeenCalledTimes(1)
    })
  })
})

describe('updateExpense multi-payer validation', () => {
  const EXPENSE_ID = 'expense-1'

  const existingExpense = {
    id: EXPENSE_ID,
    groupId: GROUP_ID,
    title: 'Original Expense',
    amount: 10000,
    expenseDate: new Date('2024-06-15'),
    categoryId: 1,
    paidById: MEMBER_A,
    splitMode: 'EVENLY',
    isReimbursement: false,
    notes: null,
    recurrenceRule: 'NONE',
    paidBy: { id: MEMBER_A, name: MEMBER_A, email: `${MEMBER_A}@test.com` },
    paidFor: [
      {
        expenseId: EXPENSE_ID,
        userId: MEMBER_A,
        shares: 1,
        user: { id: MEMBER_A, name: MEMBER_A, email: `${MEMBER_A}@test.com` },
      },
      {
        expenseId: EXPENSE_ID,
        userId: MEMBER_B,
        shares: 1,
        user: { id: MEMBER_B, name: MEMBER_B, email: `${MEMBER_B}@test.com` },
      },
    ],
    payers: [
      {
        userId: MEMBER_A,
        amount: 10000,
        user: { id: MEMBER_A, name: MEMBER_A },
      },
    ],
    category: { id: 1, grouping: 'General' },
    documents: [],
    recurringExpenseLink: null,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGroup([MEMBER_A, MEMBER_B, MEMBER_C])
    mockExpenseFindFirst.mockResolvedValue(existingExpense)
    mockActivityCreate.mockResolvedValue({ id: 'activity-1', changes: [] })
    mockRecurringExpenseLinkFindMany.mockResolvedValue([])
    mockExpenseUpdate.mockResolvedValue({ id: EXPENSE_ID })
  })

  describe('rejects invalid input', () => {
    it('rejects non-member userId with BAD_REQUEST', async () => {
      const values = makeExpenseFormValues({
        paidBy: [{ participant: NON_MEMBER, amount: 10000 }],
      })

      await expect(updateExpense(GROUP_ID, EXPENSE_ID, values)).rejects.toThrow(
        TRPCError,
      )
      await expect(
        updateExpense(GROUP_ID, EXPENSE_ID, values),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: `User ${NON_MEMBER} is not a group member`,
      })
    })

    it('rejects amount mismatch with BAD_REQUEST', async () => {
      const values = makeExpenseFormValues({
        amount: 10000,
        paidBy: [
          { participant: MEMBER_A, amount: 7000 },
          { participant: MEMBER_B, amount: 2000 }, // sum = 9000
        ],
      })

      await expect(updateExpense(GROUP_ID, EXPENSE_ID, values)).rejects.toThrow(
        TRPCError,
      )
      await expect(
        updateExpense(GROUP_ID, EXPENSE_ID, values),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Payer amounts must sum to expense total',
      })
    })

    it('rejects duplicate payer with BAD_REQUEST', async () => {
      const values = makeExpenseFormValues({
        amount: 10000,
        paidBy: [
          { participant: MEMBER_B, amount: 5000 },
          { participant: MEMBER_B, amount: 5000 },
        ],
      })

      await expect(updateExpense(GROUP_ID, EXPENSE_ID, values)).rejects.toThrow(
        TRPCError,
      )
      await expect(
        updateExpense(GROUP_ID, EXPENSE_ID, values),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: `Duplicate payer: ${MEMBER_B}`,
      })
    })
  })

  describe('payer change triggers activity log', () => {
    it('logs paidBy change when payers are updated', async () => {
      const values = makeExpenseFormValues({
        amount: 10000,
        paidBy: [
          { participant: MEMBER_A, amount: 6000 },
          { participant: MEMBER_B, amount: 4000 },
        ],
      })

      await updateExpense(GROUP_ID, EXPENSE_ID, values)

      // Activity log should have been called with changes including paidBy
      expect(mockActivityCreate).toHaveBeenCalledTimes(1)
      const activityCall = mockActivityCreate.mock.calls[0][0]
      const changes = activityCall.data.changes?.createMany?.data

      // Find the paidBy change
      const paidByChange = changes?.find(
        (c: { field: string }) => c.field === 'paidBy',
      )
      expect(paidByChange).toBeDefined()
      expect(paidByChange.oldValue).toBe(
        JSON.stringify([{ userId: MEMBER_A, amount: 10000 }]),
      )
      // New value should contain both payers (sorted by userId)
      const newPayers = JSON.parse(paidByChange.newValue)
      expect(newPayers).toHaveLength(2)
      expect(newPayers).toContainEqual({ userId: MEMBER_A, amount: 6000 })
      expect(newPayers).toContainEqual({ userId: MEMBER_B, amount: 4000 })
    })

    it('does not log paidBy change when payers are unchanged', async () => {
      const values = makeExpenseFormValues({
        amount: 10000,
        paidBy: [{ participant: MEMBER_A, amount: 10000 }],
      })

      await updateExpense(GROUP_ID, EXPENSE_ID, values)

      expect(mockActivityCreate).toHaveBeenCalledTimes(1)
      const activityCall = mockActivityCreate.mock.calls[0][0]
      const changes = activityCall.data.changes?.createMany?.data

      // No paidBy change should be recorded
      const paidByChange = changes?.find(
        (c: { field: string }) => c.field === 'paidBy',
      )
      expect(paidByChange).toBeUndefined()
    })
  })
})
