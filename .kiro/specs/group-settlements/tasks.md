# Implementation Plan: Group Settlements

## Overview

Complete Splitwise-style Request + Settle flows on the Balances tab. Backend is partially done; focus on UI (shadcn MCP), i18n (all 19 locales), expense form fixes, and tests.

**IMPORTANT FOR KIRO:**

- Use the **shadcn MCP / CLI** for all UI (`pnpm dlx shadcn@latest docs <component>`). Read `components.json` — style is `base-vega`.
- Add **all i18n keys to all 19 locale files** using `i18n-translations.md` in this folder.
- Do not create git commits unless the user explicitly asks.

## Tasks

- [x] 0. Verify existing backend (working tree)
  - [x] 0.1 Confirm `src/lib/settlements.ts`, tests, email service, tRPC procedures compile
  - [x] 0.2 Run `pnpm test src/lib/settlements.test.ts` and `pnpm check-types`
  - _Requirements: 7.1, 7.2_

- [x] 1. Fix settlement creation prefill
  - [x] 1.1 Update `expense-form.tsx` reimbursement URL prefill: `BY_AMOUNT`, creditor-only `paidFor`, correct `shares`
  - [x] 1.2 Remove `isReimbursement` checkbox from expense form UI
  - _Requirements: 4.1, 4.2_

- [x] 2. i18n — ALL 19 locale files
  - [x] 2.1 Add `Balances.Actions` keys to `messages/en-US.json` (source of truth)
  - [x] 2.2 Add/update `Balances.Reimbursements.settle` and related keys in en-US
  - [x] 2.3 Propagate translations to all other 18 locale files per `i18n-translations.md`
  - [x] 2.4 Validate JSON syntax for every `messages/*.json` file
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 3. Build UI with shadcn MCP
  - [x] 3.1 Run `pnpm dlx shadcn@latest docs dialog` (and select/textarea/field) — follow base-vega APIs
  - [x] 3.2 Create `request-payment-dialog.tsx`
  - [x] 3.3 Create `settle-accounts-dialog.tsx`
  - [x] 3.4 Create `balances-actions.tsx` (summary + Solicitar + Liquidar buttons)
  - [x] 3.5 Integrate into `balances-and-reimbursements.tsx` with `profile.getProfile` for `currentUserId`
  - _Requirements: 1.1–1.8, 2.1–2.7, 3.1–3.3, 6.1–6.4_

- [x] 4. Update reimbursement list
  - [x] 4.1 Replace "Mark as paid" link with **Liquidar** using `recordSettlement` mutation (or dialog)
  - [x] 4.2 Optional: add **Solicitar** per row when current user is creditor
  - _Requirements: 2.7_

- [x] 5. Checkpoint — manual + automated tests
  - [x] 5.1 Two-user scenario: expense → request email → settle → zero balance
  - [x] 5.2 Confirm settlement `paidFor` has only creditor (no Ana/Rafael 25€ bug)
  - [x] 5.3 `pnpm test` and lint pass

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["0.1", "0.2"] },
    { "id": 1, "tasks": ["1.1", "1.2", "2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "2.4"] },
    { "id": 3, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "4.1"] },
    { "id": 4, "tasks": ["5.1", "5.2", "5.3"] }
  ]
}
```

## Notes

- Amounts are in **minor units** (cents) in API; display via `formatCurrency` / `Money`.
- `requestPayment`: caller must be `toUserId` (creditor).
- `recordSettlement`: caller must be `fromUserId` (debtor).
- Email requires `RESEND_API_KEY` in env for integration testing.
