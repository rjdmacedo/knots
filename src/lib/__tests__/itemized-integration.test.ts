/**
 * Integration tests for itemized expenses.
 *
 * Feature: itemized-expenses
 *
 * Covers:
 * - Non-member itemized decomposition: an itemized expense assigning a line to a
 *   non-member decomposes like the equivalent BY_AMOUNT expense (Requirement 7.3, 7.4).
 * - Persistence: createExpense writes items + tax/tip; updateExpense clears them
 *   when itemization is off (Requirement 1.6, 2.6, 3.5).
 * - Currency conversion exactness of shares (Requirement 11.4).
 */

import { computeDecompositionSlots } from '../decompose-expense'
import { computeItemizedShares } from '../itemized-split'

jest.mock('nanoid', () => ({ nanoid: () => 'mocked-id' }))

jest.mock('../friends', () => ({
  upsertFriendByEmail: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../payments', () => ({
  assertPaymentEditable: jest.fn(),
}))

const mockGroupFindUnique = jest.fn()
const mockExpenseCreate = jest.fn()
const mockExpenseUpdate = jest.fn()
const mockExpenseFindFirst = jest.fn()
const mockActivityCreate = jest.fn()
const mockActivityChangeCreate = jest.fn()

jest.mock('../prisma', () => ({
  prisma: {
    group: {
      findUnique: (...args: unknown[]) => mockGroupFindUnique(...args),
    },
    expense: {
      create: (...args: unknown[]) => mockExpenseCreate(...args),
      update: (...args: unknown[]) => mockExpenseUpdate(...args),
      findFirst: (...args: unknown[]) => mockExpenseFindFirst(...args),
    },
    activity: {
      create: (...args: unknown[]) => mockActivityCreate(...args),
    },
    activityChange: {
      create: (...args: unknown[]) => mockActivityChangeCreate(...args),
    },
  },
}))

const GROUP_ID = 'grp-itemized'
const MEMBER_A = 'user-a'
const MEMBER_B = 'user-b'

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

beforeEach(() => {
  mockGroupFindUnique.mockReset()
  mockExpenseCreate.mockReset()
  mockExpenseUpdate.mockReset()
  mockExpenseFindFirst.mockReset()
  mockActivityCreate.mockReset()
  mockActivityChangeCreate.mockReset()
})

describe('itemized → non-member decomposition (Requirement 7.3, 7.4)', () => {
  it('produces the same slots as an equivalent hand-entered BY_AMOUNT expense', () => {
    // Scenario: member A has a €30 item, non-member C has a €10 item, plus €6
    // tax split by subtotal (A: 3000/4000 * 600 = 450, C: 150). Totals: A=3450,
    // C=1150; total 4600.
    const participantIdsInOrder = [MEMBER_A, 'user-c']
    const itemized = computeItemizedShares({
      participantIdsInOrder,
      items: [
        { amountMinor: 3000, assignedParticipantIds: [MEMBER_A] },
        { amountMinor: 1000, assignedParticipantIds: ['user-c'] },
      ],
      remainder: { amountMinor: 600, allocationMode: 'PROPORTIONAL' },
    })

    // Collapse to BY_AMOUNT paidFor (minor units), as the app persists.
    const paidFor = itemized.perParticipant.map((p) => ({
      participant: p.participantId,
      shares: p.amountMinor,
    }))

    const group = {
      participants: [{ id: MEMBER_A }],
      currencyCode: 'EUR',
      currency: 'EUR',
    }

    const itemizedSlots = computeDecompositionSlots(
      { amount: itemized.totalMinor, splitMode: 'BY_AMOUNT', paidFor },
      group,
    )

    // Oracle: the same amounts entered directly as BY_AMOUNT.
    const handEnteredSlots = computeDecompositionSlots(
      {
        amount: 4600,
        splitMode: 'BY_AMOUNT',
        paidFor: [
          { participant: MEMBER_A, shares: 3450 },
          { participant: 'user-c', shares: 1150 },
        ],
      },
      group,
    )

    expect(itemizedSlots).toEqual(handEnteredSlots)
    // Non-member C's Direct_Half equals their itemized share.
    expect(itemizedSlots?.directHalfEntries).toEqual([
      { userId: 'user-c', amount: 1150 },
    ])
    // Group_Half is member A's share.
    expect(itemizedSlots?.groupHalfAmount).toBe(3450)
  })
})

