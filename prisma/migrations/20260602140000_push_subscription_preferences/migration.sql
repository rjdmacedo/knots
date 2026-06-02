-- Push notification preferences: per-member and per-event filters (never notify subscriber's own actions)

ALTER TABLE "PushSubscription" ADD COLUMN "subscriberUserId" VARCHAR(200);
ALTER TABLE "PushSubscription" ADD COLUMN "notifyAllMembers" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PushSubscription" ADD COLUMN "includedUserIds" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "PushSubscription" ADD COLUMN "notifyOnCreate" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PushSubscription" ADD COLUMN "notifyOnUpdate" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PushSubscription" ADD COLUMN "notifyOnDelete" BOOLEAN NOT NULL DEFAULT true;

-- Previous excludeUserId stored the subscriber when filtering own actions
UPDATE "PushSubscription"
SET "subscriberUserId" = "excludeUserId"
WHERE "excludeUserId" IS NOT NULL;

-- Rows that included own notifications cannot infer subscriber; reset them
DELETE FROM "PushSubscription" WHERE "subscriberUserId" IS NULL;

ALTER TABLE "PushSubscription" ALTER COLUMN "subscriberUserId" SET NOT NULL;

ALTER TABLE "PushSubscription" DROP COLUMN "excludeUserId";
