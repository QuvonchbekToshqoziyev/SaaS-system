import { Request, Response } from 'express';
import { prisma } from '../db';
import { Prisma, Role, TicketStatus, TransactionType } from '@prisma/client';

type AuthUser = {
  userId?: string;
  role?: Role | string;
  firmId?: string | null;
};

function getAuthUser(req: Request): AuthUser {
  return ((req as any).user || {}) as AuthUser;
}

function parseDateParam(value: unknown): Date | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function sumToNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  // Prisma Decimal supports valueOf/toString
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

function normalizePaymentMethod(method: unknown): string {
  const m = String(method || '').trim().toLowerCase();
  if (!m) return 'unknown';
  return m;
}

function buildCreatedAtFilter(dateFrom?: Date, dateTo?: Date): Prisma.DateTimeFilter | undefined {
  if (!dateFrom && !dateTo) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (dateFrom) filter.gte = dateFrom;
  if (dateTo) filter.lte = dateTo;
  return filter;
}

function parseMonthParam(value: unknown): { month: string; start: Date; end: Date } | undefined {
  const now = new Date();
  let year = now.getUTCFullYear();
  let monthIndex = now.getUTCMonth();

  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    const match = /^([0-9]{4})-([0-9]{2})$/.exec(trimmed);
    if (!match) return undefined;
    const parsedYear = Number(match[1]);
    const parsedMonth = Number(match[2]);
    if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedMonth)) return undefined;
    if (parsedMonth < 1 || parsedMonth > 12) return undefined;
    year = parsedYear;
    monthIndex = parsedMonth - 1;
  }

  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
  const month = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  return { month, start, end };
}

function dateKeyUtc(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
    .toISOString()
    .slice(0, 10);
}

