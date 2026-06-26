# Design Document: Friend Timeline (Splitwise-style)

## Overview

Eliminate the `GroupType.DYAD` hack. Direct expenses and payments live as `Expense` records with `groupId = null`. Redesign the friend UX to match Splitwise: debt-focused friends list, unified timeline, payment detail, and simplified direct expense creation.

### Key Design Decisions

1. **`groupId` nullable** — expenses/payments without a group have `groupId = null`. No DYAD groups.
2. **Single entity for payments** — payments remain `Expense` with `isReimbursement: true` (mirrors Splitwise `payment: true`). No separate `Payment` model.
3. **Multi-participant direct expenses** — unlike the old DYAD (always 2 users), direct expenses can have N participants.
4. **Per-bucket settlement** — direct ledger (`groupId = null`) and each group are independent balance buckets. Settling one never affects another.
5. **Timeline is derived data** — built at query time from expenses across all contexts.
6. **Username routes** — canonical `/friends/[username]`; remove legacy `[friendId]` routes.

### Splitwise → Knots field mapping

| Splitwise                               | Knots                                             |
|-----------------------------------------|---------------------------------------------------|
| `group_id: null`                        | `Expense.groupId = null`                          |
| `payment: true`                         | `Expense.isReimbursement = true`                  |
| `description`                           | `Expense.title`                                   |
| `details`                               | `Expense.notes`                                   |
| `cost` (string decimal)                 | `Expense.amount` (integer, minor units)           |
| `repayments[{from, to, amount}]`        | Computed from `ExpensePaidFor` shares (see below) |
| `receipt`                               | `ExpenseDocument[]` (image or PDF)                |
| `creation_method: "payment"`            | `isReimbursement = true`                          |
| `creation_method: "debt_consolidation"` | `Expense.creationMethod = 'debt_consolidation'`   |
| `expense_bundle_id`                     | `Expense.bundleId`                                |

### Repayments: storage vs. API

**Storage (source of truth):** `ExpensePaidFor` with shares — preserves the _intent_ of the split (equal, percentage, fixed amounts, by shares). This is more expressive than storing just the net result.

**API response (computed):** Expose a `repayments: [{from, to, amount}]` field in timeline and expense detail responses — computed at query time from `paidById` + `ExpensePaidFor` shares. This gives the frontend the "who owes whom how much" answer directly, without client-side recalculation.

```typescript
// Computed at query time, not stored
type Repayment = {
  from: string // userId who owes
  to: string // userId who is owed
  amount: number // minor units
}

function computeRepayments(expense: ExpenseWithPaidFor): Repayment[] {
  // For single-payer (current Knots model):
  // Each participant who didn't pay owes their share to paidById
  // For multi-payer (future): more complex net settlement
}
```

**Why not store repayments directly:**

- Loses split semantics ("divided equally among 3" vs. "33.33€ fixed per person")
- Makes editing harder (change shares → must recompute and re-store)
- `ExpensePaidFor` already exists and works; repayments are a view on top

**Future optimization:** If balance queries become slow, add a denormalized `repayments` JSONB column or materialized view — but treat it as cache, not source of truth.

## Schema Changes

### Prisma migration

```prisma
// BEFORE
model Expense {
  group   Group  @relation(fields: [groupId], references: [id], onDelete: Cascade)
  groupId String
}

enum GroupType {
  STANDARD
  DYAD
}

model Group {
  type    GroupType @default(STANDARD)
  dyadKey String?  @unique
}

// AFTER
model Expense {
  group   Group?  @relation(fields: [groupId], references: [id], onDelete: Cascade)
  groupId String?

  // New fields for debt consolidation (settle-all)
  creationMethod String?   // "payment", "debt_consolidation", "equal", "split", etc.
  bundleId       String?   // groups related entries (e.g. all entries from one settle-all action)
}

enum GroupType {
  STANDARD
}

model Group {
  type GroupType @default(STANDARD)
  // dyadKey removed
}
```

### Migration SQL (conceptual)

