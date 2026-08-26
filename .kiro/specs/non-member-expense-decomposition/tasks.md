# Implementation Plan: Non-Member Expense Decomposition

## Overview

This plan implements atomic expense decomposition when a group expense includes non-members in `paidFor`. The work is organized into eight phases: foundation (pure logic, no DB), schema migration, server logic, balance/friend ledger, UI, recurring guard UI, i18n, and integration/property tests. Each phase builds on the previous so no orphaned code exists at any checkpoint. All amounts use integer minor currency units throughout.

## Tasks

- [x] 1. Extract `randomId` and create `src/lib/random-id.ts`
  - [x] 1.1 Create `src/lib/random-id.ts` and update `api.ts` import
    - Create `src/lib/random-id.ts` exporting `randomId(): string { return nanoid() }`
    - Update `src/lib/api.ts` to import `randomId` from `@/lib/random-id` instead of defining it locally; remove local definition and `import { nanoid } from 'nanoid'`
    - _Requirements: 2.1 (design decision 6)_

- [x] 2. Implement `computeDecompositionSlots` pure arithmetic function
  - [x] 2.1 Create `src/lib/decompose-expense.ts` with `computeDecompositionSlots`
    - Create the file with `DecomposeInput`, `DecomposeResult`, and slot-result type exports
    - Implement `computeDecompositionSlots(values, group)` as a pure exported function (no DB):
      - Derive `decimalDigits` via `getCurrency(group.currencyCode ?? group.currency).decimal_digits`
      - Partition `paidFor` into `memberPaidFor` and `nonMemberPaidFor` using `group.participants`
      - For `BY_AMOUNT`: use `pf.shares` as minor-unit slots directly; no distributor call
      - For `EVENLY`: call `distributeEqualAmounts(totalMajor, combinedCount, decimalDigits)` once (members-first order); convert major slots → minor via `Math.round(slot * factor)`
      - For `BY_SHARES` / `BY_PERCENTAGE`: call `distributeWeightedAmounts(totalMajor, combinedWeights, decimalDigits)` once (members-first order); convert to minor units
      - Filter zero-slot non-members; return `null` when all non-member slots are zero
      - Return `{ memberEntries, directHalfEntries, groupHalfAmount }` otherwise
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 12.4_

- [x] 3. Implement `decomposeExpense` transaction helper
  - [x] 3.1 Add `decomposeExpense` async function to `src/lib/decompose-expense.ts`
    - Implement `decomposeExpense(input, existingExpenseId, tx)` writing inside an already-open Prisma transaction:
      - Step 0: if `existingExpenseId`, read `previousAmount` via `tx.expense.findUnique` before any write
      - Call `computeDecompositionSlots`; return `null` if it returns `null`
      - Set `expenseCurrencyCode = group.currencyCode ?? group.currency`
      - **Create path** (`existingExpenseId = undefined`): `tx.expense.create` for Group_Half with `id = randomId()`, `splitMode = 'BY_AMOUNT'`, `creationMethod = 'NON_MEMBER_SPLIT'`, `linkedExpenseId = null`, `originalTotalAtDecomposition = values.amount`; include nested `paidFor`, `payers`, `documents` creates
      - **Update path** (`existingExpenseId` defined): `tx.expense.update` on the existing row (preserving `documents`, `notes`, `originalAmount`, `originalCurrency`, `conversionRate`, `recurringExpenseLink`); then `tx.expense.findUniqueOrThrow` to fetch the full row with `expenseInclude`
      - For each `directHalfEntries` entry: `tx.expense.create` with `groupId = null`, `splitMode = 'BY_AMOUNT'`, `creationMethod = 'NON_MEMBER_SPLIT'`, `linkedExpenseId = groupHalfRow.id`, `expenseCurrencyCode` set, `originalTotalAtDecomposition = null`; `paidFor` one entry with `shares = entry.amount`; `payers` one entry
      - Log activity via `tx.activity.create` with `ActivityType.CREATE_EXPENSE` or `UPDATE_EXPENSE`; include `amount`, `paidBy`, `paidFor` `ActivityChange` rows; use `previousAmount` captured in step 0
      - Return `{ groupHalf: Expense, directHalves: Array<{ id, nonMemberId, amount }> }`
    - Import `randomId` from `@/lib/random-id`
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.12, 9.1, 9.2, 9.3_

