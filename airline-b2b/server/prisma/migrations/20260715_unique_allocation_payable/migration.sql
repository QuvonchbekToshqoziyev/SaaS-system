CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_one_active_allocation_payable"
ON "Transaction" ("subjectId")
WHERE "subjectType" = 'TICKET_ALLOCATION'
  AND type = 'PAYABLE'
  AND status = 'CONFIRMED'
  AND "deletedAt" IS NULL;
