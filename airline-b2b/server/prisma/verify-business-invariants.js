#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const [allocationRows, indexRows] = await Promise.all([
    prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*) FILTER (WHERE tx.cnt = 0)::int AS "missingTransaction",
        COUNT(*) FILTER (WHERE tx.cnt > 1)::int AS "duplicateTransaction",
        COUNT(*) FILTER (WHERE tx.cnt = 1 AND tx.total <> a."totalAmount")::int AS "wrongTotal",
        COUNT(*)::int AS "acceptedAllocations"
      FROM "TicketAllocation" a
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt, COALESCE(SUM(t."originalAmount"), 0) AS total
        FROM "Transaction" t
        WHERE t."subjectType" = 'TICKET_ALLOCATION'
          AND t."subjectId" = a.id
          AND t.type = 'PAYABLE'
          AND t.status = 'CONFIRMED'
          AND t."deletedAt" IS NULL
      ) tx ON TRUE
      WHERE a.status = 'ACCEPTED'
    `),
    prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS count
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = 'Transaction_one_active_allocation_payable'
    `),
  ]);
  const allocation = allocationRows[0];
  const uniqueIndexPresent = indexRows[0]?.count === 1;
  const ok = uniqueIndexPresent
    && allocation.missingTransaction === 0
    && allocation.duplicateTransaction === 0
    && allocation.wrongTotal === 0;
  console.log(JSON.stringify({ ok, uniqueIndexPresent, allocation }, null, 2));
  if (!ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
