# Requirements Document

## Introduction

Redesign the group expense "Paid by" UI to match the Spliit Cloud pattern: a Choice Card selector for **Single payer** versus **Multiple payers**, with multiple-payer modes (Evenly, By shares, By percentage, By amount). The persisted data model remains `paidBy: Array<{ participant, amount }>` from `multi-payer-expenses` — split modes exist only in the UI to compute those amounts. No new Prisma fields.

## Glossary

- **Payer_Selector**: The form control (`PayerSelector`) that collects who paid and how much each contributed.
- **Payer_Mode**: UI-only mode: `single`, `evenly`, `by_shares`, `by_percentage`, or `by_amount`.
- **Expense_Total**: The expense amount field value (major currency units in the form).
- **Payer_Entry**: `{ participant: string; amount: number }` in the form; persisted as `ExpensePaidBy` after minor-unit conversion.
- **Choice_Card**: A selectable card composed with shadcn `Field` + `RadioGroup` that reveals nested controls when selected.
- **Digit_Aware_Split**: Integer division in minor currency units with remainder distribution so major-unit totals sum exactly.

## Requirements

### Requirement 1: Single vs Multiple Choice Cards

**User Story:** As a user, I want a clear Single vs Multiple payers choice, so that the common single-payer case stays simple and multi-payer is intentional.

#### Acceptance Criteria

1. WHEN the user opens the group Expense_Form Paid by section, THE Payer_Selector SHALL present Choice_Cards grouped under Single and Multiple payers.
2. WHEN Single payer is selected, THE Payer_Selector SHALL show one participant selector and set that payer's amount to the Expense_Total.
3. WHEN a Multiple payers mode is selected, THE Payer_Selector SHALL allow selecting which participants paid and collect contribution inputs for that mode.
4. WHEN `singlePayerOnly` is true OR the expense is a reimbursement, THE Payer_Selector SHALL only offer Single payer and SHALL prevent adding additional payers.

### Requirement 2: Multiple Payer Modes

**User Story:** As a user, I want to distribute what each payer contributed using evenly / shares / percentage / amount, so that I can match how we actually paid without manual cent math for common cases.

#### Acceptance Criteria

1. THE Payer_Selector SHALL offer Multiple payers modes: Evenly, By shares, By percentage, and By amount.
2. WHEN Evenly is selected and N participants are toggled on, THE Payer_Selector SHALL set each selected payer's amount via Digit_Aware_Split of the Expense_Total.
3. WHEN By shares is selected, THE Payer_Selector SHALL accept a positive share weight per selected payer and convert weights to amounts via Digit_Aware_Split proportional to weights.
4. WHEN By percentage is selected, THE Payer_Selector SHALL accept percentages per selected payer that must sum to 100 and convert them to amounts via Digit_Aware_Split.
5. WHEN By amount is selected, THE Payer_Selector SHALL accept an absolute amount per selected payer and display a mismatch indicator when the sum does not equal the Expense_Total.
6. WHEN editing an expense with more than one Payer_Entry, THE Payer_Selector SHALL open in By amount mode so stored amounts are preserved.
7. WHEN editing an expense with exactly one Payer_Entry, THE Payer_Selector SHALL open in Single payer mode.

### Requirement 3: Persistence Contract

**User Story:** As a developer, I want the form to always submit absolute payer amounts, so that the existing multi-payer API and balances keep working without a new DB column.

#### Acceptance Criteria

1. THE Payer_Selector SHALL always emit `paidBy` as an array of Payer_Entry with absolute amounts (major units in the form).
2. THE system SHALL NOT persist Payer_Mode to the database.
3. THE sum of emitted payer amounts SHALL equal the Expense_Total before successful validation (except while the user is mid-edit in By amount with a visible mismatch).

### Requirement 4: Digit-Aware Amount Math

**User Story:** As a user, I want even splits to conserve cents, so that €100 / 3 does not become 34+33+33 in euros.

#### Acceptance Criteria

1. WHEN distributing the Expense_Total across payers, THE Payer_Selector SHALL convert to minor units, divide with integer arithmetic, distribute remainders, then convert back to major units.
2. THE Digit_Aware_Split helper SHALL be unit-tested for equal splits and weighted splits.

### Requirement 5: Friend / Hybrid Scope

**User Story:** As a user creating a friend or hybrid expense, I want only single-payer Paid by, so that APIs that only store one payer cannot silently drop multi-payer input.

#### Acceptance Criteria

1. WHEN FloatingCreateExpense has any friends selected, THE Expense_Form SHALL pass `singlePayerOnly` so only Single payer is available.
2. WHEN creating a group-only expense (no friends), THE Expense_Form SHALL allow Multiple payers modes.

### Requirement 6: Internationalization

**User Story:** As a user, I want Paid by mode labels localized, so that the feature works in all supported locales.

#### Acceptance Criteria

1. THE Payer_Selector section headings, mode titles, and mode descriptions SHALL use i18n keys under `Expenses.paidBy`.
2. WHEN a locale translation is missing, THE UI SHALL fall back to the English default.
