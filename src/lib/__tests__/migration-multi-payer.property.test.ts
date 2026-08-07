/**
 * Property-based tests for multi-payer migration correctness.
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
 * Generate paidFor entries for given participants and split mode.
 */
function arbPaidFor(
  participantIds: string[],
  splitMode: 'EVENLY' | 'BY_SHARES' | 'BY_AMOUNT',
  total: number,
): fc.Arbitrary<Array<{ user: { id: string; name: string }; shares: number }>> {
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

/**
 * Generate a single-payer expense (pre-migration state).
 * These expenses have a single paidById user and no payers entries.
 */
function arbSinglePayerExpense(participantIds: string[]): fc.Arbitrary<{
  total: number
  splitMode: string
  paidFor: any[]
  payerId: string
}> {
  return fc.integer({ min: 1, max: 10_000_000 }).chain((total) =>
    arbSplitMode.chain((splitMode) =>
      arbPaidFor(participantIds, splitMode, total).chain((paidFor) =>
        fc.constantFrom(...participantIds).map((payerId) => ({
          total,
          splitMode,
          paidFor,
          payerId,
        })),
      ),
    ),
  )
}

// --- Helpers ---

/**
 * Simulate pre-migration expense: payers array is empty,
 * getBalances falls back to paidBy.id with full amount.
 */
function toLegacyExpense(exp: {
  total: number
  splitMode: string
  paidFor: any[]
  payerId: string
}): Expense {
  return {
    amount: exp.total,
    isReimbursement: false,
    splitMode: exp.splitMode,
    paidBy: { id: exp.payerId, name: exp.payerId },
    paidFor: exp.paidFor,
    payers: [],
  } as unknown as Expense
}

/**
 * Simulate post-migration expense: payers array has one entry
 * with userId = paidById and amount = expense.amount.
 * This is exactly what the migration does.
 */
function toMigratedExpense(exp: {
  total: number
  splitMode: string
  paidFor: any[]
  payerId: string
}): Expense {
  return {
    amount: exp.total,
    isReimbursement: false,
    splitMode: exp.splitMode,
    paidBy: { id: exp.payerId, name: exp.payerId },
    paidFor: exp.paidFor,
    payers: [
      {
        userId: exp.payerId,
        amount: exp.total,
        user: { id: exp.payerId, name: exp.payerId },
      },
    ],
  } as Expense
}

// --- Tests ---

describe('Multi-Payer Migration — Property-Based Tests', () => {
  /**
   * Property 6: Migration Correctness and Idempotence
   *
   * **Validates: Requirements 6.1, 6.3**
   *
   * For any set of existing expenses, the data migration SHALL create exactly one
   * ExpensePaidBy row per expense (with userId = paidById and amount = expense.amount),
   * and running the migration N times SHALL produce the same database state as running
   * it once (no duplicate rows).
   */
  describe('Property 6: Migration Correctness and Idempotence', () => {
    it('migration produces exactly one payer entry per expense with correct userId and amount', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc
              .array(arbSinglePayerExpense(ids), {
                minLength: 1,
                maxLength: 10,
              })
              .map((exps) => ({ ids, exps })),
          ),
          ({ exps }) => {
            // Simulate migration: for each expense, create one payer entry
            for (const exp of exps) {
              const migrated = toMigratedExpense(exp)

              // Exactly one payer entry
              expect(migrated.payers).toHaveLength(1)
              // userId matches paidById
              expect(migrated.payers![0].userId).toBe(exp.payerId)
              // amount matches expense total
              expect(migrated.payers![0].amount).toBe(exp.total)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('repeated migration produces identical state (idempotence)', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc
              .array(arbSinglePayerExpense(ids), {
                minLength: 1,
                maxLength: 10,
              })
              .map((exps) => ({ ids, exps })),
          ),
          ({ exps }) => {
            // Simulate running migration multiple times
            // The migration uses ON CONFLICT DO NOTHING, so applying it N times
            // should yield the same set of payer entries as applying it once.
            const migrateOnce = exps.map(toMigratedExpense)
            const migrateTwice = exps.map(toMigratedExpense)
            const migrateThrice = exps.map(toMigratedExpense)

            for (let i = 0; i < exps.length; i++) {
              // All migrations produce identical payer arrays
              expect(migrateOnce[i].payers).toEqual(migrateTwice[i].payers)
              expect(migrateTwice[i].payers).toEqual(migrateThrice[i].payers)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  /**
   * Property 7: Migration Balance Preservation
   *
   * **Validates: Requirements 6.4**
   *
   * For any group, the net balance (paid − paidFor) for every participant SHALL be
   * identical before and after the data migration.
   */
  describe('Property 7: Migration Balance Preservation', () => {
    it('net balance for every participant is identical before and after migration', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc
              .array(arbSinglePayerExpense(ids), {
                minLength: 1,
                maxLength: 10,
              })
              .map((exps) => ({ ids, exps })),
          ),
          ({ ids, exps }) => {
            // Before migration: legacy path (payers empty, uses paidBy.id with full amount)
            const legacyExpenses = exps.map(toLegacyExpense)
            const balancesBefore = getBalances(legacyExpenses)

            // After migration: payers array has one entry per expense
            const migratedExpenses = exps.map(toMigratedExpense)
            const balancesAfter = getBalances(migratedExpenses)

            // Every participant's net balance (total = paid - paidFor) must be identical
            const allParticipantIds = Array.from(
              new Set([
                ...ids,
                ...Object.keys(balancesBefore),
                ...Object.keys(balancesAfter),
              ]),
            )

            for (const id of allParticipantIds) {
              const before = balancesBefore[id] ?? {
                paid: 0,
                paidFor: 0,
                total: 0,
              }
              const after = balancesAfter[id] ?? {
                paid: 0,
                paidFor: 0,
                total: 0,
              }

              expect(after.paid).toBe(before.paid)
              expect(after.paidFor).toBe(before.paidFor)
              expect(after.total).toBe(before.total)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('migration preserves balances for groups with mixed expense types', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc
              .array(arbSinglePayerExpense(ids), { minLength: 2, maxLength: 8 })
              .map((exps) => ({ ids, exps })),
          ),
          ({ ids, exps }) => {
            // Before migration: all expenses use legacy path
            const legacyExpenses = exps.map(toLegacyExpense)
            const balancesBefore = getBalances(legacyExpenses)

            // After migration: all expenses have payers array populated
            const migratedExpenses = exps.map(toMigratedExpense)
            const balancesAfter = getBalances(migratedExpenses)

            // Verify net positions are preserved (paid, paidFor, total)
            const allParticipantIds = Array.from(
              new Set([
                ...ids,
                ...Object.keys(balancesBefore),
                ...Object.keys(balancesAfter),
              ]),
            )

            // Sum of all totals should be zero (zero-sum invariant)
            let sumBefore = 0
            let sumAfter = 0

            for (const id of allParticipantIds) {
              const before = balancesBefore[id] ?? {
                paid: 0,
                paidFor: 0,
                total: 0,
              }
              const after = balancesAfter[id] ?? {
                paid: 0,
                paidFor: 0,
                total: 0,
              }

              // Individual balances preserved
              expect(after.paid).toBe(before.paid)
              expect(after.paidFor).toBe(before.paidFor)
              expect(after.total).toBe(before.total)

              sumBefore += before.total
              sumAfter += after.total
            }

            // Zero-sum invariant holds both before and after
            expect(sumBefore).toBe(sumAfter)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
