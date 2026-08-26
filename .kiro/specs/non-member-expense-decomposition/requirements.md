# Requirements Document

## Introduction

When a group expense includes participants who are not members of that group, the system atomically decomposes the save into two independent expense records rather than rejecting the submission. The first record is a standard group expense covering only the shares owed by group members (`groupId` set). The second is a direct expense (`groupId = null`) covering each non-member's share — one direct expense per non-member — credited to the payer and the non-member as the two parties. Both records share the same title, date, and category as the original intent, and the payer's identity is preserved across both. The UI explains the decomposition inline before and after submission. A `linkedExpenseId` audit field on the direct expense records points back to the group expense so the original total remains discoverable without overloading the `bundleId` column (which is reserved for `DEBT_CONSOLIDATION` settlements).

**Worked example:** Rafael creates 100 € in group "Casa" (members: Rafael, Ana) including Daniel (non-member), equal split → Casa group expense 66.67 € (Rafael and Ana); one direct expense 33.33 € with Daniel as sole debtor.

**Scope decisions:**

- Non-members may appear in `paidFor` only, never as payers of the group expense. The payer must be a group member.
- **Single payer enforced when non-members are present.** Expenses that include at least one non-member in `paidFor` are restricted to exactly one payer (same constraint as reimbursements). If the Expense_Form currently has multiple payers and the user adds a non-member, the Payer_Selector reverts to single-payer mode and displays an explanatory note.
- Multiple non-members produce one direct expense per non-member (N dyads), not a single N-party direct expense. This matches the existing friend-ledger model.
- **Direct_Half model (Model A):** `amount` = the non-member's proportional share of the original total; `splitMode = BY_AMOUNT`; `paidFor` contains exactly one entry — the Non_Member — with `shares` equal to the Direct_Half `amount`. The payer is recorded in `paidById` / `payers` only. With `BY_AMOUNT` and a single-entry `paidFor`, `balances.ts` charges the Non_Member the exact Direct_Half amount. This is consistent with the worked example (33.33 €) and does not require `share * 2`.
- **Decomposition triggers on first save only.** An expense decomposes (create or update) only when its `paidFor` list contains at least one Non_Member AND no Direct_Halves are already linked to it (i.e. the expense is not yet `NON_MEMBER_SPLIT`). Once an expense is tagged `NON_MEMBER_SPLIT`, its Group_Half `paidFor` contains only group members; any subsequent edit of the Group_Half that re-submits non-members in the payload returns `BAD_REQUEST`. The linked Direct_Halves are independent and are never automatically modified by Group_Half edits.
- **EVENLY split uses a single distributor call.** For EVENLY, `distributeEqualAmounts(originalTotal, membersInOrder + nonMembersInOrder)` is called once. Member slots are summed to produce the Group_Half amount; each non-member slot becomes that non-member's Direct_Half amount. Remainder cents land on the first indices of the combined list per the helper's existing behaviour. BY_SHARES and BY_PERCENTAGE follow the same single-call pattern with `distributeWeightedAmounts`. BY_AMOUNT needs no distributor.
- Linking is via a new `linkedExpenseId` field on the direct expense record pointing at the group expense. A new `CreationMethod` value `NON_MEMBER_SPLIT` tags both halves so downstream views can detect paired records without touching `DEBT_CONSOLIDATION` logic.
- Reimbursements (`isReimbursement = true`) do not take the decomposition path; non-members are rejected at validation time for reimbursements.
- Recurring expenses: non-members are disallowed when `recurrenceRule ≠ NONE`. The form and the tRPC procedure both enforce this constraint.
- Edit semantics: editing or deleting one half after initial decomposition does not automatically affect the other. The Group_Half's `paidFor` only ever contains group members; there is no rehydration of non-members from linked Direct_Halves into the edit form.
- Friendship: creating a Direct_Half requires an existing `Friend` record. If no `Friend` record exists, the procedure calls `upsertFriendByEmail` (global `prisma` client, outside the transaction) before opening the transaction. If the transaction fails, the orphaned Friend record remains — same behaviour as `createGlobalExpense`.
- Currency: all amounts on both records are stored in the group's currency (minor units) after server-authoritative FX conversion. A new nullable `expenseCurrencyCode String?` column on `Expense` is added; Direct_Halves populate it with the group's `currencyCode` (fallback: `Group.currency`) so the friend ledger displays the correct currency regardless of the user's preferred currency. Existing group expenses and pre-feature direct expenses leave `expenseCurrencyCode` null and continue to resolve currency via `Group` or `preferredCurrency` as today.
- Auth: only an authenticated user who is a group member may trigger decomposition, enforced by the existing group-membership check (any member, not just the payer).
- i18n: all 19 locale files (`messages/*.json`) receive keys for the decomposition banner and the post-save confirmation copy; `messages/en-US.json` is the source of truth.
- Audit note caveat: the "original total" displayed on the Group_Half detail view reflects the at-creation sum. If either half is independently edited after creation, the displayed figure may no longer match current amounts; the note does not update automatically.
- Out of scope for this feature: copy-expense behaviour on decomposed pairs, duplicate-detection interactions (same title / different amounts), document and notes propagation to both halves, push notifications for Direct_Half creation, CSV export of Direct_Halves, and Splitwise CSV import of non-member group expenses.

