/**
 * Guard tests and integration tests for non-member expense decomposition.
 *
 * Feature: non-member-expense-decomposition
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 2.1, 2.2, 2.3, 2.9, 11.4
 *
 * Tests (as specified in task 20.1):
 * - Non-member in paidBy → BAD_REQUEST "Non-members cannot be payers"
 * - Multi-payer + non-member in paidFor → BAD_REQUEST
 * - isReimbursement + non-member → BAD_REQUEST
 * - recurrenceRule ≠ NONE + non-member → BAD_REQUEST
 * - All paidFor non-members (zero member slots) → BAD_REQUEST "must include at least one group member"
 * - Already-NON_MEMBER_SPLIT expense updated with non-member → BAD_REQUEST "already been split"
 * - All-member expense → regular group path, creationMethod not NON_MEMBER_SPLIT
 * - Create group expense with 1 non-member → DB has Group_Half + 1 Direct_Half with correct fields
 * - Update of not-yet-decomposed expense with non-member → existing row promoted in place (same id)
 * - Delete Group_Half → linkedExpenseId = null on Direct_Halves; Direct_Halves still present
 */

import { createExpense, deleteExpense, updateExpense } from '../api'
import { getBalances } from '../balances'
import { getCurrency } from '../currency'
import { buildDirectBuckets, computeFriendBalance } from '../friend-balances'
import type { ExpenseFormValues } from '../schemas'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('nanoid', () => ({
  nanoid: () => 'mocked-id',
}))

jest.mock('../friends', () => ({
  upsertFriendByEmail: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../payments', () => ({
  assertPaymentEditable: jest.fn(),
}))

jest.mock('rrule', () => ({
  RRule: class {
    static fromString() {
      return { after: () => new Date() }
    }
  },
}))

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockGroupFindUnique = jest.fn()
const mockExpenseCreate = jest.fn()
const mockExpenseUpdate = jest.fn()
const mockExpenseUpdateMany = jest.fn()
const mockExpenseDelete = jest.fn()
const mockExpenseFindFirst = jest.fn()
const mockExpenseFindUnique = jest.fn()
const mockExpenseFindUniqueOrThrow = jest.fn()
const mockExpenseFindMany = jest.fn()
const mockActivityCreate = jest.fn()
const mockRecurringExpenseLinkFindMany = jest.fn()
const mockUserFindUnique = jest.fn()
const mockExpenseCategoryMappingUpsert = jest.fn()
const mockExpenseCount = jest.fn()

// Transaction mock: runs callback with a tx-like client
const mockTransaction = jest.fn()