- [x] 4. Unit and property tests for `computeDecompositionSlots` and `decomposeExpense` arithmetic
  - [x] 4.1 Write unit tests for `computeDecompositionSlots`
    - Create `src/lib/__tests__/decompose-expense.test.ts`
    - EVENLY **2 members + 1 non-member**, total 10000 → groupHalf 6667, direct 3333 (matches worked example: 3 participants total, 10000/3 ≈ 3333 each, first 2 slots go to members)
    - EVENLY remainder: total 1 minor unit, 2 members + 1 non-member → slot[0]=1, slot[1]=0, slot[2]=0; only member slot[0]=1 retained; returns `null` because directHalfEntries is empty
    - BY_SHARES: weighted; assert conservation (P1) + Group_Half internal consistency (P2)
    - BY_PERCENTAGE: weighted; assert P1 + P2
    - BY_AMOUNT: explicit amounts; verify no factor multiplication (shares passed through as-is; 3333 stays 3333, not 333300)
    - JPY (`decimalDigits = 0`): total 10000, 2 members + 1 non-member → whole-number slots, sum = 10000
    - **Note:** `originalTotalAtDecomposition`, `linkedExpenseId`, and `expenseCurrencyCode` are fields set by `decomposeExpense` (the DB writer), not by `computeDecompositionSlots` (pure arithmetic). Test those fields in task 20.3 against the actual DB writer.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 12.1_

  - [x] 4.2 Write property test Suite 1 — amount conservation, Group_Half consistency, non-negative amounts
    - Create `src/lib/__tests__/decompose-expense.property.test.ts`
    - **Property 1: Amount Conservation** — `groupHalf.amount + sum(directHalves[i].amount) === originalTotal`
    - **Property 2: Group_Half Internal Consistency** — `sum(groupHalf.paidFor[j].shares) === groupHalf.amount`
    - **Property 3: Non-Negative Direct_Half Amounts** — every persisted Direct_Half has `amount > 0`
    - Generate: `fc.integer({ min: 1, max: 1_000_000 })` (total), `fc.integer({ min: 1, max: 10 })` (members), `fc.integer({ min: 1, max: 5 })` (non-members), `fc.constantFrom('EVENLY', 'BY_SHARES', 'BY_PERCENTAGE', 'BY_AMOUNT')` (splitMode)
    - Use `runDecomposeArithmetic` helper that calls `computeDecompositionSlots` directly (no DB); minimum 100 runs
    - **Validates: Requirements 2.9, 3.6, 3.7, 12.2, 12.3, 12.4**

- [x] 5. Checkpoint — Foundation complete (pure logic, no DB)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Schema migration — add 3 columns, 1 enum value, 1 index
  - [x] 6.1 Add `NON_MEMBER_SPLIT` to `CreationMethod` enum and new fields to `Expense` model in `prisma/schema.prisma`
    - Add `NON_MEMBER_SPLIT` as third value in the `CreationMethod` enum
    - Add `linkedExpenseId String?` on `Expense` — Direct_Half only: Group_Half id; null elsewhere
    - Add `expenseCurrencyCode String?` on `Expense` — Direct_Half only: originating group currency; null elsewhere
    - Add `originalTotalAtDecomposition Int?` on `Expense` — Group_Half only: original total at decomposition (minor units)
    - Add `@@index([linkedExpenseId])` to `Expense` model for efficient reverse lookup
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6_

  - [x] 6.2 Write and apply idempotent SQL migration
    - Create `prisma/migrations/XXXXXX_non_member_decomposition/migration.sql` with:
      ```sql
      DO $$ BEGIN
        ALTER TYPE "CreationMethod" ADD VALUE 'NON_MEMBER_SPLIT';
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
      ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "linkedExpenseId" TEXT;
      ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "expenseCurrencyCode" TEXT;
      ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "originalTotalAtDecomposition" INTEGER;
      CREATE INDEX IF NOT EXISTS "Expense_linkedExpenseId_idx" ON "Expense"("linkedExpenseId");
      ```
    - Run `npx prisma migrate deploy` and verify no existing rows are modified
    - Run `npx prisma generate` to regenerate the Prisma client
    - _Requirements: 1.5, 1.6_

