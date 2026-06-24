# Requirements Document: Group Settlements (Splitwise-style)

## Introduction

Knots currently models debt settlement as **expenses with `isReimbursement: true`**, mixed into the expense list with a checkbox on the expense form. This is confusing: a shared cost (despesa) is not the same as a payment between people to clear balances (liquidação).

This feature adds a **Splitwise-style settlement flow** on the group Balances tab:

1. **Solicitar** — Request payment from someone who owes you (opens dialog, sends email).
2. **Liquidar contas** — Record a payment you made to someone you owe (opens dialog, records settlement server-side without navigating to the expense form).

The underlying data model may keep `isReimbursement` expenses for now (no DB migration), but the **UI and copy** must treat settlements as a separate concept from regular expenses.

## Glossary

- **Expense**: A shared cost (dinner, rent, etc.) split between participants.
- **Settlement**: A payment between two people to adjust balances (`isReimbursement: true` internally).
- **Suggested_Settlement**: Output of `getSuggestedReimbursements()` — optimized list of who should pay whom.
- **Balances_Tab**: `/groups/[groupId]/balances` — shows balances chart + suggested settlements.

## Requirements

### Requirement 1: Request Payment (Solicitar)

**User Story:** As a user who is owed money, I want to request payment from a debtor via email, like Splitwise's "Request".

#### Acceptance Criteria

1. THE Balances_Tab SHALL show a **Solicitar** action when the current user is owed money in at least one suggested settlement (`to === currentUserId`).
2. WHEN the user clicks **Solicitar**, THE app SHALL open a **Dialog** to choose who to request payment from (only debtors who owe the current user per suggested settlements).
3. THE Dialog SHALL allow an optional message (max 500 characters).
4. WHEN confirmed, THE app SHALL call `groups.balances.requestPayment` and send an email to the debtor's `User.email`.
5. THE email SHALL include group name, amount, requester name, optional message, and a link to `/groups/{groupId}/balances`.
6. ONLY the creditor (`toUserId`) MAY request payment; the procedure MUST validate the settlement exists in current suggestions.
7. Block checks (`isBlockedBy`) SHALL be enforced; blocked users cannot receive requests.
8. ON success, THE app SHALL show a toast and close the dialog.

### Requirement 2: Settle Up (Liquidar contas)

**User Story:** As a user who owes money, I want to record a payment in one step, like Splitwise's "Settle up".

#### Acceptance Criteria

1. THE Balances_Tab SHALL show a **Liquidar contas** action when the current user owes money in at least one suggested settlement (`from === currentUserId`).
2. WHEN the user clicks **Liquidar contas**, THE app SHALL open a **Dialog** to choose who they paid (only creditors the current user owes per suggested settlements).
3. WHEN confirmed, THE app SHALL call `groups.balances.recordSettlement` and create a settlement expense server-side (no navigation to expense form).
4. Settlement creation SHALL use `buildSettlementFormValues`: `splitMode: BY_AMOUNT`, `paidFor` = creditor only with `shares === amount` (minor units), `isReimbursement: true`, category Payment (id 1).
5. ONLY the debtor (`fromUserId`) MAY record the payment; the procedure MUST validate the settlement exists in current suggestions.
6. ON success, THE app SHALL invalidate balances/expenses queries, show a toast, and close the dialog.
7. THE suggested settlements list SHALL offer **Liquidar** per row (replacing or supplementing "Mark as paid" deep link) using the same `recordSettlement` mutation.

### Requirement 3: Balance Summary (Splitwise-style header)

**User Story:** As a user, I want to see my net position in the group at a glance on the Balances tab.

#### Acceptance Criteria

1. WHEN suggested settlements exist for the current user, THE Balances_Tab SHALL show a summary line (e.g. "{name} owes you {amount}" or "You owe {name} {amount}").
2. WHEN the user is fully settled, THE summary SHALL show an "all settled" message.
3. Summary amounts SHALL use the existing `Money` / `formatCurrency` components.

### Requirement 4: Simplify Expense vs Settlement UX

**User Story:** As a user, I should not think of settlements as regular expenses.

#### Acceptance Criteria

1. THE expense create/edit form SHALL NOT expose an `isReimbursement` checkbox for manual use (settlements only via Balances tab flows).
2. THE reimbursement deep-link prefill (`?reimbursement=yes`) SHALL use `splitMode: BY_AMOUNT` and `paidFor` with only the creditor at 100% of amount (fix Ana/Rafael bug).
3. Settlement rows in the expense list MAY remain `isReimbursement` internally but SHOULD use distinct copy/styling (future: separate section — out of scope unless trivial).

### Requirement 5: i18n

**User Story:** As a user in any supported locale, I want settlement UI in my language.

#### Acceptance Criteria

1. ALL user-facing strings SHALL use `next-intl` keys under `Balances.Actions` and updated `Balances.Reimbursements` where needed.
2. Translations SHALL be added to **all 19 locale files** in `messages/`. Use `i18n-translations.md` in this spec folder as the source.
3. JSON files MUST remain valid after edits.

### Requirement 6: UI Implementation (shadcn)

**User Story:** As a developer, settlements UI must match project conventions.

#### Acceptance Criteria

1. UI SHALL be built with existing shadcn components (`Dialog`, `Button`, `Select` or `RadioGroup`, `Textarea`, `Label`, `Field` patterns).
2. BEFORE adding components, use the **shadcn MCP / CLI** (`pnpm dlx shadcn@latest docs <component>`, `pnpm dlx shadcn@latest search`) — do not reinvent primitives.
3. Follow project shadcn skill rules: `flex` + `gap-*` (no `space-y-*`), semantic colors, `DialogTitle` for a11y, `toast` from `sonner`.
4. Dialogs SHALL follow patterns in `delete-popup.tsx` and `splitwise-import-dialog.tsx`.

### Requirement 7: Tests

#### Acceptance Criteria

1. `src/lib/settlements.test.ts` SHALL pass (settlement math zeroes balances).
2. Typecheck and existing tests SHALL pass (`pnpm check-types`, `pnpm test`).

## Out of Scope (Phase 2)

- New `Settlement` Prisma model / migration away from `isReimbursement`
- Payment integrations (MB Way, PayPal, Venmo)
- Rate limiting on payment request emails
- Email to creditor when settlement is recorded
- Bulk "settle all" in one action
