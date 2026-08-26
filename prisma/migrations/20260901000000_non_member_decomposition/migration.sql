DO $$ BEGIN
  ALTER TYPE "CreationMethod" ADD VALUE 'NON_MEMBER_SPLIT';
EXCEPTION WHEN duplicate_object THEN null;
END $$;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "linkedExpenseId" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "expenseCurrencyCode" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "originalTotalAtDecomposition" INTEGER;
CREATE INDEX IF NOT EXISTS "Expense_linkedExpenseId_idx" ON "Expense"("linkedExpenseId");