- [x] 7. Modify `src/lib/api.ts` — `createExpense`, `updateExpense`, `deleteExpense`
  - [x] 7.1 Add non-member guards and decomposition path to `createExpense`
    - Remove the existing `BAD_REQUEST` that rejects non-members from `paidFor` ("User X is not a group member")
    - After existing payer dedup/sum validations, add five guards (execute before any DB write):
      1. Non-member in `paidBy` → `BAD_REQUEST`: "Non-members cannot be payers of a group expense."
      2. Multiple payers + any non-member in `paidFor` → `BAD_REQUEST`: "Expenses with non-members must have a single payer."
      3. `isReimbursement = true` + any non-member in `paidFor` → `BAD_REQUEST`: "Reimbursements cannot include non-members."
      4. `recurrenceRule ≠ NONE` + any non-member in `paidFor` → `BAD_REQUEST`: "Recurring expenses cannot include non-members."
      5. `hasNonMembers && memberPaidFor.length === 0` → `BAD_REQUEST`: "A group expense must include at least one group member."
    - When `hasNonMembers`: call `upsertFriendByEmail` (global `prisma`, outside tx) for each non-member; then `prisma.$transaction(async (tx) => decomposeExpense({ values, group, actorUserId: userId! }, undefined, tx))`; if non-null return `result.groupHalf as Expense`; if null fall through to regular path
    - Leave regular path unchanged
    - _Requirements: 2.1, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 2.11_

  - [x] 7.2 Add non-member guards and decomposition path to `updateExpense`
    - Add the same four non-member guards as in `createExpense` (7.1)
    - Add guard: `existingExpense.creationMethod === 'NON_MEMBER_SPLIT' && hasNonMembers` → `BAD_REQUEST`: "This expense has already been split. Edit the direct expense separately."
    - Add guard: `hasNonMembers && memberPaidFor.length === 0` → `BAD_REQUEST`: "A group expense must include at least one group member."
    - When `hasNonMembers`: call `upsertFriendByEmail` outside tx for each non-member; then `prisma.$transaction(async (tx) => decomposeExpense({ values, group, actorUserId: userId! }, expenseId, tx))`; if non-null return `result.groupHalf as Expense`; if null fall through to regular path
    - Leave regular update path unchanged
    - _Requirements: 2.2, 2.3, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 11.1_

  - [x] 7.3 Update `deleteExpense` to nullify `linkedExpenseId` on Direct_Halves in same transaction
    - Wrap the existing `prisma.expense.delete` in a `prisma.$transaction`
    - Before deleting, run `tx.expense.updateMany({ where: { linkedExpenseId: expenseId }, data: { linkedExpenseId: null } })`
    - Then `tx.expense.delete({ where: { id: expenseId } })`
    - _Requirements: 11.4_

- [x] 8. Rewrite existing non-member rejection tests to expect decomposition
  - [x] 8.1 Rewrite `src/lib/__tests__/api-multi-payer-validation.test.ts` for decomposition
    - Update the tests that previously asserted `BAD_REQUEST` for non-member in `paidFor` ("User X is not a group member") to instead assert successful decomposition
    - Verify the returned expense is a Group_Half (`creationMethod = 'NON_MEMBER_SPLIT'`, `splitMode = 'BY_AMOUNT'`)
    - Verify a corresponding Direct_Half was created with correct `linkedExpenseId` and `expenseCurrencyCode`
    - Also update `.kiro/specs/user-profile-and-participants/` Property 2 ("Expense creation rejects non-members") to expect decomposition instead of `BAD_REQUEST`
    - _Requirements: 2.1, 2.2_

