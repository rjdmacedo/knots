# Requirements Document

## Introduction

Support for expenses funded by multiple payers, each contributing a specific amount or share toward the expense total. Currently, every expense has a single `paidById` field pointing to one user. This feature introduces a join table (`ExpensePaidBy`) that records one or more payers per expense, each with their contributed amount. The balance computation credits each payer by their specific contribution rather than crediting the entire total to a single user. The expense form replaces the single "Paid by" dropdown with a multi-payer selector, and all downstream systems (activity log, import, export, data migration) are updated accordingly.

**Scope decisions:**

- Multi-payer is available only for **group expenses** in the MVP. Direct (friend) expenses remain single-payer.
- `ExpensePaidBy.amount` is always in **group currency** (minor units). When combined with `server-authoritative-currency-conversion`, conversion happens first, then the converted total is distributed among payers.
- The `paidBy` field in form schema and tRPC input is **always an array** (`[{participant, amount}]`). No union string|array — reimbursements simply send a single-element array.

## Glossary

- **Expense_Form**: The React component (`ExpenseForm`) where the user creates or edits an expense, including payer selection and split configuration.
- **Payer_Selector**: The UI section within the Expense_Form that allows selecting one or more group participants as payers with per-payer amounts.
- **ExpensePaidBy**: A new Prisma join table linking an expense to one or more paying users, each with an `amount` field (integer, minor currency units) representing their contribution.
- **Balance_Calculator**: The module (`src/lib/balances.ts`) that computes per-participant paid/owed totals across all group expenses.
- **Activity_Diff**: The module (`src/lib/activity-diff.ts`) that computes field-level changes between expense versions for the activity log.
- **Splitwise_Importer**: The module (`src/lib/splitwise-import.ts`) that parses Splitwise CSV exports and converts them into expense form values.
- **Knots_Importer**: The tRPC procedure that imports previously exported Knots JSON data into a group.
- **CSV_Exporter**: The route handler that exports group expenses to CSV format.
- **JSON_Exporter**: The route handler that exports group expenses to JSON format.
- **Migration**: A Prisma migration that converts existing single-payer data into `ExpensePaidBy` rows without altering balances.
- **Payer_Amount**: The integer amount (in group currency minor units) that a specific payer contributed toward an expense total. When currency conversion is involved, conversion happens before payer distribution — payer amounts are always in group currency.
- **Expense_Total**: The `amount` field on the Expense model representing the total cost of the expense in group currency minor units.

## Requirements

### Requirement 1: Multi-Payer Data Model

**User Story:** As a developer, I want a data model that supports multiple payers per expense with individual amounts, so that the system can accurately track who paid what.

#### Acceptance Criteria

1. THE ExpensePaidBy model SHALL store a composite key of `expenseId` and `userId`, plus an `amount` field (integer, minor currency units).
2. THE Expense model SHALL maintain a `paidBy` relation to one or more ExpensePaidBy rows.
3. WHEN an expense is created, THE system SHALL create one ExpensePaidBy row per payer with the corresponding Payer_Amount.
4. THE sum of all ExpensePaidBy amounts for a given expense SHALL equal the Expense_Total.
5. THE ExpensePaidBy model SHALL cascade-delete when the parent Expense is deleted.
6. THE ExpensePaidBy model SHALL enforce that `userId` references a valid group participant.

### Requirement 2: Expense Form Multi-Payer Selection

**User Story:** As a user, I want to select one or more payers when creating or editing an expense, so that I can record shared payments accurately.

#### Acceptance Criteria

1. WHEN the user opens the Expense_Form, THE Payer_Selector SHALL default to a single payer (the current user or first participant) with the full Expense_Total.
2. WHEN the user adds a payer, THE Payer_Selector SHALL display an additional row with a participant selector and an amount input.
3. WHEN the user removes a payer, THE Payer_Selector SHALL remove that row and redistribute the remaining amount among the remaining payers.
4. THE Payer_Selector SHALL allow selecting any group participant as a payer.
5. THE Payer_Selector SHALL prevent selecting the same participant as a payer more than once.
6. THE Payer_Selector SHALL display a running total of all per-payer amounts and indicate whether the total matches the Expense_Total.
7. IF the sum of per-payer amounts does not equal the Expense_Total, THEN THE Expense_Form SHALL prevent submission and display a validation error.
8. WHEN only one payer is selected, THE Payer_Selector SHALL auto-fill that payer's amount to match the Expense_Total.
9. THE Payer_Selector SHALL support arithmetic expressions in per-payer amount inputs, consistent with the existing amount field behavior.
10. WHEN the user changes the Expense_Total, THE Payer_Selector SHALL retain existing payer amounts and display the mismatch. A "Split evenly" button SHALL redistribute the total equally among current payers when clicked.
11. THE Payer_Selector SHALL only be available for group expenses. Direct (friend) expenses SHALL continue using the existing single-payer selector.

