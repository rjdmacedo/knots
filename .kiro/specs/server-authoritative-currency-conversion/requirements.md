# Requirements Document

## Introduction

Server-authoritative currency conversion for expenses. When a user creates or updates an expense in a currency different from the group's currency, the server fetches the exchange rate from the Frankfurter API, computes the converted amount, and persists `originalAmount`, `originalCurrency`, and `conversionRate` alongside the converted `amount`. This moves the source of truth for FX rates from the client to the server, ensuring consistency, auditability, and correctness of balance computations. The client retains the ability to preview rates for UX purposes but the server performs the authoritative conversion at save time. If the FX provider is unavailable, users may supply a manual rate so that expense creation is never blocked.

## Glossary

- **Conversion_Service**: Server-side module responsible for fetching exchange rates from the Frankfurter API, computing converted amounts, and validating conversion data.
- **Frankfurter_API**: External free FX rates service at `https://api.frankfurter.dev` providing historical and current exchange rates.
- **Group_Currency**: The currency associated with a group (stored as `currencyCode` on the Group model), in which all balances are denominated.
- **Original_Currency**: The currency in which an expense was originally incurred, stored as `originalCurrency` on the Expense model (ISO 4217 three-letter code).
- **Original_Amount**: The expense amount in the original currency, stored as `originalAmount` on the Expense model using the integer minor-units (cents) convention.
- **Converted_Amount**: The expense amount converted into the Group_Currency, stored as `amount` on the Expense model using the integer minor-units (cents) convention.
- **Conversion_Rate**: The exchange rate applied to convert from Original_Currency to Group_Currency, stored as `conversionRate` (Decimal) on the Expense model. Represents how many units of Group_Currency equal one unit of Original_Currency.
- **Expense_Form**: The client-side form component used to create or edit expenses.
- **Expenses_Router**: The tRPC router handling expense creation and update mutations on the server.

## Requirements

### Requirement 1: Server-Side Rate Resolution on Save

**User Story:** As a group member, I want the server to resolve the exchange rate when I save an expense in a foreign currency, so that the stored rate is authoritative and tamper-proof.

#### Acceptance Criteria

1. WHEN the Expenses_Router receives a create or update mutation with an Original_Currency that differs from the Group_Currency, THE Conversion_Service SHALL fetch the exchange rate from the Frankfurter_API for the expense date, base Original_Currency, and target Group_Currency.
2. WHEN the Frankfurter_API returns a valid rate, THE Conversion_Service SHALL compute the Converted_Amount by multiplying the Original_Amount (in minor units) by the Conversion_Rate, rounding to the nearest integer minor unit of the Group_Currency.
3. WHEN the Conversion_Service resolves a rate, THE Expenses_Router SHALL persist `originalAmount`, `originalCurrency`, `conversionRate`, and the computed `amount` on the Expense record.
4. WHEN the Original_Currency equals the Group_Currency, THE Expenses_Router SHALL store `originalAmount` as null, `originalCurrency` as null, and `conversionRate` as null, and SHALL use the submitted amount directly.

### Requirement 2: Integer Minor-Units Convention for Original Amount

**User Story:** As a developer, I want all monetary values stored consistently in integer minor units, so that arithmetic is exact and free of floating-point errors.

#### Acceptance Criteria

1. THE Expenses_Router SHALL store `originalAmount` as an integer representing the amount in the smallest unit of the Original_Currency (e.g., cents for USD, yen for JPY).
2. THE Conversion_Service SHALL use the ISO 4217 `decimal_digits` of the Original_Currency to interpret the minor-unit value during conversion.
3. THE Conversion_Service SHALL use the ISO 4217 `decimal_digits` of the Group_Currency to round the Converted_Amount to the correct number of minor units.

### Requirement 3: Fallback to Manual Rate on Provider Failure

**User Story:** As a user, I want to still save an expense with a manually entered exchange rate when the FX provider is unavailable, so that expense creation is never blocked.

#### Acceptance Criteria

1. IF the Frankfurter_API is unreachable or returns an error, THEN THE Conversion_Service SHALL return a failure indicator to the Expenses_Router without throwing an unrecoverable error.
2. IF the Conversion_Service fails to obtain an automatic rate, THEN THE Expenses_Router SHALL accept a client-supplied `conversionRate` from the request payload and use it for conversion.
3. IF the Conversion_Service fails and no client-supplied rate is provided, THEN THE Expenses_Router SHALL reject the mutation with a descriptive error indicating that a manual rate is required.
4. WHEN the Expense_Form detects that the automatic rate fetch failed, THE Expense_Form SHALL enable manual rate entry and inform the user that the automatic rate is unavailable.

