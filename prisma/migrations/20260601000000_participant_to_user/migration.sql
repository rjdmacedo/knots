-- Migration: Participant → User
-- Migrates Expense.paidById and ExpensePaidFor.participantId from referencing
-- the Participant table to referencing the User table via GroupMembership.

-- ============================================================================
-- Step 1: Add nullable userId columns
-- ============================================================================

ALTER TABLE "Expense" ADD COLUMN "paidByUserId" TEXT;
ALTER TABLE "ExpensePaidFor" ADD COLUMN "userId" TEXT;

-- ============================================================================
-- Step 2: Backfill data — match Participant to User via GroupMembership + name
-- ============================================================================

-- Backfill Expense.paidByUserId
UPDATE "Expense" e
SET "paidByUserId" = u."id"
FROM "Participant" p
JOIN "GroupMembership" gm ON gm."groupId" = p."groupId"
JOIN "User" u ON u."id" = gm."userId" AND u."name" = p."name"
WHERE e."paidById" = p."id";

-- Backfill ExpensePaidFor.userId
UPDATE "ExpensePaidFor" epf
SET "userId" = u."id"
FROM "Participant" p
JOIN "GroupMembership" gm ON gm."groupId" = p."groupId"
JOIN "User" u ON u."id" = gm."userId" AND u."name" = p."name"
WHERE epf."participantId" = p."id";

-- ============================================================================
-- Step 3: Create placeholder User records for unmatched Participants
-- ============================================================================

-- Insert placeholder Users for Participants that could not be matched.
-- Uses a generated email based on participant id and an empty passwordHash.
INSERT INTO "User" ("id", "name", "email", "passwordHash", "createdAt", "updatedAt")
SELECT
  p."id",
  p."name",
  'placeholder_' || p."id" || '@knots.local',
  '',
  NOW(),
  NOW()
FROM "Participant" p
WHERE NOT EXISTS (
  SELECT 1 FROM "GroupMembership" gm
  JOIN "User" u ON u."id" = gm."userId" AND u."name" = p."name"
  WHERE gm."groupId" = p."groupId"
)
AND NOT EXISTS (
  SELECT 1 FROM "User" u WHERE u."id" = p."id"
);

-- Create GroupMembership records for placeholder Users
INSERT INTO "GroupMembership" ("id", "userId", "groupId", "joinedAt")
SELECT
  p."id" || '_membership',
  p."id",
  p."groupId",
  NOW()
FROM "Participant" p
WHERE NOT EXISTS (
  SELECT 1 FROM "GroupMembership" gm
  JOIN "User" u ON u."id" = gm."userId" AND u."name" = p."name"
  WHERE gm."groupId" = p."groupId"
)
AND NOT EXISTS (
  SELECT 1 FROM "GroupMembership" gm WHERE gm."userId" = p."id" AND gm."groupId" = p."groupId"
);

-- Backfill remaining NULL references using the placeholder Users
UPDATE "Expense" e
SET "paidByUserId" = p."id"
FROM "Participant" p
WHERE e."paidById" = p."id"
AND e."paidByUserId" IS NULL;

UPDATE "ExpensePaidFor" epf
SET "userId" = p."id"
FROM "Participant" p
WHERE epf."participantId" = p."id"
AND epf."userId" IS NULL;

-- ============================================================================
-- Step 4: Set new columns as NOT NULL, add FK constraints
-- ============================================================================

ALTER TABLE "Expense" ALTER COLUMN "paidByUserId" SET NOT NULL;
ALTER TABLE "ExpensePaidFor" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_paidByUserId_fkey"
  FOREIGN KEY ("paidByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExpensePaidFor"
  ADD CONSTRAINT "ExpensePaidFor_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Step 5: Drop old FK columns
-- ============================================================================

-- Drop the old composite primary key on ExpensePaidFor
ALTER TABLE "ExpensePaidFor" DROP CONSTRAINT "ExpensePaidFor_pkey";

-- Drop old FK constraints
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_paidById_fkey";
ALTER TABLE "ExpensePaidFor" DROP CONSTRAINT "ExpensePaidFor_participantId_fkey";

-- Drop old columns
ALTER TABLE "Expense" DROP COLUMN "paidById";
ALTER TABLE "ExpensePaidFor" DROP COLUMN "participantId";

-- ============================================================================
-- Step 6: Rename new columns to final names
-- ============================================================================

-- Rename paidByUserId → paidById on Expense
ALTER TABLE "Expense" RENAME COLUMN "paidByUserId" TO "paidById";

-- Rename the FK constraint to match the final column name
ALTER TABLE "Expense" RENAME CONSTRAINT "Expense_paidByUserId_fkey" TO "Expense_paidById_fkey";

-- ExpensePaidFor.userId stays as "userId" per the design schema

-- Add the new composite primary key
ALTER TABLE "ExpensePaidFor" ADD CONSTRAINT "ExpensePaidFor_pkey" PRIMARY KEY ("expenseId", "userId");

-- ============================================================================
-- Step 7: Drop the Participant table
-- ============================================================================

-- Drop FK from Participant to Group first
ALTER TABLE "Participant" DROP CONSTRAINT "Participant_groupId_fkey";

-- Drop the Participant table
DROP TABLE "Participant";

-- ============================================================================
-- Step 8: Add relation indexes on new FK columns
-- ============================================================================

CREATE INDEX "Expense_paidById_idx" ON "Expense"("paidById");
CREATE INDEX "ExpensePaidFor_userId_idx" ON "ExpensePaidFor"("userId");
