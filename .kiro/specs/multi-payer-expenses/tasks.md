# Implementation Plan: Multi-Payer Expenses

## Overview

This plan implements support for expenses funded by multiple payers. The work is organized into six phases: database schema & migration, core logic (balances, activity diff), tRPC API layer, UI components, import/export systems, and testing. Each phase builds on the previous, ensuring no orphaned code. All amounts use integer minor currency units.

## Tasks

- [x] 1. Database schema and migration
  - [x] 1.1 Add ExpensePaidBy model to Prisma schema
    - Add `ExpensePaidBy` model to `prisma/schema.prisma` with composite key `[expenseId, userId]` and `amount Int`
    - Add `payers ExpensePaidBy[]` relation on `Expense` model with `@relation("ExpensesPaidByMulti")`
    - Add `paidByExpenses ExpensePaidBy[]` on `User` model with `@relation("UserExpensesPaidBy")`
    - Configure `onDelete: Cascade` on both foreign key relations
    - Keep existing `paidById` / `paidBy` relation intact (deprecated)
    - _Requirements: 1.1, 1.2, 1.5, 1.6_

  - [x] 1.2 Generate and apply Prisma migration
    - Run `npx prisma migrate dev --name add_expense_paid_by` to generate migration SQL
    - Verify the migration creates the `ExpensePaidBy` table with composite primary key
    - _Requirements: 1.1_

  - [x] 1.3 Create idempotent data backfill migration
    - Create `prisma/migrations/XXXXXX_backfill_expense_paid_by/migration.sql` with idempotent INSERT
    - SQL: `INSERT INTO "ExpensePaidBy" ("expenseId", "userId", "amount") SELECT e."id", e."paidById", e."amount" FROM "Expense" e WHERE NOT EXISTS (SELECT 1 FROM "ExpensePaidBy" epb WHERE epb."expenseId" = e."id") ON CONFLICT ("expenseId", "userId") DO NOTHING;`
    - Handle expenses with null `groupId` (orphaned/direct-friend expenses)
    - _Requirements: 6.1, 6.2, 6.3, 6.5_

  - [x] 1.4 Update `getGroupExpenses` and `getExpense` queries to include `payers`
    - Modify `src/lib/api.ts` — add `payers: { select: { userId: true, amount: true, user: { select: { id: true, name: true } } } }` to all expense includes
    - _Requirements: 1.2, 3.1_

- [x] 2. Core logic — balance computation
  - [x] 2.1 Refactor `getBalances` to support multiple payers
    - Modify `src/lib/balances.ts` — replace `expense.paidBy.id` single-payer credit with iteration over `expense.payers` array
    - Credit each payer by their `amount` field instead of the full `expense.amount`
    - Keep `paidFor` (debit) logic completely unchanged
    - Add fallback: if `payers` is empty/undefined, fall back to `expense.paidBy.id` with full amount (graceful degradation)
    - Ensure integer arithmetic and rounding remainder behavior is preserved
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 2.2 Update `getDirectReimbursements` for multi-payer
    - Modify `src/lib/balances.ts` — `getDirectReimbursements` currently calls `getBalances([expense])` per expense, ensure this still works with new multi-payer logic
    - The pair-owes map should credit each payer individually
    - _Requirements: 3.1, 3.5_

  - [x] 2.3 Write unit tests for multi-payer balance computation
    - Create/extend `src/lib/balances.test.ts` with test cases:
      - Single payer (backward compatibility): same result as before
      - Two payers splitting payment evenly
      - Three payers with uneven amounts
      - Payer who is also a beneficiary (net position)
      - Rounding remainder with multiple payers
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 2.4 Write property test: Payer Amount Sum Invariant (Property 1)
    - **Property 1: Payer Amount Sum Invariant**
    - Create `src/lib/__tests__/balances-multi-payer.property.test.ts`
    - Generate random expenses with 1–N payers whose amounts sum to expense total
    - Assert: sum of all payer credits in balances equals sum of expense totals
    - **Validates: Requirements 1.4, 3.3, 2.7, 11.2, 11.3**

  - [x] 2.5 Write property test: Per-Payer Credit Accumulation (Property 2)
    - **Property 2: Per-Payer Credit Accumulation**
    - In `src/lib/__tests__/balances-multi-payer.property.test.ts`
    - Assert: each payer's `paid` total equals their `ExpensePaidBy.amount`
    - **Validates: Requirements 3.1, 1.3**

  - [x] 2.6 Write property test: PaidFor Independence (Property 3)
    - **Property 3: PaidFor Independence from Payer Distribution**
    - Assert: `paidFor` values are identical regardless of payer distribution (same expense total, same split)
    - **Validates: Requirements 3.2**

  - [x] 2.7 Write property test: Single-Payer Backward Compatibility (Property 4)
    - **Property 4: Single-Payer Backward Compatibility**
    - Assert: single-payer expense produces identical balances to legacy computation
    - **Validates: Requirements 3.4**