- [x] 9. Update tRPC groups router — return decomposition metadata
  - [x] 9.1 Extend `createExpense` and `updateExpense` tRPC procedures to return `decomposition` metadata
    - Wrap the `api.ts` result in a response envelope:
      ```typescript
      type CreateExpenseResponse = {
        expense: Expense
        decomposition?: {
          groupHalfAmount: number
          directHalves: Array<{ nonMemberName: string; amount: number }>
        }
      }
      ```
    - After `api.ts` returns the Group_Half, resolve non-member names from `nonMemberPaidFor` user records and populate `decomposition` when decomposition occurred
    - Return `decomposition: undefined` for all-member expenses
    - **Update all callers** of these procedures (group expense form, any other tRPC client) to use `result.expense` (not `result` directly) for the returned `Expense` object, since the return type is now an envelope
    - _Requirements: 7.1, 7.2_

  - [x] 9.2 Extend `getExpense` and `getGroupExpenses` selects to include new decomposition fields
    - Add `linkedExpenseId`, `expenseCurrencyCode`, and `originalTotalAtDecomposition` to the `select` clauses of `getExpense` and `getGroupExpenses` in `src/lib/api.ts`
    - These fields are required by tasks 17.1 (Group_Half audit note) and 17.2 (Direct_Half "part of a split" banner) to render without extra round-trips
    - `creationMethod` is already selected; verify it is included
    - _Requirements: 8.1, 8.2, 11.6, 11.7_

- [x] 10. Refactor `createGlobalExpense` in `src/trpc/routers/friends/index.ts`
  - [x] 10.1 Replace inline EVENLY arithmetic with `decomposeExpense` when group + non-members present
    - Build `mappedFormValues: ExpenseFormValues` with `splitMode: 'BY_AMOUNT'`, `title: input.title` (not `values.title`), `amount: totalAmountMinor` (minor units), `paidBy: [{ participant: paidByUserId, amount: totalAmountMinor }]`, `paidFor` from `sharesMap` entries
    - When `input.groupId` is set and non-members exist: call `upsertFriendByEmail` for each non-member outside tx; then `prisma.$transaction(async (tx) => decomposeExpense({ values: mappedFormValues, group: resolvedGroup, actorUserId: ctx.user.id }, undefined, tx))`
    - When result is non-null, return `{ groupHalf: result.groupHalf, directHalves: result.directHalves }`
    - Keep existing direct-expense creation path as fallback when `decomposeExpense` returns null or no group
    - _Requirements: 2.1 (design decision 13)_

  - [x] 10.2 Update `src/components/floating-create-expense.tsx` (FAB) for new return shape
    - Update result handling to use `groupHalf.id` for navigation/display instead of legacy `expenseIds[0]`
    - Handle the `{ groupHalf, directHalves }` return shape from `createGlobalExpense`
    - _Requirements: 2.1 (design decision 13)_

- [x] 11. Checkpoint — Server logic complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Friend balance currency bucketing
  - [x] 12.1 Add `expenseCurrencyCode` to `getDirectExpensesBetweenUsers` select in `src/lib/friend-balances-db.ts`
    - Add `expenseCurrencyCode: true` to the `select` clause in `getDirectExpensesBetweenUsers`
    - _Requirements: 1.7_

  - [x] 12.2 Implement `buildDirectBuckets` utility
    - Add `buildDirectBuckets(directExpenses, fallbackCurrency)` to `src/lib/friend-balances.ts` (or a new helper adjacent to it):
      - Group expenses by `expenseCurrencyCode` (when non-null) via `getCurrency(code)`
      - Expenses with `expenseCurrencyCode = null` fall into the `fallbackCurrency` bucket
      - Return `Array<{ currency: Currency; expenses: typeof directExpenses }>` filtering empty buckets
    - _Requirements: 1.7, 14.4_

  - [x] 12.3 Apply `buildDirectBuckets` in `listWithBalances`, `getBalanceDetail`, and `getTimeline`
    - In `src/trpc/routers/friends/index.ts`, replace the single-bucket `[{ currency: directCurrency, expenses: directExpenses }]` construction in all three procedures with `buildDirectBuckets(directExpenses, directCurrency)`
    - Pass the resulting array (or `undefined` when empty) to `computeFriendBalance` and `computeFriendSettlements`
    - _Requirements: 1.7_

