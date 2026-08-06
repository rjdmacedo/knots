# Expense Date Timezone Bug - Bugfix Design

## Overview

When a user selects a date in the expense form's DatePicker (which uses `react-day-picker`), the resulting `Date` object is created at midnight in the user's local timezone (e.g., `2026-06-01T00:00:00+02:00`). When serialized via superjson and stored in the PostgreSQL `@db.Date` column through Prisma, the UTC representation (`2026-05-31T22:00:00.000Z`) causes the stored date to shift one day earlier for users in positive UTC offsets.

The fix normalizes dates to noon UTC before storage, ensuring the calendar date is preserved regardless of timezone. Additionally, the `DatePicker` component needs to pass a `defaultMonth` prop to the `Calendar` so it focuses on the correct month when opened.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the date shift — selecting a date via the DatePicker when the user's local timezone offset is positive (ahead of UTC), causing the midnight local time to become the previous day in UTC
- **Property (P)**: The desired behavior — the stored expense date must always match the calendar date the user selected, regardless of timezone
- **Preservation**: Existing behavior that must remain unchanged — mouse/touch date selection, date display in expense lists, date grouping, recurrence calculation, and behavior for UTC-timezone users
- **`DatePicker`**: The component in `src/components/date-picker.tsx` that wraps `react-day-picker`'s `Calendar` and emits a `Date` object via `onChange`
- **`expenseDate`**: The `DateTime @db.Date` column on the Prisma `Expense` model that stores a date-only value
- **`expenseFormSchema`**: The Zod schema in `src/lib/schemas.ts` that validates `expenseDate` via `z.coerce.date()`

## Bug Details

### Bug Condition

The bug manifests when a user selects a date via the `DatePicker` calendar component and their local timezone is ahead of UTC (positive offset). The `react-day-picker` `Calendar` creates a `Date` at midnight local time (e.g., `new Date(2026, 5, 1)` → `2026-06-01T00:00:00+02:00`). When this Date is serialized to JSON via superjson (which uses `.toISOString()` internally for transport), it becomes `2026-05-31T22:00:00.000Z`. Prisma then stores this in the `@db.Date` column, which truncates to `2026-05-31` — one day earlier than what the user selected.

A secondary bug occurs when the `DatePicker` opens: it does not set `defaultMonth` on the `Calendar`, so it defaults to the current month rather than focusing on the already-selected expense date (when editing) or today's date (which is already correct for creation since `new Date()` is the current month).

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type { selectedDate: Date, timezoneOffsetMinutes: number, isEditing: boolean, existingDate: Date | null }
  OUTPUT: boolean

  // Date shift bug: positive timezone offset causes day shift
  dateShiftBug := input.timezoneOffsetMinutes < 0
                  // Note: getTimezoneOffset() returns negative for positive UTC offsets
                  AND selectedDate is created at midnight local time
                  AND UTC hour of selectedDate < 0 (wraps to previous day)

  // Calendar focus bug: editing with existing date but calendar doesn't show that month
  calendarFocusBug := input.isEditing
                      AND input.existingDate IS NOT NULL
                      AND calendar.defaultMonth IS NOT SET to existingDate's month

  RETURN dateShiftBug OR calendarFocusBug
