import fc from 'fast-check'
import { toNoonUTC } from './date-normalization'

/**
 * Property-based tests for date normalization (toNoonUTC).
 *
 * Feature: expense-date-timezone-bug
 *
 * Validates: Requirements 1.1, 1.2, 3.1, 3.2, 3.3, 3.4
 */

/**
 * Property 1: Bug Condition - Timezone Date Shift on Positive UTC Offset
 *
 * **Validates: Requirements 1.1, 1.2**
 *
 * For any date constructed as `new Date(year, month, day)` (midnight local time),
 * `toNoonUTC(d).toISOString().substring(0, 10)` SHALL equal the formatted calendar
 * day `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`.
 *
 * This test is EXPECTED TO FAIL on unfixed code (stub pass-through) in environments
 * with positive UTC offsets, because `new Date(year, month, day)` at midnight local
 * time serializes to the previous UTC day via `.toISOString()`.
 */
describe('Date Normalization - Bug Condition Exploration', () => {
  it('toNoonUTC preserves the calendar day in UTC for any local midnight date', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2100 }), // year
        fc.integer({ min: 0, max: 11 }), // month (0-indexed)
        fc.integer({ min: 1, max: 28 }), // day (1-28 for simplicity, avoids invalid dates)
        (year, month, day) => {
          // Construct a date at midnight local time (as react-day-picker does)
          const localMidnight = new Date(year, month, day)

          // Apply toNoonUTC (stub just passes through)
          const normalized = toNoonUTC(localMidnight)

          // The UTC date string from the normalized result
          const utcDateString = normalized.toISOString().substring(0, 10)

          // The expected calendar day string
          const expectedDateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

          // Property: the UTC date representation must match the intended calendar day
          return utcDateString === expectedDateString
        },
      ),
      { numRuns: 1000 },
    )
  })
})

/**
 * Property 2: Preservation - Calendar Day Extraction Consistency for All Timezones
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * For ALL dates (any year, month, day), `toNoonUTC(date)` SHALL produce a Date whose
 * `getUTCFullYear()`, `getUTCMonth()`, `getUTCDate()` match the input's
 * `getFullYear()`, `getMonth()`, `getDate()` (local calendar day).
 *
 * Observation: In UTC environments (offset = 0), the pass-through stub already
 * preserves the calendar day because local time === UTC time. For negative-offset
 * environments (e.g., UTC-5), `new Date(2026, 5, 1)` serializes to
 * `2026-06-01T05:00:00.000Z`, which also preserves the calendar day in UTC.
 *
 * This test PASSES on unfixed code in a UTC CI environment because the pass-through
 * preserves the calendar day when there is no positive offset.
 */
describe('Date Normalization - Preservation', () => {
  it('toNoonUTC output UTC components match input local calendar day for all dates', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date(2000, 0, 1), max: new Date(2100, 11, 31) }),
        (date) => {
          // Extract the local calendar day from the input
          const inputYear = date.getFullYear()
          const inputMonth = date.getMonth()
          const inputDay = date.getDate()

          // Apply toNoonUTC
          const normalized = toNoonUTC(date)

          // The UTC components of the normalized result must match the local calendar day
          expect(normalized.getUTCFullYear()).toBe(inputYear)
          expect(normalized.getUTCMonth()).toBe(inputMonth)
          expect(normalized.getUTCDate()).toBe(inputDay)
        },
      ),
      { numRuns: 1000 },
    )
  })
})