- [x] 3. Core logic — activity diff
  - [x] 3.1 Add `paidBy` field tracking to activity diff
    - Modify `src/lib/activity-diff.ts` — add detection of `paidBy` changes in `computeExpenseChanges`
    - Serialize old/new payer state as JSON array of `{userId, amount}` objects
    - Record creation change when expense is new (oldValue: null, newValue: payer list)
    - Skip recording when single-payer stays the same user and amount
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 3.2 Write unit tests for activity diff payer changes
    - Extend `src/lib/activity-diff.test.ts`:
      - Adding a second payer generates a `paidBy` change
      - Changing payer amounts generates a change
      - No change when payers/amounts are identical
      - Creation records initial payer set
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 3.3 Write property test: Activity Diff Payer Change Detection (Property 5)
    - **Property 5: Activity Diff Payer Change Detection**
    - Create `src/lib/__tests__/activity-diff-multi-payer.property.test.ts`
    - Assert: diff records change iff (userId, amount) sets differ; serialized values round-trip
    - **Validates: Requirements 5.1, 5.2, 5.4**

- [x] 4. Checkpoint — Schema and core logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Form schema and validation
  - [x] 5.1 Add `paidByEntrySchema` and update `expenseFormSchema`
    - Modify `src/lib/schemas.ts`:
      - Add `paidByEntrySchema = z.object({ participant: z.string().min(1), amount: z.union([z.number(), z.string().transform(expressionToNumber)]).refine(a => a > 0, 'paidByAmountPositive') })`
      - Change `paidBy` field from `z.string()` to `z.array(paidByEntrySchema).min(1)` — always an array, no union with string
      - Add superRefine: if `isReimbursement` and `paidBy` array has length > 1, issue error
      - Add superRefine: validate sum of payer amounts equals `amount`
    - _Requirements: 2.7, 4.1, 11.1, 11.2, 11.3_

  - [x] 5.2 Write unit tests for form schema validation
    - Extend or create tests for `expenseFormSchema`:
      - Valid: array with one payer whose amount = total
      - Valid: array with two payers whose amounts sum to total
      - Invalid: payer amount ≤ 0
      - Invalid: payer amounts sum ≠ total
      - Invalid: reimbursement with >1 payer in array
      - Invalid: empty array
    - _Requirements: 2.7, 4.1, 11.1, 11.2, 11.3_

- [x] 6. tRPC procedures
  - [x] 6.1 Update create expense procedure for multi-payer
    - Modify `src/trpc/routers/groups/expenses/create.procedure.ts`:
      - Accept `paidBy` as `Array<{participant, amount}>`
      - Validate all participant IDs are group members (BAD_REQUEST if not)
      - Validate sum of amounts equals expense total
      - Validate no duplicate userIds
      - Create `ExpensePaidBy` rows in same transaction
      - Set deprecated `paidById` to first payer's ID
    - _Requirements: 1.3, 1.4, 1.6, 11.4, 11.5_

  - [x] 6.2 Update update expense procedure for multi-payer
    - Modify `src/trpc/routers/groups/expenses/update.procedure.ts`:
      - Accept new `paidBy` array
      - Delete existing `ExpensePaidBy` rows and recreate (upsert pattern)
      - Same validations as create (group membership, sum, duplicates)
      - Update deprecated `paidById` to first payer's ID
      - Pass old/new payer data to activity diff
    - _Requirements: 1.3, 1.4, 1.6, 5.1, 11.4, 11.5_

  - [x] 6.3 Update recurring expense materialization
    - Find the recurring expense materialization logic and copy `ExpensePaidBy` rows from source to new instance
    - Future materializations use updated payers; existing instances unchanged
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 6.4 Write unit tests for tRPC validation
    - Test create procedure rejects: non-member userId, amount mismatch, duplicate payer, empty array
    - Test create procedure accepts: valid multi-payer, valid single-payer
    - Test update procedure: payer change triggers activity log
    - _Requirements: 1.6, 11.4, 11.5_

