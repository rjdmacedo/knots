# Implementation Plan: Itemized Expenses

## Overview

Optional itemized expenses collapsed into the existing `BY_AMOUNT` `paidFor.shares` path — no `SplitMode.ITEMIZED`, no read-time balance re-derivation. The plan has two layers:

- **Phase 0 (v1.0, already implemented)** — the pure splitter, `ExpenseItem` schema, currency-conversion-of-shares, form schema, persistence, form UI, receipt prefill, JSON export, i18n, and tests, using two `taxAmount` / `tipAmount` columns and an implicit "itemized iff items exist" rule. This layer is shipped in the working tree and is the starting point.
- **Phase 1+ (v1.1 amendment, this pass)** — align with the `spliit-cloud` product model per the amended requirements (12–19) and the **v1.1 Design Amendment**: an explicit `itemsAuthoritative` marker, a documentation-vs-authoritative gate with confirmation dialogs, a single signed "Other" remainder pool (`remainderAmount` + `remainderAllocationMode` + `remainderSplitMode` + `ExpenseRemainderShare`) replacing tax/tip, an editable total with an overshoot guard, and the FX bugfix (Entry_Total = editable `originalAmount`). R14 (unit×qty) and R15 (all-items split control) are **deferred** and named at the end.

Invariants carried through every phase (integer minor units unless noted):

- The `Item_Splitter` works in **minor units end to end**; it applies the *remainder policies* of `distributeEqualAmounts` / `distributeWeightedAmounts` inline (those helpers take/return major units). The one direct call is the currency conversion of shares (`convertedTotalMinor / factor` in, `× factor` back to minor).
- Items and the remainder are stored in the **Entry_Currency**; `ExpensePaidFor.shares` holds the authoritative **Group_Currency** per-participant amounts.
- "Itemized" is read from `Expense.itemsAuthoritative`, **never** from `items.length > 0`.
- The remainder (`remainderAmount` + mode + shares) is the **single source of truth** for tax/tip/service; there are no `taxAmount` / `tipAmount` columns.
- Itemization cannot be authoritative for reimbursements or recurrence ≠ NONE.
- Cent-exactness holds for both `PROPORTIONAL` and `CUSTOM` remainder allocation; property tests are required.

---

## Tasks

### Phase 0 — v1.0 baseline (already implemented; do not redo)

These tasks are complete in the working tree and are listed only for traceability. Phase 1 modifies several of them.

- [x] 0.1 Pure `computeItemizedShares(items, taxMinor, tipMinor)` + unit/property tests (`src/lib/itemized-split.ts`, `__tests__/itemized-split*.test.ts`)
- [x] 0.2 `convertSharesToGroupCurrency` + tests
- [x] 0.3 Prisma `ExpenseItem`, `ExpenseItemAssignment`, `Expense.taxAmount/tipAmount`, migration `20260924141825_add_itemized_expenses`
- [x] 0.4 `expenseFormSchema.itemization { enabled, items, taxAmount, tipAmount }` + validation + `BY_AMOUNT` collapse transform + schema tests
- [x] 0.5 Persistence in `api.ts` (`buildItemizationCreateData` / `buildItemizationUpdateData`), `applyItemizedConversion` threaded into create/update procedures, `getExpense` include
- [x] 0.6 Form editor `itemized-expense-editor.tsx` (toggle, items, tax/tip, derived read-only total), receipt prefill, JSON export, i18n, integration tests

---

### Phase 1 — Remainder model + authoritative marker (schema & pure logic)

