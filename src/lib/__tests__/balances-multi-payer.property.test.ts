/**
 * Property-based tests for multi-payer balance computation.
 *
 * Feature: multi-payer-expenses
 * Uses fast-check for property-based testing with minimum 100 iterations.
 */

import fc from 'fast-check'
import { getBalances } from '../balances'

type Expense = Parameters<typeof getBalances>[0][number]

// --- Constants ---

const PBT_NUM_RUNS = 100

// --- Generators ---

const arbSplitMode = fc.constantFrom(
  'EVENLY' as const,
  'BY_SHARES' as const,
  'BY_AMOUNT' as const,
)

/**
 * Generate a list of unique participant IDs (2–8 participants).
 */
const arbParticipantIds = fc
  .array(fc.uuid(), { minLength: 2, maxLength: 8 })
  .map((ids) => Array.from(new Set(ids)))
  .filter((ids) => ids.length >= 2)

/**
 * Generate a valid payer distribution for a given total.
 * Produces 1–N payers whose amounts sum exactly to the total.
 */
function arbPayerDistribution(
  participantIds: string[],
  total: number,
): fc.Arbitrary<
  Array<{ userId: string; amount: number; user: { id: string; name: string } }>
> {
  const maxPayers = Math.min(participantIds.length, 5)
  return fc.integer({ min: 1, max: maxPayers }).chain((numPayers) => {
    // Pick numPayers unique participant IDs
    return fc
      .shuffledSubarray(participantIds, {
        minLength: numPayers,
        maxLength: numPayers,
      })
      .chain((payerIds) => {
        // Generate numPayers - 1 amounts that leave a positive remainder for the last
        if (numPayers === 1) {
          return fc.constant(
            payerIds.map((id) => ({
              userId: id,
              amount: total,
              user: { id, name: id },
            })),
          )
        }
        // Generate amounts for the first N-1 payers, each between 1 and (total - remaining payers)
        return fc
          .array(fc.integer({ min: 1, max: Math.max(1, total - numPayers) }), {
            minLength: numPayers - 1,
            maxLength: numPayers - 1,
          })
          .map((amounts) => {
            // Normalize so they sum to less than total, leaving at least 1 for last payer
            const rawSum = amounts.reduce((s, a) => s + a, 0)
            const scaledAmounts = amounts.map((a) =>
              Math.max(1, Math.floor((a / rawSum) * (total - 1))),
            )
            const scaledSum = scaledAmounts.reduce((s, a) => s + a, 0)
            const lastAmount = total - scaledSum

            if (lastAmount <= 0) {
              // Fallback: give everything to the last payer
              const fallbackAmounts = payerIds.slice(0, -1).map(() => 1)
              const fallbackLast =
                total - fallbackAmounts.reduce((s, a) => s + a, 0)
              return payerIds.map((id, i) => ({
                userId: id,
                amount: i < numPayers - 1 ? fallbackAmounts[i] : fallbackLast,
                user: { id, name: id },
              }))
            }

            return payerIds.map((id, i) => ({
              userId: id,
              amount: i < numPayers - 1 ? scaledAmounts[i] : lastAmount,
              user: { id, name: id },
            }))
          })
          .filter((payers) => payers.every((p) => p.amount > 0))
      })
  })
}

/**
 * Generate paidFor entries for given participants and split mode.
 */
function arbPaidFor(
  participantIds: string[],
  splitMode: 'EVENLY' | 'BY_SHARES' | 'BY_AMOUNT',
  total: number,
): fc.Arbitrary<Array<{ user: { id: string; name: string }; shares: number }>> {
  // Pick a subset of participants as beneficiaries (at least 1)
  return fc
    .shuffledSubarray(participantIds, {
      minLength: 1,
      maxLength: participantIds.length,
    })
    .chain((beneficiaryIds) => {
      switch (splitMode) {
        case 'EVENLY':
          return fc.constant(
            beneficiaryIds.map((id) => ({
              user: { id, name: id },
              shares: 1,
            })),
          )
        case 'BY_SHARES':
          return fc
            .array(fc.integer({ min: 1, max: 100 }), {
              minLength: beneficiaryIds.length,
              maxLength: beneficiaryIds.length,
            })
            .map((shares) =>
              beneficiaryIds.map((id, i) => ({
                user: { id, name: id },
                shares: shares[i],
              })),
            )
        case 'BY_AMOUNT': {
          // Generate amounts that sum to total
          const numBeneficiaries = beneficiaryIds.length
          if (numBeneficiaries === 1) {
            return fc.constant([
              {
                user: { id: beneficiaryIds[0], name: beneficiaryIds[0] },
                shares: total,
              },
            ])
          }
          return fc
            .array(
              fc.integer({
                min: 1,
                max: Math.max(1, total - numBeneficiaries),
              }),
              {
                minLength: numBeneficiaries - 1,
                maxLength: numBeneficiaries - 1,
              },
            )
            .map((shares) => {
              const rawSum = shares.reduce((s, a) => s + a, 0)
              const scaledShares = shares.map((a) =>
                Math.max(1, Math.floor((a / rawSum) * (total - 1))),
              )
              const scaledSum = scaledShares.reduce((s, a) => s + a, 0)
              const lastShare = total - scaledSum

              if (lastShare <= 0) {
                const fallback = beneficiaryIds.slice(0, -1).map(() => 1)
                const fallbackLast = total - fallback.reduce((s, a) => s + a, 0)
                return beneficiaryIds.map((id, i) => ({
                  user: { id, name: id },
                  shares: i < numBeneficiaries - 1 ? fallback[i] : fallbackLast,
                }))
              }

              return beneficiaryIds.map((id, i) => ({
                user: { id, name: id },
                shares: i < numBeneficiaries - 1 ? scaledShares[i] : lastShare,
              }))
            })
            .filter((paidFor) => paidFor.every((p) => p.shares > 0))
        }
      }
    })
}