describe('itemized persistence (Requirements 1.6, 2.6, 3.5)', () => {
  const baseValues = {
    expenseDate: new Date('2024-06-01'),
    title: 'Dinner',
    category: 0,
    amount: 4600,
    paidBy: [{ participant: MEMBER_A, amount: 4600 }],
    paidFor: [
      { participant: MEMBER_A, shares: 3450 },
      { participant: MEMBER_B, shares: 1150 },
    ],
    splitMode: 'BY_AMOUNT' as const,
    saveDefaultSplittingOptions: false,
    saveDefaultPaidByOptions: false,
    isReimbursement: false,
    documents: [],
    notes: '',
    recurrenceRule: 'NONE' as const,
  }

  it('createExpense writes items + tax/tip for an itemized expense', async () => {
    const { createExpense } = await import('../api')
    mockGroupFindUnique.mockResolvedValue(makeGroup([MEMBER_A, MEMBER_B]))
    mockExpenseFindFirst.mockResolvedValue(null)
    mockExpenseCreate.mockResolvedValue({ id: 'mocked-id' })

    await createExpense(
      {
        ...baseValues,
        itemization: {
          authoritative: true,
          items: [
            { title: 'Burger', amount: 3000, assignedParticipants: [MEMBER_A] },
            { title: 'Salad', amount: 1000, assignedParticipants: [MEMBER_B] },
          ],
          remainder: { amount: 600, allocationMode: 'PROPORTIONAL' },
        },
      } as never,
      GROUP_ID,
      MEMBER_A,
    )

    expect(mockExpenseCreate).toHaveBeenCalledTimes(1)
    const data = mockExpenseCreate.mock.calls[0][0].data
    expect(data.itemsAuthoritative).toBe(true)
    expect(data.remainderAmount).toBe(600)
    expect(data.remainderAllocationMode).toBe('PROPORTIONAL')
    expect(data.items.create).toHaveLength(2)
    expect(data.items.create[0]).toMatchObject({
      title: 'Burger',
      amount: 3000,
      unitPrice: 3000,
      quantity: 1,
      position: 0,
    })
    expect(data.items.create[0].assignments.createMany.data).toEqual([
      { userId: MEMBER_A },
    ])
    expect(data.items.create[1].position).toBe(1)
  })

  it('createExpense writes documentation items (marker false) when not authoritative', async () => {
    const { createExpense } = await import('../api')
    mockGroupFindUnique.mockResolvedValue(makeGroup([MEMBER_A, MEMBER_B]))
    mockExpenseFindFirst.mockResolvedValue(null)
    mockExpenseCreate.mockResolvedValue({ id: 'mocked-id' })

    await createExpense(
      {
        ...baseValues,
        itemization: {
          authoritative: false,
          items: [
            { title: 'Burger', amount: 3000, assignedParticipants: [MEMBER_A] },
          ],
          remainder: { amount: 0, allocationMode: 'PROPORTIONAL' },
        },
      } as never,
      GROUP_ID,
      MEMBER_A,
    )

    const data = mockExpenseCreate.mock.calls[0][0].data
    // Documentation items are still persisted, but marked non-authoritative.
    expect(data.itemsAuthoritative).toBe(false)
    expect(data.items.create).toHaveLength(1)
  })

  it('createExpense writes no items for a non-itemized expense', async () => {
    const { createExpense } = await import('../api')
    mockGroupFindUnique.mockResolvedValue(makeGroup([MEMBER_A, MEMBER_B]))
    mockExpenseFindFirst.mockResolvedValue(null)
    mockExpenseCreate.mockResolvedValue({ id: 'mocked-id' })

    await createExpense(baseValues as never, GROUP_ID, MEMBER_A)

    const data = mockExpenseCreate.mock.calls[0][0].data
    expect(data.items).toBeUndefined()
    expect(data.remainderAmount).toBeUndefined()
  })

  it('createExpense persists a CUSTOM remainder with split mode + shares', async () => {
    const { createExpense } = await import('../api')
    mockGroupFindUnique.mockResolvedValue(makeGroup([MEMBER_A, MEMBER_B]))
    mockExpenseFindFirst.mockResolvedValue(null)
    mockExpenseCreate.mockResolvedValue({ id: 'mocked-id' })

    await createExpense(
      {
        ...baseValues,
        itemization: {
          authoritative: true,
          items: [
            { title: 'Burger', amount: 3000, assignedParticipants: [MEMBER_A] },
            { title: 'Salad', amount: 1000, assignedParticipants: [MEMBER_B] },
          ],
          remainder: {
            amount: 600,
            allocationMode: 'CUSTOM',
            splitMode: 'EVENLY',
            paidFor: [
              { participant: MEMBER_A, shares: 1 },
              { participant: MEMBER_B, shares: 1 },
            ],
          },
        },
      } as never,
      GROUP_ID,
      MEMBER_A,
    )

    const data = mockExpenseCreate.mock.calls[0][0].data
    expect(data.remainderAllocationMode).toBe('CUSTOM')
    expect(data.remainderSplitMode).toBe('EVENLY')
    expect(data.remainderAmount).toBe(600)
    expect(data.remainderShares.create).toEqual([
      { userId: MEMBER_A, shares: 1 },
      { userId: MEMBER_B, shares: 1 },
    ])
  })

  it('createExpense stores no remainder shares for a PROPORTIONAL remainder', async () => {
    const { createExpense } = await import('../api')
    mockGroupFindUnique.mockResolvedValue(makeGroup([MEMBER_A, MEMBER_B]))
    mockExpenseFindFirst.mockResolvedValue(null)
    mockExpenseCreate.mockResolvedValue({ id: 'mocked-id' })

    await createExpense(
      {
        ...baseValues,
        itemization: {
          authoritative: true,
          items: [
            { title: 'Burger', amount: 4600, assignedParticipants: [MEMBER_A] },
          ],
          remainder: { amount: 0, allocationMode: 'PROPORTIONAL' },
        },
      } as never,
      GROUP_ID,
      MEMBER_A,
    )

    const data = mockExpenseCreate.mock.calls[0][0].data
    expect(data.remainderAllocationMode).toBe('PROPORTIONAL')
    expect(data.remainderSplitMode).toBeNull()
    // PROPORTIONAL stores no shares (weights derive from item subtotals).
    expect(data.remainderShares).toBeUndefined()
  })
})