- [x] 7. Checkpoint — API layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. UI — PayerSelector component
  - [x] 8.1 Create PayerSelector component
    - Create `src/components/payer-selector.tsx`
    - Props: `participants`, `value` (PayerEntry[]), `onChange`, `expenseTotal`, `currency`, `locale`, `disabled`, `isReimbursement`
    - Render one row per payer: participant dropdown (using existing `expense-participant-picker` pattern) + `CurrencyAmountInput`
    - "Add payer" button: appends row (disabled when all participants used or `isReimbursement`)
    - Remove button on each row (disabled when only 1 payer)
    - Running total with mismatch indicator (red badge when ≠ expense total)
    - "Split evenly" button: redistributes expense total equally among current payers (visible when mismatch detected)
    - When single payer, auto-fill amount to match expense total
    - Prevent duplicate participant selection (filter available options)
    - Support arithmetic expressions in amount inputs (reuse `CurrencyAmountInput`)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 2.9, 2.10, 4.1, 4.2_

  - [x] 8.2 Add i18n keys for PayerSelector
    - Add keys to ALL 19 locale files (`messages/*.json`):
      - `Expenses.paidBy.addPayer`, `Expenses.paidBy.removePayer`, `Expenses.paidBy.splitEvenly`, `Expenses.paidBy.total`, `Expenses.paidBy.mismatch`, `Expenses.paidBy.overpayment`, `Expenses.paidBy.underpayment`, `Expenses.paidBy.reimbursementSingleOnly`, `Expenses.paidBy.amountPositive`
    - _Requirements: 2.6, 2.7, 2.10, 4.2, 11.1, 11.2, 11.3_

  - [x] 8.3 Integrate PayerSelector into ExpenseForm
    - Modify `src/app/groups/[groupId]/expenses/expense-form.tsx`:
      - Replace single "Paid by" `<Select>` with `<PayerSelector>` component
      - Wire form state: `paidBy` field now holds array of `{participant, amount}`
      - When `isReimbursement` toggled on, collapse to single payer
      - Handle expense total changes: retain payer amounts, show mismatch (Requirement 2.10)
      - Default to current user as single payer with full amount
    - _Requirements: 2.1, 2.2, 2.3, 2.10_

  - [x] 8.4 Update ExpenseForm submission to pass multi-payer data
    - Ensure form submission transforms `paidBy` array into the format expected by tRPC create/update procedures
    - When editing existing expense, populate PayerSelector from `expense.payers` data
    - _Requirements: 2.1, 1.3_

  - [x] 8.5 Update expense detail, expense card, and settlements UI to show multi-payer info
    - In expense detail view: show "Paid by A (€50) and B (€30)" instead of single payer name
    - In expense card/list: show abbreviated multi-payer label (e.g. "A, B" or "A +1")
    - In settlements/balances UI: credits display correctly per payer
    - In friend timeline: no changes needed (friend expenses remain single-payer in MVP)
    - _Requirements: 3.1, 2.11_