## Glossary

- **Expense_Form**: The React component (`ExpenseForm`) where a user creates or edits an expense, including participant selection and split configuration.
- **Participant_Picker**: The UI section within the Expense_Form that allows adding group members and non-members to the `paidFor` list.
- **Payer_Selector**: The UI section within the Expense_Form that controls who paid and how much. Restricted to single-payer mode when at least one Non_Member is present in `paidFor`.
- **Non_Member**: A user who is included in `paidFor` but does not have a `GroupMembership` row for the group being charged.
- **Group_Half**: The group expense record (`groupId` set, `creationMethod = NON_MEMBER_SPLIT`) produced by decomposition, containing only group members in `paidFor` and `paidById`.
- **Direct_Half**: The direct expense record (`groupId = null`, `isReimbursement = false`, `splitMode = BY_AMOUNT`, `creationMethod = NON_MEMBER_SPLIT`) produced by decomposition for a single non-member's share. `paidFor` contains exactly one entry — the Non_Member — with `shares` equal to the Direct_Half `amount`.
- **Decomposition_Banner**: An inline UI element in the Expense_Form that appears when one or more Non_Members are present and explains which shares will become Direct_Halves.
- **Amount_Distributor**: The module `src/lib/distribute-amount.ts` — `distributeWeightedAmounts` and `distributeEqualAmounts` — used to allocate shares in integer minor units without losing remainder cents.
- **tRPC_Groups_Router**: The tRPC router at `src/trpc/routers/groups/` that handles group expense create and update operations.
- **API_Layer**: `src/lib/api.ts` — `createExpense` and `updateExpense` — the server functions invoked by the group expense tRPC procedures.
- **Balance_Calculator**: `src/lib/balances.ts` — computes per-participant paid/owed totals across group expenses.
- **Friend_Balance_Calculator**: `src/lib/friend-balances.ts` — computes balances across both group and direct expenses for a friend pair.
- **linkedExpenseId**: A new optional `String?` column on `Expense` that, for a Direct_Half, references the `id` of the corresponding Group_Half for audit purposes.
- **expenseCurrencyCode**: A new optional `String?` column on `Expense`. Populated on Direct_Halves with the originating group's `currencyCode`. Null on group expenses and pre-feature direct expenses.
- **originalTotalAtDecomposition**: A new optional `Int?` column on `Expense`. Populated on the Group_Half with the original total (minor units) at the moment of first-save decomposition. Null on Direct_Halves and all other expenses.
- **NON_MEMBER_SPLIT**: A new value added to the `CreationMethod` enum in `prisma/schema.prisma` used to tag both halves of a decomposed expense.
- **Activity_Log**: The `Activity` and `ActivityChange` tables, populated via `logActivity` in `src/lib/api.ts`, used to record create/update/delete events.

## Requirements

### Requirement 1: Schema Changes

**User Story:** As a developer, I want the necessary schema additions so that both halves of a decomposed expense are traceable and carry the correct currency without breaking existing data.

#### Acceptance Criteria

