-- AlterTable
ALTER TABLE "GroupMembership" ADD COLUMN "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GroupEmailDigestPending" (
    "groupId" TEXT NOT NULL,
    "lastActorUserId" TEXT NOT NULL,
    "sendAfter" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupEmailDigestPending_pkey" PRIMARY KEY ("groupId")
);

-- CreateIndex
CREATE INDEX "GroupMembership_groupId_emailNotificationsEnabled_idx" ON "GroupMembership"("groupId", "emailNotificationsEnabled");

-- CreateIndex
CREATE INDEX "GroupEmailDigestPending_sendAfter_idx" ON "GroupEmailDigestPending"("sendAfter");

-- AddForeignKey
ALTER TABLE "GroupEmailDigestPending" ADD CONSTRAINT "GroupEmailDigestPending_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
