/**
 * Property-based tests for duplicate expense detection matching logic.
 *
 * Feature: duplicate-expense-detection
 * - Property 1: Title and Amount Matching
 * - Property 2: Self-Exclusion During Edit
 * - Property 7: No-Match Pass-Through
 * - Property 8: Context Scope Isolation
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 2.3, 4.3, 5.1, 5.2
 */

import fc from 'fast-check'
import {
  type ExistingExpense,
  findDuplicateMatches,
  normalizeExpenseTitle,
} from '../../../../../lib/duplicate-expense-detection'

// --- Constants ---

const PBT_NUM_RUNS = 50

// --- Generators ---

/** Arbitrary for a valid Date within a reasonable range (year 2000–2030) */
const arbDate = fc
  .integer({ min: 946684800000, max: 1893456000000 })
  .map((ms) => new Date(ms))

/** Arbitrary for a positive integer amount in minor units (cents) */
const arbAmount = fc.integer({ min: 1, max: 10_000_000 })

/** Arbitrary for a non-empty expense title */
const arbTitle = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0)

/** Arbitrary for a unique ID (UUID-like) */
const arbId = fc.uuid()

/** Arbitrary for a group ID */
const arbGroupId = fc.uuid()

/** Arbitrary for an existing expense record */
const arbExistingExpense = fc.record({
  id: arbId,
  title: arbTitle,
  amount: arbAmount,
  expenseDate: arbDate,
  categoryId: fc.integer({ min: 0, max: 50 }),
  groupId: arbGroupId.map((id): string | null => id),
})

// --- Tests ---

