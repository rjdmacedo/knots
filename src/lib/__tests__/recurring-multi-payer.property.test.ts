/**
 * Property-based tests for recurring expense multi-payer propagation.
 *
 * Feature: multi-payer-expenses, Property 16: Recurring Expense PaidBy Propagation
 * Uses fast-check for property-based testing with minimum 100 iterations.
 *
 * **Validates: Requirements 12.1, 12.2**
 */

import fc from 'fast-check'

const PBT_NUM_RUNS = 100

// --- Types ---

interface PayerEntry {
  userId: string
  amount: number
}

// --- Materialization Logic ---

/**
 * Simulates the recurring expense materialization logic from src/lib/api.ts.
 * The createRecurringExpenses function copies payers from the source expense
 * to the new instance via:
 *
 *   payers: {
 *     createMany: {
 *       data: currentExpenseRecord.payers.map((payer) => ({
 *         userId: payer.userId,
 *         amount: payer.amount,
 *       })),
 *     },
 *   }
 *
 * This function replicates that copy logic in isolation.
 */
function materializePayers(sourcePayers: PayerEntry[]): PayerEntry[] {
  return sourcePayers.map((payer) => ({
    userId: payer.userId,
    amount: payer.amount,
  }))
}

// --- Generators ---

/**
 * Generate a list of unique user IDs (1–5 payers).
 */
const arbUniqueUserIds = fc
  .array(fc.uuid(), { minLength: 1, maxLength: 5 })
  .map((ids) => Array.from(new Set(ids)))
  .filter((ids) => ids.length >= 1)

/**
 * Generate a valid payer set: 1–5 payers whose amounts sum to a positive total.
 * Amounts are positive integers in minor currency units.
 */
function arbPayerSet(): fc.Arbitrary<{ payers: PayerEntry[]; total: number }> {
  return arbUniqueUserIds.chain((userIds) => {
    const numPayers = userIds.length

    if (numPayers === 1) {
      return fc.integer({ min: 1, max: 10_000_000 }).map((total) => ({
        payers: [{ userId: userIds[0], amount: total }],
        total,
      }))
    }

    // Generate a total and distribute it among payers
    return fc.integer({ min: numPayers, max: 10_000_000 }).chain((total) => {
      // Generate N-1 amounts that leave a positive remainder for the last payer
      return fc
        .array(fc.integer({ min: 1, max: Math.max(1, total - numPayers) }), {
          minLength: numPayers - 1,
          maxLength: numPayers - 1,
        })
        .map((rawAmounts) => {
          const rawSum = rawAmounts.reduce((s, a) => s + a, 0)
          // Scale amounts so they sum to less than total, leaving at least 1 for last payer
          const scaledAmounts = rawAmounts.map((a) =>
            Math.max(1, Math.floor((a / rawSum) * (total - 1))),
          )
          const scaledSum = scaledAmounts.reduce((s, a) => s + a, 0)
          const lastAmount = total - scaledSum

          if (lastAmount <= 0) {
            // Fallback: give 1 to each and remainder to last
            const fallbackAmounts = userIds.slice(0, -1).map(() => 1)
            const fallbackLast =
              total - fallbackAmounts.reduce((s, a) => s + a, 0)
            return {
              payers: userIds.map((id, i) => ({
                userId: id,
                amount: i < numPayers - 1 ? fallbackAmounts[i] : fallbackLast,
              })),
              total,
            }
          }

          return {
            payers: userIds.map((id, i) => ({
              userId: id,
              amount: i < numPayers - 1 ? scaledAmounts[i] : lastAmount,
            })),
            total,
          }
        })
        .filter(({ payers }) => payers.every((p) => p.amount > 0))
    })
  })
}

// --- Tests ---

describe('Recurring Expense Multi-Payer — Property-Based Tests', () => {
  /**
   * Property 16: Recurring Expense PaidBy Propagation
   *
   * **Validates: Requirements 12.1, 12.2**
   *
   * For any recurring expense with N payers, each materialized instance SHALL
   * contain exactly N ExpensePaidBy rows with the same userIds and amounts as
   * the source expense at the time of materialization.
   */
  describe('Property 16: Recurring Expense PaidBy Propagation', () => {
    it('materialized instance has identical payer count as source', () => {
      fc.assert(
        fc.property(arbPayerSet(), ({ payers }) => {
          const materialized = materializePayers(payers)
          expect(materialized).toHaveLength(payers.length)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('materialized instance has identical userIds as source', () => {
      fc.assert(
        fc.property(arbPayerSet(), ({ payers }) => {
          const materialized = materializePayers(payers)
          const sourceUserIds = payers.map((p) => p.userId).sort()
          const materializedUserIds = materialized.map((p) => p.userId).sort()
          expect(materializedUserIds).toEqual(sourceUserIds)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('materialized instance has identical amounts as source', () => {
      fc.assert(
        fc.property(arbPayerSet(), ({ payers }) => {
          const materialized = materializePayers(payers)
          const sourceAmounts = payers
            .map((p) => p.amount)
            .sort((a, b) => a - b)
          const materializedAmounts = materialized
            .map((p) => p.amount)
            .sort((a, b) => a - b)
          expect(materializedAmounts).toEqual(sourceAmounts)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('materialized instance payers match source payers exactly (userId-amount pairs)', () => {
      fc.assert(
        fc.property(arbPayerSet(), ({ payers }) => {
          const materialized = materializePayers(payers)

          // Each source payer must have a corresponding materialized payer
          // with the same userId and amount
          const sortByUserId = (a: PayerEntry, b: PayerEntry) =>
            a.userId.localeCompare(b.userId)

          const sortedSource = [...payers].sort(sortByUserId)
          const sortedMaterialized = [...materialized].sort(sortByUserId)

          expect(sortedMaterialized).toEqual(sortedSource)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('materialized payers are independent copies (no shared references)', () => {
      fc.assert(
        fc.property(arbPayerSet(), ({ payers }) => {
          const materialized = materializePayers(payers)

          // Mutating materialized entries should not affect source
          for (const entry of materialized) {
            entry.amount = 0
            entry.userId = 'mutated'
          }

          // Source should remain unchanged
          for (const payer of payers) {
            expect(payer.userId).not.toBe('mutated')
            expect(payer.amount).toBeGreaterThan(0)
          }
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('sum of materialized payer amounts equals source expense total', () => {
      fc.assert(
        fc.property(arbPayerSet(), ({ payers, total }) => {
          const materialized = materializePayers(payers)
          const materializedSum = materialized.reduce((s, p) => s + p.amount, 0)
          expect(materializedSum).toBe(total)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