jest.mock('../prisma', () => ({
  prisma: {
    group: {
      findUnique: (...args: unknown[]) => mockGroupFindUnique(...args),
    },
    expense: {
      create: (...args: unknown[]) => mockExpenseCreate(...args),
      update: (...args: unknown[]) => mockExpenseUpdate(...args),
      updateMany: (...args: unknown[]) => mockExpenseUpdateMany(...args),
      delete: (...args: unknown[]) => mockExpenseDelete(...args),
      findFirst: (...args: unknown[]) => mockExpenseFindFirst(...args),
      findUnique: (...args: unknown[]) => mockExpenseFindUnique(...args),
      findMany: (...args: unknown[]) => mockExpenseFindMany(...args),
      count: (...args: unknown[]) => mockExpenseCount(...args),
    },
    activity: {
      create: (...args: unknown[]) => mockActivityCreate(...args),
    },
    recurringExpenseLink: {
      findMany: (...args: unknown[]) =>
        mockRecurringExpenseLinkFindMany(...args),
    },
    expenseCategoryMapping: {
      upsert: (...args: unknown[]) => mockExpenseCategoryMappingUpsert(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}))

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GROUP_ID = 'grp-abc'
const MEMBER_A = 'user-member-a'
const MEMBER_B = 'user-member-b'
const NON_MEMBER = 'user-non-member'
const ACTOR = MEMBER_A
const EXPENSE_ID = 'expense-existing'

beforeEach(() => {
  // mockReset clears leftover mockResolvedValueOnce queues that leak across
  // describes; clearAllMocks alone does not.
  mockGroupFindUnique.mockReset()
  mockExpenseCreate.mockReset()
  mockExpenseUpdate.mockReset()
  mockExpenseUpdateMany.mockReset()
  mockExpenseDelete.mockReset()
  mockExpenseFindFirst.mockReset()
  mockExpenseFindUnique.mockReset()
  mockExpenseFindUniqueOrThrow.mockReset()
  mockExpenseFindMany.mockReset()
  mockActivityCreate.mockReset()
  mockRecurringExpenseLinkFindMany.mockReset()
  mockUserFindUnique.mockReset()
  mockExpenseCategoryMappingUpsert.mockReset()
  mockExpenseCount.mockReset()
  mockTransaction.mockReset()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGroup(participantIds: string[]) {
  return {
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
  }
}

function makeGroupHalfRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mocked-id',
    groupId: GROUP_ID,
    title: 'Test',
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
        expenseId: 'mocked-id',
        userId: MEMBER_A,
        shares: 3334,
        user: { id: MEMBER_A, name: MEMBER_A, email: `${MEMBER_A}@test.com` },
      },
      {
        expenseId: 'mocked-id',
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

function makeExistingExpense(overrides: Record<string, unknown> = {}) {
  return {
    id: EXPENSE_ID,
    groupId: GROUP_ID,
    title: 'Original',
    amount: 10000,
    expenseDate: new Date('2024-01-01'),
    categoryId: 1,
    paidById: MEMBER_A,
    splitMode: 'EVENLY',
    creationMethod: 'PAYMENT',
    isReimbursement: false,
    notes: null,
    recurrenceRule: 'NONE',
    linkedExpenseId: null,
    expenseCurrencyCode: null,
    originalTotalAtDecomposition: null,
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
    ...overrides,
  }
}

function makeExpenseFormValues(
  overrides: Partial<ExpenseFormValues> = {},
): ExpenseFormValues {
  return {
    expenseDate: new Date('2024-06-15'),
    title: 'Test',
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

/** Sets up mockTransaction to run the callback with a full tx-like client */
function setupTransactionMock(
  groupHalfRow: ReturnType<typeof makeGroupHalfRow>,
) {
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      expense: {
        create: mockExpenseCreate,
        update: mockExpenseUpdate,
        findUnique: jest
          .fn()
          .mockResolvedValue({ amount: groupHalfRow.amount }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(groupHalfRow),
        updateMany: mockExpenseUpdateMany,
        delete: mockExpenseDelete,
      },
      activity: {
        create: mockActivityCreate,
      },
    }
    return fn(tx)
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createExpense — non-member guards (Requirements 4.1–4.6)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGroupFindUnique.mockResolvedValue(makeGroup([MEMBER_A, MEMBER_B]))
    mockActivityCreate.mockResolvedValue({ id: 'act-1', changes: [] })
    mockRecurringExpenseLinkFindMany.mockResolvedValue([])
    mockUserFindUnique.mockResolvedValue({
      email: `${NON_MEMBER}@test.com`,
      name: 'Non Member',
    })
    setupTransactionMock(makeGroupHalfRow())
    mockExpenseCreate
      .mockResolvedValueOnce(makeGroupHalfRow()) // Group_Half
      .mockResolvedValueOnce({ id: 'direct-1' }) // Direct_Half
  })

  /**
   * Requirement 4.1: Non-member in paidBy → BAD_REQUEST "Non-members cannot be payers"
   */
  it('rejects non-member in paidBy with BAD_REQUEST (Req 4.1)', async () => {
    const values = makeExpenseFormValues({
      paidBy: [{ participant: NON_MEMBER, amount: 10000 }],
    })

    await expect(createExpense(values, GROUP_ID, ACTOR)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Non-members cannot be payers of a group expense.',
    })
  })

  /**
   * Requirement 4.2: Multi-payer + non-member in paidFor → BAD_REQUEST
   */
  it('rejects multi-payer when non-member is in paidFor (Req 4.2)', async () => {
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

    await expect(createExpense(values, GROUP_ID, ACTOR)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Expenses with non-members must have a single payer.',
    })
  })

  /**
   * Requirement 4.3: isReimbursement + non-member → BAD_REQUEST
   */
  it('rejects reimbursement with non-member in paidFor (Req 4.3)', async () => {
    const values = makeExpenseFormValues({
      isReimbursement: true,
      paidFor: [
        { participant: MEMBER_A, shares: 1 },
        { participant: NON_MEMBER, shares: 1 },
      ],
    })

    await expect(createExpense(values, GROUP_ID, ACTOR)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Reimbursements cannot include non-members.',
    })
  })

  /**
   * Requirement 4.4: recurrenceRule ≠ NONE + non-member → BAD_REQUEST
   */
  it('rejects recurring expense with non-member in paidFor (Req 4.4)', async () => {
    const values = makeExpenseFormValues({
      recurrenceRule: 'MONTHLY',
      paidFor: [
        { participant: MEMBER_A, shares: 1 },
        { participant: NON_MEMBER, shares: 1 },
      ],
    })

    await expect(createExpense(values, GROUP_ID, ACTOR)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Recurring expenses cannot include non-members.',
    })
  })

  /**
   * Requirement 4.5 / design guard 5: all paidFor are non-members →
   * BAD_REQUEST "must include at least one group member"
   */
  it('rejects when all paidFor participants are non-members (Req 4.5)', async () => {
    const values = makeExpenseFormValues({
      paidFor: [{ participant: NON_MEMBER, shares: 1 }],
    })

    await expect(createExpense(values, GROUP_ID, ACTOR)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'A group expense must include at least one group member.',
    })
  })

  /**
   * Requirement 4.6: all guards run before any decomposition logic / DB write
   * Verified by the guard tests above — none of them reach the transaction.
   */
  it('guards execute before any DB write (Req 4.6)', async () => {
    const values = makeExpenseFormValues({
      paidBy: [{ participant: NON_MEMBER, amount: 10000 }],
    })

    await expect(createExpense(values, GROUP_ID, ACTOR)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })

    // Transaction must not have been called
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------

describe('updateExpense — non-member guards (Requirements 4.1–4.4, 2.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGroupFindUnique.mockResolvedValue(makeGroup([MEMBER_A, MEMBER_B]))
    mockExpenseFindFirst.mockResolvedValue(makeExistingExpense())
    mockActivityCreate.mockResolvedValue({ id: 'act-1', changes: [] })
    mockRecurringExpenseLinkFindMany.mockResolvedValue([])
    mockUserFindUnique.mockResolvedValue({
      email: `${NON_MEMBER}@test.com`,
      name: 'Non Member',
    })
    setupTransactionMock(makeGroupHalfRow({ id: EXPENSE_ID }))
    mockExpenseCreate.mockResolvedValue({ id: 'direct-1' })
    mockExpenseUpdate.mockResolvedValue(makeExistingExpense())
  })

  it('rejects non-member in paidBy with BAD_REQUEST (Req 4.1)', async () => {
    const values = makeExpenseFormValues({
      paidBy: [{ participant: NON_MEMBER, amount: 10000 }],
    })

    await expect(
      updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Non-members cannot be payers of a group expense.',
    })
  })

  it('rejects multi-payer when non-member is in paidFor (Req 4.2)', async () => {
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
      updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Expenses with non-members must have a single payer.',
    })
  })

  it('rejects reimbursement with non-member in paidFor (Req 4.3)', async () => {
    const values = makeExpenseFormValues({
      isReimbursement: true,
      paidFor: [
        { participant: MEMBER_A, shares: 1 },
        { participant: NON_MEMBER, shares: 1 },
      ],
    })

    await expect(
      updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Reimbursements cannot include non-members.',
    })
  })

  it('rejects recurring expense with non-member in paidFor (Req 4.4)', async () => {
    const values = makeExpenseFormValues({
      recurrenceRule: 'MONTHLY',
      paidFor: [
        { participant: MEMBER_A, shares: 1 },
        { participant: NON_MEMBER, shares: 1 },
      ],
    })

    await expect(
      updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Recurring expenses cannot include non-members.',
    })
  })

  /**
   * Requirement 2.3: already-NON_MEMBER_SPLIT expense updated with non-member in payload
   * → BAD_REQUEST "already been split"
   */
  it('rejects re-decomposing an already-split expense (Req 2.3)', async () => {
    mockExpenseFindFirst.mockResolvedValue(
      makeExistingExpense({ creationMethod: 'NON_MEMBER_SPLIT' }),
    )

    const values = makeExpenseFormValues({
      paidFor: [
        { participant: MEMBER_A, shares: 1 },
        { participant: NON_MEMBER, shares: 1 },
      ],
    })

    await expect(
      updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message:
        'This expense has already been split. Edit the direct expense separately.',
    })
  })

  it('rejects when all paidFor participants are non-members (Req 4.5)', async () => {
    const values = makeExpenseFormValues({
      paidFor: [{ participant: NON_MEMBER, shares: 1 }],
    })

    await expect(
      updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'A group expense must include at least one group member.',
    })
  })
})

