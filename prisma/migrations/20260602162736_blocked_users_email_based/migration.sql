/*
  Warnings:

  - A unique constraint covering the columns `[userId,blockedEmail]` on the table `BlockedUser` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `blockedEmail` to the `BlockedUser` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "BlockedUser" DROP CONSTRAINT "BlockedUser_blockedUserId_fkey";

-- DropIndex
DROP INDEX "BlockedUser_userId_blockedUserId_key";

-- AlterTable
ALTER TABLE "BlockedUser" ADD COLUMN     "blockedEmail" TEXT NOT NULL,
ALTER COLUMN "blockedUserId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "BlockedUser_blockedEmail_idx" ON "BlockedUser"("blockedEmail");

-- CreateIndex
CREATE UNIQUE INDEX "BlockedUser_userId_blockedEmail_key" ON "BlockedUser"("userId", "blockedEmail");

-- AddForeignKey
ALTER TABLE "BlockedUser" ADD CONSTRAINT "BlockedUser_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
