/**
 * Unit tests for computeItemizedShares (pure itemized splitter, v1.1).
 *
 * Feature: itemized-expenses
 *
 * **Validates: Requirements 3.3, 5.1, 16.3, 16.4, 16.5, 17.2**
 */

import {
  computeItemizedShares,
  itemsExceedExpenseAmount,
  ItemizedInput,
  ItemizedRemainder,
} from '../itemized-split'

const NO_REMAINDER: ItemizedRemainder = {
  amountMinor: 0,
  allocationMode: 'PROPORTIONAL',
}

// Helper: build the input with sensible defaults.
function input(overrides: Partial<ItemizedInput>): ItemizedInput {
  return {
    participantIdsInOrder: ['a', 'b', 'c'],
    items: [],
    remainder: NO_REMAINDER,
    ...overrides,
  }
}

// Helper: build a PROPORTIONAL remainder of a given amount.
function proportional(amountMinor: number): ItemizedRemainder {
  return { amountMinor, allocationMode: 'PROPORTIONAL' }
}

// Helper: read a participant's share out of the result.
function shareOf(
  result: ReturnType<typeof computeItemizedShares>,
  id: string,
): number {
  return result.perParticipant.find((p) => p.participantId === id)!.amountMinor
}

describe('computeItemizedShares — items', () => {
  it('assigns the full amount of a single-assignee item to that participant', () => {
    const result = computeItemizedShares(
      input({ items: [{ amountMinor: 1200, assignedParticipantIds: ['b'] }] }),
    )
    expect(shareOf(result, 'a')).toBe(0)
    expect(shareOf(result, 'b')).toBe(1200)
    expect(shareOf(result, 'c')).toBe(0)
    expect(result.totalMinor).toBe(1200)
  })

  it('splits a shared item equally, giving remainder cents to earliest participants', () => {
    // 1001 across 3 → base 333, remainder 2 → a=334, b=334, c=333
    const result = computeItemizedShares(
      input({
        items: [{ amountMinor: 1001, assignedParticipantIds: ['a', 'b', 'c'] }],
      }),
    )
    expect(shareOf(result, 'a')).toBe(334)
    expect(shareOf(result, 'b')).toBe(334)
    expect(shareOf(result, 'c')).toBe(333)
    expect(
      shareOf(result, 'a') + shareOf(result, 'b') + shareOf(result, 'c'),
    ).toBe(1001)
  })

  it('gives shared-item remainder cents in paidFor order regardless of assignment order', () => {
    // Assigned as [c, a] but remainder follows paidFor order (a before c).
    const result = computeItemizedShares(
      input({
        participantIdsInOrder: ['a', 'b', 'c'],
        items: [{ amountMinor: 3, assignedParticipantIds: ['c', 'a'] }],
      }),
    )
    expect(shareOf(result, 'a')).toBe(2)
    expect(shareOf(result, 'b')).toBe(0)
    expect(shareOf(result, 'c')).toBe(1)
  })
})

describe('computeItemizedShares — PROPORTIONAL remainder (tax/tip pool)', () => {
  it('distributes the remainder proportionally to item subtotals', () => {
    // Subtotals: a=3000, b=1000 (total 4000). Remainder 600 → a=450, b=150.
    const result = computeItemizedShares(
      input({
        participantIdsInOrder: ['a', 'b'],
        items: [
          { amountMinor: 3000, assignedParticipantIds: ['a'] },
          { amountMinor: 1000, assignedParticipantIds: ['b'] },
        ],
        remainder: proportional(600),
      }),
    )
    expect(shareOf(result, 'a')).toBe(3000 + 450)
    expect(shareOf(result, 'b')).toBe(1000 + 150)
    expect(result.totalMinor).toBe(4600)
  })

  it('keeps the remainder summing exactly to its input with awkward proportions', () => {
    // Subtotals a=1, b=1, c=1. Remainder 10 → floors 3,3,3 = 9, leftover 1 → a.
    const result = computeItemizedShares(
      input({
        participantIdsInOrder: ['a', 'b', 'c'],
        items: [
          { amountMinor: 1, assignedParticipantIds: ['a'] },
          { amountMinor: 1, assignedParticipantIds: ['b'] },
          { amountMinor: 1, assignedParticipantIds: ['c'] },
        ],
        remainder: proportional(10),
      }),
    )
    const rem = (id: string) => shareOf(result, id) - 1
    expect(rem('a')).toBe(4)
    expect(rem('b')).toBe(3)
    expect(rem('c')).toBe(3)
    expect(rem('a') + rem('b') + rem('c')).toBe(10)
  })

  it('falls back to an equal split of the remainder when all subtotals are zero', () => {
    // Zero-amount items assigned to a and b. Remainder 5 over {a,b} → a=3, b=2.
    const result = computeItemizedShares(
      input({
        participantIdsInOrder: ['a', 'b', 'c'],
        items: [
          { amountMinor: 0, assignedParticipantIds: ['a'] },
          { amountMinor: 0, assignedParticipantIds: ['b'] },
        ],
        remainder: proportional(5),
      }),
    )
    expect(shareOf(result, 'a')).toBe(3)
    expect(shareOf(result, 'b')).toBe(2)
    expect(shareOf(result, 'c')).toBe(0)
    expect(result.totalMinor).toBe(5)
  })

  it('handles a negative remainder (discount) proportionally and exactly', () => {
    // Subtotals a=3000, b=1000. Remainder -400 → a=-300, b=-100.
    const result = computeItemizedShares(
      input({
        participantIdsInOrder: ['a', 'b'],
        items: [
          { amountMinor: 3000, assignedParticipantIds: ['a'] },
          { amountMinor: 1000, assignedParticipantIds: ['b'] },
        ],
        remainder: proportional(-400),
      }),
    )
    expect(shareOf(result, 'a')).toBe(2700)
    expect(shareOf(result, 'b')).toBe(900)
    expect(result.totalMinor).toBe(3600)
  })
})

