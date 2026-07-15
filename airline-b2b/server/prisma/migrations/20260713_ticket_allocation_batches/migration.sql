CREATE TABLE IF NOT EXISTS "TicketAllocation" (
  "id" TEXT NOT NULL,
  "flightId" TEXT NOT NULL,
  "fromFirmId" TEXT NOT NULL,
  "toFirmId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "currency" TEXT NOT NULL,
  "totalAmount" DECIMAL(18,4) NOT NULL,
  "note" TEXT,
  "createdByUserId" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "acceptedByUserId" TEXT,
  "rejectionReason" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectedByUserId" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancelledByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TicketAllocationPriceRow" (
  "id" TEXT NOT NULL,
  "allocationId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(18,4) NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "TicketAllocationPriceRow_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "allocationId" TEXT;

-- Preserve pending allocations created before batch IDs existed.
INSERT INTO "TicketAllocation" (
  "id", "flightId", "fromFirmId", "toFirmId", "status", "currency", "totalAmount", "createdAt", "updatedAt"
)
SELECT
  'legacy-' || md5("flightId" || ':' || "allocationSourceFirmId" || ':' || "allocatedFirmId" || ':' || currency),
  "flightId",
  "allocationSourceFirmId",
  "allocatedFirmId",
  'PENDING',
  currency,
  SUM(price),
  MIN("createdAt"),
  MAX("updatedAt")
FROM "Ticket"
WHERE status = 'PENDING'
  AND "deletedAt" IS NULL
  AND "allocationSourceFirmId" IS NOT NULL
  AND "allocatedFirmId" IS NOT NULL
  AND "allocationId" IS NULL
GROUP BY "flightId", "allocationSourceFirmId", "allocatedFirmId", currency
ON CONFLICT ("id") DO NOTHING;

UPDATE "Ticket"
SET "allocationId" = 'legacy-' || md5("flightId" || ':' || "allocationSourceFirmId" || ':' || "allocatedFirmId" || ':' || currency)
WHERE status = 'PENDING'
  AND "deletedAt" IS NULL
  AND "allocationSourceFirmId" IS NOT NULL
  AND "allocatedFirmId" IS NOT NULL
  AND "allocationId" IS NULL;

INSERT INTO "TicketAllocationPriceRow" ("id", "allocationId", quantity, "unitPrice", position)
SELECT
  'legacy-row-' || md5("allocationId" || ':' || price::text),
  "allocationId",
  COUNT(*)::INTEGER,
  price,
  ROW_NUMBER() OVER (PARTITION BY "allocationId" ORDER BY price)::INTEGER - 1
FROM "Ticket"
WHERE status = 'PENDING' AND "deletedAt" IS NULL AND "allocationId" IS NOT NULL
GROUP BY "allocationId", price
ON CONFLICT ("id") DO NOTHING;

CREATE INDEX IF NOT EXISTS "Ticket_allocationId_status_idx" ON "Ticket"("allocationId", status);
CREATE INDEX IF NOT EXISTS "TicketAllocation_flightId_status_idx" ON "TicketAllocation"("flightId", status);
CREATE INDEX IF NOT EXISTS "TicketAllocation_fromFirmId_status_idx" ON "TicketAllocation"("fromFirmId", status);
CREATE INDEX IF NOT EXISTS "TicketAllocation_toFirmId_status_idx" ON "TicketAllocation"("toFirmId", status);
CREATE INDEX IF NOT EXISTS "TicketAllocation_createdAt_idx" ON "TicketAllocation"("createdAt");
CREATE INDEX IF NOT EXISTS "TicketAllocationPriceRow_allocationId_position_idx" ON "TicketAllocationPriceRow"("allocationId", position);

DO $$ BEGIN
  ALTER TABLE "TicketAllocation" ADD CONSTRAINT "TicketAllocation_flightId_fkey"
    FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TicketAllocation" ADD CONSTRAINT "TicketAllocation_fromFirmId_fkey"
    FOREIGN KEY ("fromFirmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TicketAllocation" ADD CONSTRAINT "TicketAllocation_toFirmId_fkey"
    FOREIGN KEY ("toFirmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TicketAllocationPriceRow" ADD CONSTRAINT "TicketAllocationPriceRow_allocationId_fkey"
    FOREIGN KEY ("allocationId") REFERENCES "TicketAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_allocationId_fkey"
    FOREIGN KEY ("allocationId") REFERENCES "TicketAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