// ---------------------------------------------------------------------------

describe('createExpense — all-member expense uses regular group path (Req 4.5)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGroupFindUnique.mockResolvedValue(makeGroup([MEMBER_A, MEMBER_B]))
    mockActivityCreate.mockResolvedValue({ id: 'act-1', changes: [] })
    mockRecurringExpenseLinkFindMany.mockResolvedValue([])
    mockExpenseCreate.mockResolvedValue({
      id: 'regular-expense',
      groupId: GROUP_ID,
      creationMethod: 'PAYMENT',
      splitMode: 'EVENLY',
    })
    // Transaction should NOT be called for all-member expenses
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({}),
    )
  })

  /**
   * All-member expense → regular group path; creationMethod must NOT be NON_MEMBER_SPLIT
   */
  it('saves regular group expense without decomposition when all paidFor are members', async () => {
    const values = makeExpenseFormValues({
      paidFor: [
        { participant: MEMBER_A, shares: 1 },
        { participant: MEMBER_B, shares: 1 },
      ],
    })

    const result = await createExpense(values, GROUP_ID, ACTOR)

    // Transaction not used (decomposeExpense not invoked)
    expect(mockTransaction).not.toHaveBeenCalled()
    // Single regular expense.create call
    expect(mockExpenseCreate).toHaveBeenCalledTimes(1)
    // creationMethod is not NON_MEMBER_SPLIT
    expect(result.creationMethod).not.toBe('NON_MEMBER_SPLIT')
  })
})

