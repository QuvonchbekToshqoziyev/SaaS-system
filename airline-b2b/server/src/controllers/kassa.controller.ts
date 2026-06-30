import { Request, Response } from 'express';
import { prisma } from '../db';
import { KassaStatus, Prisma, Role } from '@prisma/client';
import {
  assertKassaOpenForDate,
  findKassaForDate,
  formatBusinessDateKey,
  getTransactionBusinessDateKey,
  nextDayUtc,
  normalizeBusinessDate,
  parseBusinessDate,
  startOfDayUtc,
  sumToNumber,
} from '../utils/kassa';
import { isPayableDebtType, payableAndPaymentTypeFilter } from '../utils/transaction-types';

type AuthUser = {
  userId?: string;
  role?: Role | string;
  firmId?: string | null;
};

function getAuthUser(req: Request): AuthUser {
  return ((req as any).user || {}) as AuthUser;
}

function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

function resolveBusinessDate(req: Request): Date | null {
  const raw = req.query.date ?? req.body?.businessDate ?? req.body?.date;
  return parseBusinessDate(String(raw || ''));
}

function serializeKassa(kassa: NonNullable<Awaited<ReturnType<typeof findKassaForDate>>>) {
  return {
    id: kassa.id,
    businessDate: formatBusinessDateKey(kassa.businessDate),
    status: kassa.status,
    openedAt: kassa.openedAt.toISOString(),
    closedAt: kassa.closedAt?.toISOString() ?? null,
    openedBy: kassa.openedBy,
    closedBy: kassa.closedBy,
    openingBalance: String(kassa.openingBalance),
    closingBalance: kassa.closingBalance != null ? String(kassa.closingBalance) : null,
    expectedCash: kassa.expectedCash != null ? String(kassa.expectedCash) : null,
    variance: kassa.variance != null ? String(kassa.variance) : null,
    notes: kassa.notes,
  };
}

async function loadDayTransactions(businessDate: Date, firmScopeId?: string) {
  const dayKey = formatBusinessDateKey(businessDate);
  const dayStart = startOfDayUtc(businessDate);
  const dayEnd = nextDayUtc(businessDate);

  const where: Prisma.TransactionWhereInput = firmScopeId ? { firmId: firmScopeId } : {};
  const rows = await prisma.transaction.findMany({
    where,
    include: { firm: true, flight: true },
    orderBy: { createdAt: 'desc' },
  });

  return rows.filter((tx) => getTransactionBusinessDateKey(tx) === dayKey);
}

function computeDayTotals(transactions: Awaited<ReturnType<typeof loadDayTransactions>>) {
  let cashTotal = 0;
  let cardTotal = 0;
  let paymentCount = 0;
  let saleTotal = 0;
  let payableTotal = 0;

  for (const tx of transactions) {
    const base = sumToNumber(tx.baseAmount);
    if (tx.type === 'PAYMENT') {
      paymentCount += 1;
      const method = String(tx.paymentMethod || '').toLowerCase();
      if (method === 'cash') cashTotal += base;
      else if (method === 'card') cardTotal += base;
    } else if (tx.type === 'SALE') {
      saleTotal += base;
    } else if (isPayableDebtType(tx.type)) {
      payableTotal += base;
    }
  }

  return { cashTotal, cardTotal, paymentCount, saleTotal, payableTotal, transactionCount: transactions.length };
}

