# Implementation Plan: Duplicate Expense Detection

## Overview

Implement duplicate expense detection that intercepts the expense save flow (create and edit) to check for potentially duplicate expenses before persistence. The feature uses server-side tRPC procedures for detection, a shared React hook for client-side orchestration, and a confirmation dialog when duplicates are found. Pure utility functions handle title normalization and date proximity checks.

The extended feature adds similarity indicator badges to the confirmation dialog, clickable expense items for navigation to detail views, form data persistence via sessionStorage, and unsaved changes warnings using the existing `PreventNavigation` component with updated button labels.

## Tasks

- [x] 1. Create utility functions and shared types
  - [x] 1.1 Create `normalizeExpenseTitle` and `isDateProximate` utility functions
    - Create `src/lib/duplicate-expense-detection.ts`
    - Implement `normalizeExpenseTitle(title: string): string` using `trim().toLowerCase()`
    - Implement `isDateProximate(dateA: Date, dateB: Date, windowDays?: number): boolean` with default 7-day window
    - Export `DuplicateCheckResult` type with `hasDuplicates: boolean` and `matches` array containing `id`, `title`, `amount`, `expenseDate`, `isDateProximate`
    - _Requirements: 1.4, 2.1_

  - [x] 1.2 Write property tests for `normalizeExpenseTitle`
    - **Property 3: Title Normalization Equivalence**
    - Create `src/lib/duplicate-expense-detection.property.test.ts`
    - Test idempotence: normalizing twice equals normalizing once
    - Test equivalence: strings differing only in case/whitespace normalize to the same value
    - Test preservation: strings differing in non-whitespace content remain different after normalization
    - **Validates: Requirements 1.4**

  - [x] 1.3 Write property tests for `isDateProximate`
    - **Property 4: Date Proximity Symmetry and Correctness**
    - Test symmetry: `isDateProximate(a, b, w) === isDateProximate(b, a, w)`
    - Test correctness: result is `true` iff absolute day difference ≤ window
    - Test boundary: dates exactly `windowDays` apart return `true`; dates `windowDays + 1` apart return `false`
    - **Validates: Requirements 2.1**

- [x] 2. Implement server-side tRPC procedures
  - [x] 2.1 Create `checkDuplicate` procedure for group expenses
    - Create `src/trpc/routers/groups/expenses/check-duplicate.procedure.ts`
    - Define Zod input schema: `groupId`, `title`, `amount` (int), `expenseDate` (date), `excludeExpenseId` (optional)
    - Query `prisma.expense.findMany` with case-insensitive title match (using `normalizeExpenseTitle`), exact amount match, scoped to `groupId`, excluding `excludeExpenseId`
    - Map results to `DuplicateCheckResult` including `isDateProximate` for each match
    - Return `{ hasDuplicates: false, matches: [] }` on database errors (non-blocking)
    - Register the procedure in `src/trpc/routers/groups/expenses/index.ts` as `checkDuplicate`
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.3, 5.1, 5.3, 6.2_

  - [x] 2.2 Create `checkDirectDuplicate` procedure for friend expenses
    - Create `src/trpc/routers/friends/check-direct-duplicate.procedure.ts`
    - Define Zod input schema: `friendId`, `title`, `amount` (int), `expenseDate` (date), `excludeExpenseId` (optional)
    - Verify friend ownership and resolve `friendUserId`
    - Query `prisma.expense.findMany` with case-insensitive title, exact amount, `groupId: null`, AND both users involved (paidBy/paidFor)
    - Map results to `DuplicateCheckResult` with `isDateProximate` for each match
    - Return `{ hasDuplicates: false, matches: [] }` on database errors (non-blocking)
    - Register the procedure in `src/trpc/routers/friends/index.ts` as `checkDirectDuplicate`
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.3, 5.2, 5.3, 6.2_

  - [x] 2.3 Write property tests for duplicate detection logic
    - **Property 1: Title and Amount Matching**
    - **Property 2: Self-Exclusion During Edit**
    - **Property 7: No-Match Pass-Through**
    - **Property 8: Context Scope Isolation**
    - Create `src/trpc/routers/groups/expenses/__tests__/check-duplicate.property.test.ts`
    - Extract core matching logic into a testable pure function if needed
    - Test that matching title+amount always flags as duplicate
    - Test that the expense being edited is never in results
    - Test that non-matching title or amount never flags
    - Test that expenses from other groups/friends are never returned
    - **Validates: Requirements 1.1, 1.2, 1.3, 2.3, 4.3, 5.1, 5.2**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement client-side hook and dialog component
  - [x] 4.1 Create `useDuplicateCheck` React hook
    - Create `src/components/hooks/use-duplicate-check.ts`
    - Accept `context` option: `{ type: 'group'; groupId: string } | { type: 'friend'; friendId: string }`
    - Expose `checkForDuplicates(params)` function calling the appropriate tRPC procedure based on context type
    - Expose `isChecking: boolean` loading state for submit button indicator
    - On tRPC call failure, resolve with `{ hasDuplicates: false, matches: [] }` (non-blocking)
    - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.3_

  - [x] 4.2 Create `DuplicateExpenseDialog` component
    - Create `src/components/duplicate-expense-dialog.tsx`
    - Use the existing `AlertDialog` component from `@/components/ui/alert-dialog`
    - Props: `open`, `matches`, `onConfirm`, `onCancel`, `currency`, `locale`
    - Display each match's title, formatted amount (using currency), and date
    - Show date proximity indicator when `isDateProximate` is true for a match
    - Provide "Confirm" action button triggering `onConfirm`
    - Provide "Cancel" action button triggering `onCancel`
    - _Requirements: 2.2, 3.1, 3.2, 3.3, 3.4_

  - [x] 4.3 Write property test for dialog payload completeness
    - **Property 5: Dialog Payload Completeness**
    - Create `src/components/__tests__/duplicate-expense-dialog.property.test.ts`
    - Test that for any match object passed to the dialog, title, amount, and expenseDate are non-null
    - **Validates: Requirements 3.2**

  - [x] 4.4 Write unit tests for `DuplicateExpenseDialog`
    - Create `src/components/__tests__/duplicate-expense-dialog.test.tsx`
    - Test dialog renders match details (title, amount, date)
    - Test "Confirm" button calls `onConfirm`
    - Test "Cancel" button calls `onCancel`
    - Test date proximity indicator appears when `isDateProximate` is true
    - _Requirements: 3.2, 3.3, 3.4_

