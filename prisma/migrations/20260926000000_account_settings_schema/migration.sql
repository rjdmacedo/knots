-- Account settings page: user profile/preferences fields, passkeys,
-- email-change challenges, per-user notification preferences, and
-- user-scoped (group-less) push subscriptions.

-- AlterTable: User gains profile/preference columns; passwordHash becomes optional.
ALTER TABLE "User" ADD COLUMN     "image" TEXT,
ADD COLUMN     "locale" TEXT,
ADD COLUMN     "theme" TEXT,
ADD COLUMN     "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable: PushSubscription.groupId becomes optional (null = this device, all groups).
ALTER TABLE "PushSubscription" DROP CONSTRAINT "PushSubscription_groupId_fkey";

ALTER TABLE "PushSubscription" ALTER COLUMN "groupId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailChangeChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailChangeChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "push" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Passkey_credentialId_key" ON "Passkey"("credentialId");

-- CreateIndex
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

-- CreateIndex
CREATE INDEX "EmailChangeChallenge_userId_idx" ON "EmailChangeChallenge"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotificationPreference_userId_category_key" ON "UserNotificationPreference"("userId", "category");

-- CreateIndex: partial unique index so a browser can have at most one
-- user-scoped (group-less) push subscription per endpoint. Group rows keep
-- using the composite "PushSubscription_endpoint_groupId_key" index, which
-- treats NULL groupId as distinct and so does not enforce this.
CREATE UNIQUE INDEX "PushSubscription_endpoint_group_null_key" ON "PushSubscription"("endpoint") WHERE "groupId" IS NULL;

-- AddForeignKey
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailChangeChallenge" ADD CONSTRAINT "EmailChangeChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