- [x] 9. Import — Splitwise CSV
  - [x] 9.1 Update Splitwise CSV importer for multi-payer
    - Modify `src/lib/splitwise-import.ts`:
      - Detect multiple positive user-column values in a CSV row
      - Create `paidBy` array using each user's positive column value directly as their amount (validate against real Splitwise CSV before finalizing)
      - Adjust last payer's amount to reconcile rounding differences
      - Single positive column: single-payer entry (backward-compatible)
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 9.2 Update `import-splitwise.procedure.ts` to write ExpensePaidBy rows
    - Modify `src/trpc/routers/groups/expenses/import-splitwise.procedure.ts` to pass `paidBy` array to createExpense
    - _Requirements: 7.1_

  - [x] 9.3 Write unit tests for Splitwise multi-payer import
    - Extend `src/lib/splitwise-import.test.ts`:
      - Row with 2 positive columns → 2 payers with amounts matching column values
      - Row with 1 positive column → single payer
      - Rounding mismatch → last payer adjusted
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 9.4 Write property test: Splitwise Multi-Payer Import (Property 8)
    - **Property 8: Splitwise Multi-Payer Import**
    - Create `src/lib/__tests__/splitwise-import-multi-payer.property.test.ts`
    - Assert: K positive columns → K payers; sum equals row cost exactly
    - **Validates: Requirements 7.1, 7.3, 7.4**

- [x] 10. Import — Knots JSON
  - [x] 10.1 Update Knots JSON import for multi-payer
    - Modify `src/lib/knots-import.ts`:
      - Accept `paidBy` array in expense JSON schema
      - Legacy fallback: if no `paidBy` array, create single entry from `paidById` + full amount
      - Validate payer userIds are group participants (reject with descriptive error if not)
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 10.2 Update `import-knots.procedure.ts` to write ExpensePaidBy rows
    - Modify `src/trpc/routers/groups/expenses/import-knots.procedure.ts` to pass parsed `paidBy` array
    - _Requirements: 8.1_

  - [x] 10.3 Write unit tests for Knots JSON multi-payer import
    - Extend `src/lib/knots-import.test.ts`:
      - JSON with `paidBy` array → correct ExpensePaidBy entries
      - Legacy JSON (only `paidById`) → single-payer entry
      - Unknown userId in `paidBy` → descriptive error
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 10.4 Write property test: Knots JSON Multi-Payer Import (Property 9)
    - **Property 9: Knots JSON Multi-Payer Import**
    - Create `src/lib/__tests__/knots-import-multi-payer.property.test.ts`
    - Assert: M entries in `paidBy` array → M ExpensePaidBy rows with matching data
    - **Validates: Requirements 8.1**

  - [x] 10.5 Write property test: Payer UserId Validation (Property 10)
    - **Property 10: Payer UserId Validation**
    - In `src/lib/__tests__/knots-import-multi-payer.property.test.ts`
    - Assert: non-member userId → BAD_REQUEST rejection
    - **Validates: Requirements 1.6, 8.3, 11.4, 11.5**

- [x] 11. Checkpoint — Imports complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Export — CSV
  - [x] 12.1 Update CSV export for multi-payer
    - Modify `src/app/groups/[groupId]/expenses/export/csv/route.ts`:
      - Compute per-participant column: payer credit (positive) minus beneficiary debit (negative)
      - Net amount when participant is both payer and beneficiary
      - Single-payer expenses produce identical output to current format
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 12.2 Write property test: CSV Export Per-Participant Values (Property 11)
    - **Property 11: CSV Export Per-Participant Values**
    - Create `src/lib/__tests__/export-multi-payer.property.test.ts`
    - Assert: sum of all participant columns equals zero
    - **Validates: Requirements 9.1, 9.2**

  - [x] 12.3 Write property test: CSV Export Single-Payer Backward Compatibility (Property 12)
    - **Property 12: CSV Export Single-Payer Backward Compatibility**
    - In `src/lib/__tests__/export-multi-payer.property.test.ts`
    - Assert: single-payer CSV output is byte-identical to legacy
    - **Validates: Requirements 9.3**