describe('itemized update: clearing itemization (Requirement 1.6, 13)', () => {
  const EXPENSE_ID = 'exp-1'

  function existingItemizedExpense() {
    return {
      id: EXPENSE_ID,
      groupId: GROUP_ID,
      isReimbursement: false,
      recurrenceRule: 'NONE',
      creationMethod: null,
      recurringExpenseLink: null,
      documents: [],
      paidFor: [
        { userId: MEMBER_A, shares: 3300 },
        { userId: MEMBER_B, shares: 1300 },
      ],
      payers: [{ userId: MEMBER_A, amount: 4600 }],
    }
  }

  const updateValues = {
    expenseDate: new Date('2024-06-01'),
    title: 'Dinner',
    category: 0,
    amount: 4600,
    paidBy: [{ participant: MEMBER_A, amount: 4600 }],
    paidFor: [
      { participant: MEMBER_A, shares: 2300 },
      { participant: MEMBER_B, shares: 2300 },
    ],
    splitMode: 'BY_AMOUNT' as const,
    saveDefaultSplittingOptions: false,
    saveDefaultPaidByOptions: false,
    isReimbursement: false,
    documents: [],
    notes: '',
    recurrenceRule: 'NONE' as const,
  }

  it('clears items, remainder and marker when no items are submitted', async () => {
    const { updateExpense } = await import('../api')
    mockGroupFindUnique.mockResolvedValue(makeGroup([MEMBER_A, MEMBER_B]))
    mockExpenseFindFirst.mockResolvedValue(existingItemizedExpense())
    mockExpenseUpdate.mockResolvedValue({ id: EXPENSE_ID })

    // No itemization field → de-itemized update.
    await updateExpense(GROUP_ID, EXPENSE_ID, updateValues as never, MEMBER_A)

    const data = mockExpenseUpdate.mock.calls[0][0].data
    expect(data.itemsAuthoritative).toBe(false)
    expect(data.remainderAmount).toBeNull()
    expect(data.remainderAllocationMode).toBeNull()
    expect(data.remainderSplitMode).toBeNull()
    expect(data.items.deleteMany).toEqual({})
    expect(data.remainderShares.deleteMany).toEqual({})
  })

  it('full-replaces items + remainder shares on an itemized update', async () => {
    const { updateExpense } = await import('../api')
    mockGroupFindUnique.mockResolvedValue(makeGroup([MEMBER_A, MEMBER_B]))
    mockExpenseFindFirst.mockResolvedValue(existingItemizedExpense())
    mockExpenseUpdate.mockResolvedValue({ id: EXPENSE_ID })

    await updateExpense(
      GROUP_ID,
      EXPENSE_ID,
      {
        ...updateValues,
        itemization: {
          authoritative: true,
          items: [
            { title: 'Pizza', amount: 4600, assignedParticipants: [MEMBER_A] },
          ],
          remainder: {
            amount: 0,
            allocationMode: 'CUSTOM',
            splitMode: 'BY_SHARES',
            paidFor: [{ participant: MEMBER_A, shares: 1 }],
          },
        },
      } as never,
      MEMBER_A,
    )

    const data = mockExpenseUpdate.mock.calls[0][0].data
    expect(data.itemsAuthoritative).toBe(true)
    // Items are deleted then recreated (full replace).
    expect(data.items.deleteMany).toEqual({})
    expect(data.items.create).toHaveLength(1)
    // Remainder shares are deleted then recreated.
    expect(data.remainderShares.deleteMany).toEqual({})
    expect(data.remainderShares.create).toEqual([
      { userId: MEMBER_A, shares: 1 },
    ])
    expect(data.remainderSplitMode).toBe('BY_SHARES')
  })
})

describe('itemized currency conversion exactness (Requirement 11.4)', () => {
  it('converted shares sum exactly to the converted total', async () => {
    const { convertSharesToGroupCurrency } = await import('../itemized-split')
    // Entry shares 3450 + 1150 = 4600; convert at 1.1 → 5060 total.
    const entryShares = [3450, 1150]
    const convertedTotalMinor = 5060
    const converted = convertSharesToGroupCurrency(
      convertedTotalMinor,
      entryShares,
      2,
    )
    expect(converted.reduce((s, v) => s + v, 0)).toBe(convertedTotalMinor)
  })
})
