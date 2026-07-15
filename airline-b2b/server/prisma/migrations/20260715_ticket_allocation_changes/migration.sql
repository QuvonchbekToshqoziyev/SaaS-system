ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "originPrice" DECIMAL(18,4) NOT NULL DEFAULT 0;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "allocationSourcePrice" DECIMAL(18,4);
UPDATE "Ticket" SET "originPrice" = price WHERE "originPrice" = 0;

ALTER TABLE "TicketAllocation" ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "AllocationChangeRequest" (
  id TEXT NOT NULL,
  "allocationId" TEXT NOT NULL,
  "requestedByFirmId" TEXT NOT NULL,
  "requestedByUserId" TEXT,
  "receivingFirmId" TEXT NOT NULL,
  type TEXT NOT NULL,
  "oldValuesJson" JSONB NOT NULL,
  "proposedValuesJson" JSONB NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "requiresCounterpartyApproval" BOOLEAN NOT NULL DEFAULT TRUE,
  "autoApproved" BOOLEAN NOT NULL DEFAULT FALSE,
  "baseVersion" INTEGER NOT NULL,
  "approvedByUserId" TEXT,
  "rejectedByUserId" TEXT,
  "rejectionReason" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AllocationChangeRequest_pkey" PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS "AllocationChangeRequest_allocationId_status_idx" ON "AllocationChangeRequest"("allocationId", status);
CREATE INDEX IF NOT EXISTS "AllocationChangeRequest_requestedByFirmId_status_idx" ON "AllocationChangeRequest"("requestedByFirmId", status);
CREATE INDEX IF NOT EXISTS "AllocationChangeRequest_receivingFirmId_status_idx" ON "AllocationChangeRequest"("receivingFirmId", status);
CREATE INDEX IF NOT EXISTS "AllocationChangeRequest_createdAt_idx" ON "AllocationChangeRequest"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AllocationChangeRequest_one_pending_per_allocation_idx"
  ON "AllocationChangeRequest"("allocationId") WHERE status = 'PENDING_APPROVAL';

DO $$ BEGIN
  ALTER TABLE "AllocationChangeRequest" ADD CONSTRAINT "AllocationChangeRequest_allocationId_fkey"
    FOREIGN KEY ("allocationId") REFERENCES "TicketAllocation"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
