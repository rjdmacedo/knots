# Implementation Plan: Group Expense Editor Pages

## Overview

Move group expense create and edit out of the `FloatingCreateExpense` dialog and onto two App Router pages that share one `ExpenseEditor`. The forms (`ExpenseForm`, `PaymentForm`), tRPC procedures, and decomposition toast are reused as-is; the Editor lifts only the group branch of the current dialog's save/delete/decomposition logic.

The build order is bottom-up: pure helpers first (path builders, return-path mapping, add-expense routing, prefill store, payment-mode predicate, participant derivation), each covered by a property-based test; then the shared `ExpenseEditor`; then the New/Edit page shells; then repointing every entry from dialog events to navigation; and finally trimming the dialog to friend-only.

Three review-flagged points are handled explicitly:

- **Cancel is navigation, not a button.** `ExpenseForm`/`PaymentForm` footers only have Save/Create and a conditional Delete — there is no Cancel button. On a page, "cancel" means leaving (browser back or a return-navigation), and the dirty-form prompt comes from the `PreventNavigation` guard the forms already render. No new footer button is added.
- **`create-from-receipt-button.tsx` stops dispatching `create-group-expense`.** The preservation test at `src/app/groups/__tests__/ui-button-preservation.property.test.tsx` searches that file for the literal string `create-group-expense` and asserts it is present; it must be updated in the same task so it asserts the new stash-then-navigate behavior instead.
- **Static `new` route beside dynamic `[expenseId]`.** `expenses/new/` must sit next to `expenses/[expenseId]/` so the App Router matches the static `new` segment before the dynamic one, and `new` is never read as an expense id.

Implementation language: **TypeScript** (React 19 / Next.js App Router), matching the existing codebase and design.

## Tasks

- [x] 1. Add pure navigation and prefill helpers
  - [x] 1.1 Create route path builders and Editor mode/return-path helpers
    - Create `src/lib/expense-editor-navigation.ts`
    - `getGroupExpenseNewPath(groupId)` → `/groups/{groupId}/expenses/new`
    - `getGroupExpenseEditPath(groupId, expenseId)` → `/groups/{groupId}/expenses/{expenseId}/edit`
    - `parseGroupExpenseEditPath(pathname)` → a pure parser for the `edit` route segment returning `{ groupId, expenseId }`, or `null` when the pathname is not a well-formed edit path (`parseExpenseCreateContext` only reads the group id, so the expense id must be recovered here)
    - Define `EditorMode` (`{ kind: 'new'; groupId }` | `{ kind: 'edit'; groupId; expenseId }`) and `getEditorReturnPath(mode)`: new → `/groups/{groupId}/expenses`, edit → `getGroupExpenseDetailPath(groupId, expenseId)` (reuse `src/lib/expense-detail-urls.ts`)
    - Define `AddExpenseTarget` and `resolveAddExpenseTarget(pathname)`: return `{ kind: 'navigate', path: getGroupExpenseNewPath(g) }` when `parseExpenseCreateContext(pathname)` (from `src/lib/expense-create-context.ts`) is a group with id `g`; otherwise `{ kind: 'dialog' }`
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.4, 2.5, 4.2, 4.3_

  - [ ]\* 1.2 Write property test for Editor route paths round-trip
    - Create `src/lib/__tests__/expense-editor-navigation.property.test.ts`
    - **Property 1: Editor route paths round-trip to their ids** — for all group ids `g` and expense ids `e`, `parseExpenseCreateContext(getGroupExpenseNewPath(g))` recovers group `g`, and `parseGroupExpenseEditPath(getGroupExpenseEditPath(g, e))` recovers exactly `(g, e)` (use the dedicated edit-path parser to recover the expense id, not `parseExpenseCreateContext`); both paths are well-formed absolute paths under `/groups/{g}/expenses/`
    - **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
    - `fast-check`, `{ numRuns: PBT_NUM_RUNS }` (100), tag `// Feature: group-expense-editor-pages, Property 1: ...`

  - [ ]\* 1.3 Write property test for Editor return path
    - **Property 2: Editor return path depends only on mode** — `getEditorReturnPath` maps new → `/groups/{g}/expenses` and edit → `getGroupExpenseDetailPath(g, e)`, never depending on anything outside the mode
    - **Validates: Requirements 2.4, 2.5**
    - Tag `// Feature: group-expense-editor-pages, Property 2: ...`, `{ numRuns: PBT_NUM_RUNS }`

  - [ ]\* 1.4 Write property test for add-expense routing
    - **Property 3: Add-expense routing follows the route** — `resolveAddExpenseTarget(pathname)` returns navigate to `getGroupExpenseNewPath(g)` iff the pathname is a group route with id `g`, and dialog otherwise; use adversarial pathnames (`/friends/x`, `/groups`, trailing slashes)
    - **Validates: Requirements 4.2, 4.3**
    - Tag `// Feature: group-expense-editor-pages, Property 3: ...`, `{ numRuns: PBT_NUM_RUNS }`

  - [x] 1.5 Create the transient prefill store
    - Create `src/lib/expense-prefill-store.ts` with a module-scope `Map<string, ExpenseFormCreatePrefill>`
    - `stashExpensePrefill(groupId, prefill)` stores it; `consumeExpensePrefill(groupId)` returns and clears it (returns `undefined` when nothing stashed)
    - _Requirements: 1.1, 2.3_

  - [ ]\* 1.6 Write property test for the prefill handoff
    - Create `src/lib/__tests__/expense-prefill-store.property.test.ts`
    - **Property 5: Prefill handoff round-trips and is consumed once** — after `stashExpensePrefill(g, p)`, the first `consumeExpensePrefill(g)` deep-equals `p` and the next returns `undefined`; consuming with nothing stashed returns `undefined`. Generate arbitrary `ExpenseFormCreatePrefill` (including `Date`, `documents`, `items`, `paidFor`)
    - **Validates: Requirements 1.1, 2.3**
    - Tag `// Feature: group-expense-editor-pages, Property 5: ...`, `{ numRuns: PBT_NUM_RUNS }`

