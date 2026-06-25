-- AlterTable: Add slug column to Group (nullable first for backfill)
ALTER TABLE "Group" ADD COLUMN "slug" TEXT;

-- AlterTable: Add username column to User (nullable first for backfill)
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Backfill: Generate slugs for existing groups from their name
-- Uses lower(name), replaces non-alphanumeric with hyphens, trims, and appends id suffix for uniqueness
UPDATE "Group"
SET "slug" = CONCAT(
  TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER("name"), '[^a-z0-9]+', '-', 'g')),
  '-',
  LEFT("id", 6)
)
WHERE "slug" IS NULL;

-- Backfill: Generate usernames for existing users from the email local part
UPDATE "User"
SET "username" = CONCAT(
  TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(SPLIT_PART("email", '@', 1)), '[^a-z0-9]+', '-', 'g')),
  '-',
  LEFT("id", 6)
)
WHERE "username" IS NULL;

-- Make columns NOT NULL after backfill
ALTER TABLE "Group" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Group_slug_key" ON "Group"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
