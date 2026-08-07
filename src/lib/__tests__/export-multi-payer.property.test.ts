/**
 * Property-based tests for multi-payer CSV export.
 *
 * Feature: multi-payer-expenses
 * Uses fast-check for property-based testing with minimum 100 iterations.
 */

import { Currency } from '@/lib/currency'
import { formatAmountAsDecimal } from '@/lib/utils'
import fc from 'fast-check'

// --- Constants ---

const PBT_NUM_RUNS = 100

// A standard 2-decimal-digit currency for testing
const TEST_CURRENCY: Currency = {
  name: 'US Dollar',
  symbol_native: '$',
  symbol: '$',
  code: 'USD',
  name_plural: 'US dollars',
  rounding: 0,
  decimal_digits: 2,
}

// --- Types ---

interface PaidForEntry {
  userId: string
  shares: number
}

interface PayerEntry {
  userId: string
  amount: number
}

// --- CSV Column Computation Functions ---

/**
 * New multi-payer code: single-payer backward-compatible path.
 * Mirrors the `isSinglePayer` branch in the CSV export route.
 */
function computeColumnNewCode(
  participantId: string,
  payers: PayerEntry[],
  paidById: string,
  paidFor: PaidForEntry[],
  expenseAmount: number,
  currency: Currency,
): number {
  const totalShares = paidFor.reduce((acc, entry) => acc + entry.shares, 0)
  const participantPaidFor = paidFor.find((e) => e.userId === participantId)
  const participantShare = participantPaidFor ? participantPaidFor.shares : 0

  const isSinglePayer = payers.length <= 1

  if (isSinglePayer) {
    // Single-payer: preserve backward-compatible format
    // Payer column = +share, non-payer column = -share
    const isPaidByParticipant =
      (payers.length === 1 && payers[0].userId === participantId) ||
      (payers.length === 0 && paidById === participantId)

    const participantAmountShare =
      totalShares === 0
        ? 0
        : +formatAmountAsDecimal(
            (expenseAmount / totalShares) * participantShare,
            currency,
          )

    return participantAmountShare * (isPaidByParticipant ? 1 : -1)
  }

  // This path should not be reached for single-payer expenses
  throw new Error('Expected single-payer expense')
}

/**
 * Legacy/old code: original single-payer CSV export logic.
 * Before multi-payer was introduced, the code used `paidById` directly.
 * Payer column = +share, non-payer column = -share.
 */
function computeColumnLegacyCode(
  participantId: string,
  paidById: string,
  paidFor: PaidForEntry[],
  expenseAmount: number,
  currency: Currency,
): number {
  const totalShares = paidFor.reduce((acc, entry) => acc + entry.shares, 0)
  const participantPaidFor = paidFor.find((e) => e.userId === participantId)
  const participantShare = participantPaidFor ? participantPaidFor.shares : 0

  const isPaidByParticipant = paidById === participantId
  const participantAmountShare =
    totalShares === 0
      ? 0
      : +formatAmountAsDecimal(
          (expenseAmount / totalShares) * participantShare,
          currency,
        )

  return participantAmountShare * (isPaidByParticipant ? 1 : -1)
}

// --- Generators ---

/**
 * Generate a list of unique participant IDs (2–6 participants).
 */
const arbParticipantIds = fc
  .array(fc.uuid(), { minLength: 2, maxLength: 6 })
  .map((ids) => Array.from(new Set(ids)))
  .filter((ids) => ids.length >= 2)

/**
 * Generate valid paidFor entries for the given participants.
 * Each beneficiary gets at least 1 share.
 */
function arbPaidFor(participantIds: string[]): fc.Arbitrary<PaidForEntry[]> {
  return fc
    .shuffledSubarray(participantIds, {
      minLength: 1,
      maxLength: participantIds.length,
    })
    .chain((beneficiaryIds) =>
      fc
        .array(fc.integer({ min: 1, max: 100 }), {
          minLength: beneficiaryIds.length,
          maxLength: beneficiaryIds.length,
        })
        .map((shares) =>
          beneficiaryIds.map((id, i) => ({
            userId: id,
            shares: shares[i],
          })),
        ),
    )
}

/**
 * Multi-payer CSV column calculation — mirrors the route handler logic.
 * For multi-payer expenses: net position = payer credit - beneficiary debit.
 */
function computeColumnMultiPayer(
  participantId: string,
  payers: PayerEntry[],
  paidFor: PaidForEntry[],
  expenseAmount: number,
  currency: Currency,
): number {
  const totalShares = paidFor.reduce((acc, entry) => acc + entry.shares, 0)
  const participantPaidFor = paidFor.find((e) => e.userId === participantId)
  const participantShare = participantPaidFor ? participantPaidFor.shares : 0

  // Beneficiary debit
  const debit =
    totalShares === 0 ? 0 : (expenseAmount / totalShares) * participantShare

  // Payer credit from payers array
  const payerEntry = payers.find((p) => p.userId === participantId)
  const credit = payerEntry ? payerEntry.amount : 0

  // Net amount: payer credit (positive) minus beneficiary debit (negative)
  const net = credit - debit
  return +formatAmountAsDecimal(net, currency)
}