- [x] 2. Extract Editor logic helpers (payment mode + participants)
  - [x] 2.1 Add pure payment-mode and participant-derivation helpers
    - Create `src/lib/expense-editor-participants.ts`
    - `isPaymentMode({ expenseIsReimbursement?, prefillIsReimbursement? })` → `true` iff at least one flag is `true`
    - `addableOutsideFriends(friends, groupMembers)` → friends whose resolved id (`friendUserId ?? id`) is not a group member
    - `deriveEditorParticipants({ currentUser, groupMembers, addedOutsideFriends })` → current user + all group members + added outside friends, deduped by resolved id; never drops a member, never includes a non-member/non-added friend
    - _Requirements: 1.4, 3.3, 3.4, 3.5, 5.2_

  - [ ]\* 2.2 Write property test for payment-mode predicate
    - **Property 4: Payment mode iff either reimbursement flag is set** — over all combinations of the two flags (`true`/`false`/absent), `isPaymentMode` is `true` iff at least one is `true`
    - **Validates: Requirements 1.4**
    - Tag `// Feature: group-expense-editor-pages, Property 4: ...`, `{ numRuns: PBT_NUM_RUNS }`

  - [ ]\* 2.3 Write property test for addable friends exclusion
    - **Property 6: Addable friends exclude current group members** — offered friends are exactly those whose resolved id is not already a group member; generate friend/member lists with deliberate id overlap
    - **Validates: Requirements 3.3**
    - Tag `// Feature: group-expense-editor-pages, Property 6: ...`, `{ numRuns: PBT_NUM_RUNS }`

  - [ ]\* 2.4 Write property test for derived participants
    - **Property 7: Derived participants are members plus added outside friends only** — the derived set equals current user + all group members + exactly the added outside friends (deduped by resolved id); never drops a member, never includes an unrelated friend; with no outside friends it is only the current user and members
    - **Validates: Requirements 3.4, 3.5, 5.2**
    - Tag `// Feature: group-expense-editor-pages, Property 7: ...`, `{ numRuns: PBT_NUM_RUNS }`

