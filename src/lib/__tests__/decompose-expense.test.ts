/**
 * Unit tests for `computeDecompositionSlots`.
 *
 * Feature: non-member-expense-decomposition
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 12.1
 *
 * Note: `originalTotalAtDecomposition`, `linkedExpenseId`, and
 * `expenseCurrencyCode` are DB-writer fields set by `decomposeExpense`, not by
 * `computeDecompositionSlots`. Those are tested in task 20.3.
 */

// Mock nanoid (ESM package) to avoid import errors in Jest
jest.mock('nanoid', () => ({
  nanoid: () => 'mocked-nanoid',
}))

import { computeDecompositionSlots } from '../decompose-expense'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EUR_GROUP = {
  participants: [{ id: 'user-1' }, { id: 'user-2' }],
  currencyCode: 'EUR' as const,
  currency: 'EUR',
}

const JPY_GROUP = {
  participants: [{ id: 'user-1' }, { id: 'user-2' }],
  currencyCode: 'JPY' as const,
  currency: 'JPY',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeDecompositionSlots', () => {
  /**
   * EVENLY — 2 members + 1 non-member, EUR total = 10000 minor (100.00 EUR)
   *
   * distributeEqualAmounts(100.00, 3, 2) produces [33.34, 33.33, 33.33] major
   * → minor: [3334, 3333, 3333]
   * memberSlots = [3334, 3333]  → groupHalfAmount = 6667
   * nonMemberSlots = [3333]     → directHalfEntries[0].amount = 3333
   *
   * Validates: Requirements 3.1, 3.2, 3.6
   */
  describe('EVENLY split', () => {
    it('2 members + 1 non-member, total 10000 EUR minor → groupHalfAmount=6667, directHalf=3333', () => {
      const result = computeDecompositionSlots(
        {
          amount: 10000,
          splitMode: 'EVENLY',
          paidFor: [
            { participant: 'user-1', shares: 1 },
            { participant: 'user-2', shares: 1 },
            { participant: 'user-3', shares: 1 }, // non-member
          ],
        },
        EUR_GROUP,
      )

      expect(result).not.toBeNull()
      expect(result!.groupHalfAmount).toBe(6667)
      expect(result!.directHalfEntries).toHaveLength(1)
      expect(result!.directHalfEntries[0].userId).toBe('user-3')
      expect(result!.directHalfEntries[0].amount).toBe(3333)
    })

    it('groupHalfAmount + sum(directHalfEntries) equals total', () => {
      const result = computeDecompositionSlots(
        {
          amount: 10000,
          splitMode: 'EVENLY',
          paidFor: [
            { participant: 'user-1', shares: 1 },
            { participant: 'user-2', shares: 1 },
            { participant: 'user-3', shares: 1 },
          ],
        },
        EUR_GROUP,
      )

      expect(result).not.toBeNull()
      const directSum = result!.directHalfEntries.reduce(
        (s, e) => s + e.amount,
        0,
      )
      expect(result!.groupHalfAmount + directSum).toBe(10000)
    })

    /**
     * Remainder edge case: total = 1 minor unit, 2 members + 1 non-member
     *
     * distributeEqualAmounts(0.01, 3, 2) → totalMinor=1, baseMinor=0, remainder=1
     * Slots: [1/100, 0/100, 0/100] → minor [1, 0, 0]
     * nonMemberSlot = 0 → directHalfEntries is empty → returns null
     *
     * Validates: Requirement 3.7 (zero non-member slot → null)
     */
    it('total 1 minor unit, 2 members + 1 non-member → returns null (non-member slot is 0)', () => {
      const result = computeDecompositionSlots(
        {
          amount: 1,
          splitMode: 'EVENLY',
          paidFor: [
            { participant: 'user-1', shares: 1 },
            { participant: 'user-2', shares: 1 },
            { participant: 'user-3', shares: 1 }, // non-member gets slot 0
          ],
        },
        EUR_GROUP,
      )

      expect(result).toBeNull()
    })
  })

  /**
   * BY_SHARES — weighted distribution
   *
   * P1 (conservation): groupHalfAmount + sum(directHalfEntries[i].amount) === total
   * P2 (Group_Half internal consistency): sum(memberEntries[j].shares) === groupHalfAmount
   *
   * Validates: Requirements 3.3, 3.6, 3.7
   */
  describe('BY_SHARES split', () => {
    it('P1: amount conservation — groupHalf + directHalf sum equals total', () => {
      const total = 9000
      const result = computeDecompositionSlots(
        {
          amount: total,
          splitMode: 'BY_SHARES',
          paidFor: [
            { participant: 'user-1', shares: 2 },
            { participant: 'user-2', shares: 3 },
            { participant: 'user-3', shares: 5 }, // non-member, 50%
          ],
        },
        EUR_GROUP,
      )

      expect(result).not.toBeNull()
      const directSum = result!.directHalfEntries.reduce(
        (s, e) => s + e.amount,
        0,
      )
      expect(result!.groupHalfAmount + directSum).toBe(total)
    })

    it('P2: Group_Half internal consistency — sum of memberEntries.shares equals groupHalfAmount', () => {
      const result = computeDecompositionSlots(
        {
          amount: 9000,
          splitMode: 'BY_SHARES',
          paidFor: [
            { participant: 'user-1', shares: 2 },
            { participant: 'user-2', shares: 3 },
            { participant: 'user-3', shares: 5 }, // non-member
          ],
        },
        EUR_GROUP,
      )

      expect(result).not.toBeNull()
      const memberShareSum = result!.memberEntries.reduce(
        (s, e) => s + e.shares,
        0,
      )
      expect(memberShareSum).toBe(result!.groupHalfAmount)
    })

    it('non-member userId is preserved in directHalfEntries', () => {
      const result = computeDecompositionSlots(
        {
          amount: 9000,
          splitMode: 'BY_SHARES',
          paidFor: [
            { participant: 'user-1', shares: 2 },
            { participant: 'user-2', shares: 3 },
            { participant: 'user-3', shares: 5 },
          ],
        },
        EUR_GROUP,
      )

      expect(result).not.toBeNull()
      expect(result!.directHalfEntries[0].userId).toBe('user-3')
    })
  })

  /**
   * BY_PERCENTAGE — basis-point weighted distribution
   *
   * P1 (conservation): groupHalfAmount + sum(directHalfEntries[i].amount) === total
   * P2 (Group_Half internal consistency): sum(memberEntries[j].shares) === groupHalfAmount
   *
   * Validates: Requirements 3.4, 3.6, 3.7
   */
  describe('BY_PERCENTAGE split', () => {
    it('P1: amount conservation — groupHalf + directHalf sum equals total', () => {
      const total = 12000
      // weights: user-1=3333 bp, user-2=3334 bp, user-3=3333 bp (≈33.33% each)
      const result = computeDecompositionSlots(
        {
          amount: total,
          splitMode: 'BY_PERCENTAGE',
          paidFor: [
            { participant: 'user-1', shares: 3333 },
            { participant: 'user-2', shares: 3334 },
            { participant: 'user-3', shares: 3333 }, // non-member
          ],
        },
        EUR_GROUP,
      )

      expect(result).not.toBeNull()
      const directSum = result!.directHalfEntries.reduce(
        (s, e) => s + e.amount,
        0,
      )
      expect(result!.groupHalfAmount + directSum).toBe(total)
    })

    it('P2: Group_Half internal consistency — sum of memberEntries.shares equals groupHalfAmount', () => {
      const result = computeDecompositionSlots(
        {
          amount: 12000,
          splitMode: 'BY_PERCENTAGE',
          paidFor: [
            { participant: 'user-1', shares: 3333 },
            { participant: 'user-2', shares: 3334 },
            { participant: 'user-3', shares: 3333 }, // non-member
          ],
        },
        EUR_GROUP,
      )

      expect(result).not.toBeNull()
      const memberShareSum = result!.memberEntries.reduce(
        (s, e) => s + e.shares,
        0,
      )
      expect(memberShareSum).toBe(result!.groupHalfAmount)
    })

    it('non-member userId is preserved in directHalfEntries', () => {
      const result = computeDecompositionSlots(
        {
          amount: 12000,
          splitMode: 'BY_PERCENTAGE',
          paidFor: [
            { participant: 'user-1', shares: 3333 },
            { participant: 'user-2', shares: 3334 },
            { participant: 'user-3', shares: 3333 },
          ],
        },
        EUR_GROUP,
      )

      expect(result).not.toBeNull()
      expect(result!.directHalfEntries[0].userId).toBe('user-3')
    })
  })

  /**
   * BY_AMOUNT — explicit minor-unit amounts, no factor multiplication
   *
   * pf.shares are already minor-unit values; they must pass through as-is.
   * 3333 must stay 3333, NOT become 333300 (factor=100 must not be applied).
   *
   * Validates: Requirements 3.5, 3.6
   */
  describe('BY_AMOUNT split', () => {
    it('shares are used as-is (not multiplied by factor) — 3333 stays 3333', () => {
      const result = computeDecompositionSlots(
        {
          amount: 9999,
          splitMode: 'BY_AMOUNT',
          paidFor: [
            { participant: 'user-1', shares: 3333 },
            { participant: 'user-2', shares: 3333 },
            { participant: 'user-3', shares: 3333 }, // non-member
          ],
        },
        EUR_GROUP,
      )

      expect(result).not.toBeNull()
      // Non-member direct half: 3333, not 333300
      expect(result!.directHalfEntries[0].amount).toBe(3333)
      // Member entries: 3333 each, not multiplied
      expect(result!.memberEntries[0].shares).toBe(3333)
      expect(result!.memberEntries[1].shares).toBe(3333)
    })

    it('groupHalfAmount equals sum of member shares', () => {
      const result = computeDecompositionSlots(
        {
          amount: 9999,
          splitMode: 'BY_AMOUNT',
          paidFor: [
            { participant: 'user-1', shares: 3333 },
            { participant: 'user-2', shares: 3333 },
            { participant: 'user-3', shares: 3333 }, // non-member
          ],
        },
        EUR_GROUP,
      )

      expect(result).not.toBeNull()
      expect(result!.groupHalfAmount).toBe(6666) // 3333 + 3333
    })

    it('zero non-member share returns null', () => {
      const result = computeDecompositionSlots(
        {
          amount: 6000,
          splitMode: 'BY_AMOUNT',
          paidFor: [
            { participant: 'user-1', shares: 3000 },
            { participant: 'user-2', shares: 3000 },
            { participant: 'user-3', shares: 0 }, // non-member with 0
          ],
        },
        EUR_GROUP,
      )

      expect(result).toBeNull()
    })
  })

  /**
   * JPY (decimal_digits = 0, factor = 1) — amounts stay as whole numbers
   *
   * total = 10000 JPY, 2 members + 1 non-member (EVENLY)
   * distributeEqualAmounts(10000, 3, 0) → totalMinor=10000, baseMinor=3333, remainder=1
   * Slots: [3334, 3333, 3333] → Math.round(slot * 1) = [3334, 3333, 3333]
   * groupHalfAmount = 3334 + 3333 = 6667, directHalf = 3333
   * Sum = 6667 + 3333 = 10000 ✓
   *
   * Validates: Requirements 3.1, 12.1 (correct handling of zero-decimal currencies)
   */
  describe('JPY (decimal_digits = 0)', () => {
    it('total 10000 JPY, 2 members + 1 non-member → whole-number slots, sum = 10000', () => {
      const total = 10000
      const result = computeDecompositionSlots(
        {
          amount: total,
          splitMode: 'EVENLY',
          paidFor: [
            { participant: 'user-1', shares: 1 },
            { participant: 'user-2', shares: 1 },
            { participant: 'user-3', shares: 1 }, // non-member
          ],
        },
        JPY_GROUP,
      )

      expect(result).not.toBeNull()

      // All amounts must be whole numbers (no decimal)
      expect(Number.isInteger(result!.groupHalfAmount)).toBe(true)
      for (const entry of result!.directHalfEntries) {
        expect(Number.isInteger(entry.amount)).toBe(true)
      }
      for (const entry of result!.memberEntries) {
        expect(Number.isInteger(entry.shares)).toBe(true)
      }

      // Amount conservation: groupHalf + directHalves sum to total
      const directSum = result!.directHalfEntries.reduce(
        (s, e) => s + e.amount,
        0,
      )
      expect(result!.groupHalfAmount + directSum).toBe(total)

      // Specific values matching the EVENLY distribution
      expect(result!.groupHalfAmount).toBe(6667)
      expect(result!.directHalfEntries[0].amount).toBe(3333)
    })
  })
})

