# Splitwise API Reference (for Knots parity)

Data collected June 2026 from production Splitwise API v3.0.

## Key endpoints

### `GET /api/v3.0/get_expenses?friend_id=X&group_id=0`

Returns **direct expenses** (no group) between the authenticated user and a friend.

- `group_id=0` means "expenses without a group" (`group_id: null` in response)
- Supports pagination: `limit`, `offset`
- Sorted by `date` when `order=date`

### Response shape

```json
{
  "expenses": [
    {
      "id": 4534751708,
      "group_id": null,
      "expense_bundle_id": null,
      "description": "Despesa teste",
      "repeats": false,
      "payment": false,
      "creation_method": "equal",
      "transaction_method": "offline",
      "cost": "1000.0",
      "currency_code": "EUR",
      "repayments": [{ "from": 41216026, "to": 32922942, "amount": "500.0" }],
      "date": "2026-06-25T23:19:42Z",
      "created_at": "2026-06-25T23:19:52Z",
      "created_by": {
        "id": 32922942,
        "first_name": "Rafael",
        "last_name": "Macedo"
      },
      "updated_at": "2026-06-26T00:19:06Z",
      "deleted_at": null,
      "category": { "id": 18, "name": "General" },
      "receipt": { "large": "https://...", "original": "https://..." },
      "users": [
        {
          "user": {
            "id": 41216026,
            "first_name": "Ana Rita",
            "last_name": "Ferreira"
          },
          "user_id": 41216026,
          "paid_share": "0.0",
          "owed_share": "500.0",
          "net_balance": "-500.0"
        },
        {
          "user": {
            "id": 32922942,
            "first_name": "Rafael",
            "last_name": "Macedo"
          },
          "user_id": 32922942,
          "paid_share": "1000.0",
          "owed_share": "500.0",
          "net_balance": "500.0"
        }
      ]
    }
  ]
}
```

## Key fields

| Field                 | Type             | Notes                                                                |
| --------------------- | ---------------- | -------------------------------------------------------------------- |
| `group_id`            | `number \| null` | `null` = direct (no group)                                           |
| `payment`             | `boolean`        | `true` = settlement record, `false` = shared expense                 |
| `creation_method`     | `string`         | `"equal"`, `"split"`, `"payment"`, `"debt_consolidation"`, `null`    |
| `expense_bundle_id`   | `number \| null` | Groups related entries (e.g. "settle all balances" creates a bundle) |
| `cost`                | `string`         | Total expense cost (string decimal)                                  |
| `repayments`          | `array`          | Net transfers: `[{ from, to, amount }]` — simplified debts           |
| `users[].paid_share`  | `string`         | How much this user paid                                              |
| `users[].owed_share`  | `string`         | How much this user owes (their fair share)                           |
| `users[].net_balance` | `string`         | `paid_share - owed_share` (positive = lent, negative = borrowed)     |
| `receipt`             | `object`         | `{ large, original }` — nullable URLs                                |
| `details`             | `string \| null` | Notes/description body                                               |

## Observations from real data

### Direct expenses can have 3+ users

```json
{
  "description": "PdA",
  "group_id": null,
  "cost": "68.0",
  "users": [
    { "user_id": 41106309, "net_balance": "-22.67" },
    { "user_id": 41216026, "net_balance": "-22.67" },
    { "user_id": 32922942, "net_balance": "45.34" }
  ]
}
```

Splitwise allows multi-participant expenses without a group. Each participant has their own repayment entry.

### Payment records

```json
{
  "description": "Payment",
  "payment": true,
  "creation_method": "payment",
  "cost": "1000.0",
  "repayments": [{ "from": 41216026, "to": 32922942, "amount": "1000.0" }]
}
```

- Description is always "Payment" (auto-generated)
- `payment: true` is the canonical indicator
- `repayments` always has exactly one entry for payments

### Debt consolidation ("Liquidar todos os saldos")

```json
{
  "description": "Liquidar todos os saldos",
  "payment": false,
  "creation_method": "debt_consolidation",
  "expense_bundle_id": 21429431,
  "details": "Rafael e Daniel também partilharam despesas em grupos. Em January 24, 2022, Rafael registou um pagamento com Daniel que liquidou o respetivo saldo TOTAL..."
}
```

When a user settles ALL balances with a friend at once, Splitwise:

1. Creates a parent `payment: true` record for the actual payment
2. Auto-generates `debt_consolidation` entries (one per sub-balance) to zero out each context
3. Groups them via `expense_bundle_id`

### Direct payments do NOT affect group balances

A direct payment (`group_id: null, payment: true`) only affects the direct ledger balance. Group debts (Business, Casa) remain unchanged until settled within that group.

### Adding non-members to a group expense

When creating an expense in group "Casa" with a non-member (Daniel):

- Casa group: expense of 2/3 of total between group members (Rafael + Ana)
- Direct ledger: Daniel's share goes to `group_id: null` between Rafael and Daniel

## Knots mapping

| Splitwise field       | Knots equivalent                                                                |
| --------------------- | ------------------------------------------------------------------------------- |
| `group_id: null`      | `Expense.groupId = null` (Phase 2) or `GroupType.DYAD` (Phase 1)                |
| `payment: true`       | `Expense.isReimbursement = true`                                                |
| `description`         | `Expense.title`                                                                 |
| `details`             | `Expense.notes`                                                                 |
| `creation_method`     | No direct equivalent yet                                                        |
| `expense_bundle_id`   | No equivalent — Phase 2+                                                        |
| `repayments[]`        | Computed from `ExpensePaidFor` shares                                           |
| `users[].paid_share`  | `Expense.paidById` + amount (single payer model)                                |
| `users[].owed_share`  | `ExpensePaidFor.shares` → computed amount                                       |
| `users[].net_balance` | Computed: `paidShare - owedShare`                                               |
| `cost`                | `Expense.amount` (minor units in Knots, string decimal in SW)                   |
| `receipt`             | `ExpenseDocument[]` — Splitwise accepts image or PDF ("Attach an image or PDF") |
