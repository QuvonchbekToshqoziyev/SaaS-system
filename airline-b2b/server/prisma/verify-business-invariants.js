#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw`
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
  `;
  const inventoryTransactions = rows[0];
  const employeeLoginRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS "statusMismatches"
    FROM "Employee" employee
    JOIN "User" login_user ON login_user.id = employee."loginUserId"
    WHERE (
      employee.status = 'ACTIVE'
      AND (login_user.status <> 'ACTIVE' OR login_user."deletedAt" IS NOT NULL)
    ) OR (
      employee.status IN ('SUSPENDED', 'DELETED')
      AND login_user.status = 'ACTIVE'
      AND login_user."deletedAt" IS NULL
    )
  `;
  const employeeLogins = employeeLoginRows[0];
  const ok = inventoryTransactions.allocationTransactions === 0
    && inventoryTransactions.serviceInventoryTransactions === 0
    && employeeLogins.statusMismatches === 0;
  console.log(JSON.stringify({ ok, inventoryTransactions, employeeLogins }, null, 2));
  if (!ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
