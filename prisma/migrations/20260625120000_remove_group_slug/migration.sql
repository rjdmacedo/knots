-- DropIndex
DROP INDEX IF EXISTS "Group_slug_key";

-- AlterTable
ALTER TABLE "Group" DROP COLUMN IF EXISTS "slug";