- [x] 13. Export — JSON
  - [x] 13.1 Update JSON export for multi-payer
    - Modify `src/app/groups/[groupId]/expenses/export/json/route.ts`:
      - Add `paidBy` array with `{userId, amount}` objects for every expense
      - Single-payer expenses still include `paidBy` array (one entry) for consistency
      - Retain legacy `paidById` field set to first payer's userId
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 13.2 Write property test: JSON Export PaidBy Array Presence (Property 13)
    - **Property 13: JSON Export PaidBy Array Presence**
    - In `src/lib/__tests__/export-multi-payer.property.test.ts`
    - Assert: every exported expense has `paidBy` array with correct entries
    - **Validates: Requirements 10.1, 10.2**

  - [x] 13.3 Write property test: JSON Export Legacy PaidById Field (Property 14)
    - **Property 14: JSON Export Legacy PaidById Field**
    - In `src/lib/__tests__/export-multi-payer.property.test.ts`
    - Assert: `paidById` equals first entry's userId in `paidBy` array
    - **Validates: Requirements 10.3**

- [ ] 14. Validation property tests
  - [-] 14.1 Write property test: Per-Payer Amount Positivity (Property 15)
    - **Property 15: Per-Payer Amount Positivity Validation**
    - Create `src/lib/__tests__/validation-multi-payer.property.test.ts`
    - Assert: zero or negative amount → rejection with inline error
    - **Validates: Requirements 11.1**

  - [-] 14.2 Write property test: No Duplicate Payer Participants (Property 17)
    - **Property 17: No Duplicate Payer Participants**
    - In `src/lib/__tests__/validation-multi-payer.property.test.ts`
    - Assert: duplicate userId in paidBy → rejection
    - **Validates: Requirements 2.5**

- [ ] 15. Migration correctness tests
  - [-] 15.1 Write property test: Migration Correctness and Idempotence (Property 6)
    - **Property 6: Migration Correctness and Idempotence**
    - Create `src/lib/__tests__/migration-multi-payer.property.test.ts`
    - Assert: migration produces exactly one row per expense; repeated runs produce same state
    - **Validates: Requirements 6.1, 6.3**

  - [-] 15.2 Write property test: Migration Balance Preservation (Property 7)
    - **Property 7: Migration Balance Preservation**
    - In `src/lib/__tests__/migration-multi-payer.property.test.ts`
    - Assert: net balance for every participant is identical before and after migration
    - **Validates: Requirements 6.4**

- [ ] 16. Recurring expense property test
  - [-] 16.1 Write property test: Recurring Expense PaidBy Propagation (Property 16)
    - **Property 16: Recurring Expense PaidBy Propagation**
    - Create `src/lib/__tests__/recurring-multi-payer.property.test.ts`
    - Assert: materialized instance has identical payer rows as source
    - **Validates: Requirements 12.1, 12.2**

- [x] 17. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- **MVP scope for PBT:** Properties 1–4 (balances) + 6–7 (migration) are the priority for the first PR. The rest can be deferred.
- Unit tests validate specific examples and edge cases
- The deprecated `paidById` column is retained throughout for rollback safety
- All amounts are integer minor currency units (group currency) — no floating point
- The migration (task 1.3) is idempotent and safe to re-run
- Multi-payer is **group expenses only** in the MVP — direct (friend) expenses remain single-payer
- `paidBy` schema is **always array** — no union with string
- Relation name on Expense model: `payers` (not `paidByMulti`)
- **Splitwise import**: validate against a real exported CSV before finalizing the column-to-amount mapping logic
- **Currency conversion interaction**: conversion happens before payer distribution — all payer amounts are in group currency

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4"] },
    { "id": 3, "tasks": ["2.1", "3.1", "5.1"] },
    { "id": 4, "tasks": ["2.2", "2.3", "3.2", "5.2"] },
    { "id": 5, "tasks": ["2.4", "2.5", "2.6", "2.7", "3.3"] },
    { "id": 6, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 7, "tasks": ["6.4", "8.1", "8.2"] },
    { "id": 8, "tasks": ["8.3", "9.1", "10.1"] },
    { "id": 9, "tasks": ["8.4", "9.2", "9.3", "10.2", "10.3"] },
    { "id": 10, "tasks": ["9.4", "10.4", "10.5"] },
    { "id": 11, "tasks": ["12.1", "13.1"] },
    { "id": 12, "tasks": ["12.2", "12.3", "13.2", "13.3"] },
    { "id": 13, "tasks": ["14.1", "14.2", "15.1", "15.2", "16.1"] }
  ]
}
```