1. THE Expense model SHALL include a nullable `linkedExpenseId String?` column that stores the `id` of the corresponding Group_Half when the expense is a Direct_Half, and `null` on all other expenses.
2. THE Expense model SHALL include a nullable `expenseCurrencyCode String?` column. Direct_Halves populate it with the originating group's `currencyCode` (falling back to `Group.currency` if `currencyCode` is null). Existing rows and group expenses leave it `null`.
3. THE `CreationMethod` enum SHALL include a `NON_MEMBER_SPLIT` value distinct from `DEBT_CONSOLIDATION` and `PAYMENT`.
4. THE Expense model SHALL include a nullable `originalTotalAtDecomposition Int?` column that stores the original expense total (minor units) at the moment of decomposition on the Group_Half row, and is `null` on all other expenses including Direct_Halves.
5. WHEN a Prisma migration is applied, THE migration SHALL add `linkedExpenseId` (nullable, no default), `expenseCurrencyCode` (nullable, no default), `originalTotalAtDecomposition` (nullable, no default), and the `NON_MEMBER_SPLIT` enum value using an idempotent guard (`DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN null; END $$` or equivalent) without altering existing rows or balance computations.
6. THE schema SHALL add a database index on `Expense.linkedExpenseId` to support efficient reverse-lookup of all Direct_Halves for a given Group_Half.
7. THE Friend_Balance_Calculator SHALL group direct expenses by `expenseCurrencyCode` (when non-null) instead of `preferredCurrency`, so Direct_Halves display in the originating group's currency in the friend ledger. Direct expenses with `expenseCurrencyCode = null` continue to use the existing `preferredCurrency` resolution.

### Requirement 2: Server-Side Decomposition on First Save

**User Story:** As a group member, I want to create or edit a not-yet-decomposed group expense that includes non-members, so that the correct shares are automatically routed to the group ledger and the friend ledger in one operation.

#### Acceptance Criteria

1. WHEN the tRPC_Groups_Router receives a create-expense request whose `paidFor` list contains at least one Non_Member, THE API_Layer SHALL execute a database transaction that atomically creates the Group_Half and one Direct_Half per Non_Member.
2. WHEN the tRPC_Groups_Router receives an update-expense request whose `paidFor` list contains at least one Non_Member AND the expense does not yet have `creationMethod = NON_MEMBER_SPLIT`, THE API_Layer SHALL execute a database transaction that atomically converts the expense into a Group_Half and creates one Direct_Half per Non_Member. This is a one-way promotion; existing data is not destroyed.
3. WHEN the tRPC_Groups_Router receives an update-expense request for an expense that already has `creationMethod = NON_MEMBER_SPLIT` AND the `paidFor` payload contains at least one Non_Member, THE API_Layer SHALL return a `BAD_REQUEST` error: "This expense has already been split. Edit the direct expense separately."
4. THE Group_Half SHALL include only group-member entries in `paidFor`, computed via Requirement 3.
5. THE Direct_Half for each Non_Member SHALL have `groupId = null`, `isReimbursement = false`, `splitMode = BY_AMOUNT`, `creationMethod = NON_MEMBER_SPLIT`, `linkedExpenseId` set to the Group_Half's `id`, and `expenseCurrencyCode` set to the group's `currencyCode` (fallback to `Group.currency`).
6. THE Direct_Half `paidFor` SHALL contain exactly one entry — the Non_Member — with `shares` equal to the Direct_Half `amount` in group-currency minor units.
7. THE Direct_Half `paidById` SHALL be set to the single payer of the Group_Half.
8. THE Direct_Half `title`, `date`, and `category` SHALL be identical to the original expense input.
9. THE sum of the Group_Half `amount` and all Direct_Half `amount` values SHALL equal the original expense `amount` in group-currency minor units (invariant: no cents lost or gained).
10. WHEN the database transaction fails for any reason, THE API_Layer SHALL roll back all writes and return an `INTERNAL_SERVER_ERROR`; no partial records SHALL be persisted.
11. WHEN the actor does not have a `Friend` record for a Non_Member, THE API_Layer SHALL call `upsertFriendByEmail` (global `prisma` client, outside the transaction) before opening the transaction. If the transaction subsequently fails, the orphaned Friend record remains.
12. THE Group_Half SHALL carry `creationMethod = NON_MEMBER_SPLIT` so downstream views can identify paired records.

