-- Rename participantName to excludeUserId (stores User.id to filter self-notifications)
ALTER TABLE "PushSubscription" RENAME COLUMN "participantName" TO "excludeUserId";
