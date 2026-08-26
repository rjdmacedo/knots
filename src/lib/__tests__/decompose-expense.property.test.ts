/**
 * Property-based tests for computeDecompositionSlots (Suite 1).
 *
 * Feature: non-member-expense-decomposition
 * Uses fast-check for property-based testing with minimum 100 iterations.
 *
 * **Validates: Requirements 2.9, 3.6, 3.7, 12.2, 12.3, 12.4**
 */

import fc from 'fast-check'
import { computeDecompositionSlots } from '../decompose-expense'

// computeDecompositionSlots is pure (no DB), but decompose-expense.ts imports
// random-id.ts which imports nanoid (ESM). Mock it to keep Jest happy.
jest.mock('nanoid', () => ({ nanoid: () => 'mocked-id' }))

// --- Constants ---

const PBT_NUM_RUNS = 100

// EUR has 2 decimal digits — safe default for all properties
const GROUP_EUR = {
  currency: 'EUR',
  currencyCode: 'EUR' as string | null,
}

// --- Helpers ---

/**
 * Generate N unique string IDs.
 */
function makeIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `user-${i}`)
}

// --- Generators ---

/**
 * Deterministically partition `total` into `n` positive-integer buckets.
 * Uses raw weights to proportionally size each bucket; remainder goes to index 0.
 * Guaranteed to produce no zeros and to sum to exactly `total`.
 */
function partitionTotal(total: number, n: number, weights: number[]): number[] {
  if (n === 1) return [total]
  const weightSum = weights.reduce((s, w) => s + w, 0)
  // Proportional floor allocation
  const floored = weights.map((w) =>
    Math.max(1, Math.floor((w / weightSum) * total)),
  )
  // Adjust so sum === total (can overshoot due to max(1, ...))
  let diff = total - floored.reduce((s, v) => s + v, 0)
  // diff may be negative if max(1,...) pushed total over; trim from largest slots first
  if (diff < 0) {
    const order = floored.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v)
    for (const { i } of order) {
      if (diff >= 0) break
      if (floored[i] > 1) {
        floored[i]--
        diff++
      }
    }
  } else {
    // Give remainder to index 0
    floored[0] += diff
  }
  return floored
}

/**
 * Generate a valid BY_AMOUNT paidFor list where shares sum exactly to totalMinor.
 *
 * Guarantee: sum(shares) === totalMinor for every generated value.
 * Individual shares may be 0 (when totalMinor < n); zero-slot non-members are
 * filtered out by computeDecompositionSlots, so conservation still holds.
 */
function arbByAmountPaidFor(
  memberIds: string[],
  nonMemberIds: string[],
  totalMinor: number,
): fc.Arbitrary<Array<{ participant: string; shares: number }>> {
  const allIds = [...memberIds, ...nonMemberIds]
  const n = allIds.length

  if (n === 1) {
    return fc.constant([{ participant: allIds[0], shares: totalMinor }])
  }

  // When totalMinor < n we cannot guarantee every slot is ≥ 1 while summing to
  // totalMinor. Distribute 1 to the first totalMinor slots and 0 to the rest.
  if (totalMinor < n) {
    const amounts = allIds.map((_, i) => (i < totalMinor ? 1 : 0))
    return fc.constant(
      allIds.map((id, i) => ({ participant: id, shares: amounts[i] })),
    )
  }

  return fc
    .array(fc.integer({ min: 1, max: 100 }), {
      minLength: n,
      maxLength: n,
    })
    .map((weights) => {
      const amounts = partitionTotal(totalMinor, n, weights)
      return allIds.map((id, i) => ({ participant: id, shares: amounts[i] }))
    })
}

/**
 * Generate a valid paidFor list for a given split mode.
 */