// ---------------------------------------------------------------------------
// Tests for `decomposeExpense` update path and delete semantics
// ---------------------------------------------------------------------------

// These tests use mocked Prisma — no real DB connection required.

// Mock prisma for delete-path and update-path tests
const mockExpenseCreate = jest.fn()
const mockExpenseUpdate = jest.fn()
const mockExpenseFindUnique = jest.fn()
const mockExpenseFindUniqueOrThrow = jest.fn()
const mockExpenseFindFirst = jest.fn()
const mockExpenseFindMany = jest.fn()
const mockExpenseUpdateMany = jest.fn()
const mockExpenseDelete = jest.fn()
const mockActivityCreate = jest.fn()
const mockGroupFindUnique = jest.fn()
const mockRecurringExpenseLinkFindMany = jest.fn()
const mockUserFindUnique = jest.fn()

const mockTransaction = jest
  .fn()
  .mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      expense: {
        create: mockExpenseCreate,
        update: mockExpenseUpdate,
        findUnique: mockExpenseFindUnique,
        findUniqueOrThrow: mockExpenseFindUniqueOrThrow,
        updateMany: mockExpenseUpdateMany,
        delete: mockExpenseDelete,
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
      updateMany: (...args: unknown[]) => mockExpenseUpdateMany(...args),
      delete: (...args: unknown[]) => mockExpenseDelete(...args),
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

// Mock payments module (used by deleteExpense)
jest.mock('../payments', () => ({
  assertPaymentEditable: jest.fn(),
}))

// Mock upsertFriendByEmail
jest.mock('../friends', () => ({
  upsertFriendByEmail: jest.fn().mockResolvedValue(undefined),
}))

import { deleteExpense } from '../api'
import { getCurrency } from '../currency'
import { decomposeExpense } from '../decompose-expense'
import { buildDirectBuckets } from '../friend-balances'

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const GROUP_ID = 'group-decompose-test'
const MEMBER_A = 'member-a'
const MEMBER_B = 'member-b'
const NON_MEMBER_X = 'non-member-x'
const EXISTING_EXPENSE_ID = 'existing-expense-id'
const DIRECT_HALF_ID = 'direct-half-id'

const TEST_GROUP = {
  id: GROUP_ID,
  currency: 'EUR',
  currencyCode: 'EUR' as const,
  participants: [{ id: MEMBER_A }, { id: MEMBER_B }],
}

const BASE_VALUES = {
  expenseDate: new Date('2024-06-15'),
  title: 'Test Decomposition',
  category: 1,
  amount: 10000,
  paidBy: [{ participant: MEMBER_A, amount: 10000 }],
  paidFor: [
    { participant: MEMBER_A, shares: 1 },
    { participant: MEMBER_B, shares: 1 },
    { participant: NON_MEMBER_X, shares: 1 },
  ],
  splitMode: 'EVENLY' as const,
  isReimbursement: false,
  documents: [],
  notes: '',
  saveDefaultSplittingOptions: false,
  saveDefaultPaidByOptions: false,
  recurrenceRule: 'NONE' as const,
}

function makeGroupHalfRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    groupId: GROUP_ID,
    title: 'Test Decomposition',
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
        expenseId: id,
        userId: MEMBER_A,
        shares: 3334,
        user: { id: MEMBER_A, name: MEMBER_A, email: `${MEMBER_A}@test.com` },
      },
      {
        expenseId: id,
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

// ---------------------------------------------------------------------------
// decomposeExpense — update path
// ---------------------------------------------------------------------------

/**
 * Tests for the update path of `decomposeExpense` (existingExpenseId is set).
 *
 * Requirements: 2.4
 */
describe('decomposeExpense — update path', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Step 0: read previousAmount
    mockExpenseFindUnique.mockResolvedValue({ amount: 10000 })
    // Group_Half update
    mockExpenseUpdate.mockResolvedValue({ id: EXISTING_EXPENSE_ID })
    // Fetch full row after update
    mockExpenseFindUniqueOrThrow.mockResolvedValue(
      makeGroupHalfRow(EXISTING_EXPENSE_ID),
    )
    // Direct_Half create
    mockExpenseCreate.mockResolvedValue({ id: DIRECT_HALF_ID })
    // Activity
    mockActivityCreate.mockResolvedValue({ id: 'activity-1', changes: [] })
  })

  /**
   * The update path must call `tx.expense.update` (not `tx.expense.create`)
   * for the Group_Half when `existingExpenseId` is provided.
   *
   * Validates: Requirement 2.4
   */
  it('calls expense.update (not expense.create) for the Group_Half', async () => {
    const tx = {
      expense: {
        create: mockExpenseCreate,
        update: mockExpenseUpdate,
        findUnique: mockExpenseFindUnique,
        findUniqueOrThrow: mockExpenseFindUniqueOrThrow,
      },
      activity: { create: mockActivityCreate },
    }

    await decomposeExpense(
      { values: BASE_VALUES, group: TEST_GROUP, actorUserId: MEMBER_A },
      EXISTING_EXPENSE_ID,
      tx as any,
    )

    // update must be called with the existing expense id
    expect(mockExpenseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: EXISTING_EXPENSE_ID } }),
    )
    // create should only be called for Direct_Halves (not for the Group_Half)
    const groupHalfCreate = mockExpenseCreate.mock.calls.find(
      (call) => call[0]?.data?.groupId === GROUP_ID,
    )
    expect(groupHalfCreate).toBeUndefined()
  })

  /**
   * The returned groupHalf.id must equal the existing expense id (promoted in place).
   *
   * Validates: Requirement 2.4
   */
  it('returned groupHalf.id equals the existingExpenseId (promoted in place)', async () => {
    const tx = {
      expense: {
        create: mockExpenseCreate,
        update: mockExpenseUpdate,
        findUnique: mockExpenseFindUnique,
        findUniqueOrThrow: mockExpenseFindUniqueOrThrow,
      },
      activity: { create: mockActivityCreate },
    }

    const result = await decomposeExpense(
      { values: BASE_VALUES, group: TEST_GROUP, actorUserId: MEMBER_A },
      EXISTING_EXPENSE_ID,
      tx as any,
    )

    expect(result).not.toBeNull()
    expect(result!.groupHalf.id).toBe(EXISTING_EXPENSE_ID)
  })

  /**
   * Direct_Halves must receive freshly generated ids (not the existing expense id).
   *
   * Validates: Requirement 2.4
   */
  it('Direct_Halves get new ids distinct from the existingExpenseId', async () => {
    // Return a unique id for each create call to simulate randomId()
    let createCallCount = 0
    mockExpenseCreate.mockImplementation(async () => {
      createCallCount++
      return { id: `new-direct-id-${createCallCount}` }
    })

    const tx = {
      expense: {
        create: mockExpenseCreate,
        update: mockExpenseUpdate,
        findUnique: mockExpenseFindUnique,
        findUniqueOrThrow: mockExpenseFindUniqueOrThrow,
      },
      activity: { create: mockActivityCreate },
    }

    const result = await decomposeExpense(
      { values: BASE_VALUES, group: TEST_GROUP, actorUserId: MEMBER_A },
      EXISTING_EXPENSE_ID,
      tx as any,
    )

    expect(result).not.toBeNull()
    for (const dh of result!.directHalves) {
      expect(dh.id).not.toBe(EXISTING_EXPENSE_ID)
    }
    expect(result!.directHalves.length).toBeGreaterThan(0)
  })

  /**
   * The update path should log UPDATE_EXPENSE activity (not CREATE_EXPENSE).
   *
   * Validates: Requirement 2.4, 9.2
   */
  it('logs UPDATE_EXPENSE activity when existingExpenseId is provided', async () => {
    const tx = {
      expense: {
        create: mockExpenseCreate,
        update: mockExpenseUpdate,
        findUnique: mockExpenseFindUnique,
        findUniqueOrThrow: mockExpenseFindUniqueOrThrow,
      },
      activity: { create: mockActivityCreate },
    }

    await decomposeExpense(
      { values: BASE_VALUES, group: TEST_GROUP, actorUserId: MEMBER_A },
      EXISTING_EXPENSE_ID,
      tx as any,
    )

    expect(mockActivityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ activityType: 'UPDATE_EXPENSE' }),
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// deleteExpense — Group_Half delete path
// ---------------------------------------------------------------------------

/**
 * Tests for the Group_Half delete path.
 *
 * Requirements: 11.4
 */
describe('deleteExpense — Group_Half delete path', () => {
  const GROUP_HALF_ID = 'group-half-to-delete'
  const LINKED_DIRECT_ID_1 = 'direct-half-1'
  const LINKED_DIRECT_ID_2 = 'direct-half-2'

  // Minimal Group_Half returned by getExpense (expense.findFirst)
  const groupHalfRecord = {
    id: GROUP_HALF_ID,
    groupId: GROUP_ID,
    title: 'Decomposed Expense',
    amount: 6667,
    expenseDate: new Date('2024-06-15'),
    categoryId: 1,
    paidById: MEMBER_A,
    splitMode: 'BY_AMOUNT',
    creationMethod: 'NON_MEMBER_SPLIT',
    isReimbursement: false,
    notes: null,
    recurrenceRule: 'NONE',
    linkedExpenseId: null,
    expenseCurrencyCode: null,
    originalTotalAtDecomposition: 10000,
    paidBy: { id: MEMBER_A, name: MEMBER_A, email: `${MEMBER_A}@test.com` },
    paidFor: [],
    payers: [],
    category: { id: 1, grouping: 'General' },
    documents: [],
    recurringExpenseLink: null,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGroupFindUnique.mockResolvedValue({
      id: GROUP_ID,
      currency: 'EUR',
      currencyCode: 'EUR',
      memberships: [
        {
          user: { id: MEMBER_A, name: MEMBER_A, email: `${MEMBER_A}@test.com` },
        },
      ],
      participants: [{ id: MEMBER_A }],
    })
    // getExpense calls expense.findFirst
    mockExpenseFindFirst.mockResolvedValue(groupHalfRecord)
    mockActivityCreate.mockResolvedValue({ id: 'activity-del-1', changes: [] })
    mockExpenseUpdateMany.mockResolvedValue({ count: 2 })
    mockExpenseDelete.mockResolvedValue({ id: GROUP_HALF_ID })
    mockRecurringExpenseLinkFindMany.mockResolvedValue([])
    // Reset transaction to real-passthrough for the delete path
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        expense: {
          updateMany: mockExpenseUpdateMany,
          delete: mockExpenseDelete,
        },
        activity: { create: mockActivityCreate },
      }
      return fn(tx)
    })
  })

  /**
   * When the Group_Half is deleted, `linkedExpenseId` must be set to null on
   * all linked Direct_Halves in the same transaction (before the delete).
   *
   * Validates: Requirement 11.4
   */
  it('sets linkedExpenseId = null on linked Direct_Halves before deleting the Group_Half', async () => {
    await deleteExpense(GROUP_ID, GROUP_HALF_ID, MEMBER_A)

    expect(mockExpenseUpdateMany).toHaveBeenCalledWith({
      where: { linkedExpenseId: GROUP_HALF_ID },
      data: { linkedExpenseId: null },
    })
    expect(mockExpenseDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: GROUP_HALF_ID } }),
    )
  })

  /**
   * The updateMany (nullify) call must happen before the delete call within
   * the same transaction — order matters to avoid FK constraint issues.
   *
   * Validates: Requirement 11.4
   */
  it('nullifies linkedExpenseId before deleting the Group_Half (call order)', async () => {
    const callOrder: string[] = []
    mockExpenseUpdateMany.mockImplementation(async () => {
      callOrder.push('updateMany')
      return { count: 2 }
    })
    mockExpenseDelete.mockImplementation(async () => {
      callOrder.push('delete')
      return { id: GROUP_HALF_ID }
    })

    await deleteExpense(GROUP_ID, GROUP_HALF_ID, MEMBER_A)

    expect(callOrder).toEqual(['updateMany', 'delete'])
  })

  /**
   * After deleting the Group_Half, Direct_Halves are not deleted — they become
   * standalone direct expenses. The mock simulates this: `updateMany` only
   * nullifies `linkedExpenseId`; Direct_Half rows themselves remain.
   *
   * Validates: Requirement 11.4 — "Direct_Halves still queryable"
   */
  it('does NOT delete the Direct_Halves when deleting the Group_Half', async () => {
    await deleteExpense(GROUP_ID, GROUP_HALF_ID, MEMBER_A)

    // expense.delete is called exactly once (for the Group_Half only)
    expect(mockExpenseDelete).toHaveBeenCalledTimes(1)
    expect(mockExpenseDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: GROUP_HALF_ID } }),
    )
    // No call to delete with the Direct_Half IDs
    const directHalfDeleteCall = mockExpenseDelete.mock.calls.find(
      (call) =>
        call[0]?.where?.id === LINKED_DIRECT_ID_1 ||
        call[0]?.where?.id === LINKED_DIRECT_ID_2,
    )
    expect(directHalfDeleteCall).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// deleteExpense — Direct_Half delete path
