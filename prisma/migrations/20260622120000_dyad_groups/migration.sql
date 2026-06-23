-- CreateEnum
CREATE TYPE "GroupType" AS ENUM ('STANDARD', 'DYAD');

-- AlterTable
ALTER TABLE "Group" ADD COLUMN "type" "GroupType" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "Group" ADD COLUMN "dyadKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Group_dyadKey_key" ON "Group"("dyadKey");