- [x] 13. Expense_Form — Participant_Picker and Payer_Selector updates
  - [x] 13.1 Fetch non-member friends and extend Participant_Picker
    - In `src/app/groups/[groupId]/expenses/expense-form.tsx`, query `trpc.friends.list` to obtain the current user's friends; build `nonMemberFriends` list (friends whose `friendUserId` is not in `group.participants`)
    - Render `nonMemberFriends` below group members in the `paidFor` picker with a "Not in group" badge
    - Hide non-member options in edit mode for an already-`NON_MEMBER_SPLIT` expense (R5.7)
    - Hide non-member options when `recurrenceRule ≠ NONE` (R13.3)
    - _Requirements: 5.1, 5.2, 5.5, 5.6, 5.7, 13.3_

  - [x] 13.2 Handle add/remove non-member share redistribution
    - When a non-member is added to `paidFor`: redistribute total equally among all `paidFor` participants using `distributeEqualAmounts`; zero total → zero shares
    - When a non-member is removed: redistribute their share equally among remaining participants
    - _Requirements: 5.3, 5.4_

  - [x] 13.3 Enforce single-payer mode when non-members are present
    - When at least one non-member is in `paidFor`, collapse `paidBy` to a single entry and disable multi-payer adding
    - Display inline note in Payer_Selector: "Expenses with non-members can only have one payer."
    - Re-enable multi-payer when the last non-member is removed
    - _Requirements: 5.8_

- [x] 14. Decomposition_Banner component
  - [x] 14.1 Create `src/components/decomposition-banner.tsx`
    - Props: `nonMembers: Array<{ userId: string; name: string; amountMajor: number }>`, `groupHalfAmountMajor: number`, `currency: Currency`
    - Render `null` when `nonMembers.length === 0` or all `amountMajor` are zero
    - One line per non-member using i18n key `ExpenseForm.decompositionBanner.nonMemberLine`
    - Group-half summary line using `ExpenseForm.decompositionBanner.groupHalfLine` when `groupHalfAmountMajor > 0`
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6_

  - [x] 14.2 Wire `DecompositionBanner` into `expense-form.tsx` with live form state
    - Compute minor-unit amount from `formValues.amount * factor`; convert BY_AMOUNT shares to minor units
    - Call `computeDecompositionSlots` with minor-unit form values; convert returned minor-unit slots back to major units for display
    - Render `<DecompositionBanner>` above the submit button; update reactively on form state change
    - _Requirements: 6.1, 6.4, 6.5_

- [x] 15. Post-save decomposition notification
  - [x] 15.1 Display persistent post-save notification when decomposition occurred
    - After a successful create/update that returns a `decomposition` field, display a persistent (no auto-dismiss) toast using the existing `sonner` library
    - Content: group-half amount, per-Direct_Half name + amount (i18n keys under `ExpenseForm.decompositionBanner`)
    - Include a link to the Group_Half detail view (navigates in same tab via `expense.id`)
    - When no decomposition occurred, show the standard single-record success notification unchanged
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 16. Checkpoint — UI form, banner, and notification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Audit banners on Group_Half and Direct_Half detail views
  - [x] 17.1 Add independent-edit warning and audit note to Group_Half detail view
    - In `src/components/expense-detail/expense-detail.tsx` (or equivalent), when `expense.creationMethod === 'NON_MEMBER_SPLIT'` and `groupId` is set:
      - While at least one Direct_Half with matching `linkedExpenseId` exists, show a persistent banner: "Editing or deleting this expense does not automatically update the associated direct expenses." (R11.6)
      - Show `originalTotalAtDecomposition` with caveat that it reflects the at-decomposition state (i18n key `ExpenseForm.decompositionBanner.groupHalfAuditNote`) (R8.1)
    - _Requirements: 8.1, 11.6_

  - [x] 17.2 Add "part of a split" note and link to Direct_Half detail view
    - In the direct expense detail view, when `expense.linkedExpenseId` is non-null:
      - Show persistent banner: "This expense is part of a split that also includes a group expense. Editing or deleting it does not affect the group record." (R11.7)
      - Provide a link to the Group_Half detail view resolved via `linkedExpenseId` (same tab)
      - Graceful degradation: if Group_Half no longer exists (404/null), show no audit note (no broken link) (R8.4)
    - When `linkedExpenseId` is null, render nothing
    - _Requirements: 8.2, 8.3, 8.4, 11.7_

- [x] 18. Recurring guard UI (R13)
  - [x] 18.1 Add inline validation error and picker restriction for recurring + non-member
    - In `src/app/groups/[groupId]/expenses/expense-form.tsx`, when `recurrenceRule ≠ NONE` and at least one non-member is in `paidFor`, display inline validation error: "Recurring expenses cannot include participants who are not group members."
    - Disable form submission while this condition holds
    - When the form is opened in edit mode for an expense with `recurrenceRule ≠ NONE`, do not surface non-member picker options (already enforced by 13.1, but verify the combined guard is active)
    - _Requirements: 13.1, 13.2, 13.3_

