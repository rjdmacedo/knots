-- CreateTable
CREATE TABLE "ActivityChange" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,

    CONSTRAINT "ActivityChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityChange_activityId_idx" ON "ActivityChange"("activityId");

-- AddForeignKey
ALTER TABLE "ActivityChange" ADD CONSTRAINT "ActivityChange_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
