ALTER TABLE "Flight" ADD COLUMN "ownerFirmId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "allocationSourceFirmId" TEXT;

-- Existing flight ownership is recoverable from the oldest assigned ticket.
UPDATE "Flight" AS flight
SET "ownerFirmId" = (
  SELECT ticket."allocatedFirmId"
  FROM "Ticket" AS ticket
  WHERE ticket."flightId" = flight.id
    AND ticket."allocatedFirmId" IS NOT NULL
  ORDER BY ticket."createdAt" ASC
  LIMIT 1
)
WHERE flight."ownerFirmId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "Ticket" AS ticket
    WHERE ticket."flightId" = flight.id
      AND ticket."allocatedFirmId" IS NOT NULL
  );

-- Pending legacy allocations were sent by the flight owner.
UPDATE "Ticket" AS ticket
SET "allocationSourceFirmId" = flight."ownerFirmId"
FROM "Flight" AS flight
WHERE ticket."flightId" = flight.id
  AND ticket.status = 'PENDING'
  AND ticket."allocationSourceFirmId" IS NULL
  AND flight."ownerFirmId" IS NOT NULL
  AND ticket."allocatedFirmId" IS DISTINCT FROM flight."ownerFirmId";

CREATE INDEX "Flight_ownerFirmId_idx" ON "Flight"("ownerFirmId");
CREATE INDEX "Ticket_allocationSourceFirmId_status_idx" ON "Ticket"("allocationSourceFirmId", status);

ALTER TABLE "Flight"
  ADD CONSTRAINT "Flight_ownerFirmId_fkey"
  FOREIGN KEY ("ownerFirmId") REFERENCES "Firm"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Ticket"
  ADD CONSTRAINT "Ticket_allocationSourceFirmId_fkey"
  FOREIGN KEY ("allocationSourceFirmId") REFERENCES "Firm"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