describe('Duplicate Detection - Property-Based Tests', () => {
  /**
   * Feature: duplicate-expense-detection, Property 1: Amount + Reinforcement Factor Matching
   *
   * Amount is the mandatory base factor. A duplicate is flagged when amount matches
   * AND at least one reinforcement factor (title or date proximity) also matches.
   *
   * Validates: Requirements 1.1, 1.3, 2.3
   */
  describe('Property 1: Amount + Reinforcement Factor Matching', () => {
    it('matching amount + title always flags as duplicate', () => {
      fc.assert(
        fc.property(
          arbExistingExpense,
          arbDate,
          fc.boolean(),
          (existing, inputDate, toUpper) => {
            const inputTitle = toUpper
              ? `  ${existing.title.toUpperCase()}  `
              : existing.title

            const result = findDuplicateMatches([existing], {
              title: inputTitle,
              amount: existing.amount,
              expenseDate: inputDate,
              groupId: existing.groupId,
              excludeExpenseId: undefined,
            })

            expect(result.hasDuplicates).toBe(true)
            expect(result.matches).toHaveLength(1)
            expect(result.matches[0].id).toBe(existing.id)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('matching amount + close date (different title) flags as duplicate', () => {
      fc.assert(
        fc.property(arbExistingExpense, arbTitle, (existing, inputTitle) => {
          // Precondition: titles must differ
          fc.pre(
            normalizeExpenseTitle(inputTitle) !==
              normalizeExpenseTitle(existing.title),
          )

          // Use a date within 7 days of existing
          const closeDate = new Date(
            existing.expenseDate.getTime() + 3 * 24 * 60 * 60 * 1000,
          )

          const result = findDuplicateMatches([existing], {
            title: inputTitle, // Different title
            amount: existing.amount, // Same amount
            expenseDate: closeDate, // Close date (proximate)
            groupId: existing.groupId,
          })

          // Amount (mandatory) + date (reinforcement) → flag
          expect(result.hasDuplicates).toBe(true)
          expect(result.matches).toHaveLength(1)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('matching amount only (no title match, far date) does NOT flag', () => {
      fc.assert(
        fc.property(arbExistingExpense, arbTitle, (existing, inputTitle) => {
          // Precondition: titles differ
          fc.pre(
            normalizeExpenseTitle(inputTitle) !==
              normalizeExpenseTitle(existing.title),
          )

          // Far date so date proximity doesn't match
          const farDate = new Date(
            existing.expenseDate.getTime() + 30 * 24 * 60 * 60 * 1000,
          )

          const result = findDuplicateMatches([existing], {
            title: inputTitle,
            amount: existing.amount, // Same amount but no reinforcement
            expenseDate: farDate,
            groupId: existing.groupId,
          })

          // Amount alone without reinforcement → no flag
          expect(result.hasDuplicates).toBe(false)
          expect(result.matches).toHaveLength(0)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('matching title + close date but different amount does NOT flag', () => {
      fc.assert(
        fc.property(arbExistingExpense, arbAmount, (existing, inputAmount) => {
          // Precondition: amounts must differ
          fc.pre(inputAmount !== existing.amount)

          const closeDate = new Date(
            existing.expenseDate.getTime() + 2 * 24 * 60 * 60 * 1000,
          )

          const result = findDuplicateMatches([existing], {
            title: existing.title, // Same title
            amount: inputAmount, // Different amount
            expenseDate: closeDate, // Close date
            groupId: existing.groupId,
          })

          // Amount is mandatory — without it, never flags
          expect(result.hasDuplicates).toBe(false)
          expect(result.matches).toHaveLength(0)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  /**
   * Feature: duplicate-expense-detection, Property 2: Self-Exclusion During Edit
   *
   * For any expense being edited, the Duplicate Detector SHALL never return that
   * expense's own ID in the match results, even when its title and amount match.
   *
   * Validates: Requirements 1.2
   */
  describe('Property 2: Self-Exclusion During Edit', () => {
    it('the expense being edited is never returned in results', () => {
      fc.assert(
        fc.property(arbExistingExpense, arbDate, (existing, inputDate) => {
          const result = findDuplicateMatches([existing], {
            title: existing.title,
            amount: existing.amount,
            expenseDate: inputDate,
            groupId: existing.groupId,
            excludeExpenseId: existing.id, // Editing this expense
          })

          // Should never include self
          expect(result.matches.every((m) => m.id !== existing.id)).toBe(true)
          expect(result.hasDuplicates).toBe(false)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('self-exclusion only removes the edited expense, other matches remain', () => {
      fc.assert(
        fc.property(
          arbExistingExpense,
          arbId,
          arbDate,
          (existing, otherId, inputDate) => {
            // Ensure other ID is different from existing
            fc.pre(otherId !== existing.id)

            const otherExpense: ExistingExpense = {
              ...existing,
              id: otherId,
            }

            const result = findDuplicateMatches([existing, otherExpense], {
              title: existing.title,
              amount: existing.amount,
              expenseDate: inputDate,
              groupId: existing.groupId,
              excludeExpenseId: existing.id, // Exclude self
            })

            // The other expense should still be a match
            expect(result.hasDuplicates).toBe(true)
            expect(result.matches).toHaveLength(1)
            expect(result.matches[0].id).toBe(otherId)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  /**
   * Feature: duplicate-expense-detection, Property 7: No-Match Pass-Through
   *
   * When the mandatory factor (amount) doesn't match, or when amount matches but
   * no reinforcement factor (title or date) matches, the detector SHALL NOT flag.
   *
   * Validates: Requirements 4.3
   */
  describe('Property 7: No-Match Pass-Through', () => {
    it('different amount never flags regardless of title/date match', () => {
      fc.assert(
        fc.property(arbExistingExpense, arbAmount, (existing, inputAmount) => {
          // Precondition: amounts differ
          fc.pre(inputAmount !== existing.amount)

          // Even with same title and close date, different amount means no flag
          const closeDate = new Date(
            existing.expenseDate.getTime() + 1 * 24 * 60 * 60 * 1000,
          )

          const result = findDuplicateMatches([existing], {
            title: existing.title, // Same title
            amount: inputAmount, // Different amount
            expenseDate: closeDate, // Close date
            groupId: existing.groupId,
          })

          expect(result.hasDuplicates).toBe(false)
          expect(result.matches).toHaveLength(0)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('same amount but no reinforcement (different title + far date) never flags', () => {
      fc.assert(
        fc.property(arbExistingExpense, arbTitle, (existing, inputTitle) => {
          // Precondition: titles differ
          fc.pre(
            normalizeExpenseTitle(inputTitle) !==
              normalizeExpenseTitle(existing.title),
          )

          // Far date (>7 days) so date proximity is false
          const farDate = new Date(
            existing.expenseDate.getTime() + 30 * 24 * 60 * 60 * 1000,
          )

          const result = findDuplicateMatches([existing], {
            title: inputTitle,
            amount: existing.amount, // Same amount
            expenseDate: farDate, // Far date
            groupId: existing.groupId,
          })

          expect(result.hasDuplicates).toBe(false)
          expect(result.matches).toHaveLength(0)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  /**
   * Feature: duplicate-expense-detection, Property 8: Context Scope Isolation
   *
   * For any expense context (group or direct friend relationship), the Duplicate Detector
   * SHALL only return matches from expenses belonging to that same context — never from
   * a different group or a different friend relationship.
   *
   * Validates: Requirements 5.1, 5.2
   */
  describe('Property 8: Context Scope Isolation', () => {
    it('expenses from other groups are never returned as matches', () => {
      fc.assert(
        fc.property(
          arbExistingExpense,
          arbGroupId,
          arbDate,
          (existing, otherGroupId, inputDate) => {
            // Precondition: groups must differ
            fc.pre(otherGroupId !== existing.groupId)

            const result = findDuplicateMatches([existing], {
              title: existing.title,
              amount: existing.amount,
              expenseDate: inputDate,
              groupId: otherGroupId, // Different group
            })

            expect(result.hasDuplicates).toBe(false)
            expect(result.matches).toHaveLength(0)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('only expenses from the same context are matched, not from other contexts', () => {
      fc.assert(
        fc.property(
          arbExistingExpense,
          arbExistingExpense,
          arbDate,
          (sameGroupExpense, otherGroupExpense, inputDate) => {
            // Precondition: they belong to different groups
            fc.pre(sameGroupExpense.groupId !== otherGroupExpense.groupId)

            // Make both have the same title/amount so they would match if in same context
            const sharedTitle = sameGroupExpense.title
            const sharedAmount = sameGroupExpense.amount
            const otherWithSameData: ExistingExpense = {
              ...otherGroupExpense,
              title: sharedTitle,
              amount: sharedAmount,
            }

            const result = findDuplicateMatches(
              [sameGroupExpense, otherWithSameData],
              {
                title: sharedTitle,
                amount: sharedAmount,
                expenseDate: inputDate,
                groupId: sameGroupExpense.groupId, // Only same group should match
              },
            )

            // Only the same-group expense should match
            expect(result.hasDuplicates).toBe(true)
            expect(result.matches).toHaveLength(1)
            expect(result.matches[0].id).toBe(sameGroupExpense.id)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