- [x] 3. Checkpoint - pure helpers
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Build the shared ExpenseEditor
  - [x] 4.1 Implement the Outside_Participant_Control
    - Create `src/components/expense-editor/outside-participant-control.tsx`
    - Reuse `ExpenseParticipantPicker` with group selection hidden/disabled; the trigger shows added outside friends (no group name to change)
    - Use `addableOutsideFriends` (from 2.1) so members of the URL group are never offered
    - _Requirements: 3.2, 3.3_

  - [x] 4.2 Implement the ExpenseEditor component
    - Create `src/app/groups/[groupId]/expenses/expense-editor.tsx` with props `{ groupId, expenseId?, createPrefill?, runtimeFeatureFlags? }`
    - Load group via `useCurrentGroup()` (fallback `trpc.groups.get`), plus `profile.getProfile` and `categories.list`; in edit mode load `groups.expenses.get({ groupId, expenseId })`
    - Select `PaymentForm` vs `ExpenseForm` using `isPaymentMode` (from 2.1); build the participant list with `deriveEditorParticipants`; pass `singlePayerOnly` when outside friends are present (as the dialog does)
    - Render the outside-participant control as `scrollHeader` + the chosen form; render no `Dialog` shell and no Cancel button — the form supplies its own Save/Delete footer and its `PreventNavigation` guard handles leaving with a dirty form
    - Guard locked/consolidated payments with the existing locked-payment toast, then navigate back to the Detail_Page
    - _Requirements: 1.1, 1.2, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3_

  - [x] 4.3 Wire Editor save/delete/decomposition and return navigation
    - In `expense-editor.tsx`, port the **group** branches of the dialog's `handleSubmit`/`handleDelete`: `createGroupExpense`, `updateGroupExpense`, `deleteGroupExpense`, and the hybrid `createGlobalExpense` (group + outside friends), including the decomposition toast and the same query invalidations and success/error toasts
    - Decomposition toast is no longer Sonner: raise it with `toast.add` from `@/components/ui/toast` using `timeout: 0` and an action with an icon, and call `toast.close` after the redirect (not the old Sonner `toast(...)` call)
    - On finish or delete success, navigate with `getEditorReturnPath` (new → group expense list; edit → Detail_Page); on failure stay on the page with the form intact
    - _Requirements: 1.4, 2.4, 2.5, 2.6, 5.3_

  - [ ]\* 4.4 Write unit tests for ExpenseEditor
    - Reimbursement expense/prefill renders `PaymentForm`, otherwise `ExpenseForm` (R1.4); a decomposing save fires the decomposition toast and a plain save fires the success toast (R2.6); the control offers friend-add but no group selection (R3.2); locked payment short-circuits to the Detail_Page
    - _Requirements: 1.4, 2.6, 3.2_

- [x] 5. Create the New_Page and Edit_Page route shells
  - [x] 5.1 Create the New_Page beside the dynamic expense route
    - Create `src/app/groups/[groupId]/expenses/new/page.tsx` (server: awaits `params`, sets title metadata) and `new/page.client.tsx` (client: calls `consumeExpensePrefill(groupId)` once on mount, renders `ExpenseEditor` with the result or `undefined`)
    - Placement note: `new/` sits alongside `[expenseId]/`; the static `new` segment wins over the dynamic `[expenseId]`, so `new` is never treated as an expense id. Verify the detail route still resolves for real ids
    - _Requirements: 1.1, 2.3, 2.5_

  - [x] 5.2 Create the Edit_Page under the expense route
    - Create `src/app/groups/[groupId]/expenses/[expenseId]/edit/page.tsx` (server: awaits `params`) and `edit/page.client.tsx` (renders `ExpenseEditor` with `expenseId`)
    - _Requirements: 1.2, 2.4_

  - [ ]\* 5.3 Write structural tests for the pages
    - Assert both New_Page and Edit_Page render `ExpenseEditor` and do not import `ExpenseForm`/`PaymentForm` directly (R1.3); assert `[expenseId]/page.tsx` still renders `ExpenseDetail` and not the Editor (R1.5); assert route ordering so `new` is not matched as an expense id
    - _Requirements: 1.3, 1.5_

