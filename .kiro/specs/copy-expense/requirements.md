# Requirements Document

## Introduction

A "Copy" action on an existing expense that opens the create-expense form pre-filled with the original expense's data but with today's date. This allows users to quickly duplicate recurring-ish purchases (e.g., weekly coffee, monthly subscriptions) without manually re-entering all fields. The copied expense is fully independent from the original on save — no link or reference is maintained between the two.

## Glossary

- **Expense_Detail**: The detail view component (`ExpenseDetailContent`) that displays full expense information along with action buttons (edit, delete).
- **Expense_Card**: The list item component (`ExpenseCard`) that represents an expense row in the group expense list.
- **Create_Form**: The expense creation form (`ExpenseForm`) opened via the floating action button (`FloatingCreateExpense`) with `createPrefill` data.
- **Copy_Action**: A user-initiated action (button/menu item) that triggers navigation to the Create_Form with pre-filled data derived from the source expense.
- **Source_Expense**: The existing expense from which field values are copied.
- **Prefill_Data**: The set of field values extracted from the Source_Expense and passed to the Create_Form via the `create-group-expense` custom event with a prefill payload.

## Requirements

### Requirement 1: Copy Action Availability

**User Story:** As a user, I want a "Copy" action visible on expenses, so that I can quickly initiate duplication of an expense.

#### Acceptance Criteria

1. WHEN viewing a group expense in the Expense_Detail view, THE Expense_Detail SHALL display a Copy_Action button alongside the existing edit and delete actions.
2. WHEN viewing a group expense in the Expense_Card list, THE Expense_Card SHALL include the Copy_Action within a context menu or action dropdown.
3. THE Copy_Action SHALL be available for all non-locked expenses (expenses that are not consolidated payments).
4. WHEN the Source_Expense is a reimbursement (payment), THE Copy_Action SHALL still be available to the user.

### Requirement 2: Pre-fill Create Form with Source Expense Data

**User Story:** As a user, I want the create form to open pre-filled with the original expense's data when I choose Copy, so that I do not have to re-enter all fields manually.

#### Acceptance Criteria

1. WHEN the user activates the Copy_Action on a Source_Expense, THE Create_Form SHALL open pre-filled with the title from the Source_Expense.
2. WHEN the user activates the Copy_Action on a Source_Expense, THE Create_Form SHALL open pre-filled with the amount from the Source_Expense.
3. WHEN the user activates the Copy_Action on a Source_Expense, THE Create_Form SHALL open pre-filled with the category from the Source_Expense.
4. WHEN the user activates the Copy_Action on a Source_Expense, THE Create_Form SHALL open pre-filled with the payer (paidBy) from the Source_Expense.
5. WHEN the user activates the Copy_Action on a Source_Expense, THE Create_Form SHALL open pre-filled with the split mode from the Source_Expense.
6. WHEN the user activates the Copy_Action on a Source_Expense, THE Create_Form SHALL open pre-filled with the paid-for participants and their respective shares from the Source_Expense.
7. WHEN the user activates the Copy_Action on a Source_Expense, THE Create_Form SHALL open pre-filled with the isReimbursement flag from the Source_Expense.
8. WHEN the user activates the Copy_Action on a Source_Expense, THE Create_Form SHALL open pre-filled with the notes from the Source_Expense.

### Requirement 3: Default Date to Today

**User Story:** As a user, I want the copied expense date to default to today's date, so that the duplicate reflects the current date rather than the original expense date.

#### Acceptance Criteria

1. WHEN the Create_Form opens via a Copy_Action, THE Create_Form SHALL set the expense date field to today's date in the user's locale.
2. THE Create_Form SHALL allow the user to change the pre-filled date before saving.

### Requirement 4: Independent Expense on Save

**User Story:** As a user, I want the saved copy to be a fully independent expense, so that editing or deleting it does not affect the original.

#### Acceptance Criteria

1. WHEN the user saves the Create_Form after a Copy_Action, THE Create_Form SHALL create a new expense using the standard expense creation flow.
2. THE new expense SHALL have no reference, link, or foreign key pointing to the Source_Expense.
3. WHEN the new expense is created, THE Source_Expense SHALL remain unmodified.

### Requirement 5: Excluded Fields from Copy

**User Story:** As a user, I want certain fields to be reset on copy, so that the new expense does not carry over data that should be unique or re-evaluated.

#### Acceptance Criteria

1. WHEN the Create_Form opens via a Copy_Action, THE Create_Form SHALL NOT pre-fill attached documents (receipts/images) from the Source_Expense.
2. WHEN the Create_Form opens via a Copy_Action, THE Create_Form SHALL NOT pre-fill recurrence rules from the Source_Expense.
3. WHEN the Create_Form opens via a Copy_Action, THE Create_Form SHALL set the recurrence rule to NONE.

### Requirement 6: Copy Action for Direct (Friend) Expenses

**User Story:** As a user, I want to copy direct friend expenses the same way as group expenses, so that duplication works consistently regardless of expense context.

#### Acceptance Criteria

1. WHEN viewing a direct expense in the Expense_Detail view, THE Expense_Detail SHALL display the Copy_Action button alongside the existing edit and delete actions.
2. WHEN the user activates the Copy_Action on a direct Source_Expense, THE Create_Form SHALL open pre-filled with the same fields as specified in Requirement 2, within the same friend context.
3. WHEN the user activates the Copy_Action on a direct Source_Expense, THE Create_Form SHALL set the expense date to today's date.

### Requirement 7: Internationalization

**User Story:** As a user, I want the Copy action label and any related UI text to be localized, so that the feature is accessible in all supported languages.

#### Acceptance Criteria

1. THE Copy_Action label SHALL use an i18n message key from the `messages/*.json` catalogs.
2. WHEN a new locale translation is missing, THE Copy_Action SHALL fall back to the English default message.