// ---------------------------------------------------------------------------

/**
 * Tests that deleting a Direct_Half does not affect the Group_Half.
 *
 * Requirements: 11.5
 */
describe('deleteExpense — Direct_Half delete path', () => {
  const DIRECT_HALF_TO_DELETE = 'direct-half-to-delete'
  const LINKED_GROUP_HALF_ID = 'linked-group-half-id'

  // Direct_Half has no groupId — deleteExpense is called with groupId=null
  // In practice the friend router calls deleteExpense on behalf of the user.
  // We simulate by calling deleteExpense with the group that the actor belongs to.
  // The Direct_Half record itself has groupId: null (standalone direct expense).
  const directHalfRecord = {
    id: DIRECT_HALF_TO_DELETE,
    groupId: GROUP_ID, // actor's group for auth check (api.ts uses this to look up the expense)
    title: 'Direct Half Expense',
    amount: 3333,
    expenseDate: new Date('2024-06-15'),
    categoryId: 1,
    paidById: MEMBER_A,
    splitMode: 'BY_AMOUNT',
    creationMethod: 'NON_MEMBER_SPLIT',
    isReimbursement: false,
    notes: null,
    recurrenceRule: 'NONE',
    linkedExpenseId: LINKED_GROUP_HALF_ID,
    expenseCurrencyCode: 'EUR',
    originalTotalAtDecomposition: null,
    paidBy: { id: MEMBER_A, name: MEMBER_A, email: `${MEMBER_A}@test.com` },
    paidFor: [],
    payers: [],
    category: { id: 1, grouping: 'General' },
    documents: [],
    recurringExpenseLink: null,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGroupFindUnique.mockResolvedValue({
      id: GROUP_ID,
      currency: 'EUR',
      currencyCode: 'EUR',
      memberships: [
        {
          user: { id: MEMBER_A, name: MEMBER_A, email: `${MEMBER_A}@test.com` },
        },
      ],
      participants: [{ id: MEMBER_A }],
    })
    mockExpenseFindFirst.mockResolvedValue(directHalfRecord)
    mockActivityCreate.mockResolvedValue({ id: 'activity-del-2', changes: [] })
    mockExpenseUpdateMany.mockResolvedValue({ count: 0 }) // no expenses link to a Direct_Half
    mockExpenseDelete.mockResolvedValue({ id: DIRECT_HALF_TO_DELETE })
    mockRecurringExpenseLinkFindMany.mockResolvedValue([])
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        expense: {
          updateMany: mockExpenseUpdateMany,
          delete: mockExpenseDelete,
        },
        activity: { create: mockActivityCreate },
      }
      return fn(tx)
    })
  })

  /**
   * Deleting a Direct_Half only deletes that Direct_Half.
   * The Group_Half must not be deleted.
   *
   * Validates: Requirement 11.5
   */
  it('deletes only the Direct_Half — Group_Half is NOT deleted', async () => {
    await deleteExpense(GROUP_ID, DIRECT_HALF_TO_DELETE, MEMBER_A)

    expect(mockExpenseDelete).toHaveBeenCalledTimes(1)
    expect(mockExpenseDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: DIRECT_HALF_TO_DELETE } }),
    )
    // Group_Half id must not appear in any delete call
    const groupHalfDeleteCall = mockExpenseDelete.mock.calls.find(
      (call) => call[0]?.where?.id === LINKED_GROUP_HALF_ID,
    )
    expect(groupHalfDeleteCall).toBeUndefined()
  })

  /**
   * When deleting a Direct_Half, `updateMany` is still called (to nullify any
   * back-references pointing to this Direct_Half — there will be none, but the
   * call must happen). No Group_Half fields are modified.
   *
   * Validates: Requirement 11.5
   */
  it('does NOT call updateMany with the linkedGroupHalf id (Group_Half is untouched)', async () => {
    await deleteExpense(GROUP_ID, DIRECT_HALF_TO_DELETE, MEMBER_A)

    // updateMany is called for the direct half's own id (clears any reverse links)
    expect(mockExpenseUpdateMany).toHaveBeenCalledWith({
      where: { linkedExpenseId: DIRECT_HALF_TO_DELETE },
      data: { linkedExpenseId: null },
    })
    // It must NOT be called with the Group_Half id — that would modify the Group_Half
    const groupHalfUpdateCall = mockExpenseUpdateMany.mock.calls.find(
      (call) => call[0]?.where?.linkedExpenseId === LINKED_GROUP_HALF_ID,
    )
    expect(groupHalfUpdateCall).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// buildDirectBuckets — pure function tests
// ---------------------------------------------------------------------------

/**
 * Tests for the `buildDirectBuckets` pure utility.
 *
 * Requirements: 1.7
 */
describe('buildDirectBuckets', () => {
  const eurCurrency = getCurrency('EUR')
  const usdCurrency = getCurrency('USD')
  const jpyCurrency = getCurrency('JPY')

  type MinimalExpense = { id: string; expenseCurrencyCode: string | null }

  const makeExpense = (
    id: string,
    expenseCurrencyCode: string | null,
  ): MinimalExpense => ({ id, expenseCurrencyCode })

  /**
   * Expenses with distinct non-null `expenseCurrencyCode` values land in separate buckets.
   *
   * Validates: Requirement 1.7
   */
  it('mixed expenseCurrencyCode values produce separate buckets', () => {
    const expenses = [
      makeExpense('exp-1', 'EUR'),
      makeExpense('exp-2', 'EUR'),
      makeExpense('exp-3', 'USD'),
      makeExpense('exp-4', 'JPY'),
    ]

    const buckets = buildDirectBuckets(expenses, eurCurrency)

    expect(buckets).toHaveLength(3)

    const eurBucket = buckets.find((b) => b.currency.code === 'EUR')
    const usdBucket = buckets.find((b) => b.currency.code === 'USD')
    const jpyBucket = buckets.find((b) => b.currency.code === 'JPY')

    expect(eurBucket).toBeDefined()
    expect(eurBucket!.expenses).toHaveLength(2)
    expect(eurBucket!.expenses.map((e) => e.id)).toContain('exp-1')
    expect(eurBucket!.expenses.map((e) => e.id)).toContain('exp-2')

    expect(usdBucket).toBeDefined()
    expect(usdBucket!.expenses).toHaveLength(1)
    expect(usdBucket!.expenses[0].id).toBe('exp-3')

    expect(jpyBucket).toBeDefined()
    expect(jpyBucket!.expenses).toHaveLength(1)
    expect(jpyBucket!.expenses[0].id).toBe('exp-4')
  })

  /**
   * Expenses with `expenseCurrencyCode = null` fall into the fallback bucket.
   *
   * Validates: Requirement 1.7
   */
  it('null expenseCurrencyCode entries land in the fallback bucket', () => {
    const expenses = [
      makeExpense('exp-null-1', null),
      makeExpense('exp-null-2', null),
      makeExpense('exp-usd', 'USD'),
    ]

    const buckets = buildDirectBuckets(expenses, eurCurrency)

    // null entries should be in the EUR (fallback) bucket
    const eurBucket = buckets.find((b) => b.currency.code === 'EUR')
    expect(eurBucket).toBeDefined()
    expect(eurBucket!.expenses).toHaveLength(2)
    expect(eurBucket!.expenses.map((e) => e.id)).toContain('exp-null-1')
    expect(eurBucket!.expenses.map((e) => e.id)).toContain('exp-null-2')

    const usdBucket = buckets.find((b) => b.currency.code === 'USD')
    expect(usdBucket).toBeDefined()
    expect(usdBucket!.expenses).toHaveLength(1)
  })

  /**
   * When all expenses have null expenseCurrencyCode, they all land in a single
   * fallback bucket.
   *
   * Validates: Requirement 1.7
   */
  it('all-null expenseCurrencyCode → single fallback bucket', () => {
    const expenses = [
      makeExpense('exp-a', null),
      makeExpense('exp-b', null),
      makeExpense('exp-c', null),
    ]

    const buckets = buildDirectBuckets(expenses, jpyCurrency)

    expect(buckets).toHaveLength(1)
    expect(buckets[0].currency.code).toBe('JPY')
    expect(buckets[0].expenses).toHaveLength(3)
  })

  /**
   * All expenses with the same non-null currencyCode are grouped into one bucket.
   *
   * Validates: Requirement 1.7
   */
  it('all expenses with same currencyCode → single bucket', () => {
    const expenses = [
      makeExpense('exp-1', 'USD'),
      makeExpense('exp-2', 'USD'),
      makeExpense('exp-3', 'USD'),
    ]

    const buckets = buildDirectBuckets(expenses, eurCurrency)

    expect(buckets).toHaveLength(1)
    expect(buckets[0].currency.code).toBe('USD')
    expect(buckets[0].expenses).toHaveLength(3)
  })

  /**
   * Empty input → empty output.
   *
   * Validates: Requirement 1.7
   */
  it('empty input returns empty array', () => {
    const buckets = buildDirectBuckets([], eurCurrency)
    expect(buckets).toHaveLength(0)
  })

  /**
   * Mixed null and same-code entries: null entries join the fallback, same-code
   * entries join their own bucket. The fallback bucket is EUR; the explicit
   * currency is also EUR — so null and EUR entries merge into the same bucket.
   *
   * Validates: Requirement 1.7
   */
  it('null entries merge into fallback bucket when fallback matches an explicit code', () => {
    const expenses = [
      makeExpense('exp-explicit-eur', 'EUR'),
      makeExpense('exp-null', null),
    ]

    const buckets = buildDirectBuckets(expenses, eurCurrency)

    // Both should end up in EUR bucket (explicit EUR + null fallback → same key)
    expect(buckets).toHaveLength(1)
    expect(buckets[0].currency.code).toBe('EUR')
    expect(buckets[0].expenses).toHaveLength(2)
  })
})
