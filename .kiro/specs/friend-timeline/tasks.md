# Implementation Plan: Friend Timeline (Splitwise-style)

## Overview

Migrate from DYAD groups to nullable `groupId`. Redesign friend UX: debt-focused list, unified timeline, payment detail, simplified direct expense creation.

**IMPORTANT:**

- Use **shadcn MCP / CLI** for new UI components.
- Add **all i18n keys to all 19 locale files** per `i18n-translations.md`.
- Do not create git commits unless the user explicitly asks.
- Canonical friend routes: `/friends/[username]` — remove legacy `[friendId]` paths.
- See `splitwise-api-reference.md` for Splitwise API shape and field mappings.

## Tasks

- [x] 0. Schema migration — nullable groupId, remove DYAD, add consolidation fields
  - [x] 0.1 Update `prisma/schema.prisma`: make `Expense.groupId` nullable (`String?`), make `group` relation optional (`Group?`), remove `dyadKey` from Group, remove `DYAD` from `GroupType` enum, add `creationMethod String?` and `bundleId String?` to Expense
  - [x] 0.2 Create Prisma migration: ALTER groupId nullable, ADD creationMethod + bundleId columns, CREATE index on bundleId, UPDATE DYAD expenses SET groupId=NULL, backfill creationMethod='payment' for existing reimbursements, DELETE DYAD memberships, DELETE DYAD groups, DROP dyadKey column
  - [x] 0.3 Verify migration preserves `ExpensePaidFor` records for migrated expenses
  - [x] 0.4 Delete `src/lib/dyad-groups.ts` and `src/lib/dyad-groups.test.ts`
  - [x] 0.5 Remove all `findOrCreateDyadGroup`, `resolveDyadCurrencyCode`, `syncDyadGroupCurrency` call sites
  - [x] 0.6 Add `WHERE "groupId" IS NOT NULL` filters to all group-scoped expense queries (prevent direct expenses from leaking into group views)
  - _Requirements: 1.1–1.9, 12.5_

- [x] 1. Backend — balance engine update
  - [x] 1.1 Update `computeFriendBalance` to include a "direct" bucket (`groupId = null`) alongside group buckets
  - [x] 1.2 Update `computeFriendSettlements` to include the direct bucket as a settlement target
  - [x] 1.3 Update `friends.listWithBalances` to include direct ledger in per-friend totals
  - [x] 1.4 Add/update tests for balance computation with direct expenses
  - _Requirements: 2.7, 8.8_

- [x] 2. Backend — new tRPC procedures
  - [x] 2.1 Add `friends.createDirectExpense` — create expense with `groupId = null`, `splitMode = EVENLY`
  - [x] 2.2 Add `friends.recordDirectPayment` — create expense with `groupId = null`, `isReimbursement = true`
  - [x] 2.3 Add `friends.getDirectExpenses` — paginated list of `groupId = null` expenses between two users
  - [x] 2.4 Add `friends.getTimeline` — merged timeline (group summaries + direct expenses + payments)
  - [x] 2.5 Update `SettleAccountsDialog` backend to support `groupId = null` as settlement target
  - _Requirements: 2.1–2.6, 8.1–8.8, 9.1–9.5_

- [x] 3. Friend timeline computation module
  - [x] 3.1 Create `src/lib/friend-timeline.ts` with `TimelineEntry` types and `buildFriendTimeline`
  - [x] 3.2 Implement GROUP_SUMMARY: standard groups only, last activity date, pairwise balance, settled flag
  - [x] 3.3 Implement EXPENSE entries from direct expenses (`groupId = null`, `isReimbursement = false`)
  - [x] 3.4 Implement PAYMENT entries from all settlements (`isReimbursement = true`) across all contexts
  - [x] 3.5 Sort entries by activity date descending, tie-break createdAt
  - _Requirements: 4.2–4.6, 8.2–8.7_

- [x] 4. Unit tests for timeline builder
  - [x] 4.1 Create `src/lib/friend-timeline.test.ts`
  - [x] 4.2 Test: group summary settled vs non-zero balance
  - [x] 4.3 Test: direct expenses appear as EXPENSE entries
  - [x] 4.4 Test: payments appear as PAYMENT with correct from/to (group and direct)
  - [x] 4.5 Test: multi-participant direct expense
  - [x] 4.6 Test: sort order
  - [x] 4.7 Test: unrelated expenses excluded
  - _Requirements: 11.1_

- [x] 5. Checkpoint — migration + backend tests pass
  - [x] 5.1 `pnpm test` passes
  - [x] 5.2 `pnpm check-types` passes

- [x] 6. i18n — ALL 19 locale files
  - [x] 6.1 Add keys to `messages/en-US.json` under `Friends.Timeline`, `Friends.List`, `Friends.PaymentDetail`, `Friends.DirectExpense` - [x] 6.2 Propagate to all other 18 locale files per `i18n-translations.md`
  - [x] 6.3 Validate JSON syntax
  - _Requirements: 10.1–10.3_

- [x] 7. Friend timeline UI
  - [x] 7.1 Create `friend-timeline.tsx` with row components (`GroupSummaryRow`, `TimelineExpenseRow`, `PaymentTimelineRow`)
  - [x] 7.2 Create `/friends/[username]/page.tsx` as timeline default
  - [x] 7.3 Integrate header: balance summary + Solicitar / Liquidar contas + Add expense FAB
  - [x] 7.4 Update `friend-layout-client.tsx`: remove expenses/balances tabs, timeline is the default
  - [x] 7.5 Date grouping headers (This week, Earlier this month, Last month, etc.)
  - _Requirements: 4.1–4.6, 5.1–5.5_