/**
 * Generate a multi-payer distribution (2+ payers) whose amounts sum exactly to total.
 */
function arbMultiPayerDistribution(
  participantIds: string[],
  total: number,
): fc.Arbitrary<PayerEntry[]> {
  const maxPayers = Math.min(participantIds.length, 5)
  return fc
    .integer({ min: 2, max: Math.max(2, maxPayers) })
    .chain((numPayers) => {
      return fc
        .shuffledSubarray(participantIds, {
          minLength: numPayers,
          maxLength: numPayers,
        })
        .chain((payerIds) => {
          if (numPayers === 1) {
            return fc.constant([{ userId: payerIds[0], amount: total }])
          }
          return fc
            .array(
              fc.integer({ min: 1, max: Math.max(1, total - numPayers) }),
              { minLength: numPayers - 1, maxLength: numPayers - 1 },
            )
            .map((amounts) => {
              const rawSum = amounts.reduce((s, a) => s + a, 0)
              const scaledAmounts = amounts.map((a) =>
                Math.max(1, Math.floor((a / rawSum) * (total - 1))),
              )
              const scaledSum = scaledAmounts.reduce((s, a) => s + a, 0)
              const lastAmount = total - scaledSum

              if (lastAmount <= 0) {
                const fallbackAmounts = payerIds.slice(0, -1).map(() => 1)
                const fallbackLast =
                  total - fallbackAmounts.reduce((s, a) => s + a, 0)
                return payerIds.map((id, i) => ({
                  userId: id,
                  amount: i < numPayers - 1 ? fallbackAmounts[i] : fallbackLast,
                }))
              }

              return payerIds.map((id, i) => ({
                userId: id,
                amount: i < numPayers - 1 ? scaledAmounts[i] : lastAmount,
              }))
            })
            .filter((payers) => payers.every((p) => p.amount > 0))
        })
    })
}

// --- Tests ---