- [x] 1. Migrate the schema to the remainder + marker model
  - [x] 1.1 Amend `prisma/schema.prisma`
    - On `Expense`: add `itemsAuthoritative Boolean @default(false)`, `remainderAmount Int?`, `remainderAllocationMode RemainderAllocationMode?`, `remainderSplitMode SplitMode?`, `remainderShares ExpenseRemainderShare[]`; **remove** `taxAmount` and `tipAmount`
    - Add enum `RemainderAllocationMode { PROPORTIONAL CUSTOM }`
    - Add model `ExpenseRemainderShare { expenseId, userId, shares Int, @@id([expenseId, userId]), @@index([userId]) }` (same shape as `ExpensePaidFor`; split mode lives on `Expense.remainderSplitMode`, not per row), cascade-delete on both relations
    - Add `User.expenseRemainderShares ExpenseRemainderShare[] @relation("UserExpenseRemainderShares")`
    - _Requirements: 1.6, 1.7, 12.5, 16.1, 16.2_

  - [x] 1.2 Generate the migration with backfill
    - `npx prisma migrate dev --name itemized_remainder_and_marker`
    - Hand-write the backfill in the generated SQL: for rows with items, `remainderAmount = coalesce(taxAmount,0)+coalesce(tipAmount,0)`, `remainderAllocationMode = 'PROPORTIONAL'`, `itemsAuthoritative = true`; then drop `taxAmount` / `tipAmount` (no-op on empty dev data, safe if any rows exist)
    - Run `npx prisma generate`; confirm non-itemized expenses are unaffected (new columns null / default false)
    - _Requirements: 16.7 (fold tax/tip into remainder), 6.4_

- [x] 2. Generalise the pure splitter to `(items, remainder)`
  - [x] 2.1 Replace tax/tip with a remainder in `computeItemizedShares` (`src/lib/itemized-split.ts`)
    - New input shape: `ItemizedInput { participantIdsInOrder; items; remainder: { amountMinor: number (signed); allocationMode: 'PROPORTIONAL'|'CUSTOM'; splitMode?: SplitMode; paidFor?: Array<{ participantId; shares }> } }`
    - Per-item equal split + `Item_Subtotal` accumulation: **unchanged**
    - `PROPORTIONAL`: distribute `remainder.amountMinor` by `Item_Subtotal` weights using the existing largest-fractional-part policy (the old tax/tip path over one pool); zero-subtotal fallback = equal split across assigned participants
    - `CUSTOM`: distribute `remainder.amountMinor` by `remainder.paidFor` / `remainder.splitMode` reusing the integer distributor policies exactly as `computeDecompositionSlots` interprets `paidFor` per `splitMode`
    - `Participant_Share = Item_Subtotal + remainderSlice`; assert `Σ shares === Σ items + remainder` (signed)
    - _Requirements: 16.3, 16.4, 16.5, 5.1, 5.4_

  - [x] 2.2 Update splitter unit + property tests
    - Migrate existing tax/tip tests to the `PROPORTIONAL` remainder (behaviour must be identical); add `CUSTOM` cases (each flat split mode) and signed/zero remainder cases
    - Property tests (fast-check ≥100 runs): cent-exactness for both modes; remainder slices sum to `remainderAmount`; item subtotals sum to `Σ items`; zero-subtotal fallback stays exact; monotonicity for PROPORTIONAL
    - _Requirements: 5.1, 5.3, 16.5_

  - [x] 2.3 Port the overshoot helper
    - Add a small pure `itemsExceedExpenseAmount(itemsSumMinor, expenseTotalMinor)` (signed: `total < 0 ? items < total : items > total`) in `src/lib/itemized-split.ts`; unit tests for positive and negative expenses
    - _Requirements: 17.2, 16.6_

### Phase 2 — Form schema & the documentation/authoritative gate