- [x] 5. Integrate duplicate check into expense forms
  - [x] 5.1 Integrate `useDuplicateCheck` into `ExpenseForm` (group expenses)
    - Modify `src/app/groups/[groupId]/expenses/expense-form.tsx`
    - Initialize `useDuplicateCheck` with `{ type: 'group', groupId }`
    - Wrap the existing submit handler: call `checkForDuplicates` before proceeding
    - If duplicates found, show `DuplicateExpenseDialog` instead of submitting
    - On dialog confirm, call original `onSubmit` prop
    - On dialog cancel, do nothing (React Hook Form preserves state)
    - Pass `excludeExpenseId` when editing an existing expense
    - Show loading indicator on submit button while `isChecking` is true
    - _Requirements: 1.1, 1.2, 3.1, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 6.3_

  - [x] 5.2 Integrate `useDuplicateCheck` into `PaymentForm` (direct friend expenses)
    - Modify `src/app/groups/[groupId]/expenses/payment-form.tsx`
    - Initialize `useDuplicateCheck` with `{ type: 'group', groupId }` (payments are group-scoped)
    - Apply the same submit interception pattern as `ExpenseForm`
    - Pass `excludeExpenseId` when editing an existing payment
    - Show loading indicator on submit button while `isChecking` is true
    - _Requirements: 1.1, 1.2, 3.1, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 6.3_

  - [x] 5.3 Integrate `useDuplicateCheck` into direct friend expense creation flow
    - Identify the component that calls `friends.createDirectExpense` and integrate the hook with `{ type: 'friend', friendId }`
    - Apply same submit interception pattern
    - Show loading indicator while checking
    - _Requirements: 1.1, 3.1, 4.1, 5.2, 6.3_

  - [x] 5.4 Write property test for form state preservation on cancel
    - **Property 6: Cancel Preserves Form State**
    - Test that for any set of valid form field values, clicking cancel results in identical form values (no mutation)
    - **Validates: Requirements 3.4, 3.6**

