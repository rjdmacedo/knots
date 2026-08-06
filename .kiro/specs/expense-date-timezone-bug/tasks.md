# Implementation Plan

## Overview

Fix the timezone date shift bug where dates are stored one day earlier for positive UTC offset users, and the calendar focus bug where the DatePicker doesn't display the correct month when editing an expense. The fix introduces a `toNoonUTC()` normalization function and adds `defaultMonth` to the Calendar component.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2"],
      "description": "Write exploration and preservation tests in parallel (both observe unfixed code)"
    },
    {
      "wave": 2,
      "tasks": ["3.1", "3.2"],
      "description": "Implement toNoonUTC fix in DatePicker and normalize PaymentForm (after Wave 1, can run in parallel)"
    },
    {
      "wave": 3,
      "tasks": ["3.3", "3.4"],
      "description": "Verify exploration test passes and preservation tests still pass (after Wave 2)"
    },
    {
      "wave": 4,
      "tasks": ["4"],
      "description": "Final checkpoint — run full test suite"
    }
  ]
}
```

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Timezone Date Shift on Positive UTC Offset
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the date shift bug exists
  - **Scoped PBT Approach**: Scope the property to dates created at midnight local time with positive UTC offsets (simulated via manual Date construction), then assert `toNoonUTC` preserves the calendar day in UTC
  - Create test file `src/lib/date-normalization.property.test.ts`
  - Create utility file `src/lib/date-normalization.ts` with a stub `toNoonUTC` that passes through the date unchanged (to simulate unfixed behavior)
  - Test property: for any date `d` constructed as `new Date(year, month, day)` (midnight local), `toNoonUTC(d).toISOString().substring(0, 10)` SHALL equal the formatted calendar day `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  - Use `fast-check` to generate arbitrary years (2000–2100), months (0–11), days (1–28 for simplicity), and verify the toNoonUTC result's UTC date components match the input calendar day
  - Run test on UNFIXED code (stub passes through raw date)
  - **EXPECTED OUTCOME**: Test FAILS because `new Date(2026, 5, 1).toISOString().substring(0, 10)` returns `2026-05-31` in UTC+2 environments, proving the bug
  - Document counterexamples found (e.g., "new Date(2026, 5, 1) at midnight in UTC+2 serializes to 2026-05-31T22:00:00.000Z")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Calendar Day Extraction Consistency for All Timezones
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: for dates at midnight in UTC (offset = 0), `new Date(2026, 5, 1)` already stores correctly as `2026-06-01`
  - Observe: for dates at midnight in negative offsets (e.g., UTC-5), `new Date(2026, 5, 1)` serializes to `2026-06-01T05:00:00.000Z` which stores correctly
  - Write property-based test in `src/lib/date-normalization.property.test.ts`: for ALL dates (any year, month, day), `toNoonUTC(date)` SHALL produce a Date whose `getUTCFullYear()`, `getUTCMonth()`, `getUTCDate()` match the input's `getFullYear()`, `getMonth()`, `getDate()` (local calendar day)
  - This test uses the stub `toNoonUTC` (pass-through) on unfixed code
  - For UTC and negative-offset environments, the pass-through preserves the calendar day (same day in UTC)
  - Use `fast-check` to generate dates via `fc.date({ min: new Date(2000, 0, 1), max: new Date(2100, 11, 31) })`
  - Verify test passes on UNFIXED code in the CI environment (UTC timezone, where the pass-through works correctly)
  - **EXPECTED OUTCOME**: Tests PASS on unfixed code in UTC CI environment (confirms baseline preservation behavior)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Fix for timezone date shift and calendar focus bugs
  - [x] 3.1 Implement the `toNoonUTC` normalization and calendar focus fix
    - Replace the stub in `src/lib/date-normalization.ts` with the real implementation:
      ```typescript
      export function toNoonUTC(date: Date): Date {
        return new Date(
          Date.UTC(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            12,
            0,
            0,
          ),
        )
      }
      ```
    - Update `src/components/date-picker.tsx`:
      - Import `toNoonUTC` from `@/lib/date-normalization`
      - Wrap the `onSelect` callback to normalize: `onChange?.(date ? toNoonUTC(date) : null)`
      - Add `defaultMonth={value ?? undefined}` prop to the `<Calendar>` component so it focuses on the expense's existing date month (or current month for new expenses)
    - _Bug_Condition: isBugCondition(input) where input.timezoneOffsetMinutes < 0 (getTimezoneOffset returns negative for positive UTC offsets) AND selectedDate is at midnight local time_
    - _Expected_Behavior: toNoonUTC(selectedDate).toISOString().substring(0, 10) === formatted calendar day the user selected_
    - _Preservation: Mouse/touch interactions, popover close, date highlight, and visual display remain unchanged. UTC and negative-offset users continue to see correct dates._
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 3.5, 3.6_

  - [x] 3.2 Normalize date handling in PaymentForm
    - Update `src/app/groups/[groupId]/expenses/payment-form.tsx`:
      - Import `toNoonUTC` from `@/lib/date-normalization`
      - In the date input `onChange` handler, replace `field.onChange(new Date(value))` with:
        ```typescript
        const [year, month, day] = value.split('-').map(Number)
        field.onChange(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)))
        ```
        Or use `toNoonUTC(new Date(value))` — but constructing UTC directly from parts is more explicit
      - Update `formatDate` helper to use UTC accessors: `date.getUTCFullYear()`, `date.getUTCMonth()`, `date.getUTCDate()` to avoid local timezone affecting the displayed value
    - _Bug_Condition: PaymentForm creates dates from YYYY-MM-DD strings; while `new Date("2026-06-01")` parses as UTC midnight (currently correct), normalizing to noon UTC adds robustness_
    - _Preservation: PaymentForm date input continues to display and submit dates correctly_
    - _Requirements: 2.1, 3.1_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Timezone Date Shift on Positive UTC Offset
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior: `toNoonUTC(date)` preserves calendar day as UTC date
    - Now that `toNoonUTC` is properly implemented, the property should hold for all generated dates
    - Run: `npx jest src/lib/date-normalization.property.test.ts`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed — `toNoonUTC` normalizes all dates to noon UTC preserving calendar day)
    - _Requirements: 2.1, 2.2_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Calendar Day Extraction Consistency for All Timezones
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — for all dates, `toNoonUTC` preserves the local calendar day as the UTC calendar day)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `npx jest --passWithNoTests`
  - Verify the property-based tests for date normalization pass
  - Verify no other tests were broken by the changes to DatePicker or PaymentForm
  - Ensure all tests pass, ask the user if questions arise

## Notes

- The project uses **Jest** with **fast-check** for property-based testing
- Test file naming convention: `*.property.test.ts` for property-based tests
- The `toNoonUTC` function is extracted to `src/lib/date-normalization.ts` for testability and reuse across DatePicker and PaymentForm
- The exploration test (task 1) is designed to fail on unfixed code because the pass-through stub doesn't normalize dates — in environments with positive UTC offsets, midnight local time rolls back a day when converted to UTC
- The preservation test (task 2) passes on unfixed code in UTC environments because the pass-through already preserves the calendar day when there's no offset
- Wave-based parallelism allows tasks 1 and 2 to run simultaneously, and tasks 3.1/3.2 to run simultaneously after observation is complete
