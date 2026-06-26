# Migration Safety Verification: ExpensePaidFor preservation

**Task:** 0.3 — Verify migration preserves `ExpensePaidFor` records for migrated expenses  
**Requirement:** 1.7 — `ExpensePaidFor` records for migrated expenses SHALL remain intact (no data loss on participant shares)

## Summary

✅ **SAFE** — The planned migration (`UPDATE "Expense" SET "groupId" = NULL WHERE ...`) will NOT delete or modify any `ExpensePaidFor` records.

## Analysis

### 1. ExpensePaidFor has NO relation to Group

The `ExpensePaidFor` table's foreign keys are:

```sql
-- FK to Expense (cascade on delete of the EXPENSE, not the group)
"ExpensePaidFor_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE

-- FK to User
"ExpensePaidFor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
```

`ExpensePaidFor` has **no column referencing `groupId`** and **no foreign key to the `Group` table**. Its only link to a group is indirect: `ExpensePaidFor → Expense → Group`. Setting `Expense.groupId = NULL` does not trigger any cascade on `ExpensePaidFor`.

### 2. The planned UPDATE does not cascade

The migration will execute:

```sql
UPDATE "Expense"
SET "groupId" = NULL
WHERE "groupId" IN (SELECT id FROM "Group" WHERE type = 'DYAD');
```

This UPDATE:
- Changes `Expense.groupId` from a DYAD group ID to `NULL`
- Does **NOT** delete the `Expense` record itself
- Since `ExpensePaidFor` cascades on **DELETE** of its parent `Expense` (not on UPDATE of unrelated columns), participant shares are untouched

### 3. The Expense foreign key to Group uses ON DELETE CASCADE — but we're NOT deleting expenses

The `Expense_groupId_fkey` constraint is:

```sql
FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE
```

This means: if a `Group` row is **deleted**, all `Expense` rows referencing it are cascaded-deleted. **However**, the migration sets `groupId = NULL` on DYAD expenses **before** deleting the DYAD groups. After the UPDATE, those expenses no longer reference the DYAD groups, so the subsequent `DELETE FROM "Group" WHERE type = 'DYAD'` will NOT cascade to any expenses.

**Correct migration order:**
1. `UPDATE "Expense" SET "groupId" = NULL WHERE "groupId" IN (SELECT id FROM "Group" WHERE type = 'DYAD')`
2. `DELETE FROM "GroupMembership" WHERE "groupId" IN (SELECT id FROM "Group" WHERE type = 'DYAD')`
3. `DELETE FROM "Group" WHERE type = 'DYAD'`

Step 1 detaches expenses from DYAD groups. Step 3 can then safely delete groups without cascade.

### 4. ExpensePaidFor composite primary key is independent

```sql
PRIMARY KEY ("expenseId", "userId")
```

The key is `(expenseId, userId)` — completely independent of any group relationship.

### 5. Shares data preserved

The `shares` column on `ExpensePaidFor` (which stores the split amounts/weights) is a property of the record itself. No operation on `Expense.groupId` can alter it.

## Conclusion

The planned migration is safe for `ExpensePaidFor` because:
- `ExpensePaidFor` references `Expense.id`, not `Expense.groupId` or `Group.id`
- Setting `groupId = NULL` on an `Expense` is a simple column update — no cascade triggers
- DYAD groups are deleted **after** their expenses are detached, preventing cascade deletion
- No data loss occurs on participant shares, amounts, or split information

**Verified:** 2025 — Task 0.3 complete.