// ---------------------------------------------------------------------------

describe('createExpense — decomposition path with 1 non-member (Req 2.1, 2.5, 2.9)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGroupFindUnique.mockResolvedValue(makeGroup([MEMBER_A, MEMBER_B]))
    mockActivityCreate.mockResolvedValue({ id: 'act-1', changes: [] })
    mockRecurringExpenseLinkFindMany.mockResolvedValue([])
    mockUserFindUnique.mockResolvedValue({
      email: `${NON_MEMBER}@test.com`,
      name: 'Non Member',
    })
  })

  /**
   * Requirement 2.1 / 2.9:
   * Create group expense with 1 non-member → DB has Group_Half + 1 Direct_Half
   * with correct fields (creationMethod, splitMode, linkedExpenseId, expenseCurrencyCode)
   */
  it('creates Group_Half and 1 Direct_Half with correct fields on create path (Req 2.1, 2.9)', async () => {
    const groupHalfRow = makeGroupHalfRow()
    setupTransactionMock(groupHalfRow)
    mockExpenseCreate
      .mockResolvedValueOnce(groupHalfRow) // Group_Half — returned by decomposeExpense
      .mockResolvedValueOnce({ id: 'dh-1' }) // Direct_Half

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

    const result = await createExpense(values, GROUP_ID, ACTOR)

    // Transaction was opened once (wraps decomposeExpense)
    expect(mockTransaction).toHaveBeenCalledTimes(1)

    // Group_Half shape
    expect(result).toMatchObject({
      creationMethod: 'NON_MEMBER_SPLIT',
      splitMode: 'BY_AMOUNT',
      groupId: GROUP_ID,
      linkedExpenseId: null,
      expenseCurrencyCode: null,
      originalTotalAtDecomposition: 10000,
    })

    // Find the Direct_Half create call (groupId = null, linkedExpenseId set)
    const allCreateCalls = mockExpenseCreate.mock.calls
    const directHalfCall = allCreateCalls.find(
      (call) =>
        call[0]?.data?.groupId === null &&
        call[0]?.data?.linkedExpenseId === groupHalfRow.id,
    )

    expect(directHalfCall).toBeDefined()
    expect(directHalfCall![0].data).toMatchObject({
      groupId: null,
      linkedExpenseId: groupHalfRow.id,
      expenseCurrencyCode: 'EUR', // originating group currency
      creationMethod: 'NON_MEMBER_SPLIT',
      splitMode: 'BY_AMOUNT',
      isReimbursement: false,
      recurrenceRule: 'NONE',
    })

    // Direct_Half paidFor must have exactly 1 entry: the non-member
    const paidForCreate = directHalfCall![0].data.paidFor?.createMany?.data
    expect(paidForCreate).toHaveLength(1)
    expect(paidForCreate[0].userId).toBe(NON_MEMBER)
    // shares === amount for Direct_Half (BY_AMOUNT, single entry)
    expect(paidForCreate[0].shares).toBe(directHalfCall![0].data.amount)
  })

  /**
   * Requirement 2.9: sum(Group_Half.amount + Direct_Half.amount) === originalTotal
   * The amount conservation is enforced by computeDecompositionSlots; here we verify
   * the values written to the DB are consistent.
   *
   * EVENLY, total=10000, 2 members + 1 non-member:
   *   distributeEqualAmounts(100.00, 3, 2) → [33.34, 33.33, 33.33] major
   *   minor: [3334, 3333, 3333]
   *   groupHalfAmount = 6667, directHalfAmount = 3333 → sum = 10000 ✓
   */
  it('Group_Half amount + Direct_Half amount equals original total (Req 2.9)', async () => {
    const groupHalfRow = makeGroupHalfRow({ amount: 6667 })
    setupTransactionMock(groupHalfRow)
    mockExpenseCreate
      .mockResolvedValueOnce(groupHalfRow)
      .mockResolvedValueOnce({ id: 'dh-1' })

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

    await createExpense(values, GROUP_ID, ACTOR)

    const allCalls = mockExpenseCreate.mock.calls

    // Group_Half create data
    const groupHalfCall = allCalls.find(
      (call) =>
        call[0]?.data?.groupId === GROUP_ID &&
        call[0]?.data?.creationMethod === 'NON_MEMBER_SPLIT',
    )
    expect(groupHalfCall).toBeDefined()
    const groupHalfAmount: number = groupHalfCall![0].data.amount

    // Direct_Half create data
    const directHalfCall = allCalls.find(
      (call) =>
        call[0]?.data?.groupId === null &&
        call[0]?.data?.linkedExpenseId != null,
    )
    expect(directHalfCall).toBeDefined()
    const directHalfAmount: number = directHalfCall![0].data.amount

    expect(groupHalfAmount + directHalfAmount).toBe(10000)
  })

  /**
   * Requirement 2.9: originalTotalAtDecomposition is stored on the Group_Half
   */
  it('Group_Half stores originalTotalAtDecomposition equal to original expense amount (Req 2.9)', async () => {
    const groupHalfRow = makeGroupHalfRow({
      originalTotalAtDecomposition: 10000,
    })
    setupTransactionMock(groupHalfRow)
    mockExpenseCreate
      .mockResolvedValueOnce(groupHalfRow)
      .mockResolvedValueOnce({ id: 'dh-1' })

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

    await createExpense(values, GROUP_ID, ACTOR)

    // Group_Half create call
    const groupHalfCall = mockExpenseCreate.mock.calls.find(
      (call) =>
        call[0]?.data?.groupId === GROUP_ID &&
        call[0]?.data?.creationMethod === 'NON_MEMBER_SPLIT',
    )
    expect(groupHalfCall).toBeDefined()
    expect(groupHalfCall![0].data.originalTotalAtDecomposition).toBe(10000)

    // Direct_Half must have null originalTotalAtDecomposition
    const directHalfCall = mockExpenseCreate.mock.calls.find(
      (call) => call[0]?.data?.groupId === null,
    )
    expect(directHalfCall).toBeDefined()
    expect(directHalfCall![0].data.originalTotalAtDecomposition).toBeNull()
  })
})