describe('computeItemizedShares — CUSTOM remainder', () => {
  it('EVENLY: splits the remainder equally over the chosen participants', () => {
    // Remainder 7 EVENLY over {a,b} → a=4, b=3 (earliest-index remainder).
    const result = computeItemizedShares(
      input({
        participantIdsInOrder: ['a', 'b', 'c'],
        items: [{ amountMinor: 1000, assignedParticipantIds: ['a', 'b', 'c'] }],
        remainder: {
          amountMinor: 7,
          allocationMode: 'CUSTOM',
          splitMode: 'EVENLY',
          paidFor: [
            { participantId: 'a', shares: 1 },
            { participantId: 'b', shares: 1 },
          ],
        },
      }),
    )
    // items 1000/3 → a=334, b=333, c=333; plus remainder a+4, b+3.
    expect(shareOf(result, 'a')).toBe(334 + 4)
    expect(shareOf(result, 'b')).toBe(333 + 3)
    expect(shareOf(result, 'c')).toBe(333)
    expect(result.totalMinor).toBe(1007)
  })

  it('BY_AMOUNT: uses the rows as minor-unit amounts directly', () => {
    const result = computeItemizedShares(
      input({
        participantIdsInOrder: ['a', 'b'],
        items: [{ amountMinor: 2000, assignedParticipantIds: ['a', 'b'] }],
        remainder: {
          amountMinor: 300,
          allocationMode: 'CUSTOM',
          splitMode: 'BY_AMOUNT',
          paidFor: [
            { participantId: 'a', shares: 200 },
            { participantId: 'b', shares: 100 },
          ],
        },
      }),
    )
    expect(shareOf(result, 'a')).toBe(1000 + 200)
    expect(shareOf(result, 'b')).toBe(1000 + 100)
    expect(result.totalMinor).toBe(2300)
  })

  it('BY_SHARES: distributes the remainder by weights, exact', () => {
    // Remainder 10 by shares 3:1 over {a,b} → a=8, b=2 (7.5/2.5 → floors 7,2, leftover 1 to largest frac a).
    const result = computeItemizedShares(
      input({
        participantIdsInOrder: ['a', 'b'],
        items: [{ amountMinor: 1000, assignedParticipantIds: ['a', 'b'] }],
        remainder: {
          amountMinor: 10,
          allocationMode: 'CUSTOM',
          splitMode: 'BY_SHARES',
          paidFor: [
            { participantId: 'a', shares: 3 },
            { participantId: 'b', shares: 1 },
          ],
        },
      }),
    )
    const remA = shareOf(result, 'a') - 500
    const remB = shareOf(result, 'b') - 500
    expect(remA + remB).toBe(10)
    expect(remA).toBeGreaterThan(remB)
    expect(result.totalMinor).toBe(1010)
  })

  it('throws when BY_AMOUNT custom rows do not sum to the remainder', () => {
    expect(() =>
      computeItemizedShares(
        input({
          participantIdsInOrder: ['a', 'b'],
          items: [{ amountMinor: 2000, assignedParticipantIds: ['a', 'b'] }],
          remainder: {
            amountMinor: 300,
            allocationMode: 'CUSTOM',
            splitMode: 'BY_AMOUNT',
            paidFor: [
              { participantId: 'a', shares: 200 },
              { participantId: 'b', shares: 50 }, // sums to 250, not 300
            ],
          },
        }),
      ),
    ).toThrow(/invariant violated/)
  })
})

describe('computeItemizedShares — general exactness', () => {
  it('always produces shares that sum exactly to the total', () => {
    const result = computeItemizedShares(
      input({
        participantIdsInOrder: ['a', 'b', 'c', 'd'],
        items: [
          { amountMinor: 777, assignedParticipantIds: ['a', 'b'] },
          { amountMinor: 333, assignedParticipantIds: ['b', 'c', 'd'] },
          { amountMinor: 100, assignedParticipantIds: ['a'] },
        ],
        remainder: proportional(226),
      }),
    )
    const sum = result.perParticipant.reduce((s, p) => s + p.amountMinor, 0)
    expect(sum).toBe(result.totalMinor)
    expect(result.totalMinor).toBe(777 + 333 + 100 + 226)
  })

  it('handles zero-decimal currency values (already integer minor units)', () => {
    const result = computeItemizedShares(
      input({
        participantIdsInOrder: ['a', 'b', 'c'],
        items: [{ amountMinor: 1000, assignedParticipantIds: ['a', 'b', 'c'] }],
        remainder: proportional(100),
      }),
    )
    const sum = result.perParticipant.reduce((s, p) => s + p.amountMinor, 0)
    expect(sum).toBe(1100)
    expect(result.totalMinor).toBe(1100)
  })
})

describe('itemsExceedExpenseAmount', () => {
  it('positive expense: items over total overshoot', () => {
    expect(itemsExceedExpenseAmount(1100, 1000)).toBe(true)
    expect(itemsExceedExpenseAmount(1000, 1000)).toBe(false)
    expect(itemsExceedExpenseAmount(900, 1000)).toBe(false)
  })

  it('negative expense (refund): mirrored comparison', () => {
    expect(itemsExceedExpenseAmount(-1100, -1000)).toBe(true)
    expect(itemsExceedExpenseAmount(-1000, -1000)).toBe(false)
    expect(itemsExceedExpenseAmount(-900, -1000)).toBe(false)
  })
})
