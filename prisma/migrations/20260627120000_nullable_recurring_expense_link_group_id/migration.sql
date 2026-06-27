-- Allow recurring expense links for direct (non-group) expenses
ALTER TABLE "RecurringExpenseLink" ALTER COLUMN "groupId" DROP NOT NULL;
