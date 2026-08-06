# Implementation Plan: Server-Authoritative Currency Conversion

## Overview

Move exchange-rate resolution from the client to the server. When an expense is saved in a foreign currency, the tRPC mutation fetches the rate from Frankfurter API, computes the converted amount using integer minor-unit arithmetic, and persists all conversion metadata. The client retains a preview-only rate fetch for UX but the server is the single source of truth for `amount`.

## Tasks

- [x] 1. Create the Conversion Service module
  - [x] 1.1 Implement `getDecimalDigits` and `convertAmount` in `src/lib/currency-conversion.ts`
    - Create `src/lib/currency-conversion.ts` with the `ZERO_DECIMAL_CURRENCIES` constant
    - Implement `getDecimalDigits(currencyCode: string): number` that returns ISO 4217 decimal digits (0 for JPY/KRW/ISK/HUF, 2 for all others)
    - Implement `convertAmount(originalAmountMinorUnits, rate, sourceDecimalDigits, targetDecimalDigits): number` using the formula `Math.round((originalAmountMinorUnits / 10^sourceDecimalDigits) * rate * 10^targetDecimalDigits)`
    - Export the `FetchRateResult`, `FetchRateError`, and `FetchRateOutcome` TypeScript interfaces
    - _Requirements: 9.1, 9.2, 9.4, 2.2, 2.3_

  - [x] 1.2 Implement `fetchRate` in `src/lib/currency-conversion.ts`
    - Implement `fetchRate(base, target, date)` that calls `https://api.frankfurter.dev/v1/{date}?base={base}&symbols={target}`
    - Apply a 5-second timeout using `AbortSignal.timeout(5000)`
    - Return discriminated union: `{ ok: true, rate, date }` on success, `{ ok: false, reason, message }` on failure
    - Handle network errors (`reason: 'network'`), non-200 responses (`reason: 'not_found'`), and malformed JSON (`reason: 'invalid_response'`)
    - _Requirements: 1.1, 3.1, 9.1_

  - [x] 1.3 Write unit tests for `convertAmount` and `getDecimalDigits` in `src/lib/currency-conversion.test.ts`
    - Test `convertAmount` with standard 2-digit currencies (USD→EUR)
    - Test `convertAmount` with zero-decimal currencies (JPY→EUR, USD→JPY)
    - Test `convertAmount` with rate < 1 and rate > 1
    - Test `getDecimalDigits` returns 0 for JPY/KRW/ISK/HUF and 2 for others
    - Test rounding behavior (banker's rounding via Math.round)
    - _Requirements: 9.2, 9.4, 2.2, 2.3_

  - [x] 1.4 Write property test for `convertAmount` correctness (Property 1)
    - **Property 1: convertAmount produces correct integer result**
    - Use fast-check to generate random `originalAmountMinorUnits` (integer in [-1_000_000_00, 1_000_000_00]), positive `rate` in (0, 1000], and `sourceDecimalDigits`/`targetDecimalDigits` ∈ {0, 2, 3}
    - Assert result equals `Math.round((originalAmountMinorUnits / 10^sourceDecimalDigits) * rate * 10^targetDecimalDigits)`
    - Assert result is always an integer
    - **Validates: Requirements 1.2, 2.3, 9.2**

  - [x] 1.5 Write property test for round-trip tolerance (Property 2)
    - **Property 2: Round-trip tolerance within one minor unit**
    - Use fast-check to generate non-zero `originalAmountMinorUnits` and positive `rate`
    - Convert forward with `convertAmount(original, rate, sd, td)`, then reverse with `convertAmount(result, 1/rate, td, sd)`
    - Assert `|reverseResult - original| <= 1`
    - **Validates: Requirements 9.3**

- [x] 2. Integrate conversion into expense creation
  - [x] 2.1 Create `resolveConversion` helper in `src/trpc/routers/groups/expenses/resolve-conversion.ts`
    - Implement `resolveConversion({ originalAmount, originalCurrency, groupCurrencyCode, expenseDate, clientConversionRate })` returning `{ amount, originalAmount, originalCurrency, conversionRate }`
    - Decision logic: if `originalCurrency` is null/empty or equals `groupCurrencyCode` → passthrough (null conversion fields, use submitted amount)
    - Otherwise call `fetchRate`, use result if ok, fall back to `clientConversionRate` if provided, throw `TRPCError({ code: 'PRECONDITION_FAILED' })` if neither available
    - Use `getDecimalDigits` for both source and target currencies
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 3.3_

  - [x] 2.2 Wire `resolveConversion` into `src/trpc/routers/groups/expenses/create.procedure.ts`
    - Before calling `createExpense`, call `resolveConversion` with form values and group currency
    - Override `expenseFormValues.amount` with the server-computed converted amount when conversion is required
    - Set `expenseFormValues.originalAmount`, `expenseFormValues.originalCurrency`, `expenseFormValues.conversionRate` from the resolution result
    - Fetch `group.currencyCode` from the database within the procedure (use existing group context)
    - _Requirements: 1.1, 1.2, 1.3, 4.4_

  - [x] 2.3 Write unit tests for `resolveConversion` in `src/trpc/routers/groups/expenses/__tests__/resolve-conversion.test.ts`
    - Mock `fetchRate` to return success → verify computed amount matches `convertAmount` output
    - Mock `fetchRate` to return failure with client fallback → verify fallback rate used
    - Mock `fetchRate` to return failure without fallback → verify TRPCError thrown with code `PRECONDITION_FAILED`
    - Test same-currency passthrough → verify null conversion fields
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 3.3_

  - [x] 2.4 Write property test for same-currency passthrough (Property 3)
    - **Property 3: Same-currency passthrough nullifies conversion fields**
    - Use fast-check to generate random currency codes; when `originalCurrency === groupCurrency`, assert `originalAmount = null`, `originalCurrency = null`, `conversionRate = null`, and `amount` equals submitted amount
    - **Validates: Requirements 1.4**

  - [x] 2.5 Write property test for server-authoritative override (Property 4)
    - **Property 4: Server-authoritative conversion overrides client amount**
    - Use fast-check to generate random `originalAmount`, `clientAmount` (different from expected), and a mocked rate
    - Assert persisted `amount` equals `convertAmount(originalAmount, fetchedRate, sourceDigits, targetDigits)` regardless of `clientAmount`
    - **Validates: Requirements 4.4, 1.2, 1.3**

- [x] 3. Integrate conversion into expense update
  - [x] 3.1 Wire `resolveConversion` into `src/trpc/routers/groups/expenses/update.procedure.ts`
    - Before calling `updateExpense`, fetch the existing expense from DB to compare `originalAmount`, `originalCurrency`, and `expenseDate`
    - If none of these changed → skip conversion, retain existing `conversionRate` and `amount`
    - If any changed → call `resolveConversion` and override the form values
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 3.2 Write unit tests for update conversion logic in `src/trpc/routers/groups/expenses/__tests__/update-conversion.test.ts`
    - Test: changing `originalAmount` triggers re-fetch
    - Test: changing `originalCurrency` triggers re-fetch
    - Test: changing `expenseDate` triggers re-fetch
    - Test: changing only title/category/notes preserves existing conversion data
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 3.3 Write property test for non-conversion update stability (Property 5)
    - **Property 5: Non-conversion field updates preserve conversion data**
    - Use fast-check to generate random non-conversion field updates (title, category, notes, paidBy, paidFor, splitMode, isReimbursement)
    - Assert `conversionRate` and `amount` remain unchanged when `originalAmount`, `originalCurrency`, and `expenseDate` are untouched
    - **Validates: Requirements 5.2**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Update the expense form client submission
  - [x] 5.1 Update `proceedWithSubmit` in `src/app/groups/[groupId]/expenses/expense-form.tsx`
    - When `conversionRequired` is true, convert `originalAmount` to minor units using the **original currency's** decimal digits (not the group currency's)
    - Use `amountAsMinorUnits(Number(values.originalAmount), originalCurrency)` for the conversion
    - The `amount` field is still sent (schema requires it) but will be overridden by the server
    - Send `conversionRate` only when user has toggled custom rate mode (serves as fallback signal)
    - _Requirements: 4.4, 2.1_

  - [x] 5.2 Add "preview only" indicator to `src/app/groups/[groupId]/expenses/expense-conversion-rate-field.tsx`
    - Display a subtle label/text indicating the rate shown is a preview and the server determines the final rate at save time
    - Use i18n key `Expenses.conversionRatePreview` for the label text
    - _Requirements: 4.2_

