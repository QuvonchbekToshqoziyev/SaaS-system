#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();
const APPLY = process.env.CONSOLIDATE_ALLOCATION_TRANSACTIONS === '1';

function decimalSum(rows, field) {
  return rows.reduce((sum, row) => sum.add(row[field]), new Prisma.Decimal(0)).toDecimalPlaces(4);
}

function sameValue(rows, field) {
  return new Set(rows.map((row) => String(row[field] ?? ''))).size === 1;
}

function validateGroup(allocation, rows, reverseReferenceCount) {
  if (!allocation) return 'allocation not found';
  if (allocation.status !== 'ACCEPTED') return `allocation status is ${allocation.status}`;
  if (rows.some((row) => row.ledgerEntries.length || row.paymentAllocations.length)) return 'linked ledger or payment allocation exists';
  if (reverseReferenceCount > 0 || rows.some((row) => row.reversedTransactionId)) return 'reversal reference exists';
  const fields = ['firmId', 'payerFirmId', 'receiverFirmId', 'flightId', 'currency', 'direction', 'type'];
  const mismatch = fields.find((field) => !sameValue(rows, field));
  if (mismatch) return `${mismatch} differs inside the allocation`;
  if (!decimalSum(rows, 'originalAmount').equals(allocation.totalAmount)) return 'transaction total does not match allocation total';
  return null;
}

async function loadCandidateGroups() {
  return prisma.transaction.groupBy({
    by: ['subjectId'],
    where: {
      subjectType: 'TICKET_ALLOCATION',
      subjectId: { not: null },
      type: 'PAYABLE',
      status: 'CONFIRMED',
      deletedAt: null,
    },
    _count: { _all: true },
    having: { subjectId: { _count: { gt: 1 } } },
  });
}

async function inspectGroup(client, allocationId) {
  const [allocation, rows] = await Promise.all([
    client.ticketAllocation.findUnique({ where: { id: allocationId } }),
    client.transaction.findMany({
      where: { subjectType: 'TICKET_ALLOCATION', subjectId: allocationId, type: 'PAYABLE', status: 'CONFIRMED', deletedAt: null },
      include: { ledgerEntries: { select: { id: true } }, paymentAllocations: { select: { id: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  ]);
  const reverseReferenceCount = rows.length
    ? await client.transaction.count({ where: { reversedTransactionId: { in: rows.map((row) => row.id) } } })
    : 0;
  return { allocation, rows, reverseReferenceCount };
}

async function consolidateGroup(allocationId) {
  return prisma.$transaction(async (tx) => {
    const { allocation, rows, reverseReferenceCount } = await inspectGroup(tx, allocationId);
    if (rows.length < 2) return { allocationId, outcome: 'already-consolidated' };
    const error = validateGroup(allocation, rows, reverseReferenceCount);
    if (error) return { allocationId, outcome: 'skipped', reason: error, transactionCount: rows.length };

    const now = new Date();
    const canonical = rows[0];
    const duplicates = rows.slice(1);
    const baseAmount = decimalSum(rows, 'baseAmount');
    const oldMetadata = canonical.metadata && typeof canonical.metadata === 'object' && !Array.isArray(canonical.metadata)
      ? canonical.metadata
      : {};

    await tx.transaction.update({
      where: { id: canonical.id },
      data: {
        ticketId: null,
        originalAmount: allocation.totalAmount,
        baseAmount,
        sourceMode: 'AUTO_ALLOCATION',
        metadata: {
          ...oldMetadata,
          allocationId,
          productType: allocation.productType,
          direction: allocation.direction,
          parentTicketCount: allocation.parentTicketCount,
          segmentCount: allocation.segmentCount,
          consolidatedLegacyTransactionCount: rows.length,
          consolidatedAt: now.toISOString(),
        },
      },
    });

    await tx.transaction.updateMany({
      where: { id: { in: duplicates.map((row) => row.id) } },
      data: {
        originalAmount: new Prisma.Decimal(0),
        baseAmount: new Prisma.Decimal(0),
        status: 'SUPERSEDED',
        sourceMode: 'LEGACY_CONSOLIDATED',
        deletedAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        actorRole: 'SYSTEM',
        action: 'ALLOCATION_TRANSACTIONS_CONSOLIDATED',
        entityType: 'ticketAllocation',
        entityId: allocationId,
        entityLabel: allocationId,
        summary: `${rows.length} ta eski ajratma tranzaksiyasi bitta tranzaksiyaga birlashtirildi`,
        before: rows.map((row) => ({ id: row.id, ticketId: row.ticketId, originalAmount: String(row.originalAmount), baseAmount: String(row.baseAmount) })),
        after: { canonicalTransactionId: canonical.id, originalAmount: String(allocation.totalAmount), baseAmount: String(baseAmount), supersededTransactionIds: duplicates.map((row) => row.id) },
        metadata: { repair: 'release-1.0.2', allocationId },
      },
    });

    return { allocationId, outcome: 'consolidated', canonicalTransactionId: canonical.id, transactionCount: rows.length };
  });
}

async function main() {
  const groups = await loadCandidateGroups();
  const results = [];

  for (const group of groups) {
    const allocationId = group.subjectId;
    if (!allocationId) continue;
    if (APPLY) {
      results.push(await consolidateGroup(allocationId));
      continue;
    }
    const { allocation, rows, reverseReferenceCount } = await inspectGroup(prisma, allocationId);
    const reason = validateGroup(allocation, rows, reverseReferenceCount);
    results.push({ allocationId, outcome: reason ? 'skipped' : 'ready', reason, transactionCount: rows.length });
  }

  const summary = results.reduce((acc, row) => {
    acc[row.outcome] = (acc[row.outcome] || 0) + 1;
    return acc;
  }, { candidateGroups: groups.length, mode: APPLY ? 'apply' : 'dry-run' });
  console.log(JSON.stringify({ summary, results }, null, 2));
  if (results.some((row) => row.outcome === 'skipped')) process.exitCode = 2;
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}

module.exports = { decimalSum, sameValue, validateGroup };