### Requirement 3: Split Arithmetic

**User Story:** As a group member, I want the original split to be faithfully preserved across both records with no cents created or destroyed, so that balances are accurate.

#### Acceptance Criteria

1. THE payer is recorded in Group_Half `paidById` only; non-members SHALL NOT appear in `paidById` or `payers` on either record.
2. WHEN the original split mode is `EVENLY`, the Amount_Distributor SHALL be called once as `distributeEqualAmounts(originalTotal, combinedList)` where `combinedList` is the members (in their input order) followed by the non-members (in their input order). The member slots are summed to produce the Group_Half `amount`; each non-member slot becomes that non-member's Direct_Half `amount`. Remainder cents land on the first indices of `combinedList` per the helper's existing behaviour.
3. WHEN the original split mode is `BY_SHARES`, the Amount_Distributor SHALL be called once as `distributeWeightedAmounts(originalTotal, combinedWeights)` using the same member-first, non-member-second ordering. Member slot amounts are summed for the Group_Half; each non-member slot is that non-member's Direct_Half amount.
4. WHEN the original split mode is `BY_PERCENTAGE`, the same single-call `distributeWeightedAmounts` approach as criterion 3 SHALL be used with percentage weights.
5. WHEN the original split mode is `BY_AMOUNT`, the Group_Half `amount` SHALL be the sum of the explicit member amounts; each Direct_Half `amount` SHALL equal the explicit amount assigned to that Non_Member. No distributor call is needed.
6. FOR ALL split modes, `sum(Group_Half.paidFor[*].shares) === Group_Half.amount` (integer minor units, no remainder unaccounted).
7. FOR ALL split modes, `Group_Half.amount + sum(DirectHalf[i].amount) === originalTotal`.

### Requirement 4: Validation Guards

**User Story:** As a developer, I want the server to enforce single-payer, non-member-payer, reimbursement, and recurrence guards before any write, so that the data model stays consistent.

#### Acceptance Criteria

1. IF any entry in `paidBy` / `payers` references a Non_Member, THEN THE API_Layer SHALL return a `BAD_REQUEST` error: "Non-members cannot be payers of a group expense."
2. IF the `paidBy` / `payers` list contains more than one entry and `paidFor` contains at least one Non_Member, THEN THE API_Layer SHALL return a `BAD_REQUEST` error: "Expenses with non-members must have a single payer."
3. IF `isReimbursement = true` and any `paidFor` entry references a Non_Member, THEN THE API_Layer SHALL return a `BAD_REQUEST` error: "Reimbursements cannot include non-members."
4. IF `recurrenceRule ≠ NONE` and any `paidFor` entry references a Non_Member, THEN THE API_Layer SHALL return a `BAD_REQUEST` error: "Recurring expenses cannot include non-members."
5. IF all `paidFor` participants are group members and no other guard condition applies, THEN THE API_Layer SHALL process the expense as a regular group expense without decomposition.
6. Criteria 1–4 SHALL execute before any decomposition logic and before any database writes.

### Requirement 5: Participant Picker — Non-Member Selection in the UI

**User Story:** As a group member, I want to add friends (non-members) to a group expense's `paidFor` list, so that I can capture their share without creating a separate direct expense manually.

#### Acceptance Criteria

1. WHEN the user opens the Expense_Form for a group expense that is not yet `NON_MEMBER_SPLIT`, THE Participant_Picker SHALL list all group members plus any friends of the current user who are not group members.
2. THE Participant_Picker SHALL display a visible label "Not in group" adjacent to each Non_Member's name.
3. WHEN the user selects a Non_Member, the total amount SHALL be re-divided equally among all current `paidFor` participants (including the newly added Non_Member) using `distributeEqualAmounts`; existing shares SHALL be updated accordingly. IF the current total is zero, each participant's share SHALL be zero.
4. WHEN the user removes a Non_Member from `paidFor`, the Non_Member's share SHALL be redistributed equally among the remaining `paidFor` participants.
5. THE Participant_Picker SHALL only surface friends with an existing `Friend` record; arbitrary user search is out of scope.
6. WHEN the current user has no non-member friends, THE Participant_Picker SHALL show only group members (same as the current all-members flow).
7. WHEN the Expense_Form is opened in edit mode for an expense that already has `creationMethod = NON_MEMBER_SPLIT`, THE Participant_Picker SHALL show only group members (no Non_Member options), because rehydration of non-members is not supported for already-decomposed expenses.
8. WHEN at least one Non_Member is present in `paidFor`, THE Payer_Selector SHALL automatically switch to single-payer mode and display an inline note: "Expenses with non-members can only have one payer."