export const getFlightReport = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);

  const { flightId, flight_id } = req.query;
  const id = flightId || flight_id;

  const resolvedFlightId = id ? String(id) : undefined;

  const firmScopeId = role === 'FIRM'
    ? (authUser.firmId ? String(authUser.firmId) : undefined)
    : undefined;

  if (role === 'FIRM' && !firmScopeId) {
    return res.status(400).json({ error: 'Firm account is missing firmId' });
  }

  const txWhere: Prisma.TransactionWhereInput = {};
  if (resolvedFlightId) txWhere.flightId = resolvedFlightId;
  if (firmScopeId) txWhere.firmId = firmScopeId;

  const [txByType, ticketCountsByStatus, txByFirmAndType, ticketCountsByFirmAndStatus, flight] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['type'],
      where: txWhere,
      _sum: { baseAmount: true },
      _count: { _all: true },
    }),
    resolvedFlightId
      ? prisma.ticket.groupBy({
          by: ['status'],
          where: {
            flightId: resolvedFlightId,
            ...(firmScopeId ? { assignedFirmId: firmScopeId } : {}),
          },
          _count: { _all: true },
        })
      : Promise.resolve([] as Array<{ status: TicketStatus; _count: { _all: number } }>),
    resolvedFlightId
      ? prisma.transaction.groupBy({
          by: ['firmId', 'type'],
          where: txWhere,
          _sum: { baseAmount: true },
        })
      : Promise.resolve([] as Array<{ firmId: string; type: TransactionType; _sum: { baseAmount: unknown } }>),
    resolvedFlightId
      ? prisma.ticket.groupBy({
          by: ['assignedFirmId', 'status'],
          where: {
            flightId: resolvedFlightId,
            ...(firmScopeId ? { assignedFirmId: firmScopeId } : { assignedFirmId: { not: null } }),
          },
          _count: { _all: true },
        })
      : Promise.resolve(
          [] as Array<{ assignedFirmId: string | null; status: TicketStatus; _count: { _all: number } }>,
        ),
    resolvedFlightId
      ? prisma.flight.findUnique({
          where: { id: resolvedFlightId },
          select: { id: true, flightNumber: true, departure: true, arrival: true, status: true },
        })
      : Promise.resolve(null),
  ]);

  const firmIdsForFlight = resolvedFlightId
    ? Array.from(new Set(txByFirmAndType.map((g) => g.firmId)))
    : [];
  const firms = firmIdsForFlight.length
    ? await prisma.firm.findMany({
        where: { id: { in: firmIdsForFlight } },
        select: { id: true, name: true },
      })
    : [];

  let debt = 0;
  let revenue = 0;
  let paid = 0;

  for (const row of txByType) {
    const val = sumToNumber(row._sum?.baseAmount);
    if (row.type === 'PAYABLE') debt += val;
    if (row.type === 'SALE') revenue += val;
    if (row.type === 'PAYMENT') paid += val;
  }

  const profit = revenue - debt;
  const outstanding = debt - paid;

  const tickets = {
    total: 0,
    available: 0,
    assigned: 0,
    sold: 0,
  };

  if (ticketCountsByStatus.length > 0) {
    for (const row of ticketCountsByStatus) {
      const count = row._count?._all || 0;
      tickets.total += count;
      if (row.status === 'AVAILABLE') tickets.available += count;
      if (row.status === 'ASSIGNED' || row.status === 'PENDING') tickets.assigned += count;
      if (row.status === 'SOLD') tickets.sold += count;
    }
  }

  const firmNameById = new Map<string, string>();
  for (const f of firms) firmNameById.set(f.id, f.name);

  const ticketByFirm = new Map<string, { assigned: number; sold: number }>();
  for (const row of ticketCountsByFirmAndStatus) {
    const firmIdVal = row.assignedFirmId;
    if (!firmIdVal) continue;
    const existing = ticketByFirm.get(firmIdVal) || { assigned: 0, sold: 0 };
    const count = row._count?._all || 0;
    if (row.status === 'PENDING' || row.status === 'ASSIGNED' || row.status === 'SOLD') existing.assigned += count;
    if (row.status === 'SOLD') existing.sold += count;
    ticketByFirm.set(firmIdVal, existing);
  }

  const firmMetricById = new Map<
    string,
    {
      firmId: string;
      firmName: string | null;
      ticketsAssigned: number;
      ticketsSold: number;
      debt: number;
      revenue: number;
      paid: number;
    }
  >();

  for (const row of txByFirmAndType) {
    const existing =
      firmMetricById.get(row.firmId) ||
      {
        firmId: row.firmId,
        firmName: firmNameById.get(row.firmId) || null,
        ticketsAssigned: 0,
        ticketsSold: 0,
        debt: 0,
        revenue: 0,
        paid: 0,
      };

    const val = sumToNumber((row as any)._sum?.baseAmount);
    if (row.type === 'PAYABLE') existing.debt += val;
    if (row.type === 'SALE') existing.revenue += val;
    if (row.type === 'PAYMENT') existing.paid += val;

    const ticketCounts = ticketByFirm.get(row.firmId);
    if (ticketCounts) {
      existing.ticketsAssigned = ticketCounts.assigned;
      existing.ticketsSold = ticketCounts.sold;
    }

    firmMetricById.set(row.firmId, existing);
  }

  const firmBreakdown = Array.from(firmMetricById.values())
    .map((m) => ({
      ...m,
      outstanding: m.debt - m.paid,
      profit: m.revenue - m.debt,
    }))
    .sort((a, b) => (a.firmName || a.firmId).localeCompare(b.firmName || b.firmId));

  res.json({ 
    flight: flight || null,
    flightId: resolvedFlightId || null,
    revenue, 
    debt, 
    paid, 
    profit, 
    outstanding, 
    total_allocated: debt, 
    total_sales: revenue, 
    total_payments: paid,
    tickets,
    firms: firmBreakdown,
  });
};

