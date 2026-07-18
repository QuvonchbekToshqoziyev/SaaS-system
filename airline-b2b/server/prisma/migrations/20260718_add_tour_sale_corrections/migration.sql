ALTER TABLE "TourPackageSale"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedByUserId" TEXT,
  ADD COLUMN "deleteReason" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "TourPackageSale_status_deletedAt_idx" ON "TourPackageSale"("status", "deletedAt");