// --- Tests ---

describe('Multi-Payer Balances — Property-Based Tests', () => {
  /**
   * Property 3: PaidFor Independence from Payer Distribution
   *
   * **Validates: Requirements 3.2**
   *
   * For any expense, the `paidFor` (debit) amounts computed for each beneficiary
   * SHALL be identical regardless of how the expense total is distributed among payers.
   * Only the `paidBy` credit side is affected by the payer distribution.
   */
  describe('Property 3: PaidFor Independence from Payer Distribution', () => {
    it('paidFor values are identical regardless of payer distribution', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc.integer({ min: 100, max: 1_000_000 }).chain((total) =>
              arbSplitMode.chain((splitMode) =>
                arbPaidFor(ids, splitMode, total).chain((paidFor) =>
                  fc.tuple(
                    // Generate two different payer distributions for the same total
                    arbPayerDistribution(ids, total),
                    arbPayerDistribution(ids, total),
                    fc.constant({ ids, total, splitMode, paidFor }),
                  ),
                ),
              ),
            ),
          ),
          ([payerDist1, payerDist2, { ids, total, splitMode, paidFor }]) => {
            // Create expense with first payer distribution
            const expense1: Expense = {
              amount: total,
              isReimbursement: false,
              splitMode,
              paidBy: { id: payerDist1[0].userId, name: payerDist1[0].userId },
              paidFor,
              payers: payerDist1,
            } as Expense

            // Create expense with second payer distribution (same total, same split)
            const expense2: Expense = {
              amount: total,
              isReimbursement: false,
              splitMode,
              paidBy: { id: payerDist2[0].userId, name: payerDist2[0].userId },
              paidFor,
              payers: payerDist2,
            } as Expense

            const balances1 = getBalances([expense1])
            const balances2 = getBalances([expense2])

            // Assert paidFor values are identical for all beneficiaries
            for (const entry of paidFor) {
              const userId = entry.user.id
              const paidFor1 = balances1[userId]?.paidFor ?? 0
              const paidFor2 = balances2[userId]?.paidFor ?? 0
              expect(paidFor1).toBe(paidFor2)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('paidFor values are unchanged between single-payer and multi-payer for same expense total', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc.integer({ min: 100, max: 1_000_000 }).chain((total) =>
              arbSplitMode.chain((splitMode) =>
                arbPaidFor(ids, splitMode, total).chain((paidFor) =>
                  fc.tuple(
                    // Single payer (one person pays everything)
                    fc.constantFrom(...ids).map((payerId) => [
                      {
                        userId: payerId,
                        amount: total,
                        user: { id: payerId, name: payerId },
                      },
                    ]),
                    // Multi-payer distribution
                    arbPayerDistribution(ids, total),
                    fc.constant({ ids, total, splitMode, paidFor }),
                  ),
                ),
              ),
            ),
          ),
          ([singlePayer, multiPayer, { total, splitMode, paidFor }]) => {
            const singlePayerExpense: Expense = {
              amount: total,
              isReimbursement: false,
              splitMode,
              paidBy: {
                id: singlePayer[0].userId,
                name: singlePayer[0].userId,
              },
              paidFor,
              payers: singlePayer,
            } as Expense

            const multiPayerExpense: Expense = {
              amount: total,
              isReimbursement: false,
              splitMode,
              paidBy: { id: multiPayer[0].userId, name: multiPayer[0].userId },
              paidFor,
              payers: multiPayer,
            } as Expense

            const singleBalances = getBalances([singlePayerExpense])
            const multiBalances = getBalances([multiPayerExpense])

            // Assert paidFor values are identical for ALL users in the system
            const allUserIds = Array.from(
              new Set([
                ...Object.keys(singleBalances),
                ...Object.keys(multiBalances),
              ]),
            )

            for (const userId of allUserIds) {
              const paidForSingle = singleBalances[userId]?.paidFor ?? 0
              const paidForMulti = multiBalances[userId]?.paidFor ?? 0
              expect(paidForSingle).toBe(paidForMulti)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  /**
   * Property 4: Single-Payer Backward Compatibility
   *
   * **Validates: Requirements 3.4**
   *
   * For any expense with exactly one payer whose amount equals the expense total,
   * the balance calculator SHALL produce identical `paid`, `paidFor`, and `total`
   * values to the current single-payer computation (legacy path using paidBy.id
   * with empty payers array).
   */
  describe('Property 4: Single-Payer Backward Compatibility', () => {
    it('single-payer expense with payers array produces identical balances to legacy paidBy path', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc.integer({ min: 1, max: 10_000_000 }).chain((total) =>
              arbSplitMode.chain((splitMode) =>
                arbPaidFor(ids, splitMode, total).chain((paidFor) =>
                  fc.constantFrom(...ids).map((payerId) => ({
                    ids,
                    total,
                    splitMode,
                    paidFor,
                    payerId,
                  })),
                ),
              ),
            ),
          ),
          ({ ids, total, splitMode, paidFor, payerId }) => {
            // Multi-payer format: payers array with a single entry
            const multiPayerExpense: Expense = {
              amount: total,
              isReimbursement: false,
              splitMode,
              paidBy: { id: payerId, name: payerId },
              paidFor,
              payers: [
                {
                  userId: payerId,
                  amount: total,
                  user: { id: payerId, name: payerId },
                },
              ],
            } as Expense

            // Legacy format: empty payers array, falls back to paidBy.id
            const legacyExpense = {
              amount: total,
              isReimbursement: false,
              splitMode,
              paidBy: { id: payerId, name: payerId },
              paidFor,
              payers: [],
            } as unknown as Expense

            const multiResult = getBalances([multiPayerExpense])
            const legacyResult = getBalances([legacyExpense])

            // All participant balances must be identical
            const allParticipantIds = Array.from(
              new Set([
                ...Object.keys(multiResult),
                ...Object.keys(legacyResult),
              ]),
            )

            for (const id of allParticipantIds) {
              const multi = multiResult[id] ?? { paid: 0, paidFor: 0, total: 0 }
              const legacy = legacyResult[id] ?? {
                paid: 0,
                paidFor: 0,
                total: 0,
              }

              expect(multi.paid).toBe(legacy.paid)
              expect(multi.paidFor).toBe(legacy.paidFor)
              expect(multi.total).toBe(legacy.total)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('single-payer backward compatibility holds across multiple expenses', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc
              .array(
                fc.integer({ min: 1, max: 10_000_000 }).chain((total) =>
                  arbSplitMode.chain((splitMode) =>
                    arbPaidFor(ids, splitMode, total).chain((paidFor) =>
                      fc.constantFrom(...ids).map((payerId) => ({
                        total,
                        splitMode,
                        paidFor,
                        payerId,
                      })),
                    ),
                  ),
                ),
                { minLength: 1, maxLength: 5 },
              )
              .map((exps) => ({ ids, exps })),
          ),
          ({ ids, exps }) => {
            const multiPayerExpenses: Expense[] = exps.map(
              ({ total, splitMode, paidFor, payerId }) =>
                ({
                  amount: total,
                  isReimbursement: false,
                  splitMode,
                  paidBy: { id: payerId, name: payerId },
                  paidFor,
                  payers: [
                    {
                      userId: payerId,
                      amount: total,
                      user: { id: payerId, name: payerId },
                    },
                  ],
                }) as Expense,
            )

            const legacyExpenses: Expense[] = exps.map(
              ({ total, splitMode, paidFor, payerId }) =>
                ({
                  amount: total,
                  isReimbursement: false,
                  splitMode,
                  paidBy: { id: payerId, name: payerId },
                  paidFor,
                  payers: [],
                }) as unknown as Expense,
            )

            const multiResult = getBalances(multiPayerExpenses)
            const legacyResult = getBalances(legacyExpenses)

            const allParticipantIds = Array.from(
              new Set([
                ...Object.keys(multiResult),
                ...Object.keys(legacyResult),
              ]),
            )

            for (const id of allParticipantIds) {
              const multi = multiResult[id] ?? { paid: 0, paidFor: 0, total: 0 }
              const legacy = legacyResult[id] ?? {
                paid: 0,
                paidFor: 0,
                total: 0,
              }

              expect(multi.paid).toBe(legacy.paid)
              expect(multi.paidFor).toBe(legacy.paidFor)
              expect(multi.total).toBe(legacy.total)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