export const getFirmReport = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);

  const { firmId, firm_id, dateFrom, dateTo } = req.query;
  const parsedFrom = parseDateParam(dateFrom);
  const parsedTo = parseDateParam(dateTo);

  const resolvedFirmId = role === 'FIRM'
    ? (authUser.firmId ? String(authUser.firmId) : undefined)
    : String(firmId || firm_id || '');

  if (!resolvedFirmId) {
    return res.status(400).json({ error: 'firmId is required' });
  }

  const firm = await prisma.firm.findUnique({
    where: { id: resolvedFirmId },
    select: { id: true, name: true },
  });

  if (!firm) {
    return res.status(404).json({ error: 'Firm not found' });
  }

  const txWhere: Prisma.TransactionWhereInput = { firmId: resolvedFirmId };
  const createdAtFilter = buildCreatedAtFilter(parsedFrom, parsedTo);
  if (createdAtFilter) txWhere.createdAt = createdAtFilter;

  const [byType, byFlightAndType, ticketsByStatus, ticketsByFlightAndStatus, paymentsByMethod] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['type'],
      where: txWhere,
      _sum: { baseAmount: true },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['flightId', 'type'],
      where: txWhere,
      _sum: { baseAmount: true },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ['status'],
      where: { assignedFirmId: resolvedFirmId },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ['flightId', 'status'],
      where: { assignedFirmId: resolvedFirmId },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['paymentMethod'],
      where: { ...txWhere, type: 'PAYMENT' },
      _sum: { baseAmount: true },
      _count: { _all: true },
    }),
  ]);

  const totals = { debt: 0, revenue: 0, paid: 0 };
  const transactionsByType = byType.map((row) => {
    const totalBaseAmount = sumToNumber(row._sum?.baseAmount);
    if (row.type === 'PAYABLE') totals.debt += totalBaseAmount;
    if (row.type === 'SALE') totals.revenue += totalBaseAmount;
    if (row.type === 'PAYMENT') totals.paid += totalBaseAmount;
    return {
      type: row.type,
      count: row._count?._all || 0,
      totalBaseAmount,
    };
  });

  const ticketTotals = { assigned: 0, sold: 0, available: 0, total: 0 };
  for (const row of ticketsByStatus) {
    const count = row._count?._all || 0;
    ticketTotals.total += count;
    if (row.status === 'ASSIGNED' || row.status === 'PENDING') ticketTotals.assigned += count;
    if (row.status === 'SOLD') ticketTotals.sold += count;
    if (row.status === 'AVAILABLE') ticketTotals.available += count;
  }

  const byFlight = new Map<
    string,
    {
      flightId: string;
      flightNumber: string | null;
      departure: Date | null;
      arrival: Date | null;
      debt: number;
      revenue: number;
      paid: number;
      ticketsAssigned: number;
      ticketsSold: number;
    }
  >();

  for (const row of byFlightAndType) {
    const existing =
      byFlight.get(row.flightId) ||
      {
        flightId: row.flightId,
        flightNumber: null,
        departure: null,
        arrival: null,
        debt: 0,
        revenue: 0,
        paid: 0,
        ticketsAssigned: 0,
        ticketsSold: 0,
      };
    const val = sumToNumber(row._sum?.baseAmount);
    if (row.type === 'PAYABLE') existing.debt += val;
    if (row.type === 'SALE') existing.revenue += val;
    if (row.type === 'PAYMENT') existing.paid += val;
    byFlight.set(row.flightId, existing);
  }

  for (const row of ticketsByFlightAndStatus) {
    const existing =
      byFlight.get(row.flightId) ||
      {
        flightId: row.flightId,
        flightNumber: null,
        departure: null,
        arrival: null,
        debt: 0,
        revenue: 0,
        paid: 0,
        ticketsAssigned: 0,
        ticketsSold: 0,
      };
    const count = row._count?._all || 0;
    if (row.status === 'PENDING' || row.status === 'ASSIGNED' || row.status === 'SOLD') existing.ticketsAssigned += count;
    if (row.status === 'SOLD') existing.ticketsSold += count;
    byFlight.set(row.flightId, existing);
  }

  const flightIds = Array.from(byFlight.keys());
  const flights = flightIds.length
    ? await prisma.flight.findMany({
        where: { id: { in: flightIds } },
        select: { id: true, flightNumber: true, departure: true, arrival: true },
      })
    : [];
  const flightById = new Map(flights.map((f) => [f.id, f] as const));

  const byFlightRows = Array.from(byFlight.values())
    .map((row) => {
      const f = flightById.get(row.flightId);
      const flightNumber = f?.flightNumber ?? row.flightNumber;
      const departure = f?.departure ?? row.departure;
      const arrival = f?.arrival ?? row.arrival;

      const outstanding = row.debt - row.paid;
      const profit = row.revenue - row.debt;
      return {
        flightId: row.flightId,
        flightNumber,
        departure,
        arrival,
        debt: row.debt,
        revenue: row.revenue,
        paid: row.paid,
        outstanding,
        profit,
        ticketsAssigned: row.ticketsAssigned,
        ticketsSold: row.ticketsSold,
      };
    })
    .sort((a, b) => String(a.departure || '').localeCompare(String(b.departure || '')));

  const payments = paymentsByMethod
    .map((row) => ({
      method: normalizePaymentMethod(row.paymentMethod),
      count: row._count?._all || 0,
      totalBaseAmount: sumToNumber(row._sum?.baseAmount),
    }))
    .sort((a, b) => a.method.localeCompare(b.method));

  const debt = totals.debt;
  const revenue = totals.revenue;
  const paid = totals.paid;

  return res.json({
    firm,
    dateFrom: parsedFrom ? parsedFrom.toISOString() : null,
    dateTo: parsedTo ? parsedTo.toISOString() : null,
    totals: {
      debt,
      revenue,
      paid,
      outstanding: debt - paid,
      profit: revenue - debt,
    },
    tickets: {
      assigned: ticketTotals.assigned + ticketTotals.sold,
      sold: ticketTotals.sold,
      unsold: ticketTotals.assigned,
      total: ticketTotals.total,
    },
    transactionsByType,
    paymentsByMethod: payments,
    byFlight: byFlightRows,
  });
};