### Requirement 6: Decomposition Banner — Pre-Submit Explanation

**User Story:** As a group member, I want to see an explanation of how the expense will be split before I submit it, so that I understand what records will be created.

#### Acceptance Criteria

1. WHILE at least one Non_Member is present in the Expense_Form `paidFor` list (including when opened in edit mode on a not-yet-decomposed expense with non-members), THE Decomposition_Banner SHALL be visible above the submit button.
2. THE Decomposition_Banner SHALL list each Non_Member by name and the computed Direct_Half amount formatted in the group currency (e.g. "Daniel isn't in Casa — their 33.33 € share will be saved as a direct expense").
3. IF the Group_Half amount is greater than zero, THE Decomposition_Banner SHALL also display the Group_Half amount formatted in the group currency (e.g. "The group expense will be 66.67 €").
4. WHEN the Non_Member list or amounts change (e.g. the user modifies the total or split mode), THE Decomposition_Banner SHALL update synchronously with the form state without requiring a page reload.
5. WHEN all Non_Members are removed from `paidFor`, THE Decomposition_Banner SHALL no longer be visible.
6. THE Decomposition_Banner copy SHALL be driven by i18n keys defined under the `ExpenseForm.decompositionBanner` namespace in `messages/en-US.json`; all 18 remaining locale files SHALL include the same keys.

### Requirement 7: Post-Submit Confirmation

**User Story:** As a group member, I want to see a confirmation after submitting that shows what records were created, so that I know the decomposition succeeded.

#### Acceptance Criteria

1. WHEN the tRPC create or update mutation returns successfully and decomposition occurred, THE Expense_Form SHALL display a post-save notification that includes: the Group_Half amount formatted in the group currency, and for each Direct_Half the counterpart name and amount formatted in the group currency.
2. THE post-save notification SHALL contain a link to the Group_Half expense detail view that navigates in the same browser tab.
3. THE post-save notification copy SHALL use i18n keys in the `ExpenseForm.decompositionBanner` namespace, covering all 19 locale files.
4. THE post-save notification SHALL remain visible until explicitly dismissed by the user (no auto-dismiss), so the user has time to follow the Group_Half link.
5. WHEN no decomposition occurred (all-members expense), THE Expense_Form SHALL show the standard single-record success notification without any decomposition copy.

### Requirement 8: Audit — Original Total Discoverability

**User Story:** As any participant, I want to see the original total at time of creation on both records, so that I can reconcile the decomposed amounts.

#### Acceptance Criteria

1. THE Group_Half detail view SHALL display a note showing the at-creation original total (`Group_Half.amount + sum(amount) WHERE linkedExpenseId = Group_Half.id`), formatted in the group currency, with a caveat that this reflects the state at decomposition time and may differ from current values if either half has been independently edited.
2. WHEN a Direct_Half expense is viewed in the friend ledger, THE Direct_Half detail view SHALL display a note stating it is part of a decomposed group expense and SHALL provide a link to the Group_Half detail view (resolved via `linkedExpenseId`), navigating in the same browser tab.
3. IF `linkedExpenseId` is null on a direct expense, THE direct expense detail view SHALL display no audit note.
4. IF `linkedExpenseId` is set but the referenced Group_Half no longer exists, THE direct expense detail view SHALL display no audit note (graceful degradation — no error, no broken link).
5. The JSON group export SHALL include `linkedExpenseId` on each exported expense row (value is always `null` for Group_Halves in a group export, since Direct_Halves have `groupId = null` and are excluded from group exports). This field is included for schema consistency and forward compatibility.

### Requirement 9: Activity Log

**User Story:** As a group member, I want the activity log to record decomposed expense creation and promotion, so that the group history is complete.