- [x] 8. Payment detail page
  - [x] 8.1 Create `/friends/[username]/payments/[expenseId]/page.tsx`
  - [x] 8.2 Load expense, verify `isReimbursement = true` and involves friend; 404 otherwise
  - [x] 8.3 Display payer → payee, amount, date, disclaimer, edit/delete actions
  - _Requirements: 6.1–6.6_

- [x] 9. Direct expense dialog
  - [x] 9.1 Create `direct-expense-dialog.tsx` (title, amount, paidBy, date, attach, notes)
  - [x] 9.2 Wire to `friends.createDirectExpense`
  - [x] 9.3 Default currency from user's `preferredCurrency`, fallback EUR
  - [x] 9.4 Invalidate timeline + balances on success
  - _Requirements: 7.1–7.5_

- [x] 10. Settlement — direct ledger + settle-all support
  - [x] 10.1 Update `SettleAccountsDialog` to show "Direct / Sem grupo" as a bucket option
  - [x] 10.2 Wire settlement of direct bucket to `friends.recordDirectPayment`
  - [x] 10.3 Update `RequestPaymentDialog` similarly
  - [x] 10.4 Add `creationMethod` and `bundleId` fields to Expense schema (part of migration task 0)
  - [x] 10.5 Implement `friends.settleAll` mutation: compute per-bucket balances, create N entries with shared `bundleId` and `creationMethod = 'debt_consolidation'`, atomic transaction
  - [x] 10.6 Add "Liquidar tudo" button in Friend_Detail header (visible only when 2+ buckets have non-zero balance)
  - [x] 10.7 Timeline: group entries with same `bundleId` into a single collapsed row ("Liquidou todos os saldos — {total}")
  - [x] 10.8 Payment detail: show consolidation disclaimer when `creationMethod = 'debt_consolidation'`
  - _Requirements: 9.1–9.5, 12.1–12.10_

- [x] 11. Friends list refactor
  - [x] 11.1 Add aggregate header (total owed/owing per currency)
  - [x] 11.2 Filter to non-zero balance friends by default
  - [x] 11.3 Add "Show N settled friends" expandable section
  - [x] 11.4 Simplify row UI (avatar + name + balance → link to `/friends/[username]`)
  - [x] 11.5 Keep add/remove/requests accessible
  - _Requirements: 3.1–3.8_

- [ ] 12. Cleanup
  - [ ] 12.1 Delete legacy `[friendId]` route folders or add redirects to `[username]`
  - [ ] 12.2 Delete old friend expenses tab (`/friends/[username]/expenses/`)
  - [x] 12.3 Delete old friend balances tab if exists
  - [ ] 12.4 Remove references to `GroupType.DYAD` in UI (settings, group lists, filters)

- [ ] 13. Final checkpoint
  - [ ] 13.1 Scenario: create direct expense → appears in timeline, affects direct balance only
  - [ ] 13.2 Scenario: settle direct → direct balance zeroed, group balances unchanged
  - [ ] 13.3 Scenario: settle group → group balance zeroed, direct balance unchanged
  - [ ] 13.4 Scenario: settle-all → all buckets zeroed, entries grouped in timeline with bundleId
  - [ ] 13.5 Scenario: delete one consolidation entry → only that bucket's balance is restored
  - [ ] 13.6 Scenario: group summary click → navigates to group; expense click → detail; payment click → payment detail
  - [ ] 13.7 `pnpm test` and `pnpm check-types` pass
  - _Requirements: 11.1–11.5, 12.1–12.10_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["0.1", "0.2", "0.3", "0.4", "0.5", "0.6"] },
    { "id": 1, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    {
      "id": 2,
      "tasks": [
        "2.1",
        "2.2",
        "2.3",
        "2.4",
        "2.5",
        "3.1",
        "3.2",
        "3.3",
        "3.4",
        "3.5"
      ]
    },
    {
      "id": 3,
      "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "5.1", "5.2"]
    },
    { "id": 4, "tasks": ["6.1", "6.2", "6.3"] },
    {
      "id": 5,
      "tasks": [
        "7.1",
        "7.2",
        "7.3",
        "7.4",
        "7.5",
        "8.1",
        "8.2",
        "8.3",
        "9.1",
        "9.2",
        "9.3",
        "9.4"
      ]
    },
    {
      "id": 6,
      "tasks": [
        "10.1",
        "10.2",
        "10.3",
        "10.4",
        "10.5",
        "10.6",
        "10.7",
        "10.8",
        "11.1",
        "11.2",
        "11.3",
        "11.4",
        "11.5"
      ]
    },
    {
      "id": 7,
      "tasks": [
        "12.1",
        "12.2",
        "12.3",
        "12.4",
        "13.1",
        "13.2",
        "13.3",
        "13.4",
        "13.5",
        "13.6",
        "13.7"
      ]
    }
  ]
}
```

## Notes

- Amounts in API remain **minor units** (cents/cêntimos).
- Direct expenses = `groupId IS NULL` — never show them in group expense lists.
- `isReimbursement = true` is the sole indicator of a payment. Do NOT use title/description to identify payments.
- Settlement is **per bucket** — direct ledger vs. each group. Never cross-settle.
- Splitwise `description` = Knots `title`; Splitwise `details` = Knots `notes`.
- Receipts: accept image or PDF ("Attach an image or PDF").
- Legacy `[friendId]` route folders should be deleted; canonical route is `[username]`.
