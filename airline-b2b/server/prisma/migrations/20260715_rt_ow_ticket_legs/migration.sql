DO $$ BEGIN
  CREATE TYPE "TicketProductType" AS ENUM ('ROUND_TRIP', 'ONE_WAY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "TicketLegDirection" AS ENUM ('OUTBOUND', 'RETURN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "TicketLegStatus" AS ENUM ('AVAILABLE', 'PENDING_ALLOCATION', 'ASSIGNED', 'RESERVED_FOR_TOUR', 'SOLD', 'CANCELLED', 'RETURNED', 'DELETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Flight"
  ADD COLUMN IF NOT EXISTS "tripType" "TicketProductType" NOT NULL DEFAULT 'ONE_WAY',
  ADD COLUMN IF NOT EXISTS "outboundOrigin" TEXT,
  ADD COLUMN IF NOT EXISTS "outboundDestination" TEXT,
  ADD COLUMN IF NOT EXISTS "returnOrigin" TEXT,
  ADD COLUMN IF NOT EXISTS "returnDestination" TEXT,
  ADD COLUMN IF NOT EXISTS "returnDeparture" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "returnArrival" TIMESTAMP(3);

ALTER TABLE "Ticket"
  ADD COLUMN IF NOT EXISTS "ticketType" "TicketProductType" NOT NULL DEFAULT 'ONE_WAY',
  ADD COLUMN IF NOT EXISTS "originalOwnerFirmId" TEXT;

ALTER TABLE "TicketAllocation"
  ADD COLUMN IF NOT EXISTS "productType" "TicketProductType" NOT NULL DEFAULT 'ROUND_TRIP',
  ADD COLUMN IF NOT EXISTS direction "TicketLegDirection",
  ADD COLUMN IF NOT EXISTS "parentTicketCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "segmentCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "TicketAllocationPriceRow"
  ADD COLUMN IF NOT EXISTS "productType" "TicketProductType" NOT NULL DEFAULT 'ROUND_TRIP',
  ADD COLUMN IF NOT EXISTS direction "TicketLegDirection",
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'UZS',
  ADD COLUMN IF NOT EXISTS "totalAmount" DECIMAL(18,4) NOT NULL DEFAULT 0;

ALTER TABLE "TourPackage"
  ADD COLUMN IF NOT EXISTS "ticketProductType" "TicketProductType" NOT NULL DEFAULT 'ROUND_TRIP',
  ADD COLUMN IF NOT EXISTS "ticketDirection" "TicketLegDirection";

ALTER TABLE "TourComponent"
  ADD COLUMN IF NOT EXISTS "ticketProductType" "TicketProductType",
  ADD COLUMN IF NOT EXISTS "ticketDirection" "TicketLegDirection",
  ADD COLUMN IF NOT EXISTS "segmentCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Transaction"
  ADD COLUMN IF NOT EXISTS "sourceMode" TEXT NOT NULL DEFAULT 'MANUAL_BANK',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN IF NOT EXISTS "reversedTransactionId" TEXT,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "SaleCancellationRequest"
  ADD COLUMN IF NOT EXISTS "ticketSaleId" TEXT;

CREATE TABLE IF NOT EXISTS "TicketLeg" (
  id TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "flightId" TEXT NOT NULL,
  direction "TicketLegDirection" NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  "departureAt" TIMESTAMP(3),
  "arrivalAt" TIMESTAMP(3),
  status "TicketLegStatus" NOT NULL DEFAULT 'AVAILABLE',
  "currentOwnerFirmId" TEXT,
  "pendingAllocationId" TEXT,
  "acceptedAllocationId" TEXT,
  "tourPackageId" TEXT,
  "acquisitionCostSnapshot" DECIMAL(18,4) NOT NULL,
  "originalCostSnapshot" DECIMAL(18,4) NOT NULL,
  "allocationPriceSnapshot" DECIMAL(18,4),
  "currencySnapshot" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketLeg_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "TicketAllocationLeg" (
  id TEXT NOT NULL,
  "allocationId" TEXT NOT NULL,
  "ticketLegId" TEXT NOT NULL,
  "productType" "TicketProductType" NOT NULL,
  direction "TicketLegDirection" NOT NULL,
  "previousOwnerFirmId" TEXT,
  "previousStatus" "TicketLegStatus" NOT NULL,
  "acquisitionCostSnapshot" DECIMAL(18,4) NOT NULL,
  "allocationPriceSnapshot" DECIMAL(18,4) NOT NULL,
  "productUnitPriceSnapshot" DECIMAL(18,4) NOT NULL,
  "currencySnapshot" TEXT NOT NULL,
  "acquisitionCurrencySnapshot" TEXT NOT NULL,
  "allocationCurrencySnapshot" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketAllocationLeg_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "TicketSale" (
  id TEXT NOT NULL,
  "flightId" TEXT NOT NULL,
  "sellerFirmId" TEXT NOT NULL,
  "productType" "TicketProductType" NOT NULL,
  direction "TicketLegDirection",
  quantity INTEGER NOT NULL,
  "segmentCount" INTEGER NOT NULL,
  "unitPrice" DECIMAL(18,4) NOT NULL,
  currency TEXT NOT NULL,
  "totalAmount" DECIMAL(18,4) NOT NULL,
  "purchaserInfo" JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONFIRMED',
  "transactionId" TEXT,
  "createdByUserId" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancelledByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketSale_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "TicketSaleItem" (
  id TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "ticketLegId" TEXT NOT NULL,
  "acquisitionCostSnapshot" DECIMAL(18,4) NOT NULL,
  "salePriceSnapshot" DECIMAL(18,4) NOT NULL,
  "currencySnapshot" TEXT NOT NULL,
  "acquisitionCurrencySnapshot" TEXT NOT NULL,
  "saleCurrencySnapshot" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONFIRMED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketSaleItem_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "TicketLegMigrationIssue" (
  id TEXT NOT NULL,
  "flightId" TEXT NOT NULL,
  "ticketId" TEXT,
  code TEXT NOT NULL,
  details JSONB NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketLegMigrationIssue_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS "TicketLeg_ticketId_direction_key" ON "TicketLeg"("ticketId", direction);
CREATE UNIQUE INDEX IF NOT EXISTS "TicketAllocationLeg_allocationId_ticketLegId_key" ON "TicketAllocationLeg"("allocationId", "ticketLegId");
CREATE UNIQUE INDEX IF NOT EXISTS "TicketSaleItem_saleId_ticketLegId_key" ON "TicketSaleItem"("saleId", "ticketLegId");

WITH parsed AS (
  SELECT id, route, regexp_split_to_array(trim(route), E'\\s*(→|->|–|—|-)\\s*') AS parts
  FROM "Flight"
)
UPDATE "Flight" flight
SET "tripType" = CASE
      WHEN array_length(parsed.parts, 1) >= 3
       AND upper(parsed.parts[1]) = upper(parsed.parts[array_length(parsed.parts, 1)])
        THEN 'ROUND_TRIP'::"TicketProductType"
      ELSE 'ONE_WAY'::"TicketProductType"
    END,
    "outboundOrigin" = CASE WHEN array_length(parsed.parts, 1) >= 2 THEN parsed.parts[1] ELSE trim(parsed.route) END,
    "outboundDestination" = CASE WHEN array_length(parsed.parts, 1) >= 2 THEN parsed.parts[2] ELSE 'UNKNOWN' END,
    "returnOrigin" = CASE
      WHEN array_length(parsed.parts, 1) >= 3 AND upper(parsed.parts[1]) = upper(parsed.parts[array_length(parsed.parts, 1)])
        THEN parsed.parts[array_length(parsed.parts, 1) - 1]
      ELSE NULL
    END,
    "returnDestination" = CASE
      WHEN array_length(parsed.parts, 1) >= 3 AND upper(parsed.parts[1]) = upper(parsed.parts[array_length(parsed.parts, 1)])
        THEN parsed.parts[1]
      ELSE NULL
    END
FROM parsed
WHERE parsed.id = flight.id;

UPDATE "Ticket" ticket
SET "ticketType" = flight."tripType",
    "originalOwnerFirmId" = COALESCE(
      ticket."originalOwnerFirmId",
      flight."ownerFirmId",
      (SELECT airline."firmId" FROM "Airline" airline WHERE airline.id = flight."airlineId"),
      ticket."allocationSourceFirmId",
      ticket."allocatedFirmId"
    )
FROM "Flight" flight
WHERE flight.id = ticket."flightId";

INSERT INTO "TicketLegMigrationIssue" (id, "flightId", code, details)
SELECT 'route-issue-' || md5(flight.id), flight.id, 'AMBIGUOUS_ROUTE',
       jsonb_build_object('route', flight.route, 'message', 'Route could not be safely classified as a two-point OW or closed RT route')
FROM "Flight" flight
CROSS JOIN LATERAL (SELECT regexp_split_to_array(trim(flight.route), E'\\s*(→|->|–|—|-)\\s*') AS parts) parsed
WHERE array_length(parsed.parts, 1) < 2
   OR (array_length(parsed.parts, 1) > 2 AND upper(parsed.parts[1]) <> upper(parsed.parts[array_length(parsed.parts, 1)]))
ON CONFLICT (id) DO NOTHING;

INSERT INTO "TicketLegMigrationIssue" (id, "flightId", code, details)
SELECT 'rt-schedule-' || md5(flight.id), flight.id, 'RETURN_SCHEDULE_UNKNOWN',
       jsonb_build_object('route', flight.route, 'message', 'Legacy RT return departure and arrival were not stored and must be reviewed')
FROM "Flight" flight
WHERE flight."tripType" = 'ROUND_TRIP' AND flight."returnDeparture" IS NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO "TicketLegMigrationIssue" (id, "flightId", code, details)
SELECT 'rt-cost-' || md5(flight.id), flight.id, 'LEG_COST_DEFAULTED_50_50',
       jsonb_build_object('route', flight.route, 'message', 'Legacy RT total cost had no leg split; migration used 50/50 and requires review')
FROM "Flight" flight
WHERE flight."tripType" = 'ROUND_TRIP'
ON CONFLICT (id) DO NOTHING;

INSERT INTO "TicketLeg" (
  id, "ticketId", "flightId", direction, origin, destination, "departureAt", "arrivalAt", status,
  "currentOwnerFirmId", "pendingAllocationId", "acceptedAllocationId", "tourPackageId",
  "acquisitionCostSnapshot", "originalCostSnapshot", "allocationPriceSnapshot", "currencySnapshot", "createdAt", "updatedAt"
)
SELECT
  'legacy-leg-' || md5(ticket.id || ':OUTBOUND'),
  ticket.id,
  ticket."flightId",
  'OUTBOUND'::"TicketLegDirection",
  COALESCE(flight."outboundOrigin", flight.route),
  COALESCE(flight."outboundDestination", 'UNKNOWN'),
  flight."departureTime",
  flight."arrivalTime",
  CASE
    WHEN ticket.status = 'PENDING' THEN 'PENDING_ALLOCATION'::"TicketLegStatus"
    WHEN ticket.status = 'ASSIGNED' AND ticket."allocationSourceFirmId" IS NULL AND ticket."allocatedFirmId" = ticket."originalOwnerFirmId" THEN 'AVAILABLE'::"TicketLegStatus"
    WHEN ticket.status IN ('ASSIGNED', 'ALLOCATED') THEN 'ASSIGNED'::"TicketLegStatus"
    WHEN ticket.status = 'RESERVED_FOR_TOUR' THEN 'RESERVED_FOR_TOUR'::"TicketLegStatus"
    WHEN ticket.status = 'SOLD' THEN 'SOLD'::"TicketLegStatus"
    WHEN ticket.status = 'CANCELLED' THEN 'CANCELLED'::"TicketLegStatus"
    WHEN ticket.status = 'REFUNDED' THEN 'RETURNED'::"TicketLegStatus"
    WHEN ticket.status = 'DELETED' THEN 'DELETED'::"TicketLegStatus"
    ELSE 'AVAILABLE'::"TicketLegStatus"
  END,
  CASE WHEN ticket.status = 'PENDING' THEN COALESCE(ticket."allocationSourceFirmId", ticket."originalOwnerFirmId")
       ELSE COALESCE(ticket."allocatedFirmId", ticket."originalOwnerFirmId") END,
  CASE WHEN ticket.status = 'PENDING' THEN ticket."allocationId" END,
  CASE WHEN allocation.status = 'ACCEPTED' THEN ticket."allocationId" END,
  ticket."tourPackageId",
  (CASE WHEN ticket."ticketType" = 'ROUND_TRIP' THEN 0.5 ELSE 1 END)
    * CASE WHEN ticket."allocatedFirmId" = ticket."originalOwnerFirmId" OR ticket."allocationSourceFirmId" IS NULL
      THEN COALESCE(NULLIF(ticket."originPrice", 0), ticket.price)
      ELSE ticket.price END,
  (CASE WHEN ticket."ticketType" = 'ROUND_TRIP' THEN 0.5 ELSE 1 END) * COALESCE(NULLIF(ticket."originPrice", 0), ticket.price),
  CASE WHEN ticket."allocationId" IS NULL THEN NULL
       ELSE (CASE WHEN ticket."ticketType" = 'ROUND_TRIP' THEN 0.5 ELSE 1 END) * ticket.price END,
  ticket.currency,
  ticket."createdAt",
  ticket."updatedAt"
FROM "Ticket" ticket
JOIN "Flight" flight ON flight.id = ticket."flightId"
LEFT JOIN "TicketAllocation" allocation ON allocation.id = ticket."allocationId"
ON CONFLICT ("ticketId", direction) DO NOTHING;

INSERT INTO "TicketLeg" (
  id, "ticketId", "flightId", direction, origin, destination, "departureAt", "arrivalAt", status,
  "currentOwnerFirmId", "pendingAllocationId", "acceptedAllocationId", "tourPackageId",
  "acquisitionCostSnapshot", "originalCostSnapshot", "allocationPriceSnapshot", "currencySnapshot", "createdAt", "updatedAt"
)
SELECT
  'legacy-leg-' || md5(ticket.id || ':RETURN'),
  ticket.id,
  ticket."flightId",
  'RETURN'::"TicketLegDirection",
  COALESCE(flight."returnOrigin", flight."outboundDestination", 'UNKNOWN'),
  COALESCE(flight."returnDestination", flight."outboundOrigin", 'UNKNOWN'),
  flight."returnDeparture",
  flight."returnArrival",
  outbound.status,
  outbound."currentOwnerFirmId",
  outbound."pendingAllocationId",
  outbound."acceptedAllocationId",
  outbound."tourPackageId",
  (CASE WHEN ticket."allocatedFirmId" = ticket."originalOwnerFirmId" OR ticket."allocationSourceFirmId" IS NULL
    THEN COALESCE(NULLIF(ticket."originPrice", 0), ticket.price)
    ELSE ticket.price END) * 0.5,
  COALESCE(NULLIF(ticket."originPrice", 0), ticket.price) * 0.5,
  CASE WHEN ticket."allocationId" IS NULL THEN NULL ELSE ticket.price * 0.5 END,
  ticket.currency,
  ticket."createdAt",
  ticket."updatedAt"
FROM "Ticket" ticket
JOIN "Flight" flight ON flight.id = ticket."flightId" AND flight."tripType" = 'ROUND_TRIP'
JOIN "TicketLeg" outbound ON outbound."ticketId" = ticket.id AND outbound.direction = 'OUTBOUND'
ON CONFLICT ("ticketId", direction) DO NOTHING;

UPDATE "TicketAllocation" allocation
SET "productType" = flight."tripType",
    direction = CASE WHEN flight."tripType" = 'ONE_WAY' THEN 'OUTBOUND'::"TicketLegDirection" ELSE NULL END,
    "parentTicketCount" = COALESCE((SELECT SUM(row.quantity) FROM "TicketAllocationPriceRow" row WHERE row."allocationId" = allocation.id), 0),
    "segmentCount" = COALESCE((SELECT SUM(row.quantity) FROM "TicketAllocationPriceRow" row WHERE row."allocationId" = allocation.id), 0)
      * CASE WHEN flight."tripType" = 'ROUND_TRIP' THEN 2 ELSE 1 END
FROM "Flight" flight
WHERE flight.id = allocation."flightId";

UPDATE "TicketAllocationPriceRow" row
SET "productType" = allocation."productType",
    direction = allocation.direction,
    currency = allocation.currency,
    "totalAmount" = row.quantity * row."unitPrice"
FROM "TicketAllocation" allocation
WHERE allocation.id = row."allocationId";

UPDATE "TourComponent" component
SET "ticketProductType" = package."ticketProductType",
    "ticketDirection" = package."ticketDirection",
    "segmentCount" = component."totalReservedQuantity" * CASE WHEN package."ticketProductType" = 'ROUND_TRIP' THEN 2 ELSE 1 END
FROM "TourPackage" package
WHERE package.id = component."tourId" AND component."componentType" = 'TICKET';

INSERT INTO "TicketAllocationLeg" (
  id, "allocationId", "ticketLegId", "productType", direction, "previousOwnerFirmId", "previousStatus",
  "acquisitionCostSnapshot", "allocationPriceSnapshot", "productUnitPriceSnapshot", "currencySnapshot",
  "acquisitionCurrencySnapshot", "allocationCurrencySnapshot", status,
  "createdAt", "updatedAt"
)
SELECT
  'legacy-allocation-leg-' || md5(ticket."allocationId" || ':' || leg.id),
  ticket."allocationId",
  leg.id,
  ticket."ticketType",
  leg.direction,
  allocation."fromFirmId",
  CASE WHEN allocation."fromFirmId" = ticket."originalOwnerFirmId" THEN 'AVAILABLE'::"TicketLegStatus" ELSE 'ASSIGNED'::"TicketLegStatus" END,
  (CASE WHEN ticket."ticketType" = 'ROUND_TRIP' THEN 0.5 ELSE 1 END)
    * COALESCE(ticket."allocationSourcePrice", NULLIF(ticket."originPrice", 0), ticket.price),
  (CASE WHEN ticket."ticketType" = 'ROUND_TRIP' THEN 0.5 ELSE 1 END) * ticket.price,
  ticket.price,
  ticket.currency,
  ticket.currency,
  allocation.currency,
  'ACTIVE',
  allocation."createdAt",
  allocation."updatedAt"
FROM "Ticket" ticket
JOIN "TicketAllocation" allocation ON allocation.id = ticket."allocationId"
JOIN "TicketLeg" leg ON leg."ticketId" = ticket.id
WHERE allocation.status IN ('PENDING', 'ACCEPTED')
ON CONFLICT ("allocationId", "ticketLegId") DO NOTHING;

UPDATE "Transaction"
SET "sourceMode" = CASE
      WHEN type IN ('ALLOCATION', 'PAYABLE') AND "subjectType" = 'TICKET_ALLOCATION' THEN 'AUTO_ALLOCATION'
      WHEN type = 'SALE' AND "subjectType" = 'TOUR_PACKAGE' THEN 'AUTO_TOUR_SALE'
      WHEN type = 'SALE' THEN 'AUTO_TICKET_SALE'
      WHEN type = 'REFUND' OR (metadata->>'reversedTransactionId') IS NOT NULL THEN 'REVERSAL'
      WHEN lower(COALESCE("paymentMethod", '')) = 'cash' THEN 'MANUAL_CASH'
      WHEN lower(COALESCE("paymentMethod", '')) = 'card' THEN 'MANUAL_CARD'
      ELSE 'MANUAL_BANK'
    END,
    "reversedTransactionId" = COALESCE("reversedTransactionId", metadata->>'reversedTransactionId');

WITH latest_sale_by_ticket AS (
  SELECT DISTINCT ON (transaction."ticketId")
    transaction.id, transaction."ticketId", transaction."firmId", transaction."flightId", transaction."originalAmount",
    transaction.currency, transaction."createdByUserId", transaction."createdAt"
  FROM "Transaction" transaction
  WHERE transaction.type = 'SALE' AND transaction."ticketId" IS NOT NULL AND transaction."originalAmount" > 0
  ORDER BY transaction."ticketId", transaction."createdAt" DESC
), latest_sale AS (
  SELECT latest_sale_by_ticket.*,
    row_number() OVER (PARTITION BY latest_sale_by_ticket.id ORDER BY latest_sale_by_ticket."ticketId") AS transaction_use_rank
  FROM latest_sale_by_ticket
)
INSERT INTO "TicketSale" (
  id, "flightId", "sellerFirmId", "productType", direction, quantity, "segmentCount", "unitPrice", currency,
  "totalAmount", "purchaserInfo", status, "transactionId", "createdByUserId", "createdAt", "updatedAt"
)
SELECT
  'legacy-ticket-sale-' || md5(ticket.id),
  ticket."flightId",
  COALESCE(ticket."allocatedFirmId", ticket."originalOwnerFirmId", latest_sale."firmId"),
  ticket."ticketType",
  CASE WHEN ticket."ticketType" = 'ONE_WAY' THEN 'OUTBOUND'::"TicketLegDirection" ELSE NULL END,
  1,
  CASE WHEN ticket."ticketType" = 'ROUND_TRIP' THEN 2 ELSE 1 END,
  COALESCE(ticket."soldPrice", latest_sale."originalAmount", 0),
  COALESCE(ticket."soldCurrency", latest_sale.currency, ticket.currency),
  COALESCE(ticket."soldPrice", latest_sale."originalAmount", 0),
  COALESCE(ticket."purchaserInfo", '{}'::jsonb),
  'CONFIRMED',
  CASE WHEN latest_sale.transaction_use_rank = 1 THEN latest_sale.id ELSE NULL END,
  latest_sale."createdByUserId",
  COALESCE(latest_sale."createdAt", ticket."updatedAt"),
  COALESCE(latest_sale."createdAt", ticket."updatedAt")
FROM "Ticket" ticket
LEFT JOIN latest_sale ON latest_sale."ticketId" = ticket.id
WHERE ticket.status = 'SOLD'
  AND COALESCE(ticket."allocatedFirmId", ticket."originalOwnerFirmId", latest_sale."firmId") IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO "TicketSaleItem" (
  id, "saleId", "ticketLegId", "acquisitionCostSnapshot", "salePriceSnapshot", "currencySnapshot",
  "acquisitionCurrencySnapshot", "saleCurrencySnapshot", status,
  "createdAt", "updatedAt"
)
SELECT
  'legacy-ticket-sale-item-' || md5(sale.id || ':' || leg.id),
  sale.id,
  leg.id,
  leg."acquisitionCostSnapshot",
  CASE
    WHEN totals.total_cost > 0 THEN sale."totalAmount" * leg."acquisitionCostSnapshot" / totals.total_cost
    ELSE sale."totalAmount" / GREATEST(totals.leg_count, 1)
  END,
  sale.currency,
  leg."currencySnapshot",
  sale.currency,
  'CONFIRMED',
  sale."createdAt",
  sale."updatedAt"
FROM "TicketSale" sale
JOIN "Ticket" ticket ON sale.id = 'legacy-ticket-sale-' || md5(ticket.id)
JOIN "TicketLeg" leg ON leg."ticketId" = ticket.id AND leg.status = 'SOLD'
JOIN LATERAL (
  SELECT COALESCE(SUM(all_leg."acquisitionCostSnapshot"), 0) AS total_cost, COUNT(*) AS leg_count
  FROM "TicketLeg" all_leg WHERE all_leg."ticketId" = ticket.id AND all_leg.status = 'SOLD'
) totals ON TRUE
ON CONFLICT ("saleId", "ticketLegId") DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS "TicketLeg_ticketId_direction_key" ON "TicketLeg"("ticketId", direction);
CREATE INDEX IF NOT EXISTS "TicketLeg_flightId_currentOwnerFirmId_status_direction_idx" ON "TicketLeg"("flightId", "currentOwnerFirmId", status, direction);
CREATE INDEX IF NOT EXISTS "TicketLeg_pendingAllocationId_status_idx" ON "TicketLeg"("pendingAllocationId", status);
CREATE INDEX IF NOT EXISTS "TicketLeg_acceptedAllocationId_status_idx" ON "TicketLeg"("acceptedAllocationId", status);
CREATE INDEX IF NOT EXISTS "TicketLeg_tourPackageId_status_idx" ON "TicketLeg"("tourPackageId", status);
CREATE UNIQUE INDEX IF NOT EXISTS "TicketAllocationLeg_allocationId_ticketLegId_key" ON "TicketAllocationLeg"("allocationId", "ticketLegId");
CREATE INDEX IF NOT EXISTS "TicketAllocationLeg_ticketLegId_status_idx" ON "TicketAllocationLeg"("ticketLegId", status);
CREATE INDEX IF NOT EXISTS "TicketAllocationLeg_allocationId_status_idx" ON "TicketAllocationLeg"("allocationId", status);
CREATE UNIQUE INDEX IF NOT EXISTS "TicketSale_transactionId_key" ON "TicketSale"("transactionId");
CREATE INDEX IF NOT EXISTS "TicketSale_flightId_sellerFirmId_status_idx" ON "TicketSale"("flightId", "sellerFirmId", status);
CREATE INDEX IF NOT EXISTS "TicketSale_createdAt_idx" ON "TicketSale"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "TicketSaleItem_saleId_ticketLegId_key" ON "TicketSaleItem"("saleId", "ticketLegId");
CREATE INDEX IF NOT EXISTS "TicketSaleItem_ticketLegId_status_idx" ON "TicketSaleItem"("ticketLegId", status);
CREATE INDEX IF NOT EXISTS "TicketLegMigrationIssue_flightId_code_idx" ON "TicketLegMigrationIssue"("flightId", code);
CREATE INDEX IF NOT EXISTS "TicketLegMigrationIssue_ticketId_idx" ON "TicketLegMigrationIssue"("ticketId");
CREATE INDEX IF NOT EXISTS "Ticket_originalOwnerFirmId_status_idx" ON "Ticket"("originalOwnerFirmId", status);
CREATE INDEX IF NOT EXISTS "Transaction_sourceMode_status_createdAt_idx" ON "Transaction"("sourceMode", status, "createdAt");
CREATE INDEX IF NOT EXISTS "Transaction_reversedTransactionId_idx" ON "Transaction"("reversedTransactionId");
CREATE INDEX IF NOT EXISTS "Transaction_deletedAt_idx" ON "Transaction"("deletedAt");
CREATE INDEX IF NOT EXISTS "SaleCancellationRequest_ticketSaleId_status_idx" ON "SaleCancellationRequest"("ticketSaleId", status);

DO $$ BEGIN ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_originalOwnerFirmId_fkey" FOREIGN KEY ("originalOwnerFirmId") REFERENCES "Firm"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TicketLeg" ADD CONSTRAINT "TicketLeg_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TicketLeg" ADD CONSTRAINT "TicketLeg_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TicketLeg" ADD CONSTRAINT "TicketLeg_currentOwnerFirmId_fkey" FOREIGN KEY ("currentOwnerFirmId") REFERENCES "Firm"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TicketLeg" ADD CONSTRAINT "TicketLeg_pendingAllocationId_fkey" FOREIGN KEY ("pendingAllocationId") REFERENCES "TicketAllocation"(id) ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TicketLeg" ADD CONSTRAINT "TicketLeg_acceptedAllocationId_fkey" FOREIGN KEY ("acceptedAllocationId") REFERENCES "TicketAllocation"(id) ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TicketLeg" ADD CONSTRAINT "TicketLeg_tourPackageId_fkey" FOREIGN KEY ("tourPackageId") REFERENCES "TourPackage"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TicketAllocationLeg" ADD CONSTRAINT "TicketAllocationLeg_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "TicketAllocation"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TicketAllocationLeg" ADD CONSTRAINT "TicketAllocationLeg_ticketLegId_fkey" FOREIGN KEY ("ticketLegId") REFERENCES "TicketLeg"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TicketSale" ADD CONSTRAINT "TicketSale_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TicketSale" ADD CONSTRAINT "TicketSale_sellerFirmId_fkey" FOREIGN KEY ("sellerFirmId") REFERENCES "Firm"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TicketSale" ADD CONSTRAINT "TicketSale_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TicketSale" ADD CONSTRAINT "TicketSale_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TicketSaleItem" ADD CONSTRAINT "TicketSaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "TicketSale"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TicketSaleItem" ADD CONSTRAINT "TicketSaleItem_ticketLegId_fkey" FOREIGN KEY ("ticketLegId") REFERENCES "TicketLeg"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TicketLegMigrationIssue" ADD CONSTRAINT "TicketLegMigrationIssue_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TicketLegMigrationIssue" ADD CONSTRAINT "TicketLegMigrationIssue_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"(id) ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "SaleCancellationRequest" ADD CONSTRAINT "SaleCancellationRequest_ticketSaleId_fkey" FOREIGN KEY ("ticketSaleId") REFERENCES "TicketSale"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE "SaleCancellationRequest" request
SET "ticketSaleId" = candidate."saleId"
FROM (
  SELECT request_inner.id AS "requestId", MIN(item."saleId") AS "saleId"
  FROM "SaleCancellationRequest" request_inner
  JOIN "TicketLeg" leg ON leg."ticketId" = request_inner."ticketId"
  JOIN "TicketSaleItem" item ON item."ticketLegId" = leg.id AND item.status = 'CONFIRMED'
  JOIN "TicketSale" sale ON sale.id = item."saleId" AND sale.status = 'CONFIRMED'
  GROUP BY request_inner.id
  HAVING COUNT(DISTINCT item."saleId") = 1
) candidate
WHERE request.id = candidate."requestId" AND request."ticketSaleId" IS NULL;
