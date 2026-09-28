-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'CREATE_RECURRING_EXPENSE';

-- CreateEnum
CREATE TYPE "NotificationDeliveryChannel" AS ENUM ('EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "recipientKey" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "category" TEXT NOT NULL,
    "channel" "NotificationDeliveryChannel" NOT NULL,
    "targetKey" TEXT NOT NULL,
    "snapshotVersion" INTEGER NOT NULL DEFAULT 1,
    "snapshot" JSONB NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "terminalAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_eventKey_recipientKey_channel_targetKey_key"
ON "NotificationDelivery"("eventKey", "recipientKey", "channel", "targetKey");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_availableAt_idx"
ON "NotificationDelivery"("status", "availableAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_recipientUserId_createdAt_idx"
ON "NotificationDelivery"("recipientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_leaseExpiresAt_idx"
ON "NotificationDelivery"("leaseExpiresAt");

-- AddForeignKey
ALTER TABLE "NotificationDelivery"
ADD CONSTRAINT "NotificationDelivery_recipientUserId_fkey"
FOREIGN KEY ("recipientUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop legacy digest and membership-level notification settings.
DROP TABLE IF EXISTS "GroupEmailDigestPending";

DROP INDEX IF EXISTS "GroupMembership_groupId_emailNotificationsEnabled_idx";

ALTER TABLE "GroupMembership"
DROP COLUMN IF EXISTS "emailNotificationsEnabled",
DROP COLUMN IF EXISTS "notifyAllMembers",
DROP COLUMN IF EXISTS "includedUserIds",
DROP COLUMN IF EXISTS "notifyOnCreate",
DROP COLUMN IF EXISTS "notifyOnUpdate",
DROP COLUMN IF EXISTS "notifyOnDelete";
