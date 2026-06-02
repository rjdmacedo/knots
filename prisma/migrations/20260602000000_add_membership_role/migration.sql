-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'MEMBER');

-- AlterTable: Add role column with default MEMBER
ALTER TABLE "GroupMembership" ADD COLUMN "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER';

-- Set existing first member of each group (by joinedAt) as OWNER
UPDATE "GroupMembership" gm
SET "role" = 'OWNER'
WHERE gm."id" = (
  SELECT gm2."id"
  FROM "GroupMembership" gm2
  WHERE gm2."groupId" = gm."groupId"
  ORDER BY gm2."joinedAt" ASC
  LIMIT 1
);
