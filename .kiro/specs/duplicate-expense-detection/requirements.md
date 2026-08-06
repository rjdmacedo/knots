# Requirements Document

## Introduction

Detection of potentially duplicate expenses at the moment of saving (creating or editing) an expense. When the name and price of a new expense match an existing expense within the same group or direct friend context, the system presents a confirmation dialog to the user. The date is also considered in the analysis as a reinforcement factor for the duplicate suspicion.

## Glossary

- **Expense_Form**: Form component (`ExpenseForm` / `PaymentForm`) where the user creates or edits an expense.
- **Duplicate_Detector**: Module responsible for comparing the fields of an expense being saved against existing expenses in the same group/context and determining whether a potential match exists.
- **Confirmation_Dialog**: Modal dialog (shadcn/base-ui AlertDialog) that informs the user about the potential duplication and requests explicit confirmation to proceed.
- **Expense_Context**: The group or direct friend context to which the expense belongs — defines the universe of expenses against which duplication is checked.
- **Match_Criteria**: Set of fields used to determine whether an expense is potentially duplicated: title (name), amount (price), and optionally date.
- **Similarity_Indicator**: A visual badge or label displayed in the Confirmation_Dialog that highlights a specific field match between the new expense and the potential duplicate (e.g., "same amount", "close in date", "similar title").
- **Unsaved_Changes_Dialog**: A confirmation dialog that warns the user about unsaved form data when attempting to navigate away from the Expense_Form.

## Requirements

### Requirement 1: Duplicate Detection by Name and Price

**User Story:** As a user, I want the system to detect when I am saving an expense with the same name and price as an already existing expense, so that I am warned before accidentally creating duplicates.

#### Acceptance Criteria

1. WHEN the user submits the Expense_Form (create or edit), THE Duplicate_Detector SHALL search for existing expenses within the same Expense_Context that share the same title (case-insensitive) and the same amount.
2. WHEN searching for duplicates, THE Duplicate_Detector SHALL exclude the expense being edited from the comparison set.
3. WHEN both title and amount match an existing expense, THE Duplicate_Detector SHALL flag the submission as a potential duplicate.
4. THE Duplicate_Detector SHALL perform title comparison using case-insensitive, trimmed string matching.
5. THE Duplicate_Detector SHALL treat zero-amount expenses the same as any other amount value, with no special exemption from duplicate detection.

### Requirement 2: Date as a Reinforcement Factor in the Analysis

**User Story:** As a user, I want the date to also be considered in the duplication analysis, so that matches in name, price, and close date increase the confidence that it is a duplicate.

#### Acceptance Criteria

1. WHEN a potential duplicate is identified by title and amount, THE Duplicate_Detector SHALL additionally check whether the expense date falls within a configurable date proximity window (default: 7 days) of the matching expense.
2. WHEN the expense date also falls within the proximity window of the matching expense, THE Confirmation_Dialog SHALL display the matching expense date to reinforce the duplicate warning.
3. THE Duplicate_Detector SHALL still flag a potential duplicate when title and amount match, regardless of date proximity.

### Requirement 3: Duplicate Confirmation Dialog

**User Story:** As a user, I want to see a clear confirmation dialog when a potentially duplicate expense is detected, so that I can explicitly decide whether to proceed or cancel.

#### Acceptance Criteria

1. WHEN the Duplicate_Detector flags a potential duplicate, THE Confirmation_Dialog SHALL be displayed before the expense is persisted.
2. THE Confirmation_Dialog SHALL display the title, amount, and date of the matching existing expense.
3. THE Confirmation_Dialog SHALL provide a "Confirm" action that allows the user to proceed with saving the expense.
4. THE Confirmation_Dialog SHALL provide a "Cancel" action that aborts the save operation and returns the user to the Expense_Form with all previously entered data intact.
5. WHEN the user confirms via the Confirmation_Dialog, THE Expense_Form SHALL proceed to persist the expense (create or update) using the existing save flow.
6. WHEN the user cancels via the Confirmation_Dialog, THE Expense_Form SHALL retain all form field values without modification.

### Requirement 4: Execution in Both Create and Edit Flows

**User Story:** As a user, I want this verification to occur both when creating a new expense and when editing an existing one, to ensure protection against duplicates in both scenarios.

#### Acceptance Criteria

1. WHEN a new expense is being created, THE Duplicate_Detector SHALL run the duplicate check before persisting the expense.
2. WHEN an existing expense is being edited, THE Duplicate_Detector SHALL run the duplicate check before persisting the update.
3. WHEN the Duplicate_Detector finds no matches, THE Expense_Form SHALL proceed to save without displaying the Confirmation_Dialog; other dialogs triggered by unrelated features or conditions remain unaffected.