function arbPaidFor(
  memberIds: string[],
  nonMemberIds: string[],
  splitMode: string,
  totalMinor: number,
): fc.Arbitrary<Array<{ participant: string; shares: number }>> {
  const allIds = [...memberIds, ...nonMemberIds]

  switch (splitMode) {
    case 'EVENLY':
      return fc.constant(allIds.map((id) => ({ participant: id, shares: 1 })))

    case 'BY_SHARES':
      return fc
        .array(fc.integer({ min: 1, max: 100 }), {
          minLength: allIds.length,
          maxLength: allIds.length,
        })
        .map((weights) =>
          allIds.map((id, i) => ({ participant: id, shares: weights[i] })),
        )

    case 'BY_PERCENTAGE':
      // Use raw positive integer weights — distributeWeightedAmounts handles proportional split
      return fc
        .array(fc.integer({ min: 1, max: 100 }), {
          minLength: allIds.length,
          maxLength: allIds.length,
        })
        .map((weights) =>
          allIds.map((id, i) => ({ participant: id, shares: weights[i] })),
        )

    case 'BY_AMOUNT':
    default:
      return arbByAmountPaidFor(memberIds, nonMemberIds, totalMinor)
  }
}

/**
 * Core generator: produces a random (totalMinor, memberIds, nonMemberIds, splitMode, paidFor) tuple.
 */
const arbDecomposeInput = fc
  .tuple(
    fc.integer({ min: 1, max: 1_000_000 }), // totalMinor
    fc.integer({ min: 1, max: 10 }), // numMembers
    fc.integer({ min: 1, max: 5 }), // numNonMembers
    fc.constantFrom(
      'EVENLY' as const,
      'BY_SHARES' as const,
      'BY_PERCENTAGE' as const,
      'BY_AMOUNT' as const,
    ),
  )
  .chain(([totalMinor, numMembers, numNonMembers, splitMode]) => {
    const memberIds = makeIds(numMembers).map((id) => `m-${id}`)
    const nonMemberIds = makeIds(numNonMembers).map((id) => `nm-${id}`)

    return arbPaidFor(memberIds, nonMemberIds, splitMode, totalMinor).map(
      (paidFor) => ({
        totalMinor,
        memberIds,
        nonMemberIds,
        splitMode,
        paidFor,
      }),
    )
  })

// --- Tests ---

