import { TRPCError } from '@trpc/server'
import { createExpense, updateExpense } from '../api'
import type { ExpenseFormValues } from '../schemas'

// Mock nanoid
jest.mock('nanoid', () => ({
  nanoid: () => 'mocked-nanoid',
}))

// Mock upsertFriendByEmail — called outside the transaction for non-members
jest.mock('../friends', () => ({
  upsertFriendByEmail: jest.fn().mockResolvedValue(undefined),
}))

// Mock prisma
const mockGroupFindUnique = jest.fn()
const mockExpenseCreate = jest.fn()
const mockExpenseUpdate = jest.fn()
const mockExpenseFindFirst = jest.fn()
const mockExpenseFindUnique = jest.fn()
const mockActivityCreate = jest.fn()
const mockRecurringExpenseLinkFindMany = jest.fn()
const mockExpenseFindMany = jest.fn()
const mockUserFindUnique = jest.fn()

// Transaction mock: calls the callback with a tx-like object
const mockTransaction = jest
  .fn()
  .mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      expense: {
        create: mockExpenseCreate,
        update: mockExpenseUpdate,
        findUnique: mockExpenseFindUnique,
        findUniqueOrThrow: jest
          .fn()
          .mockImplementation(async (args: { where: { id: string } }) => {
            // Return a minimal Group_Half row for the update path
            return {
              id: args.where.id,
              groupId: GROUP_ID,
              title: 'Test Expense',
              amount: 6667,
              paidById: MEMBER_A,
              splitMode: 'BY_AMOUNT',
              creationMethod: 'NON_MEMBER_SPLIT',
              isReimbursement: false,
              recurrenceRule: 'NONE',
              linkedExpenseId: null,
              expenseCurrencyCode: null,
              originalTotalAtDecomposition: 10000,
              paidBy: {
                id: MEMBER_A,
                name: MEMBER_A,
                email: `${MEMBER_A}@test.com`,
              },
              paidFor: [],
              payers: [],
              category: { id: 1, grouping: 'General' },
              documents: [],
              recurringExpenseLink: null,
            }
          }),
      },
      activity: {
        create: mockActivityCreate,
      },
    }
    return fn(tx)
  })