### Requirement 5: Comparison Scope

**User Story:** As a user, I want the duplicate check to compare only within the same group or direct friend context, to avoid false positives across different groups.

#### Acceptance Criteria

1. WHEN checking for duplicates within a group expense, THE Duplicate_Detector SHALL only compare against expenses belonging to the same group.
2. WHEN checking for duplicates within a direct friend expense, THE Duplicate_Detector SHALL only compare against expenses within the same direct friend relationship.
3. THE Duplicate_Detector SHALL query existing expenses using a server-side tRPC procedure to ensure data accuracy and avoid stale client-side data.

### Requirement 6: Performance and User Experience

**User Story:** As a user, I want the duplicate check to be fast and not add noticeable delay to the save flow, so that the experience remains fluid.

#### Acceptance Criteria

1. THE Duplicate_Detector SHALL complete the duplicate check within 500ms under normal database load.
2. IF the duplicate check fails due to a network or server error, THEN THE Expense_Form SHALL proceed with saving the expense without blocking the user.
3. WHILE the duplicate check is in progress, THE Expense_Form SHALL display a loading indicator on the submit button.

### Requirement 7: Similarity Indicators in the Confirmation Dialog

**User Story:** As a user, I want the duplicate confirmation dialog to visually highlight which fields match between my new expense and the potential duplicate, so that I can quickly understand why the system flagged it.

#### Acceptance Criteria

1. WHEN the Confirmation_Dialog displays a potential duplicate, THE Confirmation_Dialog SHALL show a Similarity_Indicator for each matching field between the new expense and the existing expense.
2. WHEN the title of the new expense matches the title of the existing expense (case-insensitive, trimmed), THE Confirmation_Dialog SHALL display a "similar title" Similarity_Indicator.
3. WHEN the amount of the new expense matches the amount of the existing expense, THE Confirmation_Dialog SHALL display a "same amount" Similarity_Indicator.
4. WHEN the date of the new expense falls within the date proximity window of the existing expense, THE Confirmation_Dialog SHALL display a "close in date" Similarity_Indicator.
5. THE Confirmation_Dialog SHALL display Similarity_Indicators as visually distinct badges adjacent to the matching expense details.
6. WHEN the Duplicate_Detector flags a potential duplicate but no individual field-level Similarity_Indicators apply, THE Confirmation_Dialog SHALL still be displayed to the user.

### Requirement 8: Clickable Duplicate Expense for Navigation

**User Story:** As a user, I want to be able to click on the potential duplicate expense shown in the confirmation dialog, so that I can navigate to that expense and compare it with my current entry before deciding.

#### Acceptance Criteria

1. WHEN the Confirmation_Dialog displays a potential duplicate expense, THE Confirmation_Dialog SHALL render the matching expense as a clickable element.
2. WHEN the user clicks on the matching expense in the Confirmation_Dialog, THE Expense_Form SHALL navigate the user to the detail view of that existing expense.
3. WHEN the user navigates to the existing expense from the Confirmation_Dialog, THE Expense_Form SHALL preserve the current form data so the user can return and resume editing.
4. IF the Expense_Form fails to preserve the current form data, THEN THE Expense_Form SHALL block the navigation and inform the user that navigation is unavailable.

### Requirement 9: Unsaved Changes Warning on Navigation

**User Story:** As a user, I want to be warned when I attempt to navigate away from the expense form with unsaved changes, so that I do not accidentally lose my entered data.

#### Acceptance Criteria

1. WHEN the user has modified any field in the Expense_Form and attempts to navigate away, THE Expense_Form SHALL display the Unsaved_Changes_Dialog.
2. THE Unsaved_Changes_Dialog SHALL inform the user that unsaved changes will be lost if they proceed.
3. THE Unsaved_Changes_Dialog SHALL provide a "Leave" action that allows the user to proceed with navigation, discarding unsaved changes.
4. THE Unsaved_Changes_Dialog SHALL provide a "Stay" action that cancels the navigation and returns the user to the Expense_Form with all data intact.
5. WHEN the user confirms navigation via the Unsaved_Changes_Dialog, THE Expense_Form SHALL allow the navigation to proceed without persisting form data.
6. WHEN the user cancels navigation via the Unsaved_Changes_Dialog, THE Expense_Form SHALL retain all form field values without modification.