export const getPaymentsReport = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);

  const { firmId, firm_id, flightId, flight_id, currency, method, dateFrom, dateTo } = req.query;
  const parsedFrom = parseDateParam(dateFrom);
  const parsedTo = parseDateParam(dateTo);

  const resolvedFirmId = role === 'FIRM'
    ? (authUser.firmId ? String(authUser.firmId) : undefined)
    : (firmId || firm_id ? String(firmId || firm_id) : undefined);

  const resolvedFlightId = flightId || flight_id ? String(flightId || flight_id) : undefined;
  const normalizedMethod = method ? normalizePaymentMethod(method) : undefined;

  const where: Prisma.TransactionWhereInput = {
    type: 'PAYMENT',
  };
  const createdAtFilter = buildCreatedAtFilter(parsedFrom, parsedTo);
  if (createdAtFilter) where.createdAt = createdAtFilter;
  if (resolvedFirmId) where.firmId = resolvedFirmId;
  if (resolvedFlightId) where.flightId = resolvedFlightId;
  if (currency) where.currency = String(currency);
  if (normalizedMethod && normalizedMethod !== 'unknown') where.paymentMethod = normalizedMethod;

  const [totals, byMethod, byCurrency] = await Promise.all([
    prisma.transaction.aggregate({
      where,
      _sum: { baseAmount: true },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['paymentMethod'],
      where,
      _sum: { baseAmount: true },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['currency'],
      where,
      _sum: { baseAmount: true },
      _count: { _all: true },
    }),
  ]);

  return res.json({
    filters: {
      firmId: resolvedFirmId || null,
      flightId: resolvedFlightId || null,
      currency: currency ? String(currency) : null,
      method: normalizedMethod || null,
      dateFrom: parsedFrom ? parsedFrom.toISOString() : null,
      dateTo: parsedTo ? parsedTo.toISOString() : null,
    },
    totals: {
      count: totals._count?._all || 0,
      totalBaseAmount: sumToNumber(totals._sum?.baseAmount),
    },
    byMethod: byMethod
      .map((row) => ({
        method: normalizePaymentMethod(row.paymentMethod),
        count: row._count?._all || 0,
        totalBaseAmount: sumToNumber(row._sum?.baseAmount),
      }))
      .sort((a, b) => a.method.localeCompare(b.method)),
    byCurrency: byCurrency
      .map((row) => ({
        currency: row.currency,
        count: row._count?._all || 0,
        totalBaseAmount: sumToNumber(row._sum?.baseAmount),
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
  });
};

export const getTransactionsReport = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);

  const { dateFrom, dateTo, firmId, firm_id, flightId, flight_id, type, currency } = req.query;
  const parsedFrom = parseDateParam(dateFrom);
  const parsedTo = parseDateParam(dateTo);

  const resolvedFirmId = role === 'FIRM'
    ? (authUser.firmId ? String(authUser.firmId) : undefined)
    : (firmId || firm_id ? String(firmId || firm_id) : undefined);
  const resolvedFlightId = flightId || flight_id ? String(flightId || flight_id) : undefined;
  const normalizedType = type ? String(type).toUpperCase() : undefined;

  const where: Prisma.TransactionWhereInput = {};
  const createdAtFilter = buildCreatedAtFilter(parsedFrom, parsedTo);
  if (createdAtFilter) where.createdAt = createdAtFilter;
  if (resolvedFirmId) where.firmId = resolvedFirmId;
  if (resolvedFlightId) where.flightId = resolvedFlightId;
  if (currency) where.currency = String(currency);
  if (normalizedType) where.type = normalizedType as any;

  const [totals, byType, byCurrency] = await Promise.all([
    prisma.transaction.aggregate({
      where,
      _sum: { baseAmount: true },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['type'],
      where,
      _sum: { baseAmount: true },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['currency'],
      where,
      _sum: { baseAmount: true },
      _count: { _all: true },
    }),
  ]);

  return res.json({
    filters: {
      firmId: resolvedFirmId || null,
      flightId: resolvedFlightId || null,
      type: normalizedType || null,
      currency: currency ? String(currency) : null,
      dateFrom: parsedFrom ? parsedFrom.toISOString() : null,
      dateTo: parsedTo ? parsedTo.toISOString() : null,
    },
    totals: {
      count: totals._count?._all || 0,
      totalBaseAmount: sumToNumber(totals._sum?.baseAmount),
    },
    byType: byType
      .map((row) => ({
        type: row.type,
        count: row._count?._all || 0,
        totalBaseAmount: sumToNumber(row._sum?.baseAmount),
      }))
      .sort((a, b) => String(a.type).localeCompare(String(b.type))),
    byCurrency: byCurrency
      .map((row) => ({
        currency: row.currency,
        count: row._count?._all || 0,
        totalBaseAmount: sumToNumber(row._sum?.baseAmount),
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
  });
};

export const getInteractionsReport = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  if (role !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { dateFrom, dateTo } = req.query;
  const parsedFrom = parseDateParam(dateFrom);
  const parsedTo = parseDateParam(dateTo);
  const createdAtFilter = buildCreatedAtFilter(parsedFrom, parsedTo);

  const inviteWhere: Prisma.InvitationWhereInput = {
    firmId: { not: null },
  };
  if (createdAtFilter) inviteWhere.createdAt = createdAtFilter;

  const txWhere: Prisma.TransactionWhereInput = {
    createdByUserId: { not: null },
  };
  if (createdAtFilter) txWhere.createdAt = createdAtFilter;

  const [inviteGroups, txGroups] = await Promise.all([
    prisma.invitation.groupBy({
      by: ['createdBy', 'firmId'],
      where: inviteWhere,
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['createdByUserId', 'firmId', 'type'],
      where: txWhere,
      _sum: { baseAmount: true },
      _count: { _all: true },
    }),
  ]);

  const actorIds = new Set<string>();
  for (const i of inviteGroups) actorIds.add(String(i.createdBy));
  for (const t of txGroups) {
    if (t.createdByUserId) actorIds.add(String(t.createdByUserId));
  }

  const actors = actorIds.size
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(actorIds) } },
        select: { id: true, email: true, role: true },
      })
    : [];
  const adminActorById = new Map<string, { id: string; email: string; role: Role }>();
  for (const a of actors) {
    if (a.role === 'ADMIN' || a.role === 'SUPERADMIN') {
      adminActorById.set(a.id, a);
    }
  }

  const firmIds = new Set<string>();
  for (const i of inviteGroups) {
    if (i.firmId) firmIds.add(String(i.firmId));
  }
  for (const t of txGroups) firmIds.add(String(t.firmId));

  const firms = firmIds.size
    ? await prisma.firm.findMany({
        where: { id: { in: Array.from(firmIds) } },
        select: { id: true, name: true },
      })
    : [];
  const firmNameById = new Map(firms.map((f) => [f.id, f.name] as const));

  type Pair = {
    adminId: string;
    adminEmail: string;
    firmId: string;
    firmName: string | null;
    invitesSent: number;
    allocationsCount: number;
    allocationsBaseAmount: number;
    paymentsCount: number;
    paymentsBaseAmount: number;
    salesCount: number;
    salesBaseAmount: number;
    adjustmentsCount: number;
    adjustmentsBaseAmount: number;
  };

  const pairByKey = new Map<string, Pair>();
  const ensurePair = (adminId: string, firmIdVal: string): Pair => {
    const key = `${adminId}::${firmIdVal}`;
    const existing = pairByKey.get(key);
    if (existing) return existing;
    const admin = adminActorById.get(adminId);
    const pair: Pair = {
      adminId,
      adminEmail: admin?.email || adminId,
      firmId: firmIdVal,
      firmName: firmNameById.get(firmIdVal) || null,
      invitesSent: 0,
      allocationsCount: 0,
      allocationsBaseAmount: 0,
      paymentsCount: 0,
      paymentsBaseAmount: 0,
      salesCount: 0,
      salesBaseAmount: 0,
      adjustmentsCount: 0,
      adjustmentsBaseAmount: 0,
    };
    pairByKey.set(key, pair);
    return pair;
  };

  for (const row of inviteGroups) {
    const adminId = String(row.createdBy);
    if (!adminActorById.has(adminId)) continue;
    const firmIdVal = row.firmId ? String(row.firmId) : '';
    if (!firmIdVal) continue;
    const pair = ensurePair(adminId, firmIdVal);
    pair.invitesSent += row._count?._all || 0;
  }

  for (const row of txGroups) {
    const adminId = row.createdByUserId ? String(row.createdByUserId) : '';
    if (!adminId || !adminActorById.has(adminId)) continue;
    const firmIdVal = String(row.firmId);
    const pair = ensurePair(adminId, firmIdVal);
    const count = row._count?._all || 0;
    const totalBaseAmount = sumToNumber(row._sum?.baseAmount);

    if (row.type === 'PAYABLE') {
      pair.allocationsCount += count;
      pair.allocationsBaseAmount += totalBaseAmount;
    }
    if (row.type === 'PAYMENT') {
      pair.paymentsCount += count;
      pair.paymentsBaseAmount += totalBaseAmount;
    }
    if (row.type === 'SALE') {
      pair.salesCount += count;
      pair.salesBaseAmount += totalBaseAmount;
    }
    if (row.type === 'ADJUSTMENT') {
      pair.adjustmentsCount += count;
      pair.adjustmentsBaseAmount += totalBaseAmount;
    }
  }

  const pairs = Array.from(pairByKey.values()).sort((a, b) => {
    const adminCmp = a.adminEmail.localeCompare(b.adminEmail);
    if (adminCmp !== 0) return adminCmp;
    return (a.firmName || a.firmId).localeCompare(b.firmName || b.firmId);
  });

  const totals = pairs.reduce(
    (acc, p) => {
      acc.invitesSent += p.invitesSent;
      acc.allocationsBaseAmount += p.allocationsBaseAmount;
      acc.paymentsBaseAmount += p.paymentsBaseAmount;
      acc.salesBaseAmount += p.salesBaseAmount;
      acc.adjustmentsBaseAmount += p.adjustmentsBaseAmount;
      return acc;
    },
    {
      invitesSent: 0,
      allocationsBaseAmount: 0,
      paymentsBaseAmount: 0,
      salesBaseAmount: 0,
      adjustmentsBaseAmount: 0,
    },
  );

  return res.json({
    dateFrom: parsedFrom ? parsedFrom.toISOString() : null,
    dateTo: parsedTo ? parsedTo.toISOString() : null,
    totals,
    pairs,
  });
};

