#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*) FILTER (
        WHERE type = 'PAYABLE'
          AND (
            "subjectType" IN ('TICKET_ALLOCATION', 'TICKET_ALLOCATION_ADJUSTMENT')
            OR ("ticketId" IS NOT NULL AND "subjectType" IS NULL)
          )
      )::int AS "allocationTransactions",
      COUNT(*) FILTER (
        WHERE "subjectType" = 'SERVICE' AND direction = 'SERVICE_PURCHASE'
      )::int AS "serviceInventoryTransactions"
    FROM "Transaction"
    WHERE "deletedAt" IS NULL
  `);
  const inventoryTransactions = rows[0];
  const ok = inventoryTransactions.allocationTransactions === 0
    && inventoryTransactions.serviceInventoryTransactions === 0;
  console.log(JSON.stringify({ ok, inventoryTransactions }, null, 2));
  if (!ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
