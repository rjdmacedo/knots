# Requirements Document

## Introduction

Group expense create and edit leave the floating modal and become real pages. Create is `/groups/:groupId/expenses/new`. Edit is `/groups/:groupId/expenses/:expenseId/edit`. Both pages render one shared editor, the same form that today lives inside `FloatingCreateExpense` (`ExpenseForm`, and `PaymentForm` when the expense is a reimbursement).

`/groups/:groupId/expenses/:expenseId` stays the read-only detail page. Edit on that page, and Edit in the expense list, navigate to the edit page. Back from edit returns to the detail page. Back from new returns to the group expense list.

The group is already in the URL, so the editor does not ask the user to pick the group again. The participant control only adds people outside that group. Friend-only expenses, with no group, stay in the existing floating dialog.

## Glossary

- **Editor**: The shared page body that renders `ExpenseForm` or `PaymentForm` for a known group. Used by both the new page and the edit page.
- **New_Page**: `/groups/:groupId/expenses/new`.
- **Edit_Page**: `/groups/:groupId/expenses/:expenseId/edit`.
- **Detail_Page**: The existing read-only page `/groups/:groupId/expenses/:expenseId`.
- **Group_Create_Entry**: Any current path that opens the floating dialog to create a group expense: the floating action button when a group is already known, the `create-group-expense` event (including copy and create-from-receipt), and the reimbursement create action.
- **Group_Edit_Entry**: `openEditGroupExpense` and the `edit-group-expense` event, used by the detail page and the expense card menu.
- **Outside_Participant_Control**: The control that today shows the selected group name (for example "Test"). On these pages it only adds friends who are not members of the group in the URL.

## Requirements

### Requirement 1: Shared editor on two routes

**User Story:** As a user, I want to create and edit a group expense on a full page, so that the form has room for items, price, quantity, and assignment.

#### Acceptance Criteria

1. THE New_Page SHALL render the Editor for the group id in the URL, with an empty expense unless prefill data is provided.
2. THE Edit_Page SHALL render the same Editor, loaded with the expense identified by `:expenseId` in that group.
3. THE New_Page and THE Edit_Page SHALL NOT each implement a separate copy of `ExpenseForm` or `PaymentForm`.
4. WHEN the expense is a reimbursement, THE Editor SHALL render `PaymentForm` instead of `ExpenseForm`, matching the current dialog behavior.
5. THE Detail_Page SHALL remain read-only and SHALL NOT embed the Editor.

### Requirement 2: Navigation replaces the group modal

**User Story:** As a user, I want Edit and Add expense to open the page instead of a dialog, so that refresh, back, and share work.

#### Acceptance Criteria

1. WHEN the user activates a Group_Edit_Entry, THE app SHALL navigate to the Edit_Page for that group and expense, and SHALL NOT open the floating dialog.
2. WHEN the user activates a Group_Create_Entry, THE app SHALL navigate to the New_Page for that group, and SHALL NOT open the floating dialog.
3. WHEN copy or create-from-receipt dispatches `create-group-expense` with prefill, THE New_Page SHALL open with that same prefill applied.
4. WHEN the user finishes or cancels on the Edit_Page, THE app SHALL return to the Detail_Page.
5. WHEN the user finishes or cancels on the New_Page, THE app SHALL return to `/groups/:groupId/expenses`.
6. WHEN a group expense is saved from the Editor, THE app SHALL keep the current success behavior, including the decomposition toast when the save splits a group half from direct halves.

### Requirement 3: Group comes from the URL

**User Story:** As a user creating an expense inside a group, I want the group to be fixed by the page I am on, so that I am not asked to select it again.

#### Acceptance Criteria

1. THE Editor SHALL use the group id from the route as the expense group.
2. THE Outside_Participant_Control SHALL NOT offer group selection on the New_Page or the Edit_Page.
3. THE Outside_Participant_Control SHALL still allow adding friends who are not members of that group.
4. WHEN no outside friends are added, item assignment and the paid-for list SHALL include only members of the group in the URL.
5. WHEN outside friends are added, those friends SHALL be included in the editor the same way selected friends are included in the dialog today.

### Requirement 4: Friend-only expenses stay in the dialog

**User Story:** As a user splitting an expense with friends and no group, I want the current dialog to keep working, so that this change does not invent a route for expenses that have no group.

#### Acceptance Criteria

1. WHEN the user creates or edits a direct expense that has no group, THE app SHALL keep using `FloatingCreateExpense`.
2. THE floating action button SHALL still open the dialog when no group is known.
3. WHEN the user is on a group page and chooses Add expense, THE app SHALL go to the New_Page instead of opening the dialog.

### Requirement 5: Preserve the current form

**User Story:** As a user, I want the page form to behave like the dialog form, so that item layout, payers, splits, and decomposition do not regress.

#### Acceptance Criteria

1. THE Editor SHALL keep the current item row layout: on viewports below the `md` breakpoint, the item name, price, quantity, and line total stack; from `md` upward they sit on one row, and the remove-item control is the last item in that row.
2. THE Editor SHALL keep item assignment limited to the group members plus any outside friends added in the Editor, not the full friends list.
3. THE Editor SHALL keep existing validation, submission, deletion, and update behavior of `ExpenseForm` and `PaymentForm`.