- [x] 3. Reshape the form schema for marker + remainder
  - [x] 3.1 Amend `expenseFormSchema.itemization` (`src/lib/schemas.ts`)
    - Replace `enabled` with `authoritative: boolean`; replace `taxAmount` / `tipAmount` with `remainder { amount?: number; allocationMode: 'PROPORTIONAL'|'CUSTOM'; splitMode?: SplitMode; paidFor?: Array<{ participant; shares }> }`
    - Keep items shape (`title`, expression-capable `amount`, `assignedParticipants.min(1)`)
    - _Requirements: 12.5, 16.1, 16.2_

  - [x] 3.2 Update validation in `superRefine`
    - Read authoritative from `itemization.authoritative` (not item presence)
    - When authoritative: `itemsRequired` (≥1 item), `itemNeedsAssignment`, `itemAssignmentUnknownParticipant`, block for reimbursement/recurrence (`itemizationNotAllowedHere`)
    - Add `itemsExceedAmount` when `Σ items` overshoots the total in sign direction (Requirement 17.2); CUSTOM remainder rows must reference current participants
    - Remove the read-only-total assumption (the total is editable now)
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 1.8, 17.2_

  - [x] 3.3 Update the `.transform`
    - When `authoritative`: force `splitMode = 'BY_AMOUNT'`, drop zero-share participants (backstop), leave `paidFor` in major units (single minor conversion still in `proceedWithSubmit`)
    - When not authoritative: leave the legacy `splitMode` / `paidFor` untouched even if items are present (documentation)
    - _Requirements: 5.4, 5.5, 12.1_

  - [x] 3.4 Schema tests
    - Documentation state: items present + legacy split → `paidFor` is the legacy split, unchanged
    - Authoritative state: collapses to `BY_AMOUNT`, zeros dropped
    - Overshoot blocks; reimbursement/recurrence block authoritative; CUSTOM remainder validation
    - _Requirements: 8.x, 12.1, 12.5, 16.x, 17.2_

- [x] 4. Documentation ↔ authoritative gate in the form (`expense-form.tsx` + editor)
  - [x] 4.1 Track authoritative state and hide/show the legacy selector
    - Derive `authoritative` from `itemization.authoritative`; when true, force `splitMode = BY_AMOUNT` and hide/disable the `SplitModeSelector`; when false, keep the legacy selector and show items as documentation with a clear affordance (Requirement 12.6)
    - _Requirements: 12.1, 12.3, 12.6_

  - [x] 4.2 "Switch to itemised?" confirmation
    - Add a split-affecting-edit detector (edit item participants, edit all-items split [deferred control], or an explicit "Use items as split" button)
    - When not authoritative and a split-affecting edit is attempted, show `Switch_To_Itemized_Confirmation` (shadcn AlertDialog, matching existing dialogs); on confirm → set authoritative, run splitter, write derived `paidFor` + `BY_AMOUNT`, then apply the edit; on cancel → no-op
    - _Requirements: 12.2, 12.3, 12.4_

  - [x] 4.3 "Leave itemised" confirmation
    - Add a control to return to a legacy split; show `Leave_Itemized_Confirmation` naming the target mode; on confirm → `authoritative = false`, restore chosen legacy mode with a valid even `paidFor`, re-show the selector, **keep items as documentation** (do not delete); on cancel → no-op
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 4.4 The "Other" remainder editor
    - Replace the two fixed tax/tip inputs with a single "Other" line showing `remainderAmount = total − Σ items`; an editor to choose PROPORTIONAL or CUSTOM (and for CUSTOM, a flat split over chosen participants); keep tax/tip only as optional quick-add inputs that sum into the remainder
    - Live per-participant preview via `computeItemizedShares`; the decomposition banner keeps working off the derived `paidFor`
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 5.2_

### Phase 3 — Editable total, FX bugfix, persistence, procedures

- [x] 5. Editable total + overshoot guard (`expense-form.tsx`)
  - [x] 5.1 Make the amount editable while items are present
    - Remove the read-only-derived-total behaviour; compute the "Other" remainder as `total − Σ items`
    - When `Σ items` overshoots, show the inline error and a "set amount from items" action that sets `amount = Σ items` (remainder → 0)
    - _Requirements: 17.1, 17.2, 17.3_

- [x] 6. FX bugfix — Entry_Total is the editable `originalAmount`
  - [x] 6.1 Bind the single editable total to `originalAmount` when authoritative + conversion required
    - The editable total field is the Entry_Total in Entry_Currency and is written to `originalAmount`; `remainder = Entry_Total − Σ items` (Entry_Currency); guard the existing FX effect so it does not overwrite the itemized Entry_Total (the itemized path owns `originalAmount`; `amount` is the converted preview)
    - When Entry_Currency == Group_Currency: no `originalAmount`; the editable total is the group-currency total directly
    - _Requirements: 18.1, 18.2, 18.3, 18.5, 17.4_

  - [x] 6.2 Single minor-unit conversion in `proceedWithSubmit`
    - When authoritative: convert item amounts + remainder to Entry_Currency minor units once; run `computeItemizedShares`; write per-participant minor shares into `paidFor` as `BY_AMOUNT`; pass the `itemization` (items + remainder, Entry_Currency minor units) to the mutation; do not convert again
    - _Requirements: 5.4, 11.6, 18.1_

