# Implementation Plan: Copy Expense

## Overview

Implement a "Copy" action on expense detail views (group and direct) that opens the create-expense form pre-filled with the source expense's data — using today's date, excluding documents and recurrence rules. The implementation uses the existing `create-group-expense` / `create-direct-expense` custom event pattern with a pure helper function for field extraction.

## Tasks

- [x] 1. Create core copy logic and extend prefill type
  - [x] 1.1 Add `notes` field to `ExpenseFormCreatePrefill` type and wire it in the form defaults
    - In `src/app/groups/[groupId]/expenses/expense-form.tsx`, add `notes?: string` to the `ExpenseFormCreatePrefill` type
    - Update the `createPrefill` defaults branch (around line 627) to use `createPrefill.notes ?? ''` instead of hardcoded `''`
    - _Requirements: 2.8_

  - [x] 1.2 Create `buildCopyExpensePrefill` pure function and `CopyableExpense` type
    - Create new file `src/lib/expense-copy.ts`
    - Define `CopyableExpense` type with fields: `title`, `amount`, `categoryId`, `paidById`, `splitMode`, `isReimbursement`, `notes`, `paidFor`
    - Implement `buildCopyExpensePrefill(expense, currency)` that maps source expense fields to `ExpenseFormCreatePrefill`
    - Use `amountAsDecimal` for monetary conversion, handle BY_AMOUNT vs BY_PERCENTAGE/BY_SHARES split modes
    - Always set `expenseDate` to `new Date()`, exclude documents and recurrence
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 5.1, 5.2, 5.3_

  - [x] 1.3 Add `openCopyGroupExpense` and `openCopyDirectExpense` event dispatchers
    - In `src/lib/expense-dialog-events.ts`, add `openCopyGroupExpense(groupId, groupName, prefill)` that dispatches `create-group-expense` with prefill payload
    - Add `openCopyDirectExpense(friendId, prefill)` that dispatches `create-direct-expense` with prefill payload
    - Import `ExpenseFormCreatePrefill` type
    - _Requirements: 2.1, 6.2_

- [x] 2. Integrate copy action into expense detail views
  - [x] 2.1 Add copy button and `onCopy` prop to `ExpenseDetailContent`
    - In `src/components/expense-detail/expense-detail.tsx`, add `onCopy?: () => void` to `ExpenseDetailContentProps`
    - Render a "Copy" button in the action bar (between delete and edit), only when `!isLocked` and `onCopy` is defined
    - Use `useTranslations('ExpenseDetail')` with key `t('copy')` for the button label
    - _Requirements: 1.1, 1.3, 1.4_

  - [x] 2.2 Wire `onCopy` in `GroupExpenseDetailLoader`
    - In `src/components/expense-detail/expense-detail.tsx`, in `GroupExpenseDetailLoader`, import `buildCopyExpensePrefill` and `openCopyGroupExpense`
    - Pass `onCopy` prop to `ExpenseDetailContent` that calls `buildCopyExpensePrefill(expense, currency)` then `openCopyGroupExpense(groupId, group.name, prefill)`
    - Only pass `onCopy` when `!isLocked`
    - _Requirements: 1.1, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 5.1, 5.2, 5.3_

  - [x] 2.3 Wire `onCopy` in `DirectExpenseDetailLoader`
    - In `src/components/expense-detail/expense-detail.tsx`, in `DirectExpenseDetailLoader`, import `buildCopyExpensePrefill` and `openCopyDirectExpense`
    - Pass `onCopy` prop to `ExpenseDetailContent` that calls `buildCopyExpensePrefill(expense, currency)` then `openCopyDirectExpense(friend.id, prefill)`
    - Only pass `onCopy` when `!isLocked`
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 3. Checkpoint - Core copy flow
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Add i18n support
  - [x] 4.1 Add `copy` i18n key to all locale message files
    - In `messages/en-US.json`, add `"copy": "Copy"` under the `"ExpenseDetail"` section
    - Add the same key to all other `messages/*.json` locale files (English fallback is acceptable for untranslated locales)
    - _Requirements: 7.1, 7.2_

- [x] 5. Add copy action to expense card (optional enhancement)
  - [x] 5.1 Add copy action to `ExpenseCard` context menu or action dropdown
    - In `src/app/groups/[groupId]/expenses/expense-card.tsx`, add a "Copy" option to the card's action dropdown or context menu
    - Wire it to dispatch `openCopyGroupExpense` with the card's expense data via `buildCopyExpensePrefill`
    - Gate the action on the expense not being a consolidated payment
    - _Requirements: 1.2, 1.3_

- [x] 6. Checkpoint - UI integration complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Property-based and unit tests
  - [x] 7.1 Write property test: Copy prefill preserves identity fields
    - **Property 1: Copy prefill preserves identity fields**
    - **Validates: Requirements 2.1, 2.3, 2.4, 2.5, 2.7, 2.8**
    - Create `src/lib/expense-copy.property.test.ts`
    - Use `fast-check` to generate random `CopyableExpense` objects (random titles, categoryIds, userIds, split modes, boolean isReimbursement, nullable notes)
    - Assert that identity fields (title, category, paidBy, splitMode, isReimbursement, notes) are correctly preserved/mapped in output
    - Minimum 100 iterations

  - [x] 7.2 Write property test: Copy prefill correctly converts monetary values
    - **Property 2: Copy prefill correctly converts monetary values**
    - **Validates: Requirements 2.2, 2.6**
    - In `src/lib/expense-copy.property.test.ts`, add test using `fast-check`
    - Generate random expenses with varying amounts, split modes, and paidFor arrays
    - Assert `amount` equals `amountAsDecimal(expense.amount, currency)` and each `paidFor[i].shares` is correctly converted per split mode
    - Minimum 100 iterations

  - [x] 7.3 Write property test: Copy prefill resets transient fields
    - **Property 3: Copy prefill resets transient fields**
    - **Validates: Requirements 3.1, 5.1, 5.2, 5.3**
    - In `src/lib/expense-copy.property.test.ts`, add test using `fast-check`
    - Generate random expenses including those with documents and recurrence rules
    - Assert output `expenseDate` is today, and output does NOT contain `documents` or `recurrenceRule`
    - Minimum 100 iterations

  - [x] 7.4 Write property test: Copy action visibility matches non-locked status
    - **Property 4: Copy action visibility matches non-locked status**
    - **Validates: Requirements 1.3, 1.4**
    - In `src/lib/expense-copy.property.test.ts`, add test using `fast-check`
    - Generate random expense objects with varying `creationMethod` and `bundleId`
    - Assert visibility predicate matches `!isConsolidatedPayment(expense)`
    - Minimum 100 iterations

  - [x] 7.5 Write unit tests for copy button rendering
    - In `src/components/expense-detail/__tests__/expense-detail-copy.test.tsx`, test:
      - `ExpenseDetailContent` with `isLocked=false` and `onCopy` → copy button present
      - `ExpenseDetailContent` with `isLocked=true` → copy button absent
    - _Requirements: 1.3, 1.4_

- [x] 8. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The design uses TypeScript, so all implementation uses TypeScript
- The existing `create-group-expense` custom event pattern (used by receipt extraction and settlement flows) is reused — no new state management needed
- No database schema changes are required; the feature operates on already-loaded client-side data
- Property tests validate universal correctness properties from the design document
- The `create-direct-expense` custom event is new (for friend expenses) but follows the same pattern

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "4.1"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3"] },
    { "id": 4, "tasks": ["5.1"] },
    { "id": 5, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5"] }
  ]
}
```
