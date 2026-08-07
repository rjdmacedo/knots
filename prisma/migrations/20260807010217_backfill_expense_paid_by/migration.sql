-- Backfill ExpensePaidBy from existing single-payer expenses.
-- This migration is idempotent: safe to run multiple times without creating duplicates.
-- It handles ALL expenses regardless of groupId (including null groupId for orphaned/direct-friend expenses).

INSERT INTO "ExpensePaidBy" ("expenseId", "userId", "amount")
SELECT e."id", e."paidById", e."amount"
FROM "Expense" e
WHERE NOT EXISTS (
  SELECT 1 FROM "ExpensePaidBy" epb WHERE epb."expenseId" = e."id"
)
ON CONFLICT ("expenseId", "userId") DO NOTHING;