export const getMonthlyReport = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);

  const { firmId, firm_id } = req.query;
  const resolvedFirmId = role === 'FIRM'
    ? (authUser.firmId ? String(authUser.firmId) : undefined)
    : (firmId || firm_id ? String(firmId || firm_id) : undefined);

  if (role === 'FIRM' && !resolvedFirmId) {
    return res.status(400).json({ error: 'Firm account is missing firmId' });
  }

  const data: any[] = resolvedFirmId
    ? await prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('month', "createdAt") as month, 
          type, 
          SUM("baseAmount") as total
        FROM "Transaction"
        WHERE "firmId" = ${resolvedFirmId}
        GROUP BY month, type 
        ORDER BY month DESC;
      `
    : await prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('month', "createdAt") as month, 
          type, 
          SUM("baseAmount") as total
        FROM "Transaction" 
        GROUP BY month, type 
        ORDER BY month DESC;
      `;

  const formatted: Record<string, any> = {};

  data.forEach((row) => {
    const m = new Date(row.month).toISOString().substring(0, 7); // "YYYY-MM"
    if (!formatted[m]) {
      formatted[m] = { month: m, allocations: 0, sales: 0, payments: 0 };
    }
    const val = Number(row.total || 0);
    if (row.type === 'PAYABLE') formatted[m].allocations += val;
    if (row.type === 'SALE') formatted[m].sales += val;
    if (row.type === 'PAYMENT') formatted[m].payments += val;
  });

  res.json(Object.values(formatted));
};