async function loadDuePayments(firmScopeId?: string) {
  const where: Prisma.TransactionWhereInput = {
    type: payableAndPaymentTypeFilter,
    ...(firmScopeId ? { firmId: firmScopeId } : {}),
  };

  const groups = await prisma.transaction.groupBy({
    by: ['firmId', 'flightId', 'type'],
    where,
    _sum: { baseAmount: true },
  });

  const firmIds = Array.from(new Set(groups.map((g) => g.firmId).filter(Boolean))) as string[];
  const flightIds = Array.from(new Set(groups.map((g) => g.flightId).filter(Boolean))) as string[];

  const [firms, flights] = await Promise.all([
    firmIds.length
      ? prisma.firm.findMany({ where: { id: { in: firmIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    flightIds.length
      ? prisma.flight.findMany({
          where: { id: { in: flightIds } },
          select: { id: true, flightNumber: true, departure: true },
        })
      : Promise.resolve([]),
  ]);

  const firmById = new Map(firms.map((f) => [f.id, f]));
  const flightById = new Map(flights.map((f) => [f.id, f]));

  const bucket = new Map<string, { debt: number; paid: number; firmId: string; flightId: string }>();
  for (const row of groups) {
    const key = `${row.firmId}:${row.flightId}`;
    const current = bucket.get(key) || { debt: 0, paid: 0, firmId: row.firmId, flightId: row.flightId };
    const val = sumToNumber(row._sum?.baseAmount);
    if (isPayableDebtType(row.type)) current.debt += val;
    if (row.type === 'PAYMENT') current.paid += val;
    bucket.set(key, current);
  }

  return Array.from(bucket.values())
    .map((row) => {
      const outstanding = row.debt - row.paid;
      const firm = firmById.get(row.firmId);
      const flight = flightById.get(row.flightId);
      return {
        firmId: row.firmId,
        firmName: firm?.name ?? null,
        flightId: row.flightId,
        flightNumber: flight?.flightNumber ?? null,
        departure: flight?.departure?.toISOString() ?? null,
        debt: row.debt,
        paid: row.paid,
        outstanding,
      };
    })
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);
}

export const getKassaDay = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  const businessDate = resolveBusinessDate(req);

  if (!businessDate) {
    return res.status(400).json({ error: 'Invalid or missing date (YYYY-MM-DD)' });
  }

  const firmScopeId =
    role === 'FIRM' ? (authUser.firmId ? String(authUser.firmId) : undefined) : undefined;
  if (role === 'FIRM' && !firmScopeId) {
    return res.status(400).json({ error: 'Firm account is missing firmId' });
  }

  try {
    const day = normalizeBusinessDate(businessDate);
    const [kassa, transactions, duePayments] = await Promise.all([
      findKassaForDate(day),
      loadDayTransactions(day, firmScopeId),
      loadDuePayments(firmScopeId),
    ]);

    const totals = computeDayTotals(transactions);
    const status = kassa?.status === KassaStatus.CLOSED ? KassaStatus.CLOSED : kassa ? KassaStatus.OPEN : 'NOT_OPEN';
    const expectedCash = kassa ? sumToNumber(kassa.openingBalance) + totals.cashTotal : null;

    res.json({
      businessDate: formatBusinessDateKey(day),
      status,
      kassa: kassa ? serializeKassa(kassa) : null,
      totals: { ...totals, expectedCash },
      transactions: transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        firmId: tx.firmId,
        flightId: tx.flightId,
        firm: tx.firm,
        flight: tx.flight,
        originalAmount: String(tx.originalAmount),
        currency: tx.currency,
        baseAmount: String(tx.baseAmount),
        paymentMethod: tx.paymentMethod,
        metadata: tx.metadata,
        createdAt: tx.createdAt.toISOString(),
      })),
      duePayments,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const openKassa = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const actorUserId = authUser.userId ? String(authUser.userId) : '';
  const businessDate = parseBusinessDate(String(req.body?.businessDate || ''));

  if (!actorUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!businessDate) {
    return res.status(400).json({ error: 'Invalid businessDate (YYYY-MM-DD)' });
  }

  const openingRaw = req.body?.openingBalance;
  let openingBalance = new Prisma.Decimal(0);
  if (openingRaw != null && String(openingRaw).trim() !== '') {
    try {
      openingBalance = new Prisma.Decimal(String(openingRaw));
      if (openingBalance.lt(0)) {
        return res.status(400).json({ error: 'Opening balance cannot be negative' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid opening balance' });
    }
  }

  try {
    const day = normalizeBusinessDate(businessDate);
    const kassa = await prisma.$transaction(async (tx) => {
      const existing = await tx.kassaDay.findUnique({
        where: { businessDate: day },
        include: {
          openedBy: { select: { id: true, email: true } },
          closedBy: { select: { id: true, email: true } },
        },
      });

      if (existing) {
        if (existing.status === KassaStatus.CLOSED) {
          throw new Error('Kassa is already closed for this date and cannot be reopened');
        }
        throw new Error('Kassa is already open for this date');
      }

      return tx.kassaDay.create({
        data: {
          businessDate: day,
          status: KassaStatus.OPEN,
          openedByUserId: actorUserId,
          openingBalance: openingBalance.toDecimalPlaces(4),
        },
        include: {
          openedBy: { select: { id: true, email: true } },
          closedBy: { select: { id: true, email: true } },
        },
      });
    });

    res.status(201).json({ kassa: serializeKassa(kassa) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const closeKassa = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const actorUserId = authUser.userId ? String(authUser.userId) : '';
  const businessDate = parseBusinessDate(String(req.body?.businessDate || ''));

  if (!actorUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!businessDate) {
    return res.status(400).json({ error: 'Invalid businessDate (YYYY-MM-DD)' });
  }

  const closingRaw = req.body?.closingBalance;
  let closingBalance: Prisma.Decimal | undefined;
  if (closingRaw != null && String(closingRaw).trim() !== '') {
    try {
      closingBalance = new Prisma.Decimal(String(closingRaw));
      if (closingBalance.lt(0)) {
        return res.status(400).json({ error: 'Closing balance cannot be negative' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid closing balance' });
    }
  }

  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : undefined;

  try {
    const day = normalizeBusinessDate(businessDate);
    const updated = await prisma.$transaction(async (tx) => {
      const kassa = await tx.kassaDay.findUnique({
        where: { businessDate: day },
        include: {
          openedBy: { select: { id: true, email: true } },
          closedBy: { select: { id: true, email: true } },
        },
      });
      if (!kassa) {
        throw new Error('Kassa is not open for this date');
      }
      if (kassa.status === KassaStatus.CLOSED) {
        throw new Error('Kassa is already closed for this date');
      }

      const transactions = await loadDayTransactions(day);
      const totals = computeDayTotals(transactions);
      const expectedCash = sumToNumber(kassa.openingBalance) + totals.cashTotal;
      const variance =
        closingBalance != null ? sumToNumber(closingBalance) - expectedCash : null;

      return tx.kassaDay.update({
        where: { businessDate: day },
        data: {
          status: KassaStatus.CLOSED,
          closedAt: new Date(),
          closedByUserId: actorUserId,
          closingBalance: closingBalance?.toDecimalPlaces(4),
          expectedCash: new Prisma.Decimal(expectedCash).toDecimalPlaces(4),
          variance: variance != null ? new Prisma.Decimal(variance).toDecimalPlaces(4) : null,
          notes: notes || null,
        },
        include: {
          openedBy: { select: { id: true, email: true } },
          closedBy: { select: { id: true, email: true } },
        },
      });
    });

    res.json({ kassa: serializeKassa(updated) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const getKassaHistory = async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
  const skip = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    prisma.kassaDay.count(),
    prisma.kassaDay.findMany({
      orderBy: { businessDate: 'desc' },
      skip,
      take: limit,
      include: {
        openedBy: { select: { id: true, email: true } },
        closedBy: { select: { id: true, email: true } },
      },
    }),
  ]);

  res.json({
    data: rows.map(serializeKassa),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
  });
};

export { assertKassaOpenForDate, parseBusinessDate, startOfDayUtc };
