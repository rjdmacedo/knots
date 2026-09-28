-- CreateTable
CREATE TABLE "GroupNotificationOverride" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "email" BOOLEAN NOT NULL,
    "push" BOOLEAN NOT NULL,

    CONSTRAINT "GroupNotificationOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupNotificationOverride_membershipId_idx" ON "GroupNotificationOverride"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupNotificationOverride_membershipId_category_key" ON "GroupNotificationOverride"("membershipId", "category");

-- AddForeignKey
ALTER TABLE "GroupNotificationOverride" ADD CONSTRAINT "GroupNotificationOverride_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