#### Acceptance Criteria

1. WHEN decomposition occurs on create or first-save update, THE Activity_Log SHALL persist a `CREATE_EXPENSE` (on create) or `UPDATE_EXPENSE` (on update) activity row for the Group_Half, attributed to the acting user, within the same database transaction as the expense write.
2. THE activity row SHALL include `ActivityChange` entries for: `paidBy` (old value `null` on create, previous `paidById` on update), `paidFor` (the member-only participant list and their shares), and `amount` (the Group_Half amount).
3. IF the transaction rolls back, THE activity row SHALL also roll back (no phantom log entries).
4. Direct_Half creation SHALL NOT generate a group `Activity` row; Direct_Halves surface in the friend's activity feed via the existing friend-activity infrastructure.

### Requirement 10: Balance Correctness

**User Story:** As any participant, I want balances to reflect the decomposed records correctly, so that settlement suggestions are accurate.

#### Acceptance Criteria

1. THE Balance_Calculator (`balances.ts`) SHALL compute the Group_Half balance using only the Group_Half `paidFor` members and the Group_Half `amount`. Because the Group_Half has `groupId` set and Non_Members are absent from its `paidFor`, no code change is required for this criterion.
2. WHEN a Direct_Half is processed by the Friend_Balance_Calculator, the payer SHALL be credited by `Direct_Half.amount` and the Non_Member SHALL be debited by `Direct_Half.amount`. With `splitMode = BY_AMOUNT` and `paidFor = [Non_Member, shares = amount]`, the existing `balances.ts` logic already produces this result without modification.
3. FOR ALL decomposed expenses, the payer's net position (across the Group_Half and all linked Direct_Halves) SHALL equal: `originalTotal − payerOwnShare`, where `payerOwnShare` is the payer's proportional share of the original split. This property SHALL be expressed as a property-based test (Requirement 12).
4. THE Balance_Calculator SHALL produce identical `paid` and `paidFor` totals per participant for all-member expenses regardless of whether `creationMethod` is `NON_MEMBER_SPLIT` or any other value.

### Requirement 11: Edit and Delete Semantics — Independent After Creation

**User Story:** As a group member, I want predictable behaviour when I edit or delete one half of a decomposed expense after the initial save, so that I do not accidentally orphan records.

#### Acceptance Criteria

1. WHEN a user edits a Group_Half via the group expense form and the `paidFor` payload contains no Non_Members, THE API_Layer SHALL update the Group_Half as a regular group expense. Existing linked Direct_Halves are NOT automatically updated or deleted; they become independent direct expenses from that point.
2. WHEN a user edits a Group_Half via the group expense form and the `paidFor` payload contains Non_Members, Requirement 2.3 applies (`BAD_REQUEST` because the expense is already `NON_MEMBER_SPLIT`).
3. WHEN a Direct_Half is edited via the friend ledger, only the Direct_Half's own fields change; the linked Group_Half SHALL retain its original values.
4. WHEN a Group_Half is deleted, THE linked Direct_Halves SHALL NOT be automatically deleted; their `linkedExpenseId` field SHALL be set to `null` so they become standalone direct expenses.
5. WHEN a Direct_Half is deleted, THE linked Group_Half SHALL NOT be automatically deleted and SHALL retain its original field values.
6. WHILE at least one Direct_Half with a matching `linkedExpenseId` exists, THE Group_Half detail view SHALL display a persistent banner: "Editing or deleting this expense does not automatically update the associated direct expenses."
7. THE Direct_Half detail view SHALL display a persistent banner: "This expense is part of a split that also includes a group expense. Editing or deleting it does not affect the group record."

### Requirement 12: Money Exactness and Balance — Property Tests

**User Story:** As a developer, I want property-based tests that verify no cents are created or destroyed and that balances are correct, so that I can trust the split arithmetic across all inputs.

#### Acceptance Criteria