### Requirement 3: Balance Calculation with Multiple Payers

**User Story:** As a user, I want balances to correctly reflect each payer's contribution, so that settlement suggestions are accurate when multiple people pay for an expense.

#### Acceptance Criteria

1. THE Balance_Calculator SHALL credit each payer's `paid` total by their respective Payer_Amount from the ExpensePaidBy record.
2. THE Balance_Calculator SHALL compute `paidFor` (owed) amounts using the existing split-mode logic, independent of how many payers contributed.
3. FOR ALL expenses, the sum of all payer credits SHALL equal the Expense_Total (invariant: total paid equals total owed across the group).
4. WHEN an expense has a single payer, THE Balance_Calculator SHALL produce identical results to the current single-payer computation.
5. THE Balance_Calculator SHALL handle the case where a participant is both a payer and a beneficiary of the same expense, netting their position correctly.
6. THE Balance_Calculator SHALL use integer arithmetic (minor currency units) and distribute rounding remainders to the last participant, consistent with existing behavior.

### Requirement 4: Reimbursement and Settlement Compatibility

**User Story:** As a user, I want reimbursements (payments) to remain single-payer only, so that the settlement flow stays simple and unambiguous.

#### Acceptance Criteria

1. WHEN an expense is marked as a reimbursement (`isReimbursement = true`), THE Expense_Form SHALL restrict the Payer_Selector to exactly one payer.
2. WHEN a user attempts to add a second payer to a reimbursement, THE Expense_Form SHALL display an error message indicating that reimbursements support only a single payer.
3. THE Balance_Calculator SHALL process reimbursement expenses using only the single ExpensePaidBy row, consistent with existing settlement logic.

### Requirement 5: Activity Log Diff for Payer Changes

**User Story:** As a user, I want the activity log to show when the payers of an expense change, so that I can track who edited payment responsibilities.

#### Acceptance Criteria

1. WHEN the set of payers or their amounts change during an expense update, THE Activity_Diff SHALL record a `paidBy` field change.
2. THE Activity_Diff SHALL serialize the old payer state as a structured value (list of userId:amount pairs) and the new payer state in the same format.
3. WHEN a new expense is created, THE Activity_Diff SHALL record the initial payer set as a creation change (oldValue: null, newValue: payer list).
4. WHEN a single-payer expense remains single-payer with the same user and amount, THE Activity_Diff SHALL not record a `paidBy` change.

### Requirement 6: Data Migration from Single-Payer Model

**User Story:** As a developer, I want to migrate existing single-payer expenses to the new multi-payer model without changing any balances, so that the transition is seamless for users.

#### Acceptance Criteria

1. WHEN the migration runs, THE Migration SHALL create one ExpensePaidBy row for each existing expense with `userId` set to the current `paidById` and `amount` set to the full Expense_Total.
2. THE Migration SHALL preserve the existing `paidById` column (deprecated but not removed) during the transition period to allow rollback.
3. THE Migration SHALL be idempotent — running it multiple times SHALL not create duplicate ExpensePaidBy rows.
4. THE Migration SHALL not alter any balance computations — net positions for all users in all groups SHALL remain identical before and after migration.
5. THE Migration SHALL handle expenses with null `groupId` (orphaned or direct-friend expenses) by still creating the corresponding ExpensePaidBy row.

### Requirement 7: Splitwise CSV Import with Multi-Payer Support

**User Story:** As a user, I want to import Splitwise CSV files that have expenses paid by multiple people, so that my historical data is accurately represented.

#### Acceptance Criteria