- [x] 6. Checkpoint - Editor renders on both pages
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Repoint group entries from dialog events to navigation
  - [x] 7.1 Convert the group open helpers to navigation
    - In `src/lib/expense-dialog-events.ts`, change `openEditGroupExpense` and `openCopyGroupExpense` to be navigation-driven (accept a router / return a target that the caller pushes): edit → `getGroupExpenseEditPath`; copy → `stashExpensePrefill` then push `getGroupExpenseNewPath`. Leave the friend/direct helpers unchanged
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 7.2 Repoint expense-detail and expense-card entries
    - `src/components/expense-detail/expense-detail.tsx` and `src/app/groups/[groupId]/expenses/expense-card.tsx`: `onEdit` navigates to the Edit_Page; copy stashes prefill then navigates to the New_Page. Ensure no `edit-group-expense`/`create-group-expense` event is dispatched from these paths
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 7.3 Repoint create-from-receipt and update its preservation test
    - In `src/app/groups/[groupId]/expenses/create-from-receipt-button.tsx`, replace the `window.dispatchEvent('create-group-expense', …)` continue handler with `stashExpensePrefill(group.id, prefill)` then navigate to `getGroupExpenseNewPath(group.id)` (keep the same prefill payload, including `items`)
    - In `src/app/groups/__tests__/ui-button-preservation.property.test.tsx`, update `createFromReceiptPreservesClickBehavior` so the `opensCreateExpense` assertion no longer requires the string `create-group-expense`; assert the new stash-then-navigate behavior instead (e.g. references to `stashExpensePrefill` / the new-path helper). Keep the Dialog/Drawer/receipt/file-upload assertions intact
    - _Requirements: 2.2, 2.3_

  - [x] 7.4 Repoint reimbursement-list entry
    - In `src/app/groups/[groupId]/reimbursement-list.tsx`, replace the `create-group-expense` dispatch in `openSettlementExpense` with `stashExpensePrefill(groupId, prefill)` then navigate to the New_Page (payment prefill preserved, so the Editor opens in payment mode)
    - _Requirements: 2.2, 2.3_

  - [ ]\* 7.5 Write navigation tests for the entries
    - With a mocked router, activating each Group_Edit_Entry / Group_Create_Entry pushes the expected path and dispatches no group event and opens no dialog (R2.1, R2.2); copy/receipt/payment entries stash a prefill that the New_Page then applies to the form (R2.3)
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 8. Trim FloatingCreateExpense to friend-only and route the FAB
  - [x] 8.1 Drop group event listeners and route the FAB
    - In `src/components/floating-create-expense.tsx`, remove the `create-group-expense` and `edit-group-expense` listeners and their handlers; keep `create-direct-expense` and `edit-direct-expense` and all friend/direct save branches
    - Depends on tasks 7.2, 7.3, and 7.4: this listener removal MUST land only after edit, copy, receipt, and reimbursement have been repointed to navigation. If 8.1 lands first, those entries would dispatch `create-group-expense`/`edit-group-expense` events with no listener to handle them
    - Change the FAB (`openForCreate`) to use `resolveAddExpenseTarget(pathname)`: navigate to the New_Page for a group route, open the dialog otherwise
    - _Requirements: 2.1, 2.2, 4.1, 4.2, 4.3_

  - [ ]\* 8.2 Write friend-only preservation tests
    - Friend/direct create and edit still open `FloatingCreateExpense` (R4.1); the FAB opens the dialog on a non-group route and navigates on a group route (R4.2, R4.3)
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 9. Final checkpoint - integration and full verification
  - [x] 9.1 Verify Edit_Page load and CRUD parity via integration tests
    - With mocked tRPC, the Edit_Page loads the identified expense into the form; save/update/delete call the same procedures with the same payloads as the dialog did (R5.3); Back from Edit returns to the Detail_Page and Back from New returns to the group expense list (R2.4, R2.5)
    - _Requirements: 2.4, 2.5, 5.3_

  - [x] 9.2 Checkpoint
    - Run `pnpm check-types`, `pnpm lint`, and `pnpm test`; ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Property tests use `fast-check` under Jest at `{ numRuns: PBT_NUM_RUNS }` (100) and each carries a `// Feature: group-expense-editor-pages, Property N: ...` tag referencing its design property.
- Properties 1–7 are each implemented by a single property test; the pure helpers (`expense-editor-navigation.ts`, `expense-prefill-store.ts`, `expense-editor-participants.ts`) are extracted so they can be exercised without rendering.
- Cancel is handled by navigation plus the forms' existing `PreventNavigation` guard — no Cancel footer button is added.
- Each task builds on the previous: pure helpers → Editor → pages → entry repointing → dialog trim → integration, with no orphaned code.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.5", "2.1"] },
    {
      "id": 1,
      "tasks": ["1.2", "1.3", "1.4", "1.6", "2.2", "2.3", "2.4", "4.1"]
    },
    { "id": 2, "tasks": ["4.2"] },
    { "id": 3, "tasks": ["4.3", "4.4"] },
    { "id": 4, "tasks": ["5.1", "5.2"] },
    { "id": 5, "tasks": ["5.3", "7.1"] },
    { "id": 6, "tasks": ["7.2", "7.3", "7.4"] },
    { "id": 7, "tasks": ["8.1"] },
    { "id": 8, "tasks": ["7.5", "8.2", "9.1"] }
  ]
}
```