jest.mock('../prisma', () => ({
  prisma: {
    group: {
      findUnique: (...args: unknown[]) => mockGroupFindUnique(...args),
    },
    expense: {
      create: (...args: unknown[]) => mockExpenseCreate(...args),
      update: (...args: unknown[]) => mockExpenseUpdate(...args),
      findFirst: (...args: unknown[]) => mockExpenseFindFirst(...args),
      findUnique: (...args: unknown[]) => mockExpenseFindUnique(...args),
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
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
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
const ACTOR_USER_ID = MEMBER_A

// Minimal Group_Half row returned by the tx.expense.create mock for the create path
function makeGroupHalfRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mocked-nanoid',
    groupId: GROUP_ID,
    title: 'Test Expense',
    amount: 6667,
    paidById: MEMBER_A,
    splitMode: 'BY_AMOUNT',
    creationMethod: 'NON_MEMBER_SPLIT',
    isReimbursement: false,
    recurrenceRule: 'NONE',
    linkedExpenseId: null,
    expenseCurrencyCode: null,
    originalTotalAtDecomposition: 10000,
    paidBy: { id: MEMBER_A, name: MEMBER_A, email: `${MEMBER_A}@test.com` },
    paidFor: [
      {
        expenseId: 'mocked-nanoid',
        userId: MEMBER_A,
        shares: 3334,
        user: { id: MEMBER_A, name: MEMBER_A, email: `${MEMBER_A}@test.com` },
      },
      {
        expenseId: 'mocked-nanoid',
        userId: MEMBER_B,
        shares: 3333,
        user: { id: MEMBER_B, name: MEMBER_B, email: `${MEMBER_B}@test.com` },
      },
    ],
    payers: [
      {
        userId: MEMBER_A,
        amount: 6667,
        user: { id: MEMBER_A, name: MEMBER_A },
      },
    ],
    category: { id: 1, grouping: 'General' },
    documents: [],
    recurringExpenseLink: null,
    ...overrides,
  }
}

function mockGroup(participantIds: string[]) {
  mockGroupFindUnique.mockResolvedValue({
    id: GROUP_ID,
    currency: 'EUR',
    currencyCode: 'EUR',
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
    mockExpenseCreate.mockResolvedValue(makeGroupHalfRow())
    mockUserFindUnique.mockResolvedValue({
      email: `${NON_MEMBER}@test.com`,
      name: NON_MEMBER,
    })
    // Reset the transaction mock to use default implementation
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        expense: {
          create: mockExpenseCreate,
          update: mockExpenseUpdate,
          findUnique: mockExpenseFindUnique,
          findUniqueOrThrow: jest.fn().mockResolvedValue(makeGroupHalfRow()),
        },
        activity: {
          create: mockActivityCreate,
        },
      }
      return fn(tx)
    })
  })

  describe('rejects invalid input', () => {
    it('rejects non-member in paidBy with BAD_REQUEST', async () => {
      const values = makeExpenseFormValues({
        paidBy: [{ participant: NON_MEMBER, amount: 10000 }],
      })

      await expect(
        createExpense(values, GROUP_ID, ACTOR_USER_ID),
      ).rejects.toThrow(TRPCError)
      await expect(
        createExpense(values, GROUP_ID, ACTOR_USER_ID),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Non-members cannot be payers of a group expense.',
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

      await expect(
        createExpense(values, GROUP_ID, ACTOR_USER_ID),
      ).rejects.toThrow(TRPCError)
      await expect(
        createExpense(values, GROUP_ID, ACTOR_USER_ID),
      ).rejects.toMatchObject({
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

      await expect(
        createExpense(values, GROUP_ID, ACTOR_USER_ID),
      ).rejects.toThrow(TRPCError)
      await expect(
        createExpense(values, GROUP_ID, ACTOR_USER_ID),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: `Duplicate payer: ${MEMBER_A}`,
      })
    })

    it('rejects when group is not found', async () => {
      mockGroupFindUnique.mockResolvedValue(null)
      const values = makeExpenseFormValues()

      await expect(
        createExpense(values, 'nonexistent-group', ACTOR_USER_ID),
      ).rejects.toThrow(TRPCError)
      await expect(
        createExpense(values, 'nonexistent-group', ACTOR_USER_ID),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Group not found: nonexistent-group',
      })
    })

    it('rejects multiple payers when a non-member is in paidFor', async () => {
      const values = makeExpenseFormValues({
        amount: 10000,
        paidBy: [
          { participant: MEMBER_A, amount: 5000 },
          { participant: MEMBER_B, amount: 5000 },
        ],
        paidFor: [
          { participant: MEMBER_A, shares: 1 },
          { participant: NON_MEMBER, shares: 1 },
        ],
      })

      await expect(
        createExpense(values, GROUP_ID, ACTOR_USER_ID),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Expenses with non-members must have a single payer.',
      })
    })

    it('rejects reimbursement with non-member in paidFor', async () => {
      const values = makeExpenseFormValues({
        isReimbursement: true,
        paidFor: [
          { participant: MEMBER_A, shares: 1 },
          { participant: NON_MEMBER, shares: 1 },
        ],
      })

      await expect(
        createExpense(values, GROUP_ID, ACTOR_USER_ID),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Reimbursements cannot include non-members.',
      })
    })

    it('rejects recurring expense with non-member in paidFor', async () => {
      const values = makeExpenseFormValues({
        recurrenceRule: 'MONTHLY',
        paidFor: [
          { participant: MEMBER_A, shares: 1 },
          { participant: NON_MEMBER, shares: 1 },
        ],
      })

      await expect(
        createExpense(values, GROUP_ID, ACTOR_USER_ID),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Recurring expenses cannot include non-members.',
      })
    })

    it('rejects when all paidFor are non-members with no member slots', async () => {
      const values = makeExpenseFormValues({
        paidFor: [{ participant: NON_MEMBER, shares: 1 }],
      })

      await expect(
        createExpense(values, GROUP_ID, ACTOR_USER_ID),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'A group expense must include at least one group member.',
      })
    })
  })

  describe('decomposes expense when non-member is in paidFor', () => {
    it('returns a Group_Half with creationMethod NON_MEMBER_SPLIT and splitMode BY_AMOUNT', async () => {
      const values = makeExpenseFormValues({
        amount: 10000,
        paidBy: [{ participant: MEMBER_A, amount: 10000 }],
        paidFor: [
          { participant: MEMBER_A, shares: 1 },
          { participant: MEMBER_B, shares: 1 },
          { participant: NON_MEMBER, shares: 1 },
        ],
        splitMode: 'EVENLY',
      })

      // The first expense.create call returns the Group_Half row
      mockExpenseCreate
        .mockResolvedValueOnce(makeGroupHalfRow()) // Group_Half
        .mockResolvedValueOnce({ id: 'direct-half-id' }) // Direct_Half

      const result = await createExpense(values, GROUP_ID, ACTOR_USER_ID)

      expect(result).toMatchObject({
        creationMethod: 'NON_MEMBER_SPLIT',
        splitMode: 'BY_AMOUNT',
      })
    })

    it('creates a Direct_Half with linkedExpenseId and expenseCurrencyCode', async () => {
      const values = makeExpenseFormValues({
        amount: 10000,
        paidBy: [{ participant: MEMBER_A, amount: 10000 }],
        paidFor: [
          { participant: MEMBER_A, shares: 1 },
          { participant: MEMBER_B, shares: 1 },
          { participant: NON_MEMBER, shares: 1 },
        ],
        splitMode: 'EVENLY',
      })

      const groupHalfRow = makeGroupHalfRow()
      mockExpenseCreate
        .mockResolvedValueOnce(groupHalfRow) // Group_Half
        .mockResolvedValueOnce({ id: 'direct-half-id' }) // Direct_Half

      await createExpense(values, GROUP_ID, ACTOR_USER_ID)

      // The second expense.create call should be for the Direct_Half
      const calls = mockExpenseCreate.mock.calls
      // At minimum 2 calls: Group_Half + Direct_Half
      expect(calls.length).toBeGreaterThanOrEqual(2)

      // Find the Direct_Half create call (has groupId: null and linkedExpenseId set)
      const directHalfCall = calls.find(
        (call) =>
          call[0]?.data?.groupId === null &&
          call[0]?.data?.linkedExpenseId === groupHalfRow.id,
      )
      expect(directHalfCall).toBeDefined()
      expect(directHalfCall![0].data).toMatchObject({
        groupId: null,
        linkedExpenseId: groupHalfRow.id,
        expenseCurrencyCode: 'EUR',
        creationMethod: 'NON_MEMBER_SPLIT',
        splitMode: 'BY_AMOUNT',
      })
    })

    it('calls upsertFriendByEmail for the non-member before the transaction', async () => {
      const { upsertFriendByEmail } = jest.requireMock('../friends') as {
        upsertFriendByEmail: jest.Mock
      }

      const values = makeExpenseFormValues({
        amount: 10000,
        paidBy: [{ participant: MEMBER_A, amount: 10000 }],
        paidFor: [
          { participant: MEMBER_A, shares: 1 },
          { participant: NON_MEMBER, shares: 1 },
        ],
        splitMode: 'EVENLY',
      })

      mockExpenseCreate
        .mockResolvedValueOnce(makeGroupHalfRow({ amount: 5000 }))
        .mockResolvedValueOnce({ id: 'direct-half-id' })

      await createExpense(values, GROUP_ID, ACTOR_USER_ID)

      expect(mockUserFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: NON_MEMBER } }),
      )
      expect(upsertFriendByEmail).toHaveBeenCalled()
    })
  })

  describe('accepts valid all-member input', () => {
    it('accepts valid multi-payer expense', async () => {
      const values = makeExpenseFormValues({
        amount: 10000,
        paidBy: [
          { participant: MEMBER_A, amount: 6000 },
          { participant: MEMBER_B, amount: 4000 },
        ],
      })

      await createExpense(values, GROUP_ID, ACTOR_USER_ID)

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

      await createExpense(values, GROUP_ID, ACTOR_USER_ID)

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

      await createExpense(values, GROUP_ID, ACTOR_USER_ID)

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
    creationMethod: 'PAYMENT',
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
    mockUserFindUnique.mockResolvedValue({
      email: `${NON_MEMBER}@test.com`,
      name: NON_MEMBER,
    })
    // Reset transaction mock
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const groupHalfRow = makeGroupHalfRow({ id: EXPENSE_ID })
      const tx = {
        expense: {
          create: mockExpenseCreate,
          update: mockExpenseUpdate,
          findUnique: jest.fn().mockResolvedValue({ amount: 10000 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue(groupHalfRow),
        },
        activity: {
          create: mockActivityCreate,
        },
      }
      return fn(tx)
    })
  })

  describe('rejects invalid input', () => {
    it('rejects non-member in paidBy with BAD_REQUEST', async () => {
      const values = makeExpenseFormValues({
        paidBy: [{ participant: NON_MEMBER, amount: 10000 }],
      })

      await expect(
        updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR_USER_ID),
      ).rejects.toThrow(TRPCError)
      await expect(
        updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR_USER_ID),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Non-members cannot be payers of a group expense.',
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

      await expect(
        updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR_USER_ID),
      ).rejects.toThrow(TRPCError)
      await expect(
        updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR_USER_ID),
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

      await expect(
        updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR_USER_ID),
      ).rejects.toThrow(TRPCError)
      await expect(
        updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR_USER_ID),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: `Duplicate payer: ${MEMBER_B}`,
      })
    })

    it('rejects re-decomposing an already-split expense', async () => {
      mockExpenseFindFirst.mockResolvedValue({
        ...existingExpense,
        creationMethod: 'NON_MEMBER_SPLIT',
      })

      const values = makeExpenseFormValues({
        paidFor: [
          { participant: MEMBER_A, shares: 1 },
          { participant: NON_MEMBER, shares: 1 },
        ],
      })

      await expect(
        updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR_USER_ID),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message:
          'This expense has already been split. Edit the direct expense separately.',
      })
    })
  })

  describe('decomposes expense on first save when non-member is in paidFor', () => {
    it('returns a Group_Half with creationMethod NON_MEMBER_SPLIT and splitMode BY_AMOUNT', async () => {
      const values = makeExpenseFormValues({
        amount: 10000,
        paidBy: [{ participant: MEMBER_A, amount: 10000 }],
        paidFor: [
          { participant: MEMBER_A, shares: 1 },
          { participant: MEMBER_B, shares: 1 },
          { participant: NON_MEMBER, shares: 1 },
        ],
        splitMode: 'EVENLY',
      })

      mockExpenseCreate.mockResolvedValueOnce({ id: 'direct-half-id' })

      const result = await updateExpense(
        GROUP_ID,
        EXPENSE_ID,
        values,
        ACTOR_USER_ID,
      )

      expect(result).toMatchObject({
        creationMethod: 'NON_MEMBER_SPLIT',
        splitMode: 'BY_AMOUNT',
      })
    })

    it('creates Direct_Half with linkedExpenseId pointing to the promoted Group_Half', async () => {
      const groupHalfId = EXPENSE_ID // update path preserves the existing id
      const groupHalfRow = makeGroupHalfRow({ id: groupHalfId })

      mockTransaction.mockImplementationOnce(
        async (fn: (tx: unknown) => unknown) => {
          const tx = {
            expense: {
              create: mockExpenseCreate,
              update: mockExpenseUpdate,
              findUnique: jest.fn().mockResolvedValue({ amount: 10000 }),
              findUniqueOrThrow: jest.fn().mockResolvedValue(groupHalfRow),
            },
            activity: {
              create: mockActivityCreate,
            },
          }
          return fn(tx)
        },
      )

      mockExpenseCreate.mockResolvedValueOnce({ id: 'direct-half-id' })

      const values = makeExpenseFormValues({
        amount: 10000,
        paidBy: [{ participant: MEMBER_A, amount: 10000 }],
        paidFor: [
          { participant: MEMBER_A, shares: 1 },
          { participant: MEMBER_B, shares: 1 },
          { participant: NON_MEMBER, shares: 1 },
        ],
        splitMode: 'EVENLY',
      })

      await updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR_USER_ID)

      // Find the Direct_Half create call
      const directHalfCall = mockExpenseCreate.mock.calls.find(
        (call) =>
          call[0]?.data?.groupId === null &&
          call[0]?.data?.linkedExpenseId === groupHalfId,
      )
      expect(directHalfCall).toBeDefined()
      expect(directHalfCall![0].data).toMatchObject({
        groupId: null,
        linkedExpenseId: groupHalfId,
        expenseCurrencyCode: 'EUR',
        creationMethod: 'NON_MEMBER_SPLIT',
        splitMode: 'BY_AMOUNT',
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

      await updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR_USER_ID)

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

      await updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR_USER_ID)

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