export const getCalendarReport = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);

  const { month } = req.query;
  const parsed = parseMonthParam(month);
  if (!parsed) {
    return res.status(400).json({ error: 'Invalid month (expected YYYY-MM)' });
  }

  const firmScopeId = role === 'FIRM'
    ? (authUser.firmId ? String(authUser.firmId) : undefined)
    : undefined;
  if (role === 'FIRM' && !firmScopeId) {
    return res.status(400).json({ error: 'Firm account is missing firmId' });
  }

  const txWhere: Prisma.TransactionWhereInput = {
    createdAt: { gte: parsed.start, lt: parsed.end },
    ...(firmScopeId ? { firmId: firmScopeId } : {}),
  };

  const [flights, transactions, currencyRates] = await Promise.all([
    prisma.flight.findMany({
      where: {
        departure: { gte: parsed.start, lt: parsed.end },
      },
      orderBy: { departure: 'asc' },
      select: {
        id: true,
        flightNumber: true,
        departure: true,
        arrival: true,
      },
    }),
    prisma.transaction.findMany({
      where: txWhere,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        type: true,
        originalAmount: true,
        currency: true,
        exchangeRate: true,
        baseAmount: true,
        paymentMethod: true,
        metadata: true,
        createdAt: true,
        firm: { select: { id: true, name: true } },
        flight: { select: { id: true, flightNumber: true, departure: true, arrival: true } },
      },
    }),
    prisma.currencyRate.findMany({
      where: { recordedAt: { gte: parsed.start, lt: parsed.end } },
      orderBy: { recordedAt: 'asc' },
      select: {
        id: true,
        baseCurrency: true,
        targetCurrency: true,
        rate: true,
        source: true,
        recordedAt: true,
      },
    }),
  ]);

  return res.json({
    month: parsed.month,
    dateFrom: parsed.start.toISOString(),
    dateTo: parsed.end.toISOString(),
    flights,
    transactions,
    currencyRates,
  });
};