```sql
-- 1. Make groupId nullable
ALTER TABLE "Expense" ALTER COLUMN "groupId" DROP NOT NULL;

-- 2. Add new fields
ALTER TABLE "Expense" ADD COLUMN "creationMethod" TEXT;
ALTER TABLE "Expense" ADD COLUMN "bundleId" TEXT;

-- 3. Create index for bundle lookups
CREATE INDEX "Expense_bundleId_idx" ON "Expense"("bundleId") WHERE "bundleId" IS NOT NULL;

-- 4. Move DYAD expenses to direct (groupId = null)
UPDATE "Expense"
SET "groupId" = NULL
WHERE "groupId" IN (SELECT id FROM "Group" WHERE type = 'DYAD');

-- 5. Backfill creationMethod for existing payments
UPDATE "Expense"
SET "creationMethod" = 'payment'
WHERE "isReimbursement" = true;

-- 6. Move Activity records (preserve history)
DELETE FROM "Activity" WHERE "groupId" IN (SELECT id FROM "Group" WHERE type = 'DYAD');

-- 7. Clean up DYAD infrastructure
DELETE FROM "GroupMembership" WHERE "groupId" IN (SELECT id FROM "Group" WHERE type = 'DYAD');
DELETE FROM "Group" WHERE type = 'DYAD';

-- 8. Remove dyadKey column and DYAD enum value
ALTER TABLE "Group" DROP COLUMN "dyadKey";
```

### Impact on existing code

| Module                      | Change needed                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/lib/dyad-groups.ts`    | **DELETE** — no longer needed                                                                    |
| `src/lib/balances.ts`       | Add handling for `groupId = null` bucket                                                         |
| `src/lib/totals.ts`         | Handle expenses without group context                                                            |
| `src/trpc/routers/groups/`  | Expense creation: allow `groupId` to be omitted                                                  |
| `src/trpc/routers/friends/` | New procedures: `getTimeline`, `getDirectExpenses`, `createDirectExpense`, `recordDirectPayment` |
| `src/app/friends/`          | Full UI rewrite                                                                                  |
| Group expense list          | Filter out `groupId = null` (they don't belong to any group)                                     |

## Architecture

```mermaid
graph TD
    A[Friends List /friends] --> B[friends.listWithBalances]
    A --> C[Filter non-zero + aggregate header]

    D[Friend Detail /friends/username] --> E[friends.getTimeline]
    E --> F[buildFriendTimeline]
    F --> G[getSharedGroups - standard only]
    F --> H[getDirectExpenses - groupId null]
    F --> I[computeFriendBalance - includes direct bucket]

    D --> K[FriendTimelineHeader]
    K --> L[FriendBalancesActions - per bucket settle]
    D --> M[FriendTimelineList]

    N[Add expense FAB] --> O[DirectExpenseDialog]
    O --> P[friends.createDirectExpense]

    M -->|EXPENSE click| R[expense detail/edit]
    M -->|GROUP_SUMMARY click| S[/groups/groupId]
    M -->|PAYMENT click| T[/friends/username/payments/expenseId]

    U[Settle direct] --> V[friends.recordDirectPayment]
    V --> W[Create Expense with groupId=null, isReimbursement=true]
```

## Timeline builder

**File:** `src/lib/friend-timeline.ts` (new)

```typescript
export type TimelineGroupSummary = {
  type: 'GROUP_SUMMARY'
  groupId: string
  groupName: string
  activityDate: Date // max expenseDate of shared expenses in this group
  balanceAmount: number // minor units; pairwise (positive = friend owes you)
  currency: string
  isSettled: boolean
}

export type TimelineExpense = {
  type: 'EXPENSE'
  expenseId: string
  title: string
  expenseDate: Date
  amount: number // total cost in minor units
  currency: string
  paidById: string
  paidByName: string
  userShare: number // from current user POV: positive = lent, negative = borrowed
  participantCount: number // 2+ (can be multi-participant)
}

export type TimelinePayment = {
  type: 'PAYMENT'
  expenseId: string
  groupId: string | null // null = direct payment
  groupName: string | null
  expenseDate: Date
  amount: number
  currency: string
  fromUserId: string
  fromUserName: string
  toUserId: string
  toUserName: string
}

export type TimelineEntry =
  | TimelineGroupSummary
  | TimelineExpense
  | TimelinePayment
```

### Algorithm

1. **Standard shared groups**: For each group where both users are members, compute pairwise balance and find latest activity date. Emit one `GROUP_SUMMARY`.

2. **Direct expenses** (`groupId = null`, `isReimbursement = false`): For each expense involving both users → emit `EXPENSE`.

3. **Payments** (`isReimbursement = true`): For each payment involving both users in ANY context (group or direct) → emit `PAYMENT`.

4. **Sort** all entries by date descending, tie-break by `createdAt` desc.

### Balance computation update

```typescript
// Current: computeFriendBalance returns per-group breakdown
// New: add a "direct" bucket