### Requirement 4: Client-Side Rate Preview

**User Story:** As a user, I want to see a live exchange rate preview while filling out the expense form, so that I know the approximate converted amount before saving.

#### Acceptance Criteria

1. WHEN the user selects an Original_Currency different from the Group_Currency, THE Expense_Form SHALL fetch a preview rate from the Frankfurter_API (client-side) and display the rate and estimated converted amount.
2. THE Expense_Form SHALL clearly indicate that the displayed rate is a preview and that the server will determine the final rate at save time.
3. WHEN the user toggles to custom rate mode, THE Expense_Form SHALL allow manual entry of a Conversion_Rate and compute the preview converted amount using that rate.
4. THE Expense_Form SHALL send the Original_Amount and Original_Currency to the server; the server SHALL NOT rely on a client-computed `amount` when a conversion is required.

### Requirement 5: Conversion on Expense Update

**User Story:** As a user, I want the server to re-resolve the exchange rate when I edit an expense and change its original amount or currency, so that the stored conversion remains correct.

#### Acceptance Criteria

1. WHEN an expense update mutation changes `originalAmount` or `originalCurrency`, THE Conversion_Service SHALL re-fetch the rate for the expense date and recompute the Converted_Amount.
2. WHEN an expense update mutation does not change `originalAmount`, `originalCurrency`, or `expenseDate`, THE Expenses_Router SHALL retain the existing `conversionRate` and `amount` without re-fetching.
3. WHEN an expense update changes the `expenseDate` while `originalCurrency` differs from Group_Currency, THE Conversion_Service SHALL re-fetch the rate for the new date.

### Requirement 6: Export of Conversion Data

**User Story:** As a user, I want CSV and JSON exports to include the original amount, original currency, and conversion rate, so that I have a complete audit trail.

#### Acceptance Criteria

1. THE CSV export route SHALL include columns "Original cost", "Original currency", and "Conversion rate" for each expense.
2. THE JSON export route SHALL include fields `originalAmount`, `originalCurrency`, and `conversionRate` for each expense.
3. WHEN an expense has no conversion (same currency as group), THE export routes SHALL output null or empty values for the conversion fields.
4. THE CSV export SHALL format `originalAmount` as a decimal string using the Original_Currency's decimal digits (consistent with how `amount` is formatted).

### Requirement 7: Balance Computation Uses Converted Amount

**User Story:** As a group member, I want all balances computed in the group currency using the converted amount, so that debts and settlements are denominated consistently.

#### Acceptance Criteria

1. THE balance computation modules SHALL use the `amount` field (Converted_Amount in Group_Currency) for all balance, debt, and settlement calculations.
2. THE balance computation modules SHALL NOT reference `originalAmount` or `conversionRate` when computing balances.

### Requirement 8: Conversion Rate Display on Expense Detail

**User Story:** As a user, I want to see the applied conversion rate and original amount on the expense detail view, so that I understand how the final amount was derived.

#### Acceptance Criteria

1. WHEN viewing an expense that has a non-null `originalCurrency`, THE expense detail view SHALL display the Original_Amount formatted in the Original_Currency.
2. WHEN viewing an expense that has a non-null `conversionRate`, THE expense detail view SHALL display the applied Conversion_Rate (e.g., "1 USD = 0.92 EUR").
3. WHEN viewing an expense with no conversion, THE expense detail view SHALL display only the amount in the Group_Currency without conversion details.

### Requirement 9: Conversion Utility Module

**User Story:** As a developer, I want a dedicated, tested conversion utility module, so that conversion logic is reusable, unit-testable, and decoupled from the router.

#### Acceptance Criteria

1. THE Conversion_Service SHALL be implemented as a standalone module in `src/lib/` with a clear public API: `fetchRate(base: string, target: string, date: string)` and `convertAmount(originalAmountMinorUnits: number, rate: number, targetDecimalDigits: number)`.
2. THE `convertAmount` function SHALL return an integer representing the converted amount in the target currency's minor units.
3. FOR ALL valid Original_Amount integers and positive Conversion_Rates, THE `convertAmount` function SHALL produce a result that, when divided back by the rate, is within one minor unit of the original value (round-trip tolerance property).
4. THE Conversion_Service SHALL handle zero-decimal currencies (e.g., JPY) correctly by not multiplying or dividing by 100 when the Original_Currency has zero decimal digits.