- [x] 19. i18n — all 19 locale files
  - [x] 19.1 Add `ExpenseForm.decompositionBanner` namespace to `messages/en-US.json`
    - Add keys under `ExpenseForm.decompositionBanner`:
      - `nonMemberLine` — per-non-member banner line (e.g. "{name} isn't in {group} — their {amount} share will be saved as a direct expense")
      - `groupHalfLine` — group-half summary line (e.g. "The group expense will be {amount}")
      - `postSaveTitle` — post-save notification title
      - `postSaveNonMemberLine` — per-non-member post-save line
      - `singlePayerNote` — single-payer restriction note for Payer_Selector
      - `groupHalfAuditNote` — original total caveat on Group_Half detail view (R8.1)
      - `directHalfAuditNote` — "part of a split" banner on Direct_Half detail view (R11.7)
      - `groupHalfIndependentEditWarning` — "Editing or deleting this expense does not automatically update the associated direct expenses." (R11.6)
      - `directHalfIndependentEditWarning` — "This expense is part of a split that also includes a group expense. Editing or deleting it does not affect the group record." (R11.7)
      - `notInGroupBadge` — "Not in group" badge label for Participant_Picker (R5.2)
      - `recurringNonMemberError` — inline validation error when recurring + non-member (R13.1)
    - _Requirements: 5.2, 6.6, 7.3, 8.1, 11.6, 11.7, 13.1, 15.1_

  - [x] 19.2 Add same keys to all 18 remaining locale files with English fallback values
    - Files: `ca.json`, `cs-CZ.json`, `de-DE.json`, `es.json`, `fi.json`, `fr-FR.json`, `it-IT.json`, `ja-JP.json`, `nl-NL.json`, `pl-PL.json`, `pt-BR.json`, `pt-PT.json`, `ro.json`, `ru-RU.json`, `tr-TR.json`, `ua-UA.json`, `zh-CN.json`, `zh-TW.json`
    - Use English strings as placeholders where translation is not yet available
    - _Requirements: 6.6, 7.3_

- [x] 20. Integration tests and property test Suite 2
  - [x] 20.5 Add `linkedExpenseId` to group JSON export
    - In the JSON export route handler, include `linkedExpenseId` on each exported expense row
    - For Group_Half rows the value is always `null` in a group export (Direct_Halves are excluded since `groupId = null`)
    - Verify the field appears in the export schema for schema consistency and forward compatibility
    - _Requirements: 8.5_

  - [x] 20.1 Write guard tests and integration tests in `src/lib/__tests__/api-non-member-decomposition.test.ts`
    - Non-member in `paidBy` → `BAD_REQUEST` "Non-members cannot be payers"
    - Multi-payer + non-member in `paidFor` → `BAD_REQUEST`
    - `isReimbursement + non-member` → `BAD_REQUEST`
    - `recurrenceRule ≠ NONE + non-member` → `BAD_REQUEST`
    - All `paidFor` non-members (zero member slots) → `BAD_REQUEST` "must include at least one group member"
    - Already-`NON_MEMBER_SPLIT` expense updated with non-member in payload → `BAD_REQUEST` "already been split"
    - All-member expense → regular group path, `creationMethod` not `NON_MEMBER_SPLIT`
    - Create group expense with 1 non-member → DB has Group_Half + 1 Direct_Half with correct fields
    - Update of not-yet-decomposed expense with non-member → existing row promoted in place (same `id`)
    - Delete Group_Half → `linkedExpenseId = null` on Direct_Halves; Direct_Halves still present
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 2.1, 2.2, 2.3, 2.9, 11.4_

  - [x] 20.2 Write property test Suite 2 — payer net-position via `getBalances`
    - In `src/lib/__tests__/decompose-expense.property.test.ts`
    - **Property 4: Payer Net-Position Invariant** — `payerGroupNet + payerDirectCredits === originalTotal − payerShare` for EVENLY splits
    - Build synthetic Group_Half and Direct_Half objects; call `getBalances([syntheticGroupHalf])` and `getBalances([dh])` for real
    - Minimum 100 runs
    - **Validates: Requirements 10.3, 12.5**

  - [x] 20.3 Write unit tests for `decomposeExpense` update/delete paths and `buildDirectBuckets`
    - In `src/lib/__tests__/decompose-expense.test.ts`
    - Update path: `decomposeExpense` with `existingExpenseId` uses `expense.update`; returned `groupHalf.id` equals existing id; Direct_Halves get new ids
    - Delete path: after deleting Group_Half, `linkedExpenseId = null` on linked Direct_Halves; Direct_Halves still queryable
    - Delete path: deleting a Direct_Half does not affect the Group_Half
    - `buildDirectBuckets`: mixed `expenseCurrencyCode` values produce separate buckets; `null` entries land in fallback bucket
    - _Requirements: 2.4, 11.4, 11.5, 1.7_

  - [x] 20.4 Write integration tests for balance correctness in `src/lib/__tests__/api-non-member-decomposition.test.ts`
    - `listWithBalances` / `getBalanceDetail` / `getTimeline` return per-currency buckets for Direct_Halves with `expenseCurrencyCode`
    - Balance invariant: after decomposition, payer's group net + friend-ledger net = `originalTotal − payerShare`
    - _Requirements: 10.2, 10.3, 1.7_

