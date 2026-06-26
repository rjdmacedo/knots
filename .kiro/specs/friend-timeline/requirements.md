# Requirements Document: Friend Timeline (Splitwise-style)

## Introduction

Knots currently uses a `GroupType.DYAD` hack to store direct expenses between friends — a hidden group that leaks implementation details (wrong currency, full group expense form, group-centric balance logic). After reverse-engineering the Splitwise API and UX (June 2026), it's clear that Splitwise uses a simpler model: **expenses and payments can exist without a group** (`group_id: null`). Direct expenses with 2+ participants, payments between friends — all live outside any group.

This spec:

1. **Migrates the data model** — `Expense.groupId` becomes nullable; DYAD groups are dissolved; direct expenses/payments exist independently.
2. **Redesigns the friend UX** — debt-focused friends list, unified friend timeline (group summaries + direct expenses + payments), payment detail view, and simplified direct expense creation.
3. **Aligns with Splitwise semantics** — per-bucket settlement (group vs. direct), multi-participant direct expenses, and `isReimbursement` as the payment flag.

No new `Payment` model is introduced — payments remain `Expense` records with `isReimbursement: true` (same as Splitwise's `payment: true` on the same entity).

## Reference UX (Splitwise)

Collected from product review and API inspection (June 2026). See `splitwise-api-reference.md` for raw API data.

| Screen                     | Behaviour                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Friends list**           | Header total ("No total, devem-lhe X €"); only friends with unsettled balances visible; toggle to show settled friends |
| **Friend detail**          | Balance summary + Solicitar / Liquidar contas; chronological **timeline**                                              |
| **Timeline — group row**   | Group name, date of last activity, balance or "contas liquidadas"; click → group page                                  |
| **Timeline — expense row** | Expense **title** (e.g. "Despesa teste"), lent/borrowed amount; click → expense detail                                 |
| **Timeline — payment row** | "Pagou {name} {amount}" with banknote icon; click → payment detail (not expense form)                                  |
| **Add expense (no group)** | Simple form: description, amount in user currency, equal split; label "Sem grupo"                                      |
| **Settle per group**       | Liquidating Casa/Business only clears that group's bucket; direct payment only affects direct ledger                   |

### Critical design rules

1. **`description` (Splitwise) = `title` (Knots)**; **`details` (Splitwise) = `notes` (Knots)** — use actual expense title in UI, never a generic badge.
2. **Group rows** navigate to the **group page**; expense rows navigate to **expense detail**; payment rows navigate to **payment detail**.
3. **Per-bucket settlement** — liquidating a group does NOT clear direct debt. A direct payment does NOT affect group balances. These are isolated ledgers.
4. **Direct expenses can have 3+ participants** — Splitwise supports multi-user expenses with `group_id: null`. Knots should support this natively (not limited to 2-user DYAD).
5. **Receipts accept image or PDF** — "Attach an image or PDF" (Splitwise copy).

## Glossary

- **Connected_Friend**: Reciprocal `Friend` records with `friendUserId` set (both sides accepted).
- **Shared_Group**: Standard group where both users have active (non-archived) memberships.
- **Direct_Expense**: An expense with `groupId = null` — not associated with any group.
- **Direct_Payment**: A payment (`isReimbursement: true`) with `groupId = null`.
- **Direct_Ledger**: The aggregate of all Direct_Expenses and Direct_Payments between two users — equivalent to Splitwise "Sem grupo" / `group_id=0`.
- **Timeline_Entry**: A row in the friend detail feed — one of `GROUP_SUMMARY`, `EXPENSE`, or `PAYMENT`.
- **Group_Summary**: A timeline row representing a standard shared group: last activity date, group name, current pairwise balance or "settled".
- **Payment**: A settlement record (`Expense.isReimbursement === true`); UI must not treat it as a shared cost.
- **Friends_List**: `/friends` page.
- **Friend_Detail**: `/friends/[username]` — primary timeline view.

## Dependencies

- **friend-balances** (implemented): `computeFriendBalance`, `computeFriendSettlements`, `friends.listWithBalances`, `friends.getBalanceDetail` — will need updates to handle `groupId: null`.
- **group-settlements** (implemented): `recordSettlement`, `requestPayment`, `SettleAccountsDialog`, `RequestPaymentDialog` — settlement mutations need to support `groupId: null` target.

## Requirements

### Requirement 1: Schema migration — nullable groupId, remove DYAD

**User Story:** As a developer, I need the data model to support expenses and payments without a group, eliminating the DYAD workaround.

#### Acceptance Criteria

1. `Expense.groupId` SHALL become nullable (`String?`) in the Prisma schema.
2. `Expense.group` relation SHALL become optional (`Group?`).
3. A Prisma migration SHALL:
   - ALTER `Expense.groupId` to nullable.
   - UPDATE all expenses currently in DYAD groups: SET `groupId = NULL`.
   - DELETE all `GroupMembership` records for DYAD groups.
   - DELETE all `Group` records with `type = 'DYAD'`.
4. The `GroupType` enum SHALL remove `DYAD` (or mark deprecated with a follow-up cleanup).
5. The `Group.dyadKey` field SHALL be removed.
6. All existing code referencing `GroupType.DYAD`, `findOrCreateDyadGroup`, `dyadKey`, `resolveDyadCurrencyCode`, `syncDyadGroupCurrency` SHALL be refactored or removed.
7. `ExpensePaidFor` records for migrated expenses SHALL remain intact (no data loss on participant shares).
8. `Activity` records linked to DYAD groups SHALL either be migrated (set `groupId = null` if Activity supports it) or preserved for historical reference.
9. THE migration SHALL be **reversible** — provide a down migration that recreates DYAD groups from `groupId IS NULL` expenses.

### Requirement 2: Direct expense support (groupId = null)

**User Story:** As a user, I want to create expenses with friends without them being tied to any group.

#### Acceptance Criteria

1. THE system SHALL allow creating expenses with `groupId = null`.
2. Direct expenses SHALL support **2 or more participants** (not limited to 2 like DYAD was).
3. Direct expenses SHALL support all existing `SplitMode` values (EVENLY, BY_SHARES, BY_PERCENTAGE, BY_AMOUNT).
4. THE default currency for direct expenses SHALL be the creator's `preferredCurrency`.
5. Direct payments (`isReimbursement: true, groupId: null`) SHALL be creatable via a "Record a payment" flow.
6. Direct payments SHALL only affect the Direct_Ledger balance between the two users — never group balances.
7. THE balance engine (`computeFriendBalance`) SHALL include a **"direct" bucket** alongside each shared group bucket, representing the net of all `groupId = null` expenses/payments between the two users.

### Requirement 3: Friends list — debt-focused

**User Story:** As a user, I want the Friends page to show who owes me and whom I owe, like Splitwise.

#### Acceptance Criteria

1. THE Friends_List SHALL show an **aggregate header** per currency: "In total, you are owed {amount}" / "In total, you owe {amount}" — never converting between currencies.
2. BY DEFAULT, THE Friends_List SHALL show only Connected_Friends with **non-zero** net balance (across all shared groups + direct ledger).
3. THE Friends_List SHALL provide a control **"Show N settled friends"** to expand friends with zero balance.
4. EACH visible friend row SHALL show: avatar, name, and one line per non-zero currency ("{name} owes you {amount}" / "You owe {name} {amount}").
5. EACH friend row SHALL link to `/friends/[username]` (Friend_Detail).
6. THE Friends_List SHALL NOT show email, "On Knots" badge, or receipt icon on the primary row.
7. Pending friends and incoming requests SHALL remain visible outside the settled/unsettled filter.
8. Friend management (add, remove, accept) SHALL remain accessible — header "Add friends" + overflow per row.

### Requirement 4: Friend timeline feed

**User Story:** As a user, I want one chronological view with a friend showing groups, expenses, and payments.

#### Acceptance Criteria

1. THE Friend_Detail default route (`/friends/[username]`) SHALL render the **timeline**.
2. THE timeline SHALL interleave three entry types sorted by **activity date** descending:
   - **GROUP_SUMMARY** — one entry per standard Shared_Group.
   - **EXPENSE** — each non-reimbursement direct expense (`groupId = null`) involving both users.
   - **PAYMENT** — each settlement (`isReimbursement: true`) involving both users, in any context (group or direct).
3. FOR **GROUP_SUMMARY** entries:
   - Display group name, date of last activity (max `expenseDate` of expenses involving both users in that group), and pairwise balance.
   - IF balance is zero, display "All settled up" (i18n).
   - Click SHALL navigate to `/groups/[groupId]`.
4. FOR **EXPENSE** entries:
   - Display the expense **title**, date, payer summary, and lent/borrowed amount for the current user.
   - Click SHALL navigate to expense detail/edit.
   - THE UI SHALL NOT use a generic "Direct expenses" badge — use the actual title.
5. FOR **PAYMENT** entries:
   - Display banknote-style icon, copy "{payer} paid {payee} {amount}", and date.
   - Click SHALL navigate to the **payment detail** view (Requirement 6).
6. THE timeline SHALL group entries by date headers (month/year or semantic: "This week", "Earlier this month", etc.).

### Requirement 5: Friend detail header and actions

**User Story:** As a user, I want balance summary and settle/request actions at the top of the friend page.

#### Acceptance Criteria

1. THE Friend_Detail header SHALL show net balance per currency with full-sentence copy.
2. WHEN non-zero balance exists, THE header SHALL show **"Solicitar"** and **"Liquidar contas"** buttons.
3. Settlement dialogs SHALL settle **per bucket**: each shared group separately + direct ledger separately. Never a single cross-everything payment.
4. A FAB or primary button **"Add expense"** SHALL open the simplified direct expense flow (Requirement 7).
5. THE separate Balances and Expenses tabs SHALL be removed or redirected to the timeline.

### Requirement 6: Payment detail view

**User Story:** As a user, I want to view a recorded payment as a payment — not as a shared expense.

#### Acceptance Criteria

1. WHEN the user opens a payment from the timeline, THE app SHALL show a **Payment detail** page.
2. THE page SHALL display: payer avatar+name → payee avatar+name, amount, date, "Added by {user} on {date}".
3. THE page SHALL show a disclaimer: "This payment was recorded using 'Record a payment'. No money was transferred." (i18n).
4. THE page SHALL offer **edit** and **delete** actions.
5. Internally the record remains `Expense` with `isReimbursement: true`; no separate model.
6. Payment rows in group expense lists and the friend timeline SHALL use distinct styling (banknote icon + "{payer} paid {payee}" copy).

### Requirement 7: Simplified direct expense creation

**User Story:** As a user, I want to add an expense with a friend without thinking about groups or currencies.

#### Acceptance Criteria

1. FROM Friend_Detail, **Add expense** SHALL open a **simplified form** (dialog or sheet):
   - Description (title) — required
   - Amount — required, in user's `preferredCurrency`
   - "Paid by" toggle (you / friend) — default: you
   - "Split equally" default — no other split mode exposed in v1
   - Date — default today
   - Attach image or PDF (optional)
   - Notes (optional)
2. THE form SHALL NOT expose group selection, category picker, recurrence, or advanced split modes in v1.
3. ON submit, THE app SHALL create an `Expense` with `groupId = null`, `splitMode = EVENLY`, `categoryId = 0` (General).
4. THE UI SHALL NOT navigate through a full group expense form.
5. Currency SHALL be the user's `preferredCurrency`; if unset, fall back to EUR.

### Requirement 8: API — friend timeline and direct expenses

**User Story:** As a developer, I need efficient queries for the friend timeline matching Splitwise semantics.

#### Acceptance Criteria

1. THE friends router SHALL expose **`friends.getTimeline`**:
   - Input: `{ friendId, limit?, offset? }`
   - Response: `{ friend, currentUserId, balances, settlements, entries: TimelineEntry[] }`
2. `TimelineEntry` SHALL be a discriminated union: `GROUP_SUMMARY | EXPENSE | PAYMENT`.
3. THE friends router SHALL expose **`friends.getDirectExpenses`** (equivalent to Splitwise `get_expenses?friend_id=X&group_id=0`):
   - Returns direct expenses/payments between both users, paginated, date desc.
4. **PAYMENT** entries SHALL be identified by `isReimbursement === true`.
5. **EXPENSE** entries SHALL expose the expense `title` as display text.
6. GROUP_SUMMARY `activityDate` = max `expenseDate` of expenses involving both users in that group.
7. Computation logic SHALL live in `src/lib/friend-timeline.ts` with unit tests.
8. Balance computation SHALL include a "direct" bucket for `groupId = null` items.

### Requirement 9: Settlement — direct ledger support

**User Story:** As a user, I want to settle my direct balance with a friend independently of group balances.

#### Acceptance Criteria

1. THE `SettleAccountsDialog` SHALL include a **"Direct"** / **"Sem grupo"** option alongside shared groups in the bucket radio.
2. WHEN settling the direct bucket, THE system SHALL create an `Expense` with `groupId = null, isReimbursement = true`.
3. A direct settlement SHALL only reduce the direct ledger balance — group balances remain unaffected.
4. A group settlement SHALL only reduce that group's balance — direct ledger remains unaffected.
5. THE `RequestPaymentDialog` SHALL also support the direct bucket.

### Requirement 10: Internationalization

**User Story:** As a user, I want the interface in my language.

#### Acceptance Criteria

1. ALL new strings SHALL use `next-intl` under `Friends.Timeline`, `Friends.List`, `Friends.PaymentDetail`, and `Friends.DirectExpense`.
2. Keys SHALL be added to **all 19 locale files** per `i18n-translations.md`.
3. Portuguese (pt-PT) copy SHALL follow Splitwise reference terms: "Liquidar contas", "contas liquidadas", "Registar um pagamento", "Sem grupo".

### Requirement 11: Tests

**User Story:** As a developer, I need confidence that the migration and new logic are correct.

#### Acceptance Criteria

1. `src/lib/friend-timeline.test.ts` SHALL cover: group summary with zero/non-zero balance, direct expense entries, payment entries, sort order, multi-participant direct expenses, exclusion of unrelated expenses.
2. Migration test: verify DYAD expenses become `groupId = null` with shares intact.
3. Balance engine tests: verify direct bucket is computed correctly alongside group buckets.
4. Debt consolidation tests: verify settle-all creates correct entries per bucket, all balances zeroed.
5. `pnpm test` and `pnpm check-types` SHALL pass.

### Requirement 12: Global settle-all (debt consolidation)

**User Story:** As a user, I want to settle ALL my balances with a friend in one action — across all groups and the direct ledger — without manually settling each bucket.

#### Acceptance Criteria

1. THE Friend_Detail header SHALL offer a **"Liquidar tudo"** action (in addition to per-bucket "Liquidar contas").
2. WHEN the user triggers "Liquidar tudo", THE system SHALL:
   - Compute the **net total** owed across all buckets (groups + direct) per currency.
   - For **each bucket with non-zero balance**, create a settlement entry (`isReimbursement: true`) in that bucket's context (`groupId` = the group, or `null` for direct) that zeros that bucket.
   - Link all created entries with a shared **`bundleId`** (new nullable field on `Expense`).
   - Mark each entry with `creationMethod = 'debt_consolidation'` (new nullable field on `Expense`).
3. THE system SHALL create entries atomically — all or nothing (single transaction).
4. AFTER settle-all, EACH bucket SHALL show zero balance independently (same as if settled one by one).
5. THE schema SHALL add two nullable fields to `Expense`:
   - `creationMethod: String?` — values: `"payment"`, `"debt_consolidation"`, `"equal"`, etc.
   - `bundleId: String?` — groups related entries from one settle-all action.
6. IN THE timeline, debt consolidation entries SHALL be displayed as a **single grouped row**: "Liquidou todos os saldos — {total}" with the date and a collapse/expand to show per-bucket breakdown.
7. IN THE payment detail of a consolidation entry, THE page SHALL show an explanatory note (similar to Splitwise: "{user} recorded a payment that settled all balances. Splitwise/Knots decomposed it into individual settlements per group.").
8. EACH individual consolidation entry SHALL still be deletable/editable independently (undoing one bucket doesn't undo all).
9. THE "Liquidar tudo" action SHALL only appear when there are **2+ buckets** with non-zero balance (if only one bucket, per-bucket settle is sufficient).
10. Multi-currency: IF balances exist in multiple currencies, THE system SHALL create separate consolidation sets per currency (one settle-all per currency, or show a confirmation listing amounts per currency).

## Out of Scope (Future)

- Separate `Payment` Prisma model (decouple from `Expense`)
- Hide settled friends older than 7 days (user setting)
- Collapse pre-settlement history ("tap to show settled expenses before {date}")
- Comments on payments/expenses
- Multi-currency conversion in friend header total
- Payment integrations (MB Way, Revolut, etc.)
- Recurring direct expenses
- Advanced split modes in direct expense form (BY_SHARES, BY_PERCENTAGE, BY_AMOUNT)
- Adding non-group-members to a group expense (split goes partially to group, partially to direct — Splitwise behaviour)

## Relationship to Existing Specs

| Spec                | Relationship                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `friend-balances`   | Reuses and extends balance engine; adds direct bucket; replaces flat expense list UX                   |
| `group-settlements` | Reuses dialogs and mutations; extends to support `groupId = null` settlement; adds payment detail view |
