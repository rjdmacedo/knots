/*
  itemized-expenses v1.1: replace the two fixed tax/tip columns with a single
  signed "Other" remainder pool (source of truth) plus an explicit
  itemsAuthoritative marker.

  Ordering matters: we ADD the new columns, BACKFILL them from the existing
  tax/tip values (so no data is lost while the feature is still unreleased),
  and only THEN DROP taxAmount/tipAmount. On the dev database there are no
  itemized rows yet, so the backfill is a no-op; it is written for safety.
*/

-- CreateEnum
CREATE TYPE "RemainderAllocationMode" AS ENUM ('PROPORTIONAL', 'CUSTOM');

-- AlterTable: add the new columns (tax/tip still present for the backfill)
ALTER TABLE "Expense"
ADD COLUMN     "itemsAuthoritative" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remainderAllocationMode" "RemainderAllocationMode",
ADD COLUMN     "remainderAmount" INTEGER,
ADD COLUMN     "remainderSplitMode" "SplitMode";

-- Backfill: any pre-existing itemized expense (identified by having ExpenseItem
-- rows) folds its tax + tip into the remainder pool, allocated PROPORTIONAL
-- (reproducing the v1.0 "tax and tip proportional to subtotal" behaviour), and
-- becomes authoritative (v1.0 stored items only when itemized).
UPDATE "Expense" e
SET
  "remainderAmount" = COALESCE(e."taxAmount", 0) + COALESCE(e."tipAmount", 0),
  "remainderAllocationMode" = 'PROPORTIONAL',
  "itemsAuthoritative" = true
WHERE EXISTS (
  SELECT 1 FROM "ExpenseItem" i WHERE i."expenseId" = e."id"
);

-- AlterTable: now drop the retired tax/tip columns
ALTER TABLE "Expense"
DROP COLUMN "taxAmount",
DROP COLUMN "tipAmount";

-- CreateTable
CREATE TABLE "ExpenseRemainderShare" (
    "expenseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shares" INTEGER NOT NULL,

    CONSTRAINT "ExpenseRemainderShare_pkey" PRIMARY KEY ("expenseId","userId")
);

-- CreateIndex
CREATE INDEX "ExpenseRemainderShare_userId_idx" ON "ExpenseRemainderShare"("userId");

-- AddForeignKey
ALTER TABLE "ExpenseRemainderShare" ADD CONSTRAINT "ExpenseRemainderShare_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRemainderShare" ADD CONSTRAINT "ExpenseRemainderShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