- [x] 21. Seed data update
  - [x] 21.1 Add a decomposed expense example to `prisma/seed.ts`
    - Add one Group_Half expense to an existing seeded group (e.g. Casa) with `creationMethod = 'NON_MEMBER_SPLIT'`, `splitMode = 'BY_AMOUNT'`, `originalTotalAtDecomposition` set
    - Add the corresponding Direct_Half (`groupId = null`, `linkedExpenseId = groupHalf.id`, `expenseCurrencyCode` set)
    - Ensure seed is idempotent (safe to re-run with `pnpm seed`)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 22. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP (20.3, 20.4)
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key integration boundaries
- The design uses TypeScript throughout (Next.js 16, App Router, tRPC, Prisma, PostgreSQL)
- `computeDecompositionSlots` is a pure function — safe to call from both server (decomposition logic) and client (Decomposition_Banner preview) with identical results; banner calls it with a minor-unit conversion (`Math.round(formValues.amount * factor)`) then divides back for display
- `decomposeExpense` reads `previousAmount` from the DB in step 0 **before** the `tx.expense.update` call, not after
- Direct_Half amounts are always in group-currency minor units; FX conversion happens upstream in `api.ts` before `decomposeExpense` is called
- Zero-slot non-members are excluded silently; if ALL non-member slots are zero, `computeDecompositionSlots` returns `null` and the expense is saved as a regular group expense with no `NON_MEMBER_SPLIT` tag
- `balances.ts` requires no changes — Direct_Halves with `BY_AMOUNT` and single-entry `paidFor` produce correct balances through existing logic
- `deleteExpense` guard: `assertPaymentEditable` runs before the `linkedExpenseId` nullification; the existing `DELETE_EXPENSE` activity log call remains in place
- `decomposeExpense` returns the full `Expense` row using `expenseInclude` (same shape as `createExpense`); tRPC callers can re-query Direct_Halves by `linkedExpenseId` for the toast notification — `api.ts` does not need to return them
- Phase 3 ordering is critical: task 8.1 (rewrite existing tests) must come before tasks 9–10 to avoid spurious test failures while the guards are being added
- i18n task 19 should be completed before UI tasks 13–17 are tested end-to-end to avoid raw key display during development
- Property tests use `fast-check` (already present in the repo); run with `pnpm test`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["4.1", "4.2"] },
    { "id": 4, "tasks": ["6.1", "6.2"] },
    { "id": 5, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 6, "tasks": ["8.1"] },
    { "id": 7, "tasks": ["9.1", "9.2", "10.1", "19.1", "19.2"] },
    { "id": 8, "tasks": ["10.2", "12.1"] },
    { "id": 9, "tasks": ["12.2"] },
    { "id": 10, "tasks": ["12.3", "13.1"] },
    { "id": 11, "tasks": ["13.2", "13.3", "14.1"] },
    { "id": 12, "tasks": ["14.2", "15.1"] },
    { "id": 13, "tasks": ["17.1", "17.2", "18.1"] },
    { "id": 14, "tasks": ["20.1", "20.2", "20.3", "20.4", "20.5", "21.1"] }
  ]
}
```