- [x] 6. Add conversion info to expense detail view
  - [x] 6.1 Create conversion info section in expense detail component at `src/components/expense-detail/expense-detail.tsx`
    - When `expense.originalCurrency` is non-null, display: "Original: {formattedOriginalAmount} {originalCurrency}"
    - Display: "Rate: 1 {originalCurrency} = {conversionRate} {groupCurrency}"
    - Display: "Converted: {formattedAmount} {groupCurrency}"
    - Use the existing `formatCurrency` utility for formatting
    - When `originalCurrency` is null, do not render the conversion section
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 7. Add i18n keys for conversion UI
  - [x] 7.1 Add i18n messages to `messages/en-US.json` (and other locale files)
    - Add keys under `Expenses` namespace: `conversionRatePreview`, `conversionOriginal`, `conversionRate`, `conversionConverted`, `conversionRateUnavailable`, `manualRateRequired`
    - Example: `"conversionRatePreview": "Preview — final rate determined at save time"`
    - Example: `"conversionOriginal": "Original: {amount} {currency}"`
    - Example: `"conversionRate": "Rate: 1 {from} = {rate} {to}"`
    - Example: `"conversionConverted": "Converted: {amount} {currency}"`
    - Example: `"conversionRateUnavailable": "Exchange rate unavailable. Please provide a manual rate."`
    - _Requirements: 3.4, 4.2, 8.1, 8.2_

- [x] 8. Validate export routes
  - [x] 8.1 Verify and fix CSV export formatting in `src/app/groups/[groupId]/expenses/export/csv/route.ts`
    - Verify that `originalAmount` is formatted as decimal using the **original currency's** decimal digits (not group currency's)
    - If not, fix to use `getDecimalDigits(expense.originalCurrency)` for formatting
    - Ensure "Original cost", "Original currency", "Conversion rate" columns are present and correctly populated
    - _Requirements: 6.1, 6.3, 6.4_

  - [x] 8.2 Write property test for export formatting (Property 6)
    - **Property 6: Export formatting respects currency decimal digits**
    - Use fast-check to generate random `originalAmount` integers and currency codes
    - Assert CSV formatted value equals `(originalAmount / 10^decimalDigits).toFixed(decimalDigits)`
    - **Validates: Requirements 6.4**

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The Prisma schema already has `originalAmount`, `originalCurrency`, and `conversionRate` fields — no migration needed
- Balance modules already operate on `amount` (the converted value) — no changes needed
- Export routes (JSON) already select conversion fields — verification only needed for CSV formatting
- The `fetchRate` function uses a 5s timeout to avoid blocking expense saves

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "7.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4", "1.5", "2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3"] },
    { "id": 4, "tasks": ["2.4", "2.5", "3.1"] },
    { "id": 5, "tasks": ["3.2", "3.3", "5.1"] },
    { "id": 6, "tasks": ["5.2", "6.1"] },
    { "id": 7, "tasks": ["8.1", "8.2"] }
  ]
}
```