1. A property-based test SHALL generate arbitrary inputs: total amount (integer, 1–1 000 000 minor units), member participant count (1–10), Non_Member count (1–5), and split mode (one of `EVENLY`, `BY_SHARES`, `BY_PERCENTAGE`, `BY_AMOUNT`). For `BY_SHARES` and `BY_PERCENTAGE`, participant weights SHALL be positive integers / positive percentages.
2. FOR ALL generated inputs, the test SHALL assert `Group_Half.amount + sum(Direct_Half[i].amount) === originalTotal`.
3. FOR ALL generated inputs, the test SHALL assert `sum(Group_Half.paidFor[*].shares) === Group_Half.amount`.
4. FOR ALL generated inputs, the test SHALL assert no Direct_Half `amount` is negative. (Zero-amount Direct_Halves are theoretically possible only when `originalTotal < totalParticipantCount` in EVENLY mode; the property test SHALL record any such case but SHALL NOT fail on them, and the implementation SHALL handle them by excluding zero-amount non-members from decomposition — they are treated as group members with zero share.)
5. A second property-based test SHALL assert the payer net-position invariant from Requirement 10.3 across the same input space.
6. Both property tests SHALL run under Jest via `pnpm test` with a minimum of 100 generated cases each.

### Requirement 13: Recurring Expense Guard

**User Story:** As a group member, I want the system to prevent me from setting a recurrence rule on an expense that includes non-members, so that the recurring materialisation logic stays simple.

#### Acceptance Criteria

1. WHILE `recurrenceRule ≠ NONE` and at least one Non_Member is present in the `paidFor` list, THE Expense_Form SHALL display an inline validation error indicating that recurring expenses cannot include participants who are not group members.
2. THE Expense_Form SHALL prevent submission while criterion 1 holds; the user must set `recurrenceRule = NONE` or remove all Non_Members before submitting.
3. WHEN the Expense_Form is opened in edit mode for an expense with `recurrenceRule ≠ NONE`, THE Participant_Picker SHALL not surface Non_Member options.
4. IF the tRPC procedure receives `recurrenceRule ≠ NONE` with a Non_Member in `paidFor`, THEN THE API_Layer SHALL return a `BAD_REQUEST` error (server-side guard; mirrors Requirement 4.4).

### Requirement 14: Currency — Group Currency Throughout

**User Story:** As a group member, I want all amounts on both records to be stored in the group currency and displayed correctly in the friend ledger, so that balances are comparable.

#### Acceptance Criteria

1. WHEN the original expense has `originalCurrency ≠ groupCurrencyCode`, THE server SHALL perform FX conversion before decomposition; decomposition SHALL operate on the converted group-currency total.
2. THE Group_Half SHALL store the server-resolved `originalAmount`, `originalCurrency`, and `conversionRate` from the FX conversion step.
3. THE Direct_Half SHALL store amounts in group-currency minor units only; `originalAmount`, `originalCurrency`, and `conversionRate` SHALL be `null` on Direct_Halves.
4. THE Direct_Half `expenseCurrencyCode` SHALL be set to the group's `currencyCode`; if `currencyCode` is null on the group, it SHALL fall back to the group's `currency` symbol.
5. IF the FX conversion step fails, THE API_Layer SHALL return a `BAD_REQUEST` error and perform no database writes.

### Requirement 15: i18n — All Locale Files Updated

**User Story:** As a non-English user, I want the decomposition UI copy to appear in my language, so that the feature is accessible in all supported locales.

#### Acceptance Criteria

1. THE `messages/en-US.json` file SHALL define keys under the `ExpenseForm.decompositionBanner` namespace for: the per-non-member banner line, the group-half summary line, the post-save notification title, the post-save per-non-member line, the single-payer restriction note, the independent-edit/delete warning on the Group_Half detail view, and the independent-edit/delete warning on the Direct_Half detail view.
2. WHEN a key is present in `messages/en-US.json`, THE same key SHALL be present in all 18 remaining locale files: `ca.json`, `cs-CZ.json`, `de-DE.json`, `es.json`, `fi.json`, `fr-FR.json`, `it-IT.json`, `ja-JP.json`, `nl-NL.json`, `pl-PL.json`, `pt-BR.json`, `pt-PT.json`, `ro.json`, `ru-RU.json`, `tr-TR.json`, `ua-UA.json`, `zh-CN.json`, `zh-TW.json`.
3. WHERE a locale translation is not yet available, THE locale file SHALL use the English string as a placeholder so the UI never displays a raw i18n key.