- [x] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement similarity indicators and form persistence utilities
  - [x] 7.1 Create `computeSimilarityIndicators` utility function
    - Add to `src/lib/duplicate-expense-detection.ts`
    - Define `SimilarityIndicator` type: `'similar-title' | 'same-amount' | 'close-in-date'`
    - Implement `computeSimilarityIndicators(newExpense, existingExpense): SimilarityIndicator[]`
    - Return `'similar-title'` iff normalized titles are equal
    - Return `'same-amount'` iff amounts are equal
    - Return `'close-in-date'` iff `existingExpense.isDateProximate` is true
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 7.2 Write property test for `computeSimilarityIndicators`
    - **Property 8: Similarity Indicators Correctly Computed**
    - Add to `src/lib/duplicate-expense-detection.property.test.ts`
    - Test that `'similar-title'` is included iff normalized titles match
    - Test that `'same-amount'` is included iff amounts are strictly equal
    - Test that `'close-in-date'` is included iff `isDateProximate` is true for the match
    - Use `fast-check` with 100 runs generating arbitrary title, amount, date, and isDateProximate combinations
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

  - [x] 7.3 Create `useFormPersistence` hook
    - Create `src/components/hooks/use-form-persistence.ts`
    - Accept `{ key: string }` options for sessionStorage key
    - Implement `save(data: T): boolean` — serializes to sessionStorage, returns false on failure (quota/circular ref)
    - Implement `restore(): T | null` — deserializes from sessionStorage, returns null if missing or corrupt
    - Implement `clear(): void` — removes the key from sessionStorage
    - Use try/catch for all sessionStorage operations
    - _Requirements: 8.3, 8.4_

  - [x] 7.4 Write property test for form data preservation round-trip
    - **Property 9: Form Data Preservation Round-Trip**
    - Create `src/components/hooks/__tests__/use-form-persistence.property.test.ts`
    - Mock `sessionStorage` with an in-memory Map
    - Test that for any valid `ExpenseFormValues` object, `save` followed by `restore` returns deeply equal data
    - Use `fast-check` to generate arbitrary form value objects (title, amount, date, splits, category, etc.)
    - **Validates: Requirements 8.3**

- [x] 8. Update `DuplicateExpenseDialog` with similarity badges and clickable expenses
  - [x] 8.1 Update `DuplicateExpenseDialog` to accept new props and render similarity badges
    - Modify `src/components/duplicate-expense-dialog.tsx`
    - Add `newExpense: { title: string; amount: number; expenseDate: Date }` prop
    - Add `onMatchClick: (matchId: string) => void` prop
    - Import and call `computeSimilarityIndicators` for each match using `newExpense`
    - Render `Badge` components (from `@/components/ui/badge`) for each indicator: "Similar title", "Same amount", "Close in date"
    - Display badges adjacent to each match item
    - Render each match item as a clickable element (button) that calls `onMatchClick(match.id)`
    - Ensure dialog still renders when no individual indicators apply (edge case for Req 7.6)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2_

  - [x] 8.2 Write unit tests for updated `DuplicateExpenseDialog`
    - Update `src/components/__tests__/duplicate-expense-dialog.test.tsx`
    - Test similarity indicator badges render for each matching field
    - Test clickable expense item triggers `onMatchClick` with correct match ID
    - Test dialog renders without badges when indicators don't apply (Req 7.6)
    - Test dialog still displays when `computeSimilarityIndicators` returns empty array
    - _Requirements: 7.1, 7.5, 7.6, 8.1_

