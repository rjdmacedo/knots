-- AlterTable
ALTER TABLE "GroupMembership" ADD COLUMN     "includedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "notifyAllMembers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyOnCreate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyOnDelete" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyOnUpdate" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Activity_groupId_time_idx" ON "Activity"("groupId", "time");
