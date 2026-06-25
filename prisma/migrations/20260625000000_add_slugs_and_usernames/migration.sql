-- AlterTable: Add username column to User (nullable first for backfill)
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Backfill: Generate usernames for existing users from the email local part
UPDATE "User"
SET "username" = CONCAT(
  TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(SPLIT_PART("email", '@', 1)), '[^a-z0-9]+', '-', 'g')),
  '-',
  LEFT("id", 6)
)
WHERE "username" IS NULL;

-- Make column NOT NULL after backfill
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