- [x] 9. Integrate `onMatchClick` navigation and form persistence into forms
  - [x] 9.1 Integrate `onMatchClick` and `useFormPersistence` into `ExpenseForm`
    - Modify `src/app/groups/[groupId]/expenses/expense-form.tsx`
    - Initialize `useFormPersistence` with a key like `knots:duplicate-form:group-${groupId}:${expenseId || 'new'}`
    - Implement `onMatchClick` handler: save form data via `useFormPersistence.save`, then navigate to expense detail using `getGroupExpenseDetailPath(groupId, matchId)`
    - If `save` returns false, block navigation and show toast error informing the user
    - On form mount, check `useFormPersistence.restore()` and populate form if data exists, then `clear()`
    - Pass `newExpense` and `onMatchClick` props to `DuplicateExpenseDialog`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 9.2 Integrate `onMatchClick` and `useFormPersistence` into `PaymentForm`
    - Modify `src/app/groups/[groupId]/expenses/payment-form.tsx`
    - Initialize `useFormPersistence` with a key like `knots:duplicate-form:payment-${groupId}:${expenseId || 'new'}`
    - Implement `onMatchClick` handler: save form data, navigate to expense detail using `getGroupExpenseDetailPath(groupId, matchId)`
    - If `save` returns false, block navigation and show toast error
    - On form mount, check `useFormPersistence.restore()` and populate form if data exists, then `clear()`
    - Pass `newExpense` and `onMatchClick` props to `DuplicateExpenseDialog`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 9.3 Integrate `onMatchClick` and `useFormPersistence` into direct friend expense flow
    - Modify the direct friend expense component (e.g., `src/app/friends/[username]/direct-expense-dialog.tsx`)
    - Initialize `useFormPersistence` with a key like `knots:duplicate-form:friend-${friendId}:new`
    - Implement `onMatchClick` handler: save form data, navigate to expense detail using `getFriendExpenseDetailPath(username, matchId)`
    - If `save` returns false, block navigation and show toast error
    - On form mount, check `useFormPersistence.restore()` and populate form if data exists, then `clear()`
    - Pass `newExpense` and `onMatchClick` props to `DuplicateExpenseDialog`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 10. Integrate unsaved changes warning and update `LeavingDialog` labels
  - [x] 10.1 Update `LeavingDialog` button labels to "Leave" and "Stay"
    - Modify `src/components/leaving-dialog.tsx`
    - Add optional props `cancelLabel?: string` and `confirmLabel?: string` with defaults "No" and "Yes" to preserve backward compatibility
    - Use `cancelLabel` in `AlertDialogCancel` and `confirmLabel` in `AlertDialogAction`
    - _Requirements: 9.3, 9.4_

  - [x] 10.2 Integrate `PreventNavigation` into `ExpenseForm` with custom labels
    - Modify `src/app/groups/[groupId]/expenses/expense-form.tsx`
    - Render `PreventNavigation` component with `isDirty={formState.isDirty}`
    - Pass `resetData` as form `reset` function
    - Pass custom `title="Unsaved Changes"` and `description="You have unsaved changes. If you leave, your data will be lost."`
    - Pass `cancelLabel="Stay"` and `confirmLabel="Leave"` (via updated `LeavingDialog` props propagated through `PreventNavigation`)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 10.3 Integrate `PreventNavigation` into `PaymentForm` with custom labels
    - Modify `src/app/groups/[groupId]/expenses/payment-form.tsx`
    - Render `PreventNavigation` component with `isDirty={formState.isDirty}`
    - Pass `resetData` as form `reset` function
    - Pass custom `title="Unsaved Changes"` and `description="You have unsaved changes. If you leave, your data will be lost."`
    - Pass `cancelLabel="Stay"` and `confirmLabel="Leave"` (via updated props)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 10.4 Integrate `PreventNavigation` into direct friend expense flow
    - Modify the direct friend expense component
    - Render `PreventNavigation` with `isDirty` sourced from form dirty state
    - Pass custom labels "Leave" and "Stay"
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 10.5 Write unit tests for unsaved changes integration
    - Create `src/components/__tests__/prevent-navigation-integration.test.tsx`
    - Test that unsaved changes dialog shows "Leave" and "Stay" action labels
    - Test that "Stay" action preserves form state (form values unchanged)
    - Test that "Leave" action allows navigation to proceed
    - Test that dialog appears when form is dirty and user attempts navigation
    - Test that dialog does NOT appear when form is pristine
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 11. Checkpoint - Ensure all new tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The non-blocking pattern (proceed on error) is critical — duplicate detection must never prevent saving
- Existing property test convention: `*.property.test.ts` files with `fc` from `fast-check`
- Tasks 1–6 are completed (core detection, hook, dialog, form integration)
- Tasks 7–11 cover new requirements: similarity indicators (Req 7), clickable expenses (Req 8), unsaved changes (Req 9)
- The `LeavingDialog` update uses optional props with defaults to maintain backward compatibility with other usages
- `PreventNavigation` already supports `title` and `description` customization — only button labels require the `LeavingDialog` update

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["7.1", "7.3"] },
    { "id": 1, "tasks": ["7.2", "7.4", "10.1"] },
    { "id": 2, "tasks": ["8.1"] },
    { "id": 3, "tasks": ["8.2", "9.1", "9.2", "9.3"] },
    { "id": 4, "tasks": ["10.2", "10.3", "10.4"] },
    { "id": 5, "tasks": ["10.5"] }
  ]
}
```