export const getDashboardReport = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);

  const firmScopeId = role === 'FIRM'
    ? (authUser.firmId ? String(authUser.firmId) : undefined)
    : undefined;
  if (role === 'FIRM' && !firmScopeId) {
    return res.status(400).json({ error: 'Firm account is missing firmId' });
  }

  if (role === 'FIRM') {
    const [pendingGroups, dueGroups] = await Promise.all([
      prisma.ticket.groupBy({
        by: ['flightId'],
        where: { assignedFirmId: firmScopeId, status: 'PENDING' },
        _count: { _all: true },
      }),
      prisma.transaction.groupBy({
        by: ['flightId', 'type'],
        where: {
          firmId: firmScopeId,
          type: { in: ['PAYABLE', 'PAYMENT'] },
        },
        _sum: { baseAmount: true },
      }),
    ]);

    const pendingFlightIds = pendingGroups.map((g) => g.flightId);
    const dueFlightIds = Array.from(new Set(dueGroups.map((g) => g.flightId)));
    const flightIds = Array.from(new Set([...pendingFlightIds, ...dueFlightIds]));

    const flights = flightIds.length
      ? await prisma.flight.findMany({
          where: { id: { in: flightIds } },
          select: { id: true, flightNumber: true, departure: true, arrival: true },
        })
      : [];
    const flightById = new Map(flights.map((f) => [f.id, f] as const));

    const pendingItems = pendingGroups
      .map((g) => {
        const f = flightById.get(g.flightId);
        return {
          flightId: g.flightId,
          flightNumber: f?.flightNumber || null,
          departure: f?.departure || null,
          count: g._count?._all || 0,
        };
      })
      .sort((a, b) => String(a.departure || '').localeCompare(String(b.departure || '')));

    const debtByFlight = new Map<string, number>();
    const paidByFlight = new Map<string, number>();
    for (const row of dueGroups) {
      const val = sumToNumber(row._sum?.baseAmount);
      if (row.type === 'PAYABLE') debtByFlight.set(row.flightId, (debtByFlight.get(row.flightId) || 0) + val);
      if (row.type === 'PAYMENT') paidByFlight.set(row.flightId, (paidByFlight.get(row.flightId) || 0) + val);
    }

    const dueItems = Array.from(new Set([...debtByFlight.keys(), ...paidByFlight.keys()]))
      .map((flightId) => {
        const f = flightById.get(flightId);
        const debt = debtByFlight.get(flightId) || 0;
        const paid = paidByFlight.get(flightId) || 0;
        const outstanding = debt - paid;
        return {
          flightId,
          flightNumber: f?.flightNumber || null,
          departure: f?.departure || null,
          debt,
          paid,
          outstanding,
        };
      })
      .filter((r) => r.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding);

    const pendingTotal = pendingItems.reduce((acc, i) => acc + (i.count || 0), 0);
    const totalOutstanding = dueItems.reduce((acc, i) => acc + i.outstanding, 0);

    return res.json({
      role,
      todos: [
        { key: 'pending_allocations', label: 'Confirm pending allocations', count: pendingTotal },
        { key: 'due_payments', label: 'Make payments (outstanding balance)', count: dueItems.length, amount: totalOutstanding },
      ],
      pendingAllocations: {
        total: pendingTotal,
        byFlight: pendingItems,
      },
      duePayments: {
        totalOutstanding,
        byFlight: dueItems,
      },
    });
  }

  const [pendingGroups, dueGroups] = await Promise.all([
    prisma.ticket.groupBy({
      by: ['assignedFirmId', 'flightId'],
      where: { status: 'PENDING', assignedFirmId: { not: null } },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['firmId', 'type'],
      where: { type: { in: ['PAYABLE', 'PAYMENT'] } },
      _sum: { baseAmount: true },
    }),
  ]);

  const firmIds = new Set<string>();
  const flightIds = new Set<string>();
  for (const g of pendingGroups) {
    if (g.assignedFirmId) firmIds.add(String(g.assignedFirmId));
    flightIds.add(String(g.flightId));
  }
  for (const g of dueGroups) {
    firmIds.add(String(g.firmId));
  }

  const [firms, flights] = await Promise.all([
    firmIds.size
      ? prisma.firm.findMany({
          where: { id: { in: Array.from(firmIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    flightIds.size
      ? prisma.flight.findMany({
          where: { id: { in: Array.from(flightIds) } },
          select: { id: true, flightNumber: true, departure: true, arrival: true },
        })
      : Promise.resolve([]),
  ]);
  const firmById = new Map(firms.map((f) => [f.id, f] as const));
  const flightById = new Map(flights.map((f) => [f.id, f] as const));

  const pendingItems = pendingGroups
    .map((g) => {
      const firmIdVal = g.assignedFirmId ? String(g.assignedFirmId) : '';
      const firm = firmIdVal ? firmById.get(firmIdVal) : undefined;
      const flight = flightById.get(String(g.flightId));
      return {
        firmId: firmIdVal,
        firmName: firm?.name || null,
        flightId: String(g.flightId),
        flightNumber: flight?.flightNumber || null,
        departure: flight?.departure || null,
        count: g._count?._all || 0,
      };
    })
    .filter((r) => r.firmId)
    .sort((a, b) => (a.firmName || a.firmId).localeCompare(b.firmName || b.firmId));

  const debtByFirm = new Map<string, number>();
  const paidByFirm = new Map<string, number>();
  for (const row of dueGroups) {
    const val = sumToNumber(row._sum?.baseAmount);
    if (row.type === 'PAYABLE') debtByFirm.set(row.firmId, (debtByFirm.get(row.firmId) || 0) + val);
    if (row.type === 'PAYMENT') paidByFirm.set(row.firmId, (paidByFirm.get(row.firmId) || 0) + val);
  }

  const dueItems = Array.from(new Set([...debtByFirm.keys(), ...paidByFirm.keys()]))
    .map((firmId) => {
      const f = firmById.get(firmId);
      const debt = debtByFirm.get(firmId) || 0;
      const paid = paidByFirm.get(firmId) || 0;
      const outstanding = debt - paid;
      return {
        firmId,
        firmName: f?.name || null,
        debt,
        paid,
        outstanding,
      };
    })
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  const pendingTotal = pendingItems.reduce((acc, i) => acc + (i.count || 0), 0);
  const totalOutstanding = dueItems.reduce((acc, i) => acc + i.outstanding, 0);

  return res.json({
    role,
    todos: [
      { key: 'pending_allocations', label: 'Pending firm confirmations', count: pendingTotal },
      { key: 'due_payments', label: 'Firms with outstanding balance', count: dueItems.length, amount: totalOutstanding },
    ],
    pendingAllocations: {
      total: pendingTotal,
      byFirmFlight: pendingItems,
    },
    duePayments: {
      totalOutstanding,
      byFirm: dueItems,
    },
  });
};
