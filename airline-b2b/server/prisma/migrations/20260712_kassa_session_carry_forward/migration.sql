ALTER TABLE "KassaDay"
  ADD COLUMN IF NOT EXISTS "firmId" TEXT,
  ADD COLUMN IF NOT EXISTS "cashDeskId" TEXT,
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'UZS',
  ADD COLUMN IF NOT EXISTS "previousSessionId" TEXT,
  ADD COLUMN IF NOT EXISTS "actualClosingBalance" DECIMAL(18,4),
  ADD COLUMN IF NOT EXISTS "openingAdjustmentReason" TEXT;

DROP INDEX IF EXISTS "KassaDay_businessDate_key";
CREATE UNIQUE INDEX IF NOT EXISTS "KassaDay_businessDate_cashDeskId_key" ON "KassaDay"("businessDate", "cashDeskId");
CREATE INDEX IF NOT EXISTS "KassaDay_cashDeskId_status_closedAt_idx" ON "KassaDay"("cashDeskId", "status", "closedAt");
CREATE INDEX IF NOT EXISTS "KassaDay_firmId_cashDeskId_currency_status_closedAt_idx" ON "KassaDay"("firmId", "cashDeskId", "currency", "status", "closedAt");

ALTER TABLE "KassaDesk" ADD COLUMN IF NOT EXISTS "assignedCashierUserId" TEXT;
ALTER TABLE "PaymentCard" ADD COLUMN IF NOT EXISTS "cashDeskId" TEXT;
CREATE INDEX IF NOT EXISTS "KassaDesk_assignedCashierUserId_status_idx" ON "KassaDesk"("assignedCashierUserId", "status");
DO $$ BEGIN
  ALTER TABLE "KassaDesk" ADD CONSTRAINT "KassaDesk_assignedCashierUserId_fkey" FOREIGN KEY ("assignedCashierUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