- [x] 7. Persistence of items + remainder + marker (`src/lib/api.ts`)
  - [x] 7.1 Rewrite `buildItemizationCreateData` / `buildItemizationUpdateData`
    - Persist `itemsAuthoritative` from the form flag
    - **Write items whenever items exist** (authoritative OR documentation) — the key change from v1.0 which only wrote items when itemized
    - Persist `remainderAmount`, `remainderAllocationMode`, `remainderSplitMode`, and `ExpenseRemainderShare` rows (CUSTOM only); no more `taxAmount` / `tipAmount`
    - Update path: full-replace items and remainder shares; when no items, clear items, remainder columns → null, and `itemsAuthoritative = false`
    - When not authoritative, `paidFor` is the legacy split (items do not drive it)
    - _Requirements: 12.1, 13.4, 13.5, 16.1, 16.2, 1.6_

  - [x] 7.2 Update the conversion threading
    - `applyItemizedConversion` runs only when authoritative + conversion happened (re-derive shares from converted total); unchanged in spirit
    - _Requirements: 11.4, 18.4_

  - [x] 7.3 Restore state on load (`getExpense`)
    - Include `items` (+ assignments), `remainderShares`, and select `itemsAuthoritative` / `remainderAmount` / `remainderAllocationMode` / `remainderSplitMode`; the form reconstructs documentation-vs-authoritative from the marker (not item presence)
    - _Requirements: 1.4, 1.7, 12.5, 13.5_

  - [x] 7.4 Confirm non-member decomposition unchanged
    - Authoritative itemized expenses arrive as `BY_AMOUNT`; a non-member line becomes their Direct_Half; items/remainder are not persisted on decomposed halves; payers stay independent
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

### Phase 4 — Export, i18n, verification

- [x] 8. Export reflects the remainder model
  - [x] 8.1 JSON export
    - Replace `taxAmount` / `tipAmount` in the JSON selection with `items` (+ assignments), `remainderAmount`, `remainderAllocationMode`, `remainderSplitMode`, `remainderShares`, and `itemsAuthoritative`; CSV unchanged; non-itemized output unchanged
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 9. i18n
  - [x] 9.1 Message keys in `messages/en-US.json`
    - Add/replace labels: "Other"/remainder line, allocation mode (proportional/custom), switch-to-itemised dialog (title/description/confirm/cancel), leave-itemised dialog, "use items as split", "set amount from items", items-exceed-amount error
    - Keep tax/tip labels only if the quick-add inputs are kept; remove the standalone tax/tip field labels otherwise
    - Other locales fall back to English until translated
    - _Requirements: 12.2, 13.1, 16.1, 17.2, 17.3_

- [x] 10. Integration & verification
  - [x] 10.1 Gate tests
    - Split-affecting edit while not authoritative requires the confirmation; confirm flips to authoritative + derives `paidFor`; cancel is a no-op; leaving keeps items as documentation
    - _Requirements: 12.2, 12.3, 12.4, 13.3, 13.4_

  - [x] 10.2 Documentation round-trip
    - Save documentation items (marker false) + legacy split → reload restores legacy split with items as documentation; authoritative items reload authoritative; remainder amount + mode + CUSTOM shares round-trip; JSON export emits them
    - _Requirements: 12.1, 13.5, 10.2_

  - [x] 10.3 Remainder + overshoot + non-member
    - PROPORTIONAL and CUSTOM remainders persist and produce cent-exact `paidFor`; overshoot blocks save and "set amount from items" clears the remainder; itemized non-member line decomposes like the equivalent `BY_AMOUNT`
    - _Requirements: 16.5, 17.2, 17.3, 7.3, 7.4_

  - [x] 10.4 FX exactness
    - Authoritative + foreign Entry_Currency: `originalAmount` equals the composed Entry_Total, the FX effect does not clobber it, converted per-participant shares sum exactly to the converted total
    - _Requirements: 18.1, 18.2, 18.4_

  - [x] 10.5 Full check suite
    - `pnpm check-types`, `pnpm lint`, `pnpm test`; fix failures
    - _Requirements: 5.1, 5.3_

