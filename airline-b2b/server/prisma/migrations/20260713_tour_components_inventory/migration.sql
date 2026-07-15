ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'RESERVED_FOR_TOUR';

ALTER TABLE "TourPackage"
  ADD COLUMN IF NOT EXISTS "soldQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ticketsPerTour" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "totalCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;

UPDATE "TourPackage"
SET "soldQuantity" = GREATEST("quantity" - "availableQuantity", 0),
    "totalCost" = "unitPrice" * "quantity"
WHERE "totalCost" = 0;

ALTER TABLE "ServiceOffering"
  ADD COLUMN IF NOT EXISTS "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "consumedQuantity" INTEGER NOT NULL DEFAULT 0;

UPDATE "ServiceOffering" service
SET "availableQuantity" = GREATEST(
  service."quantity"
  - COALESCE((SELECT SUM(assignment."quantity") FROM "ServiceAssignment" assignment WHERE assignment."offeringId" = service."id" AND assignment."status" <> 'CANCELLED'), 0)
  - service."reservedQuantity"
  - service."consumedQuantity",
  0
);

ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "tourPackageId" TEXT;

CREATE TABLE IF NOT EXISTS "TourComponent" (
  "id" TEXT NOT NULL,
  "tourId" TEXT NOT NULL,
  "componentType" TEXT NOT NULL,
  "serviceId" TEXT,
  "quantityPerTour" INTEGER NOT NULL,
  "totalReservedQuantity" INTEGER NOT NULL,
  "consumedQuantity" INTEGER NOT NULL DEFAULT 0,
  "unitCostSnapshot" DECIMAL(18,4) NOT NULL,
  "originalCurrency" TEXT NOT NULL,
  "currencySnapshot" TEXT NOT NULL,
  "exchangeRateSnapshot" DECIMAL(18,8) NOT NULL,
  "costPerTourSnapshot" DECIMAL(18,4) NOT NULL,
  "totalCostSnapshot" DECIMAL(18,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TourComponent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TourComponent_tourId_serviceId_key" ON "TourComponent"("tourId", "serviceId");
CREATE INDEX IF NOT EXISTS "TourComponent_tourId_componentType_idx" ON "TourComponent"("tourId", "componentType");
CREATE INDEX IF NOT EXISTS "TourComponent_serviceId_idx" ON "TourComponent"("serviceId");
CREATE INDEX IF NOT EXISTS "Ticket_tourPackageId_status_idx" ON "Ticket"("tourPackageId", "status");

DO $$ BEGIN
  ALTER TABLE "TourPackage" ADD CONSTRAINT "TourPackage_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TourPackage" ADD CONSTRAINT "TourPackage_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_tourPackageId_fkey" FOREIGN KEY ("tourPackageId") REFERENCES "TourPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TourComponent" ADD CONSTRAINT "TourComponent_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "TourPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TourComponent" ADD CONSTRAINT "TourComponent_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
