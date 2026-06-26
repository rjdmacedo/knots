-- CreateEnum
CREATE TYPE "CreationMethod" AS ENUM ('PAYMENT', 'DEBT_CONSOLIDATION');

-- AlterTable
ALTER TABLE "Expense" 
  DROP COLUMN "creationMethod",
  ADD COLUMN "creationMethod" "CreationMethod";

-- AlterTable
ALTER TABLE "Group" 
  DROP COLUMN "type";

-- DropEnum
DROP TYPE "GroupType";