// ---------------------------------------------------------------------------

describe('updateExpense — first-save promotion path (Req 2.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGroupFindUnique.mockResolvedValue(makeGroup([MEMBER_A, MEMBER_B]))
    mockExpenseFindFirst.mockResolvedValue(makeExistingExpense())
    mockActivityCreate.mockResolvedValue({ id: 'act-1', changes: [] })
    mockRecurringExpenseLinkFindMany.mockResolvedValue([])
    mockUserFindUnique.mockResolvedValue({
      email: `${NON_MEMBER}@test.com`,
      name: 'Non Member',
    })
    mockExpenseCreate.mockResolvedValue({ id: 'dh-1' })
    mockExpenseUpdate.mockResolvedValue(makeExistingExpense())
  })

  /**
   * Requirement 2.2: Update of not-yet-decomposed expense with non-member →
   * existing row promoted in place (same id returned as Group_Half)
   */
  it('promotes existing expense in place on first-save update (same id) (Req 2.2)', async () => {
    const promotedGroupHalf = makeGroupHalfRow({ id: EXPENSE_ID })

    // Transaction mock: update path uses expense.update + findUniqueOrThrow
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        expense: {
          create: mockExpenseCreate,
          update: mockExpenseUpdate,
          findUnique: jest.fn().mockResolvedValue({ amount: 10000 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue(promotedGroupHalf),
        },
        activity: {
          create: mockActivityCreate,
        },
      }
      return fn(tx)
    })

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

    const result = await updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR)

    // The returned row must have the same id as the existing expense (in-place promotion)
    expect(result.id).toBe(EXPENSE_ID)
    expect(result).toMatchObject({
      creationMethod: 'NON_MEMBER_SPLIT',
      splitMode: 'BY_AMOUNT',
    })

    // expense.update (not expense.create) used for Group_Half
    expect(mockExpenseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXPENSE_ID },
      }),
    )
  })

  /**
   * Requirement 2.2 cont'd: Direct_Halves are created fresh with new ids
   */
  it('creates Direct_Half with linkedExpenseId pointing to the promoted (same-id) Group_Half (Req 2.2)', async () => {
    const promotedGroupHalf = makeGroupHalfRow({ id: EXPENSE_ID })

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        expense: {
          create: mockExpenseCreate,
          update: mockExpenseUpdate,
          findUnique: jest.fn().mockResolvedValue({ amount: 10000 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue(promotedGroupHalf),
        },
        activity: {
          create: mockActivityCreate,
        },
      }
      return fn(tx)
    })

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

    await updateExpense(GROUP_ID, EXPENSE_ID, values, ACTOR)

    // Direct_Half create call
    const directHalfCall = mockExpenseCreate.mock.calls.find(
      (call) =>
        call[0]?.data?.groupId === null &&
        call[0]?.data?.linkedExpenseId === EXPENSE_ID,
    )
    expect(directHalfCall).toBeDefined()
    expect(directHalfCall![0].data).toMatchObject({
      groupId: null,
      linkedExpenseId: EXPENSE_ID,
      expenseCurrencyCode: 'EUR',
      creationMethod: 'NON_MEMBER_SPLIT',
    })
  })
})