describe('Non-Member Decomposition — Property-Based Tests (Suite 1)', () => {
  /**
   * Property 1: Amount Conservation
   *
   * **Validates: Requirements 2.9, 12.2, 12.4**
   *
   * For any valid expense input:
   *   groupHalfAmount + sum(directHalfEntries[i].amount) === totalMinor
   *
   * When computeDecompositionSlots returns null (all non-member slots are zero),
   * the entire total stays with the group path — conservation holds trivially and
   * we skip the assertion for the null case.
   */
  describe('Property 1: Amount Conservation', () => {
    it('groupHalfAmount + sum(directHalfAmounts) === originalTotal', () => {
      fc.assert(
        fc.property(arbDecomposeInput, (input) => {
          const { totalMinor, memberIds, splitMode, paidFor } = input

          const values = {
            amount: totalMinor,
            splitMode,
            paidFor,
          }

          const group = {
            ...GROUP_EUR,
            participants: input.memberIds.map((id) => ({ id })),
          }

          const result = computeDecompositionSlots(values, group)

          // null → all non-member slots are zero; conservation trivially holds
          if (result === null) return

          const { groupHalfAmount, directHalfEntries } = result
          const directTotal = directHalfEntries.reduce(
            (sum, e) => sum + e.amount,
            0,
          )

          expect(groupHalfAmount + directTotal).toBe(totalMinor)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  /**
   * Property 2: Group_Half Internal Consistency
   *
   * **Validates: Requirements 3.6, 12.3**
   *
   * For any non-null result:
   *   sum(memberEntries[j].shares) === groupHalfAmount
   *
   * The groupHalfAmount field must equal the sum of the per-member share slots
   * that will be stored as paidFor entries on the Group_Half expense.
   */
  describe('Property 2: Group_Half Internal Consistency', () => {
    it('sum(memberEntries[j].shares) === groupHalfAmount', () => {
      fc.assert(
        fc.property(arbDecomposeInput, (input) => {
          const { totalMinor, splitMode, paidFor } = input

          const values = {
            amount: totalMinor,
            splitMode,
            paidFor,
          }

          const group = {
            ...GROUP_EUR,
            participants: input.memberIds.map((id) => ({ id })),
          }

          const result = computeDecompositionSlots(values, group)

          if (result === null) return

          const { memberEntries, groupHalfAmount } = result
          const memberShareSum = memberEntries.reduce(
            (sum, e) => sum + e.shares,
            0,
          )

          expect(memberShareSum).toBe(groupHalfAmount)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  /**
   * Property 3: Non-Negative Direct_Half Amounts
   *
   * **Validates: Requirements 3.7, 12.4**
   *
   * Every entry in directHalfEntries (which represents a persisted Direct_Half)
   * must have amount > 0. Zero-slot non-members are silently excluded; if all
   * non-member slots are zero the function returns null (tested separately).
   */
  describe('Property 3: Non-Negative Direct_Half Amounts', () => {
    it('every directHalfEntry has amount > 0', () => {
      fc.assert(
        fc.property(arbDecomposeInput, (input) => {
          const { totalMinor, splitMode, paidFor } = input

          const values = {
            amount: totalMinor,
            splitMode,
            paidFor,
          }

          const group = {
            ...GROUP_EUR,
            participants: input.memberIds.map((id) => ({ id })),
          }

          const result = computeDecompositionSlots(values, group)

          // null → no direct halves; property trivially satisfied
          if (result === null) return

          for (const entry of result.directHalfEntries) {
            expect(entry.amount).toBeGreaterThan(0)
          }
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})

// =============================================================================
// Suite 2 — Payer Net-Position Invariant via getBalances
// =============================================================================

/**
 * Property 4: Payer Net-Position Invariant
 *
 * **Validates: Requirements 10.3, 12.5**
 *
 * For EVENLY splits, after decomposition the payer's net position across both
 * halves must equal: originalTotal − payerShare.
 *
 *   payerGroupNet     = paid − paidFor on the Group_Half  (via getBalances)
 *   payerDirectCredit = sum of Direct_Half amounts        (via getBalances on each DH)
 *   payerShare        = payer's slot from the single EVENLY distributor call
 *                       over all N participants (members + non-members)
 *
 * The invariant: payerGroupNet + payerDirectCredit === originalTotal − payerShare
 */

import { getBalances } from '../balances'
import { distributeEqualAmounts } from '../distribute-amount'

/**
 * Build a synthetic expense object shaped exactly as getBalances expects.
 * getBalances reads: expense.payers, expense.paidBy.id, expense.amount,
 *                    expense.splitMode, expense.paidFor[].user.id, expense.paidFor[].shares
 */
function makeSyntheticExpense(opts: {
  id: string
  amount: number
  payerId: string
  splitMode: 'BY_AMOUNT' | 'EVENLY'
  paidFor: Array<{ userId: string; shares: number }>
}): Parameters<typeof getBalances>[0][number] {
  return {
    id: opts.id,
    groupId: 'group-test',
    title: 'Test',
    expenseDate: new Date(),
    amount: opts.amount,
    splitMode: opts.splitMode,
    isReimbursement: false,
    recurrenceRule: 'NONE',
    creationMethod: 'NON_MEMBER_SPLIT',
    notes: null,
    categoryId: null,
    paidById: opts.payerId,
    // payers array drives the "paid" credit in getBalances
    payers: [
      {
        userId: opts.payerId,
        amount: opts.amount,
        user: { id: opts.payerId, name: 'Payer' },
      },
    ],
    // paidBy is the fallback; we always populate payers so this is not used
    paidBy: { id: opts.payerId, name: 'Payer', email: 'payer@test.com' },
    paidFor: opts.paidFor.map((pf) => ({
      shares: pf.shares,
      user: { id: pf.userId, name: pf.userId, email: `${pf.userId}@test.com` },
    })),
    category: null,
    documents: [],
    recurringExpenseLink: null,
    // New schema fields — present but not read by getBalances
    linkedExpenseId: null,
    expenseCurrencyCode: null,
    originalTotalAtDecomposition: null,
  } as unknown as Parameters<typeof getBalances>[0][number]
}

describe('Non-Member Decomposition — Property-Based Tests (Suite 2)', () => {
  /**
   * Property 4: Payer Net-Position Invariant (EVENLY)
   *
   * **Validates: Requirements 10.3, 12.5**
   */
  describe('Property 4: Payer Net-Position Invariant', () => {
    it('payerGroupNet + payerDirectCredits === originalTotal − payerShare for EVENLY splits', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 1, max: 1_000_000 }), // totalMinor
            fc.integer({ min: 1, max: 10 }), // numMembers
            fc.integer({ min: 1, max: 5 }), // numNonMembers
          ),
          ([totalMinor, numMembers, numNonMembers]) => {
            // Build IDs for members and non-members
            const memberIds = Array.from(
              { length: numMembers },
              (_, i) => `m-user-${i}`,
            )
            const nonMemberIds = Array.from(
              { length: numNonMembers },
              (_, i) => `nm-user-${i}`,
            )

            // The payer is always the first member (index 0 in the combined list)
            const payerId = memberIds[0]
            const payerIndex = 0 // payer is first in the combined list (members first)
            const combinedCount = numMembers + numNonMembers

            // Run the EVENLY distributor once over the combined list (EUR, 2 decimal digits)
            // Returns major-unit values; convert back to minor units
            const factor = 100 // EUR: 2 decimal digits
            const totalMajor = totalMinor / factor
            const majorSlots = distributeEqualAmounts(
              totalMajor,
              combinedCount,
              2,
            )
            const allMinorSlots = majorSlots.map((s) => Math.round(s * factor))

            // payerShare = payer's slot from the combined list
            const payerShare = allMinorSlots[payerIndex]

            // Member minor slots (first numMembers indices)
            const memberMinorSlots = allMinorSlots.slice(0, numMembers)
            // Non-member minor slots (remaining indices)
            const nonMemberMinorSlots = allMinorSlots.slice(numMembers)

            // Compute group half amount = sum of member slots
            const groupHalfAmount = memberMinorSlots.reduce((s, v) => s + v, 0)

            // Filter zero-slot non-members (same as computeDecompositionSlots)
            const directHalfEntries = nonMemberIds
              .map((id, i) => ({
                userId: id,
                amount: nonMemberMinorSlots[i] ?? 0,
              }))
              .filter((e) => e.amount > 0)

            // If no direct halves (e.g. very small total), skip the assertion.
            // This mirrors computeDecompositionSlots returning null.
            if (directHalfEntries.length === 0) return

            // Build synthetic Group_Half with BY_AMOUNT splitMode.
            // paidFor shares are the per-member minor-unit slots.
            const syntheticGroupHalf = makeSyntheticExpense({
              id: 'gh-test',
              amount: groupHalfAmount,
              payerId,
              splitMode: 'BY_AMOUNT',
              paidFor: memberIds.map((id, i) => ({
                userId: id,
                shares: memberMinorSlots[i],
              })),
            })

            // Run getBalances on the Group_Half
            const groupBalances = getBalances([syntheticGroupHalf])
            const payerGroupNet = groupBalances[payerId]?.total ?? 0

            // Sum payer credits from each Direct_Half
            let payerDirectCredits = 0
            for (const dh of directHalfEntries) {
              const syntheticDH = makeSyntheticExpense({
                id: `dh-${dh.userId}`,
                amount: dh.amount,
                payerId,
                splitMode: 'BY_AMOUNT',
                paidFor: [{ userId: dh.userId, shares: dh.amount }],
              })
              const dhBalances = getBalances([syntheticDH])
              // Payer's total on the DH (should be +dh.amount because payer paid, nobody owes payer from paidFor)
              payerDirectCredits += dhBalances[payerId]?.total ?? 0
            }

            // The invariant: net across both halves === originalTotal − payerShare
            const expected = totalMinor - payerShare
            const actual = payerGroupNet + payerDirectCredits

            expect(actual).toBe(expected)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