type FriendBalanceBucket = {
  groupId: string | null // null = direct ledger
  groupName: string | null // null for direct, group name otherwise
  amount: number // minor units, positive = they owe you
  currency: string
}
```

## tRPC Procedures

### `friends.getTimeline`

```typescript
getTimeline: protectedProcedure
  .input(
    z.object({
      friendId: z.string().min(1),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }),
  )
  .query(async ({ ctx, input }) => {
    // 1. Verify friend ownership + connected status
    // 2. Get shared standard groups
    // 3. Get direct expenses (groupId = null) involving both users
    // 4. Compute balances (all buckets including direct)
    // 5. Build timeline entries
    // 6. Apply pagination
    return { friend, currentUserId, balances, settlements, entries }
  })
```

### `friends.createDirectExpense`

```typescript
createDirectExpense: protectedProcedure
  .input(
    z.object({
      friendId: z.string(),
      title: z.string().min(1),
      amount: z.number().int().positive(), // minor units
      currency: z.string(),
      paidById: z.string(), // currentUser or friend
      expenseDate: z.date().optional(),
      notes: z.string().optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    // Create Expense with groupId = null, splitMode = EVENLY
    // Create ExpensePaidFor for both users (equal shares)
    // Return expense
  })
```

### `friends.recordDirectPayment`

```typescript
recordDirectPayment: protectedProcedure
  .input(
    z.object({
      friendId: z.string(),
      amount: z.number().int().positive(),
      currency: z.string(),
      fromUserId: z.string(),
      toUserId: z.string(),
      date: z.date().optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    // Create Expense with groupId = null, isReimbursement = true
    // paidById = fromUserId
    // Single ExpensePaidFor entry for toUserId
    // Return payment
  })
```

## UI Components

### Friends list refactor

**File:** `src/app/friends/friends-management.tsx`

- `FriendsAggregateHeader` — sums total by currency ("No total, devem-lhe X €")
- `FriendsDebtList` — only non-zero balance friends
- `FriendsSettledSection` — collapsed, "Show N settled friends"
- Row: avatar + name + balance per currency → link to `/friends/[username]`
- Keep add/pending/requests section

### Friend detail — timeline

**File:** `src/app/friends/[username]/page.tsx` (new default)

- Header: `FriendTimelineHeader` with balance summary + actions
- Body: `FriendTimelineList` with entry rows
- FAB: "Add expense" → `DirectExpenseDialog`

**File:** `src/app/friends/[username]/friend-timeline.tsx`

Row components:

- `GroupSummaryRow` — group icon, name, date, balance badge
- `TimelineExpenseRow` — receipt icon, title, date, lent/borrowed
- `PaymentTimelineRow` — banknote icon, "{payer} paid {payee} {amount}"

### Payment detail

**File:** `src/app/friends/[username]/payments/[expenseId]/page.tsx`

- Payer avatar → Payee avatar
- "{payer} paid {payee}"
- Amount
- Date
- "Added by {name} on {date}"
- Disclaimer: "This payment was recorded using 'Record a payment'. No money was transferred."
- Edit / Delete actions

### Direct expense dialog

**File:** `src/app/friends/[username]/direct-expense-dialog.tsx`

- Title input (required)
- Amount input + currency display
- "Paid by" toggle: You / {friend name}
- Date picker (default today)
- Attach image/PDF (optional)
- Notes textarea (optional)
- Submit → `friends.createDirectExpense`

## Global settle-all (debt consolidation)

### How it works

When a user clicks "Liquidar tudo" for a friend:

```
Input: currentUserId, friendUserId, currency
Output: N settlement entries (one per non-zero bucket), linked by bundleId

1. Compute balances per bucket: [{groupId, amount, currency}]
2. Filter buckets where amount ≠ 0 for the given currency
3. If only 1 bucket → reject (use per-bucket settle instead)
4. Generate bundleId = cuid()
5. For each non-zero bucket:
   - Create Expense:
     - groupId = bucket.groupId (or null for direct)
     - isReimbursement = true
     - amount = abs(bucket.amount)
     - paidById = whoever owes (negative balance side)
     - creationMethod = "debt_consolidation"
     - bundleId = shared bundleId
     - ExpensePaidFor: single entry for the payee
6. All created in a single DB transaction
```

### tRPC procedure

```typescript
settleAll: protectedProcedure
  .input(
    z.object({
      friendId: z.string(),
      currency: z.string(), // settle one currency at a time
    }),
  )
  .mutation(async ({ ctx, input }) => {
    // 1. Get all balance buckets for this currency
    // 2. Filter non-zero
    // 3. If only 1 bucket → reject (use per-bucket settle instead)
    // 4. Create all entries in transaction
    // 5. Return { bundleId, entries: Expense[] }
  })
```

### Timeline display

Consolidation entries with the same `bundleId` are grouped in the timeline:

```
┌─────────────────────────────────────────────┐
│ 📦 Liquidou todos os saldos — 150,00 €      │
│    jan. 26                                   │
│  ├─ Casa 🏠: 80,00 €                        │
│  ├─ Business: 50,00 €                       │
│  └─ Direto: 20,00 €                         │
└─────────────────────────────────────────────┘
```

- Collapsed by default: shows total + date
- Expandable: shows per-bucket breakdown
- Each sub-entry is clickable → payment detail
- Payment detail shows disclaimer: "Este pagamento faz parte de uma liquidação total de saldos..."

### Edge cases

- **Multi-currency:** If friend has balances in EUR and USD, show separate "Liquidar tudo" per currency (or a confirmation listing both). Each creates its own bundle.
- **Single bucket non-zero:** "Liquidar tudo" button hidden — per-bucket settle is sufficient.
- **Partial undo:** Deleting one consolidation entry only reverses that bucket's settlement. The `bundleId` still links the others but each is independent.

### Title rendering for consolidation entries

Consolidation entries do NOT store a translated title in `Expense.title`. Instead:

- **Storage:** `title = ""` (empty string) or a fixed token — the `creationMethod = 'debt_consolidation'` field is the canonical indicator.
- **Rendering:** The frontend checks `creationMethod`:
  - If `'debt_consolidation'` → render using i18n key `Friends.SettleAll.timelineLabel` ("Liquidou todos os saldos — {amount}") in the viewer's locale.
  - Otherwise → render `expense.title` as usual.

This avoids the Splitwise problem where the title is stored in the creator's language and shown untranslated to other users. Each user sees the label in their own language.

## Rollout plan

1. **Schema migration** — `groupId` nullable, add `creationMethod`/`bundleId`, move DYAD data, delete DYAD groups
2. **Backend refactor** — balance engine supports direct bucket, new tRPC procedures
3. **Friend timeline UI** — new default view replacing tabs
4. **Friends list refactor** — debt-focused
5. **Payment detail + Direct expense dialog**
6. **Cleanup** — remove dead DYAD code, legacy `[friendId]` routes, old tabs

## Files touched (expected)

| Action    | Path                                                       |
| --------- | ---------------------------------------------------------- |
| New       | `prisma/migrations/XXXX_nullable_group_id/migration.sql`   |
| New       | `src/lib/friend-timeline.ts`                               |
| New       | `src/lib/friend-timeline.test.ts`                          |
| New       | `src/app/friends/[username]/page.tsx`                      |
| New       | `src/app/friends/[username]/friend-timeline.tsx`           |
| New       | `src/app/friends/[username]/direct-expense-dialog.tsx`     |
| New       | `src/app/friends/[username]/payments/[expenseId]/page.tsx` |
| Update    | `prisma/schema.prisma`                                     |
| Update    | `src/lib/balances.ts`                                      |
| Update    | `src/lib/totals.ts`                                        |
| Update    | `src/trpc/routers/friends/index.ts`                        |
| Update    | `src/trpc/routers/groups/` (expense creation)              |
| Update    | `src/app/friends/friends-management.tsx`                   |
| Update    | `src/app/friends/[username]/friend-layout-client.tsx`      |
| Delete    | `src/lib/dyad-groups.ts`                                   |
| Delete    | `src/lib/dyad-groups.test.ts`                              |
| Deprecate | `src/app/friends/[username]/expenses/`                     |
| Deprecate | `src/app/friends/[friendId]/` (legacy routes)              |

## Risks

| Risk                                             | Mitigation                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| Migration data loss                              | Verify ExpensePaidFor shares survive; reversible migration               |
| Breaking existing group expense queries          | Group queries filter `WHERE groupId IS NOT NULL` — add filter everywhere |
| Balance computation perf (more expenses to scan) | Direct expenses are typically few per pair; index on `groupId IS NULL`   |
| Multi-participant direct expenses edge cases     | Start with 2-user (friend context); multi-user is natural extension      |
| PushSubscription / Activity tied to groupId      | Activities for DYADs deleted; push subs only exist for real groups       |