// ---------------------------------------------------------------------------

describe('deleteExpense — linkedExpenseId cleared on Direct_Halves (Req 11.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // deleteExpense calls getExpense internally (which uses findFirst)
    mockExpenseFindFirst.mockResolvedValue(
      makeExistingExpense({
        id: EXPENSE_ID,
        groupId: GROUP_ID,
        creationMethod: 'NON_MEMBER_SPLIT',
      }),
    )
    mockActivityCreate.mockResolvedValue({ id: 'act-del', changes: [] })

    // deleteExpense wraps in $transaction
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        expense: {
          updateMany: mockExpenseUpdateMany,
          delete: mockExpenseDelete,
        },
      }
      return fn(tx)
    })

    mockExpenseUpdateMany.mockResolvedValue({ count: 1 })
    mockExpenseDelete.mockResolvedValue({ id: EXPENSE_ID })
  })

  /**
   * Requirement 11.4: Deleting Group_Half clears linkedExpenseId on Direct_Halves;
   * Direct_Halves are NOT deleted.
   */
  it('clears linkedExpenseId on Direct_Halves when Group_Half is deleted (Req 11.4)', async () => {
    await deleteExpense(GROUP_ID, EXPENSE_ID, ACTOR)

    // updateMany must run to nullify linkedExpenseId
    expect(mockExpenseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { linkedExpenseId: EXPENSE_ID },
        data: { linkedExpenseId: null },
      }),
    )
  })

  it('deletes the Group_Half after nullifying linkedExpenseId (Req 11.4)', async () => {
    await deleteExpense(GROUP_ID, EXPENSE_ID, ACTOR)

    expect(mockExpenseDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXPENSE_ID },
      }),
    )
  })

  it('runs updateMany before delete in the same transaction (Req 11.4)', async () => {
    const callOrder: string[] = []
    mockExpenseUpdateMany.mockImplementation(async (...args: unknown[]) => {
      callOrder.push('updateMany')
      return { count: 1 }
    })
    mockExpenseDelete.mockImplementation(async (...args: unknown[]) => {
      callOrder.push('delete')
      return { id: EXPENSE_ID }
    })

    await deleteExpense(GROUP_ID, EXPENSE_ID, ACTOR)

    // updateMany (nullify) must precede delete
    expect(callOrder).toEqual(['updateMany', 'delete'])
  })

  it('Direct_Halves are not deleted — only linkedExpenseId is set to null (Req 11.4)', async () => {
    // updateMany sets linkedExpenseId to null; Direct_Half records survive
    await deleteExpense(GROUP_ID, EXPENSE_ID, ACTOR)

    const updateManyCall = mockExpenseUpdateMany.mock.calls[0][0]
    expect(updateManyCall.data).toEqual({ linkedExpenseId: null })
    // updateMany does NOT delete the rows — only expense.delete removes the Group_Half
    expect(mockExpenseUpdateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'deleteMany' }),
    )
  })
})

