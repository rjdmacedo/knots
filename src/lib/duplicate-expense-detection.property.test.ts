/**
 * Property-based tests for Duplicate Expense Detection utilities.
 *
 * Feature: duplicate-expense-detection
 * - Property 3: Title Normalization Equivalence
 * - Property 4: Date Proximity Symmetry and Correctness
 * - Property 8: Similarity Indicators Correctly Computed
 *
 * Validates: Requirements 1.4, 2.1, 7.1, 7.2, 7.3, 7.4
 */

import fc from 'fast-check'
import {
  computeSimilarityIndicators,
  isDateProximate,
  normalizeExpenseTitle,
} from './duplicate-expense-detection'

// --- Constants ---

const PBT_NUM_RUNS = 50

// --- Generators ---

/** Arbitrary for a valid Date within a reasonable range (year 2000–2030) */
const arbDate = fc
  .integer({ min: 946684800000, max: 1893456000000 }) // 2000-01-01 to 2030-01-01 in ms
  .map((ms) => new Date(ms))

/** Arbitrary for a positive window size in days (1–365) */
const arbWindowDays = fc.integer({ min: 1, max: 365 })

/** Arbitrary for whitespace characters (leading/trailing) */
const arbWhitespace = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r'), {
    minLength: 0,
    maxLength: 10,
  })
  .map((chars) => chars.join(''))

// --- Tests ---

describe('Duplicate Expense Detection - Property-Based Tests', () => {
  /**
   * Feature: duplicate-expense-detection, Property 3: Title Normalization Equivalence
   *
   * For any two strings a and b that differ only in leading/trailing whitespace
   * and/or letter casing, normalizeExpenseTitle(a) === normalizeExpenseTitle(b)
   * SHALL hold true. Conversely, for any two strings that differ in non-whitespace
   * content, normalization SHALL preserve that difference.
   *
   * Validates: Requirements 1.4
   */
  describe('Property 3: Title Normalization Equivalence', () => {
    it('normalizeExpenseTitle is idempotent: applying it twice yields the same result as once', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 200 }), (title) => {
          const once = normalizeExpenseTitle(title)
          const twice = normalizeExpenseTitle(once)
          expect(twice).toBe(once)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('strings differing only in case and leading/trailing whitespace normalize to the same value', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          arbWhitespace,
          arbWhitespace,
          fc.boolean(),
          (core, leadingWs, trailingWs, toUpper) => {
            const base = core.trim()
            fc.pre(base.length > 0)

            const variantA = base.toLowerCase()
            const variantB = `${leadingWs}${toUpper ? base.toUpperCase() : base}${trailingWs}`

            expect(normalizeExpenseTitle(variantA)).toBe(
              normalizeExpenseTitle(variantB),
            )
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('strings differing in non-whitespace content remain different after normalization', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          (a, b) => {
            // Precondition: the two strings differ in their trimmed lowercase form
            fc.pre(a.trim().toLowerCase() !== b.trim().toLowerCase())

            expect(normalizeExpenseTitle(a)).not.toBe(normalizeExpenseTitle(b))
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  /**
   * Feature: duplicate-expense-detection, Property 4: Date Proximity Symmetry and Correctness
   *
   * For any two dates dateA and dateB and a window size w > 0,
   * isDateProximate(dateA, dateB, w) SHALL equal isDateProximate(dateB, dateA, w) (symmetry).
   * Furthermore, the result SHALL be true if and only if the absolute difference
   * in days between the dates is ≤ w.
   *
   * Validates: Requirements 2.1
   */
  describe('Property 4: Date Proximity Symmetry and Correctness', () => {
    it('isDateProximate is symmetric: isDateProximate(a, b, w) === isDateProximate(b, a, w)', () => {
      fc.assert(
        fc.property(arbDate, arbDate, arbWindowDays, (dateA, dateB, window) => {
          expect(isDateProximate(dateA, dateB, window)).toBe(
            isDateProximate(dateB, dateA, window),
          )
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('isDateProximate returns true iff the absolute day difference ≤ window', () => {
      fc.assert(
        fc.property(arbDate, arbDate, arbWindowDays, (dateA, dateB, window) => {
          const diffMs = Math.abs(dateA.getTime() - dateB.getTime())
          const diffDays = diffMs / (1000 * 60 * 60 * 24)
          const expected = diffDays <= window

          expect(isDateProximate(dateA, dateB, window)).toBe(expected)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('dates exactly windowDays apart return true', () => {
      fc.assert(
        fc.property(arbDate, arbWindowDays, (baseDate, window) => {
          const exactBoundary = new Date(
            baseDate.getTime() + window * 24 * 60 * 60 * 1000,
          )

          expect(isDateProximate(baseDate, exactBoundary, window)).toBe(true)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('dates windowDays + 1 apart return false', () => {
      fc.assert(
        fc.property(arbDate, arbWindowDays, (baseDate, window) => {
          const onePastBoundary = new Date(
            baseDate.getTime() + (window + 1) * 24 * 60 * 60 * 1000,
          )

          expect(isDateProximate(baseDate, onePastBoundary, window)).toBe(false)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  /**
   * Feature: duplicate-expense-detection, Property 8: Similarity Indicators Correctly Computed
   *
   * For any new expense and matched existing expense pair, computeSimilarityIndicators
   * SHALL return "similar-title" iff normalized titles are equal, "same-amount" iff
   * amounts are equal, and "close-in-date" iff isDateProximate is true for the match.
   *
   * Validates: Requirements 7.1, 7.2, 7.3, 7.4
   */
  describe('Property 8: Similarity Indicators Correctly Computed', () => {
    it('similarity indicators correctly computed for arbitrary expense pairs', () => {
      fc.assert(
        fc.property(
          fc.record({
            title: fc.string({ minLength: 1 }),
            amount: fc.integer({ min: 0, max: 1_000_000_00 }),
            expenseDate: fc.date({
              min: new Date('2020-01-01'),
              max: new Date('2030-01-01'),
            }),
          }),
          fc.record({
            title: fc.string({ minLength: 1 }),
            amount: fc.integer({ min: 0, max: 1_000_000_00 }),
            expenseDate: fc.date({
              min: new Date('2020-01-01'),
              max: new Date('2030-01-01'),
            }),
            isDateProximate: fc.boolean(),
          }),
          (newExpense, existingExpense) => {
            const indicators = computeSimilarityIndicators(
              newExpense,
              existingExpense,
            )
            const titleMatch =
              normalizeExpenseTitle(newExpense.title) ===
              normalizeExpenseTitle(existingExpense.title)
            const amountMatch = newExpense.amount === existingExpense.amount

            expect(indicators.includes('similar-title')).toBe(titleMatch)
            expect(indicators.includes('same-amount')).toBe(amountMatch)
            expect(indicators.includes('close-in-date')).toBe(
              existingExpense.isDateProximate,
            )
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