### Deferred (named, not dropped — Requirement 19.2)

- [ ] 11. Per-line `unitPrice × quantity` (Requirement 14) — DEFERRED
  - `ExpenseItem` gains `unitPrice Int` + `quantity Int @default(1)`; `amount` recomputable; splitter unaffected (it consumes `Item_Amount`)

- [ ] 12. `All_Items_Split` one-click control (Requirement 15) — DEFERRED
  - Apply one default split to every line + "mixed" indicator; the gate already treats "edit all-items split" as a switch trigger, so adding the control later does not change the gate contract

**Permanently out of scope (Requirement 19.3):** per-line split *modes* (each item EVENLY/BY_SHARES/…) and Cloud's BigInt/exact-rational math. A Knots item is split equally among its assignees; the only flat split mode is the CUSTOM remainder, reusing the existing integer distributors.

## Task Dependency Graph

Waves group tasks that can proceed once the previous wave is complete. Within a wave, tasks are independent of each other.

```json
{
  "waves": [
    { "wave": 1, "tasks": [1], "dependsOn": [], "note": "Schema migration: marker + remainder columns/enum/relation; drop tax/tip." },
    { "wave": 2, "tasks": [2], "dependsOn": [1], "note": "Generalise the pure splitter to (items, remainder); needs the enum/types from task 1." },
    { "wave": 3, "tasks": [3], "dependsOn": [1, 2], "note": "Reshape the form schema (marker + remainder) using the new types and splitter shape." },
    { "wave": 4, "tasks": [4], "dependsOn": [3], "note": "Documentation/authoritative gate, confirmation dialogs, and the Other remainder editor." },
    { "wave": 5, "tasks": [5, 6], "dependsOn": [2, 4], "note": "Editable total + overshoot guard (5) and the FX bugfix binding Entry_Total to originalAmount (6)." },
    { "wave": 6, "tasks": [7], "dependsOn": [1, 3, 6], "note": "Persistence of items + remainder + marker; procedures; getExpense reload." },
    { "wave": 7, "tasks": [8, 9], "dependsOn": [4, 7], "note": "JSON export of the remainder model (8) and i18n keys (9); parallel." },
    { "wave": 8, "tasks": [10], "dependsOn": [1, 2, 3, 4, 5, 6, 7, 8, 9], "note": "Integration tests and the full check suite." },
    { "wave": 9, "tasks": [11, 12], "dependsOn": [10], "note": "Deferred upgrades (unit×qty, all-items split); independent of each other." }
  ],
  "criticalPath": [1, 2, 3, 4, 6, 7, 10]
}
```

## Notes

- **Supersession.** Phase 1+ modifies Phase 0 code in place: task 1 removes the `taxAmount` / `tipAmount` columns added by 0.3; task 2 rewrites the 0.1 splitter signature; task 3 reshapes the 0.4 schema field; task 7 rewrites the 0.5 persistence helpers. Expect existing v1.0 tests to be migrated (tax/tip → PROPORTIONAL remainder), not deleted.
- **Migration is destructive of the unreleased tax/tip columns** but the feature is unreleased, so a normal `prisma migrate dev` with an in-migration backfill is the chosen path (design §B). No phased column deprecation.
- **Single source of truth.** The remainder (`remainderAmount` + `remainderAllocationMode` + `remainderSplitMode` + `ExpenseRemainderShare`) is authoritative for tax/tip/service; tax/tip inputs, if kept, are pure UI shortcuts that sum into `remainderAmount`.
- **"Itemized" is the marker**, never `items.length > 0`. Every read of "is this itemized" goes through `Expense.itemsAuthoritative`.
- **One minor-unit conversion** for itemized shares, in `proceedWithSubmit`; the server only re-distributes across the converted total when a conversion happened.
- **Cent-exactness + property tests** remain mandatory for both PROPORTIONAL and CUSTOM remainder allocation (design Properties 1–2).