describe('Multi-Payer CSV Export — Property-Based Tests', () => {
  /**
   * Property 11: CSV Export Per-Participant Values
   *
   * **Validates: Requirements 9.1, 9.2**
   *
   * For any expense with multiple payers, the CSV export SHALL output per-participant
   * column values where each payer's column equals their credit (positive) minus their
   * beneficiary debit (if any), and each non-payer beneficiary's column equals their
   * negative debit. The sum of all participant columns SHALL equal zero.
   */
  describe('Property 11: CSV Export Per-Participant Values', () => {
    it('sum of all participant columns equals zero for multi-payer expenses', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc
              .integer({ min: 100, max: 10_000_00 }) // 100 to 10000.00 in minor units
              .chain((total) =>
                arbPaidFor(ids).chain((paidFor) =>
                  arbMultiPayerDistribution(ids, total).map((payers) => ({
                    participantIds: ids,
                    expenseAmount: total,
                    paidFor,
                    payers,
                  })),
                ),
              ),
          ),
          ({ participantIds, expenseAmount, paidFor, payers }) => {
            const columns: Record<string, number> = {}

            for (const participantId of participantIds) {
              columns[participantId] = computeColumnMultiPayer(
                participantId,
                payers,
                paidFor,
                expenseAmount,
                TEST_CURRENCY,
              )
            }

            // Sum of all participant columns should equal zero
            // (one person's credit is another's debit)
            const sum = Object.values(columns).reduce((s, v) => s + v, 0)

            // Allow for floating point rounding tolerance
            expect(Math.abs(sum)).toBeLessThanOrEqual(
              0.01 * participantIds.length,
            )
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('payer-only columns are positive and non-payer beneficiary columns are non-positive', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc.integer({ min: 100, max: 10_000_00 }).chain((total) =>
              arbPaidFor(ids).chain((paidFor) =>
                arbMultiPayerDistribution(ids, total).map((payers) => ({
                  participantIds: ids,
                  expenseAmount: total,
                  paidFor,
                  payers,
                })),
              ),
            ),
          ),
          ({ participantIds, expenseAmount, paidFor, payers }) => {
            const payerIds = new Set(payers.map((p) => p.userId))
            const beneficiaryIds = new Set(paidFor.map((p) => p.userId))

            for (const participantId of participantIds) {
              const column = computeColumnMultiPayer(
                participantId,
                payers,
                paidFor,
                expenseAmount,
                TEST_CURRENCY,
              )

              const isPayer = payerIds.has(participantId)
              const isBeneficiary = beneficiaryIds.has(participantId)

              if (!isPayer && isBeneficiary) {
                // Non-payer beneficiaries should have negative (debit) columns
                expect(column).toBeLessThanOrEqual(0)
              } else if (isPayer && !isBeneficiary) {
                // Payers who are not beneficiaries should have positive (credit) columns
                expect(column).toBeGreaterThanOrEqual(0)
              }
              // If both payer and beneficiary, the net can be positive or negative
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  /**
   * Property 12: CSV Export Single-Payer Backward Compatibility
   *
   * **Validates: Requirements 9.3**
   *
   * For any single-payer expense, the CSV export produced by the multi-payer
   * code SHALL be byte-identical to the output of the current single-payer
   * export logic.
   */
  describe('Property 12: CSV Export Single-Payer Backward Compatibility', () => {
    it('single-payer CSV column values from new code match legacy code for all participants', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc.integer({ min: 100, max: 10_000_000 }).chain((expenseAmount) =>
              arbPaidFor(ids).chain((paidFor) =>
                fc.constantFrom(...ids).map((payerId) => ({
                  participantIds: ids,
                  expenseAmount,
                  paidFor,
                  payerId,
                })),
              ),
            ),
          ),
          ({ participantIds, expenseAmount, paidFor, payerId }) => {
            const payers: PayerEntry[] = [
              { userId: payerId, amount: expenseAmount },
            ]

            for (const participantId of participantIds) {
              const newValue = computeColumnNewCode(
                participantId,
                payers,
                payerId,
                paidFor,
                expenseAmount,
                TEST_CURRENCY,
              )

              const legacyValue = computeColumnLegacyCode(
                participantId,
                payerId,
                paidFor,
                expenseAmount,
                TEST_CURRENCY,
              )

              expect(newValue).toBe(legacyValue)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('single-payer CSV column values are identical across different currencies', () => {
      const currencies: Currency[] = [
        TEST_CURRENCY,
        {
          name: 'Japanese Yen',
          symbol_native: '¥',
          symbol: '¥',
          code: 'JPY',
          name_plural: 'Japanese yen',
          rounding: 0,
          decimal_digits: 0,
        },
        {
          name: 'Euro',
          symbol_native: '€',
          symbol: '€',
          code: 'EUR',
          name_plural: 'euros',
          rounding: 0,
          decimal_digits: 2,
        },
      ]

      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc.integer({ min: 100, max: 10_000_000 }).chain((expenseAmount) =>
              arbPaidFor(ids).chain((paidFor) =>
                fc.constantFrom(...ids).chain((payerId) =>
                  fc.constantFrom(...currencies).map((currency) => ({
                    participantIds: ids,
                    expenseAmount,
                    paidFor,
                    payerId,
                    currency,
                  })),
                ),
              ),
            ),
          ),
          ({ participantIds, expenseAmount, paidFor, payerId, currency }) => {
            const payers: PayerEntry[] = [
              { userId: payerId, amount: expenseAmount },
            ]

            for (const participantId of participantIds) {
              const newValue = computeColumnNewCode(
                participantId,
                payers,
                payerId,
                paidFor,
                expenseAmount,
                currency,
              )

              const legacyValue = computeColumnLegacyCode(
                participantId,
                payerId,
                paidFor,
                expenseAmount,
                currency,
              )

              expect(newValue).toBe(legacyValue)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('non-beneficiary payer column is zero for both new and legacy code', () => {
      fc.assert(
        fc.property(
          arbParticipantIds
            .filter((ids) => ids.length >= 3)
            .chain((ids) => {
              // Pick a payer who is NOT a beneficiary
              return fc
                .integer({ min: 100, max: 10_000_000 })
                .chain((expenseAmount) => {
                  // Use only a subset as beneficiaries (not all participants)
                  const beneficiaryIds = ids.slice(1) // first participant excluded
                  const payerId = ids[0] // payer is NOT in beneficiaries

                  const paidFor: PaidForEntry[] = beneficiaryIds.map((id) => ({
                    userId: id,
                    shares: 1,
                  }))

                  return fc.constant({
                    participantIds: ids,
                    expenseAmount,
                    paidFor,
                    payerId,
                  })
                })
            }),
          ({ participantIds, expenseAmount, paidFor, payerId }) => {
            const payers: PayerEntry[] = [
              { userId: payerId, amount: expenseAmount },
            ]

            // The payer is not a beneficiary, so their share is 0
            // Legacy: isPaidByParticipant=true, share=0 → 0 * 1 = 0
            // New: isPaidByParticipant=true, share=0 → 0 * 1 = 0
            const newValue = computeColumnNewCode(
              payerId,
              payers,
              payerId,
              paidFor,
              expenseAmount,
              TEST_CURRENCY,
            )

            const legacyValue = computeColumnLegacyCode(
              payerId,
              payerId,
              paidFor,
              expenseAmount,
              TEST_CURRENCY,
            )

            expect(newValue).toBe(0)
            expect(legacyValue).toBe(0)
            expect(newValue).toBe(legacyValue)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