1. WHEN a Splitwise CSV row has multiple user columns with positive amounts, THE Splitwise_Importer SHALL create an ExpensePaidBy entry for each user with a positive amount.
2. WHEN a Splitwise CSV row has exactly one user column with a positive amount, THE Splitwise_Importer SHALL create a single-payer ExpensePaidBy entry (backward-compatible behavior).
3. THE Splitwise_Importer SHALL use each payer's positive column value directly as their Payer_Amount (in the expense's currency minor units). The importer SHALL validate this against a real Splitwise CSV before finalizing the logic.
4. IF the sum of imported payer amounts does not equal the row's cost (due to Splitwise rounding), THEN THE Splitwise_Importer SHALL adjust the last payer's amount to reconcile the difference.

### Requirement 8: Knots JSON Import with Multi-Payer Support

**User Story:** As a user, I want to import Knots JSON exports that include multi-payer data, so that I can restore or transfer group data faithfully.

#### Acceptance Criteria

1. WHEN a Knots JSON export contains a `paidBy` array on an expense, THE Knots_Importer SHALL create one ExpensePaidBy row per entry.
2. WHEN a Knots JSON export contains only the legacy `paidById` field (no `paidBy` array), THE Knots_Importer SHALL create a single ExpensePaidBy row with the full Expense_Total.
3. IF a `paidBy` array entry references a userId not present in the group participants, THEN THE Knots_Importer SHALL reject the expense import with a descriptive error.

### Requirement 9: CSV Export with Multi-Payer Data

**User Story:** As a user, I want the CSV export to represent multi-payer information, so that exported data can be analyzed or re-imported accurately.

#### Acceptance Criteria

1. WHEN an expense has multiple payers, THE CSV_Exporter SHALL output a per-participant column value that reflects each payer's credit (positive amount) and each beneficiary's debit (negative amount).
2. WHEN a participant is both a payer and a beneficiary of the same expense, THE CSV_Exporter SHALL output the net amount (payer credit minus beneficiary debit) for that participant.
3. THE CSV_Exporter SHALL maintain backward compatibility — single-payer expenses SHALL produce identical CSV output to the current format.

### Requirement 10: JSON Export with Multi-Payer Data

**User Story:** As a user, I want the JSON export to include the full multi-payer breakdown, so that the export is a complete representation of expense data.

#### Acceptance Criteria

1. WHEN an expense has multiple payers, THE JSON_Exporter SHALL include a `paidBy` array containing objects with `userId` and `amount` fields.
2. WHEN an expense has a single payer, THE JSON_Exporter SHALL still include the `paidBy` array (with one entry) for format consistency.
3. THE JSON_Exporter SHALL retain the legacy `paidById` field set to the first payer's userId for backward compatibility with older Knots importers.

### Requirement 11: Form Validation and Error Handling

**User Story:** As a user, I want clear validation feedback when payer amounts are incorrect, so that I can fix errors before submitting.

#### Acceptance Criteria

1. IF any per-payer amount is zero or negative, THEN THE Expense_Form SHALL display an inline validation error on that payer's amount input.
2. IF the sum of per-payer amounts exceeds the Expense_Total, THEN THE Expense_Form SHALL display an error indicating the overpayment amount.
3. IF the sum of per-payer amounts is less than the Expense_Total, THEN THE Expense_Form SHALL display an error indicating the underpayment amount.
4. WHEN the Expense_Form is submitted with valid payer data, THE tRPC create/update procedure SHALL verify that all payer userIds are group members.
5. IF a payer userId is not a group member, THEN THE tRPC procedure SHALL return a BAD_REQUEST error with a descriptive message.

### Requirement 12: Recurring Expense Multi-Payer Propagation

**User Story:** As a user, I want recurring expenses to preserve multi-payer information when new instances are materialized, so that recurring shared payments are handled automatically.

#### Acceptance Criteria

1. WHEN a recurring expense instance is materialized, THE system SHALL copy all ExpensePaidBy rows from the source expense to the new instance.
2. THE materialized instance SHALL have the same set of payers and per-payer amounts as the source expense.
3. WHEN the source recurring expense is edited to change payers, THE system SHALL use the updated payers for future materializations only (existing materialized instances remain unchanged).
