ALTER TABLE "KassaDay"
  ADD COLUMN IF NOT EXISTS "activeSessionKey" TEXT;

ALTER TABLE "KassaDay"
  ALTER COLUMN "firmId" SET NOT NULL,
  ALTER COLUMN "cashDeskId" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "KassaDay_activeSessionKey_key"
  ON "KassaDay"("activeSessionKey");

CREATE UNIQUE INDEX IF NOT EXISTS "KassaDesk_id_firmId_key"
  ON "KassaDesk"("id", "firmId");

ALTER TABLE "KassaDay"
  ADD CONSTRAINT "KassaDay_cashDeskId_firmId_fkey"
  FOREIGN KEY ("cashDeskId", "firmId") REFERENCES "KassaDesk"("id", "firmId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "KassaDay"
  ADD CONSTRAINT "KassaDay_previousSessionId_fkey"
  FOREIGN KEY ("previousSessionId") REFERENCES "KassaDay"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
