UPDATE "Transaction"
SET "deletedAt" = COALESCE("deletedAt", NOW()),
    status = 'DELETED'
WHERE "deletedAt" IS NULL
  AND (
    (
      type = 'PAYABLE'
      AND (
        "subjectType" IN ('TICKET_ALLOCATION', 'TICKET_ALLOCATION_ADJUSTMENT')
        OR ("ticketId" IS NOT NULL AND "subjectType" IS NULL)
      )
    )
    OR ("subjectType" = 'SERVICE' AND direction = 'SERVICE_PURCHASE')
  );
