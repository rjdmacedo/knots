-- Allow group deletion to cascade to activity log entries.
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_groupId_fkey";
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-member archive timestamp (null = active in the member's list).
ALTER TABLE "GroupMembership" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "GroupMembership_userId_archivedAt_idx" ON "GroupMembership"("userId", "archivedAt");