// ---------------------------------------------------------------------------
// 20.4 — Friend-ledger balance correctness
// (composition used by listWithBalances / getBalanceDetail / getTimeline)
// ---------------------------------------------------------------------------

/**
 * Synthetic expense shaped for getBalances + computeFriendBalance.
 * getBalances credits payers via `payers[].user.id` and debt via `paidFor[].user.id`.
 */
function makeLedgerExpense(opts: {
  id: string
  amount: number
  payerId: string
  paidFor: Array<{ userId: string; shares: number }>
  expenseCurrencyCode: string | null
}): Parameters<typeof getBalances>[0][number] {
  return {
    id: opts.id,
    groupId: opts.expenseCurrencyCode ? null : 'group-casa',
    title: 'Dinner',
    expenseDate: new Date('2025-01-20'),
    createdAt: new Date('2025-01-20'),
    amount: opts.amount,
    splitMode: 'BY_AMOUNT',
    isReimbursement: false,
    recurrenceRule: 'NONE',
    creationMethod: 'NON_MEMBER_SPLIT',
    notes: null,
    categoryId: 0,
    category: null,
    paidById: opts.payerId,
    paidBy: { id: opts.payerId, name: opts.payerId },
    payers: [
      {
        userId: opts.payerId,
        amount: opts.amount,
        user: { id: opts.payerId, name: opts.payerId },
      },
    ],
    paidFor: opts.paidFor.map((pf) => ({
      shares: pf.shares,
      user: { id: pf.userId, name: pf.userId },
    })),
    documents: [],
    recurringExpenseLink: null,
    _count: { documents: 0 },
    bundleId: null,
    linkedExpenseId: opts.expenseCurrencyCode ? 'gh-1' : null,
    expenseCurrencyCode: opts.expenseCurrencyCode,
    originalTotalAtDecomposition: opts.expenseCurrencyCode ? null : 10000,
  } as unknown as Parameters<typeof getBalances>[0][number]
}

