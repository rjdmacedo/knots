-- Migration: Remove DYAD groups, make groupId nullable, add consolidation fields
-- This migration:
-- 1. Makes Expense.groupId nullable
-- 2. Adds creationMethod and bundleId columns to Expense
-- 3. Creates a partial index on bundleId
-- 4. Moves DYAD expenses to direct (groupId = NULL)
-- 5. Backfills creationMethod = 'payment' for existing reimbursements
-- 6. Deletes Activity records tied to DYAD groups
-- 7. Deletes DYAD GroupMemberships
-- 8. Deletes DYAD Groups
-- 9. Drops dyadKey column and unique index
-- 10. Removes DYAD from GroupType enum

-- 1. Make groupId nullable on Expense
ALTER TABLE "Expense" ALTER COLUMN "groupId" DROP NOT NULL;

-- 2. Add new fields for debt consolidation
ALTER TABLE "Expense" ADD COLUMN "creationMethod" TEXT;
ALTER TABLE "Expense" ADD COLUMN "bundleId" TEXT;

-- 3. Create partial index for bundle lookups
CREATE INDEX "Expense_bundleId_idx" ON "Expense"("bundleId") WHERE "bundleId" IS NOT NULL;

-- 4. Move DYAD expenses to direct (groupId = NULL)
UPDATE "Expense"
SET "groupId" = NULL
WHERE "groupId" IN (SELECT id FROM "Group" WHERE type = 'DYAD');

-- 5. Backfill creationMethod for existing reimbursements (payments)
UPDATE "Expense"
SET "creationMethod" = 'payment'
WHERE "isReimbursement" = true;

-- 6. Delete Activity records tied to DYAD groups
DELETE FROM "Activity" WHERE "groupId" IN (SELECT id FROM "Group" WHERE type = 'DYAD');

-- 7. Delete DYAD GroupMemberships
DELETE FROM "GroupMembership" WHERE "groupId" IN (SELECT id FROM "Group" WHERE type = 'DYAD');

-- 8. Delete DYAD Groups
DELETE FROM "Group" WHERE type = 'DYAD';

-- 9. Drop dyadKey unique index and column
DROP INDEX IF EXISTS "Group_dyadKey_key";
ALTER TABLE "Group" DROP COLUMN "dyadKey";

-- 10. Remove DYAD from GroupType enum
-- PostgreSQL cannot DROP a value from an existing enum, so we recreate it.
ALTER TYPE "GroupType" RENAME TO "GroupType_old";
CREATE TYPE "GroupType" AS ENUM ('STANDARD');
ALTER TABLE "Group" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Group" ALTER COLUMN "type" TYPE "GroupType" USING ("type"::text::"GroupType");
ALTER TABLE "Group" ALTER COLUMN "type" SET DEFAULT 'STANDARD';
DROP TYPE "GroupType_old";