END FUNCTION
```

### Examples

- **Date shift**: User in UTC+2 selects June 1, 2026. `Date` is `2026-06-01T00:00:00+02:00` → serialized as `2026-05-31T22:00:00.000Z` → stored as `2026-05-31`. Expected: stored as `2026-06-01`.
- **Date shift**: User in UTC+5:30 (India) selects January 15, 2026. `Date` is `2026-01-15T00:00:00+05:30` → serialized as `2026-01-14T18:30:00.000Z` → stored as `2026-01-14`. Expected: stored as `2026-01-15`.
- **No shift (working case)**: User in UTC selects June 1, 2026. `Date` is `2026-06-01T00:00:00Z` → stored as `2026-06-01`. Works correctly.
- **No shift (negative offset)**: User in UTC-5 selects June 1, 2026. `Date` is `2026-06-01T00:00:00-05:00` → serialized as `2026-06-01T05:00:00.000Z` → stored as `2026-06-01`. Works correctly (same calendar day in UTC).
- **Calendar focus**: User edits expense dated March 15, 2026. Calendar opens showing the current month (e.g., June 2026) instead of March 2026. Expected: calendar shows March 2026.
- **Duplicate detection failure**: User selects June 1 and an expense already exists for June 1. But the stored date is May 31 due to the shift, so title+amount+date comparison fails to find the duplicate.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Mouse clicks and touch interactions on the calendar must continue to work exactly as before
- The visual date display in expense lists and detail views must continue to show the correct calendar date
- Date grouping in expense lists must continue to group by the correct calendar date
- Recurring expense date calculations must continue to compute correctly
- The calendar must continue to visually highlight the selected date
- The popover must continue to close after date selection
- The `PaymentForm` date input (which uses `<input type="date">`) must continue to work correctly
- Users in UTC timezone must continue to see correct behavior

**Scope:**
All inputs that do NOT involve the DatePicker calendar selection or calendar focus should be completely unaffected by this fix. This includes:

- The native `<input type="date">` used in `PaymentForm` (this creates dates from a `YYYY-MM-DD` string which also has the same issue when using `new Date(value)`, but is a separate component)
- Amount calculations, split modes, and currency handling
- Authentication, authorization, and group membership logic
- Expense document handling

## Hypothesized Root Cause

Based on the code analysis, the root causes are:

1. **No timezone normalization on date selection**: The `DatePicker.onChange` callback passes the raw `Date` from `react-day-picker` directly to the form. This `Date` is at midnight local time. When superjson serializes it for the tRPC call (using `.toISOString()`), it converts to UTC, which can shift the calendar day backward for positive timezone offsets.

2. **No date normalization before Prisma storage**: The server-side code in `createExpense` and `updateExpense` (in `src/lib/api.ts`) passes `expenseFormValues.expenseDate` directly to Prisma without any normalization. Since the Prisma column is `@db.Date` (date-only), Prisma extracts just the date portion from the UTC representation, which may be the previous day.

3. **Missing `defaultMonth` prop on Calendar**: The `DatePicker` component passes `selected={value}` to the `Calendar` but does not pass `defaultMonth={value ?? new Date()}`. The `react-day-picker` library uses `defaultMonth` to determine which month to display initially. Without it, the calendar defaults to the current month.

4. **PaymentForm has the same date shift issue**: The `PaymentForm` uses `<input type="date">` and creates dates with `new Date(value)` where `value` is a `YYYY-MM-DD` string. `new Date("2026-06-01")` is parsed as UTC midnight, which is actually correct for storage. However, displaying it back with `date.toISOString().substring(0, 10)` works correctly. This form is NOT affected by the timezone shift bug since `new Date("YYYY-MM-DD")` parses as UTC.

## Correctness Properties

Property 1: Bug Condition - Date Selection Preserves Calendar Date

_For any_ date selected via the DatePicker in any timezone, the normalized date value passed to the server SHALL represent the same calendar day (year, month, day) that the user selected, regardless of the user's local timezone offset.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Non-DatePicker Behavior Unchanged

_For any_ expense operation that does not involve date selection via the DatePicker (mouse clicks on other form elements, amount changes, split mode changes, participant selection), the fixed code SHALL produce exactly the same behavior as the original code, preserving all existing functionality.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

Property 3: Calendar Focus - Correct Month Display

_For any_ expense being edited that has an existing date, the DatePicker calendar SHALL open focused on the month of that existing date. For new expenses without a date, the calendar SHALL open focused on the current month.

**Validates: Requirements 2.3, 2.4**

## Fix Implementation

### Changes Required

**File**: `src/components/date-picker.tsx`

**Changes**:

1. **Normalize selected date to noon UTC**: When the `Calendar`'s `onSelect` fires, normalize the returned `Date` to noon UTC of the same calendar day before passing to `onChange`. This ensures that regardless of timezone, the UTC representation stays on the correct calendar day.

   ```typescript
   // Normalize to noon UTC to prevent timezone date shift
   function toNoonUTC(date: Date): Date {
     return new Date(
       Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0),
     )
   }
   ```

   Update the `onSelect` handler:

   ```typescript
   onSelect={(date) => {
     onChange?.(date ? toNoonUTC(date) : null)
     setOpen(false)
     onBlur?.()
   }}
   ```

2. **Add `defaultMonth` prop to Calendar**: Pass the existing value's month (or today) as the `defaultMonth` so the calendar opens on the correct month.

   ```typescript
   <Calendar
     mode="single"
     selected={value ?? undefined}
     defaultMonth={value ?? undefined}
     onSelect={...}
     locale={calendarLocale}
     initialFocus
   />
   ```

   Note: `react-day-picker`'s `defaultMonth` accepts a `Date` and uses it to determine which month to initially display. When `value` is `undefined` (new expense), the library defaults to the current month, which is the desired behavior for requirement 2.4.

3. **Normalize dates read from the database for display**: When an expense is loaded for editing, the `expenseDate` comes from the DB as a UTC date (e.g., `2026-06-01T00:00:00.000Z` if stored correctly, or `2026-05-31T22:00:00.000Z` for already-shifted dates). The `DatePicker` displays dates using `Intl.DateTimeFormat` with the user's locale, which converts UTC to local time. For already-stored dates that are at midnight UTC, this display is correct. The normalization to noon UTC for NEW selections ensures future dates are also displayed correctly.

**File**: `src/app/groups/[groupId]/expenses/payment-form.tsx`

**Changes**:

4. **Normalize PaymentForm date handling**: The `PaymentForm` uses `<input type="date">` and creates dates with `new Date(value)` where value is `YYYY-MM-DD`. While `new Date("2026-06-01")` actually parses as UTC midnight (which is correct), the `field.onChange(new Date(value))` should also use noon UTC normalization for consistency:

   ```typescript
   onChange={(event) => {
     const value = event.target.value
     if (!value) {
       field.onChange(null)
     } else if (isValidDateString(value)) {
       const [year, month, day] = value.split('-').map(Number)
       field.onChange(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)))
     }
   }}
   ```

5. **Update `formatDate` helper**: The helper should extract the date parts in UTC to avoid local timezone affecting the displayed value in the `<input type="date">`:

   ```typescript
   function formatDate(date?: Date) {
     if (!date || Number.isNaN(date.getTime())) date = new Date()
     const y = date.getUTCFullYear()
     const m = String(date.getUTCMonth() + 1).padStart(2, '0')
     const d = String(date.getUTCDate()).padStart(2, '0')
     return `${y}-${m}-${d}`
   }
   ```

**File**: `src/lib/schemas.ts` (optional hardening)

6. **No schema changes needed**: The `z.coerce.date()` correctly parses the Date object. The normalization happens at the component level before the form value is set, so the schema receives a properly normalized date.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that create `Date` objects as `react-day-picker` would (midnight local time) for various timezone offsets, pass them through the serialization path, and assert the stored date matches the selected calendar day. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:

1. **Positive offset date shift**: Create `new Date(2026, 5, 1)` (June 1) in a simulated UTC+2 environment, serialize to ISO, extract date → will show May 31 (fail on unfixed code)
2. **Large positive offset**: Create `new Date(2026, 0, 15)` (Jan 15) in a simulated UTC+5:30 environment → will show Jan 14 (fail on unfixed code)
3. **Negative offset (no shift)**: Create `new Date(2026, 5, 1)` in UTC-5 → will correctly show June 1 (passes on unfixed code)
4. **UTC (no shift)**: Create `new Date(2026, 5, 1)` in UTC → will correctly show June 1 (passes on unfixed code)

**Expected Counterexamples**:

- Dates created at midnight local time in positive UTC offsets will serialize to the previous calendar day
- The `toISOString()` call produces a UTC string where the date component is one day earlier

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  result := toNoonUTC(input.selectedDate)
  ASSERT result.getUTCFullYear() == input.selectedDate.getFullYear()
  ASSERT result.getUTCMonth() == input.selectedDate.getMonth()
  ASSERT result.getUTCDate() == input.selectedDate.getDate()
  ASSERT result.toISOString().substring(0, 10) == expectedDateString
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  // For UTC and negative-offset users, the calendar date was already correct
  ASSERT toNoonUTC(input.selectedDate).getUTCDate() == input.selectedDate.getDate()
  // Display formatting produces same visible result
  ASSERT formatDisplay(toNoonUTC(input.selectedDate)) == formatDisplay(input.selectedDate)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many random dates across all possible timezone offsets
- It catches edge cases around year/month boundaries (Dec 31 → Jan 1)
- It provides strong guarantees that the `toNoonUTC` normalization never changes the calendar day

**Test Plan**: Verify that for any `Date` created at midnight local time for any day and any timezone offset, `toNoonUTC` extracts the same year, month, and day as the local date's `.getFullYear()`, `.getMonth()`, `.getDate()`.

**Test Cases**:

1. **Date preservation across all offsets**: For any date and any timezone offset, `toNoonUTC(date)` preserves the local calendar day in UTC
2. **Month boundary preservation**: Dates on the 1st of a month remain on the 1st after normalization
3. **Year boundary preservation**: Dates on Jan 1 or Dec 31 are not shifted across year boundaries
4. **Leap year dates**: Feb 29 in leap years is preserved correctly

### Unit Tests

- Test `toNoonUTC` with dates at midnight for UTC+2, UTC+5:30, UTC+12, UTC-5, UTC-12, UTC
- Test `toNoonUTC` preserves calendar day for boundary dates (Jan 1, Dec 31, Feb 28/29)
- Test `DatePicker` passes `defaultMonth` correctly when value is set vs null
- Test `formatDate` in `PaymentForm` extracts UTC date components correctly
- Test that duplicate detection finds matches when dates are normalized

### Property-Based Tests

- Generate random dates across the full valid range (2000–2100) and random timezone offsets (-12 to +14 hours), verify `toNoonUTC` always preserves the local calendar day as the UTC calendar day
- Generate random existing expense dates and new dates, verify duplicate detection date proximity works correctly with normalized dates
- Generate random dates and verify `formatDate` round-trips correctly (format → parse → same date)

### Integration Tests

- Test full expense creation flow: select date in DatePicker → submit form → verify stored `expenseDate` matches selected calendar day
- Test expense edit flow: load expense with date → verify calendar opens on correct month → change date → verify new date stored correctly
- Test duplicate detection: create expense with date, attempt to create another with same date → verify duplicate detected