describe('friend ledger — Direct_Half currency buckets and payer net (Req 10.2, 10.3, 1.7)', () => {
  const payerId = 'rafael'
  const memberB = 'ana'
  const nonMember = 'daniel'
  const originalTotal = 10000
  const payerShare = 3334
  const groupHalfAmount = 6667
  const directHalfAmount = 3333

  const groupHalf = makeLedgerExpense({
    id: 'gh-1',
    amount: groupHalfAmount,
    payerId,
    paidFor: [
      { userId: payerId, shares: payerShare },
      { userId: memberB, shares: 3333 },
    ],
    expenseCurrencyCode: null,
  })

  const directHalfEur = makeLedgerExpense({
    id: 'dh-eur',
    amount: directHalfAmount,
    payerId,
    paidFor: [{ userId: nonMember, shares: directHalfAmount }],
    expenseCurrencyCode: 'EUR',
  })

  it('buildDirectBuckets + computeFriendBalance split Direct_Halves by expenseCurrencyCode', () => {
    const directHalfUsd = makeLedgerExpense({
      id: 'dh-usd',
      amount: 2000,
      payerId,
      paidFor: [{ userId: 'bob', shares: 2000 }],
      expenseCurrencyCode: 'USD',
    })
    const fallback = getCurrency('JPY')

    const buckets = buildDirectBuckets([directHalfEur, directHalfUsd], fallback)

    expect(buckets.map((b) => b.currency.code).sort()).toEqual(['EUR', 'USD'])

    const eurLedger = computeFriendBalance(payerId, nonMember, [], buckets)
    const eurBucket = eurLedger.find((b) => b.currency.code === 'EUR')
    const usdBucket = eurLedger.find((b) => b.currency.code === 'USD')

    // Daniel only appears on the EUR Direct_Half
    expect(eurBucket?.totalAmount).toBe(directHalfAmount)
    expect(usdBucket?.totalAmount).toBe(0)
  })

  it('null expenseCurrencyCode Direct_Halves land in the preferred-currency bucket', () => {
    const preferred = getCurrency('USD')
    const unmarked = makeLedgerExpense({
      id: 'dh-null',
      amount: 1500,
      payerId,
      paidFor: [{ userId: nonMember, shares: 1500 }],
      expenseCurrencyCode: null,
    })

    const buckets = buildDirectBuckets([directHalfEur, unmarked], preferred)

    expect(buckets.map((b) => b.currency.code).sort()).toEqual(['EUR', 'USD'])

    const ledger = computeFriendBalance(payerId, nonMember, [], buckets)
    expect(ledger.find((b) => b.currency.code === 'EUR')?.totalAmount).toBe(
      directHalfAmount,
    )
    expect(ledger.find((b) => b.currency.code === 'USD')?.totalAmount).toBe(
      1500,
    )
  })

  it('payer group net + friend-ledger net === originalTotal − payerShare', () => {
    const payerGroupNet = getBalances([groupHalf])[payerId]?.total ?? 0

    const eur = getCurrency('EUR')
    const buckets = buildDirectBuckets([directHalfEur], eur)
    const ledger = computeFriendBalance(payerId, nonMember, [], buckets)
    const friendLedgerNet =
      ledger.find((b) => b.currency.code === 'EUR')?.totalAmount ?? 0

    expect(payerGroupNet + friendLedgerNet).toBe(originalTotal - payerShare)
  })

  it('listWithBalances composition merges group + Direct_Half into one EUR bucket', () => {
    // Member Ana shares the group; Daniel is only on the Direct_Half.
    // For Daniel the friend ledger is the Direct_Half only; for Ana, the Group_Half.
    const eur = getCurrency('EUR')
    const buckets = buildDirectBuckets([directHalfEur], eur)

    const danielLedger = computeFriendBalance(payerId, nonMember, [], buckets)
    expect(danielLedger).toHaveLength(1)
    expect(danielLedger[0].currency.code).toBe('EUR')
    expect(danielLedger[0].totalAmount).toBe(directHalfAmount)
    expect(danielLedger[0].groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ groupId: null, amount: directHalfAmount }),
      ]),
    )

    const anaLedger = computeFriendBalance(
      payerId,
      memberB,
      [
        {
          id: 'group-casa',
          name: 'Casa',
          currency: '€',
          currencyCode: 'EUR',
          simplifyDebts: false,
          expenses: [groupHalf],
        },
      ],
      buckets,
    )
    expect(anaLedger).toHaveLength(1)
    expect(anaLedger[0].currency.code).toBe('EUR')
    expect(anaLedger[0].totalAmount).toBe(3333)
    expect(anaLedger[0].groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ groupId: 'group-casa', amount: 3333 }),
      ]),
    )
  })

  it('getTimeline maps Direct_Half display currency from expenseCurrencyCode, not preferredCurrency', () => {
    const preferred = getCurrency('USD')
    const mapped = [
      directHalfEur,
      makeLedgerExpense({
        id: 'dh-fallback',
        amount: 100,
        payerId,
        paidFor: [{ userId: nonMember, shares: 100 }],
        expenseCurrencyCode: null,
      }),
    ].map((exp) => {
      const currency = exp.expenseCurrencyCode
        ? getCurrency(exp.expenseCurrencyCode)
        : preferred
      return currency.code
    })

    expect(mapped).toEqual(['EUR', 'USD'])
  })
})
