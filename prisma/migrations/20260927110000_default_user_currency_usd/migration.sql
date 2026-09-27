-- New users start with USD. Existing rows keep a null preference.
ALTER TABLE "User" ALTER COLUMN "preferredCurrency" SET DEFAULT 'USD';
