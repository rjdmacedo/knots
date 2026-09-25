-- AlterTable
ALTER TABLE "ExpenseItem" ADD COLUMN "unitPrice" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ExpenseItem" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;

-- Backfill: existing lines are 1 × amount
UPDATE "ExpenseItem" SET "unitPrice" = "amount", "quantity" = 1;
