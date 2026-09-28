-- The worker scans all groups for incomplete links whose next date is due.
CREATE INDEX "RecurringExpenseLink_nextExpenseCreatedAt_nextExpenseDate_idx"
ON "RecurringExpenseLink"("nextExpenseCreatedAt", "nextExpenseDate");
