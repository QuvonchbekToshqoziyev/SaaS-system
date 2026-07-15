import { Request, Response } from 'express';
import { prisma } from '../db';
import { Prisma, Role, TicketStatus, TransactionType } from '@prisma/client';
import { isPayableDebtType, payableAndPaymentTypeFilter, payableDebtTypeFilter } from '../utils/transaction-types';
import { buildFinancialAnalyticsReport } from '../services/reporting/financial-reporting.service';
import { ERROR_CODES } from '../errors/catalog';
import { mapKnownError } from '../errors/app-error';
import { sendApiError } from '../errors/http';
import { buildCreatedAtFilter, dateKeyUtc, normalizePaymentMethod, parseDateParam, parseMonthParam, resolveReportFirmIds, sumToNumber } from '../domains/reports/report-query';
import { getAccessibleFirmIds } from '../utils/access';
import { buildTicketInventorySummary } from '../domains/tickets/inventory-summary';
import { canManageFirmWork } from '../utils/firm-user-roles';
import { writeAuditLog } from '../utils/audit';
import { activeFlightWhere } from '../domains/flights/flight-scope';

type AuthUser = {
  userId?: string;
  role?: Role | string;
  firmId?: string | null;
  firmRole?: string | null;
};

function getAuthUser(req: Request): AuthUser {
  return ((req as any).user || {}) as AuthUser;
}

function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

export const getFlightReport = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  const resolvedFlightId = String(req.query.flightId || req.query.flight_id || '').trim();
  if (!resolvedFlightId) return res.status(400).json({ error: 'flightId is required' });
  const authFirmId = authUser.firmId ? String(authUser.firmId) : '';
  if (role === 'FIRM' && !authFirmId) return res.status(400).json({ error: 'Firm account is missing firmId' });

  const accessibleFirmIds = role === 'ADMIN' ? await getAccessibleFirmIds(authUser) || [] : undefined;
  const scopeWhere: Prisma.FlightWhereInput | undefined = role === 'FIRM' ? {
    OR: [
      { ownerFirmId: authFirmId },
      { ownerFirmId: null, airline: { firmId: authFirmId } },
      { ticketLegs: { some: { currentOwnerFirmId: authFirmId } } },
      { ticketAllocations: { some: { OR: [{ fromFirmId: authFirmId }, { toFirmId: authFirmId }] } } },
      { ticketSales: { some: { sellerFirmId: authFirmId } } },
    ],
  } : role === 'ADMIN' ? {
    OR: [
      { ownerFirmId: { in: accessibleFirmIds } },
      { ownerFirmId: null, airline: { firmId: { in: accessibleFirmIds } } },
      { ticketLegs: { some: { currentOwnerFirmId: { in: accessibleFirmIds } } } },
      { ticketAllocations: { some: { OR: [{ fromFirmId: { in: accessibleFirmIds } }, { toFirmId: { in: accessibleFirmIds } }] } } },
    ],
  } : undefined;
  const flight = await prisma.flight.findFirst({
    where: {
      id: resolvedFlightId,
      AND: [activeFlightWhere(), ...(scopeWhere ? [scopeWhere] : [])],
    },
    select: {
      id: true, flightNumber: true, route: true, departure: true, arrival: true, returnDeparture: true, returnArrival: true,
      tripType: true, outboundOrigin: true, outboundDestination: true, returnOrigin: true, returnDestination: true,
      currency: true, status: true, ownerFirmId: true, ownerFirm: { select: { id: true, name: true } },
      airline: { select: { id: true, name: true, code: true, firmId: true } },
      tickets: {
        where: { deletedAt: null, status: { not: 'DELETED' } },
        select: {
          id: true, status: true, ticketType: true, assignedFirmId: true, originalOwnerFirmId: true,
          basePrice: true, originPrice: true, currency: true, soldPrice: true, soldCurrency: true, purchaserInfo: true,
          legs: { select: { id: true, ticketId: true, direction: true, status: true, currentOwnerFirmId: true, acquisitionCostSnapshot: true, originalCostSnapshot: true, allocationPriceSnapshot: true, currencySnapshot: true } },
        },
      },
      ticketAllocations: {
        select: {
          id: true, fromFirmId: true, toFirmId: true, status: true, productType: true, direction: true,
          parentTicketCount: true, segmentCount: true, currency: true, totalAmount: true, createdAt: true, acceptedAt: true,
          fromFirm: { select: { id: true, name: true } }, toFirm: { select: { id: true, name: true } },
          priceRows: { orderBy: { position: 'asc' }, select: { quantity: true, unitPrice: true, totalAmount: true } },
          legItems: { select: { ticketLegId: true, status: true, direction: true, acquisitionCostSnapshot: true, allocationPriceSnapshot: true, currencySnapshot: true, acquisitionCurrencySnapshot: true, allocationCurrencySnapshot: true } },
        },
      },
      ticketSales: {
        select: {
          id: true, sellerFirmId: true, status: true, productType: true, direction: true, quantity: true, segmentCount: true,
          unitPrice: true, totalAmount: true, currency: true, purchaserInfo: true, createdAt: true,
          items: { select: { ticketLegId: true, status: true, acquisitionCostSnapshot: true, salePriceSnapshot: true, currencySnapshot: true, acquisitionCurrencySnapshot: true, saleCurrencySnapshot: true } },
        },
      },
      ticketLegMigrationIssues: { where: { resolvedAt: null }, select: { id: true, code: true, details: true, ticketId: true, createdAt: true } },
    },
  });
  if (!flight) return res.status(role === 'FIRM' || role === 'ADMIN' ? 403 : 404).json({ error: role === 'FIRM' || role === 'ADMIN' ? 'Forbidden' : 'Flight not found' });

  const requestedFirmId = String(req.query.firmId || req.query.firm_id || '').trim();
  let reportFirmId = role === 'FIRM' ? authFirmId : requestedFirmId || flight.ownerFirmId || flight.airline?.firmId || '';
  if (role === 'ADMIN' && (!reportFirmId || !accessibleFirmIds?.includes(reportFirmId))) return res.status(403).json({ error: 'Forbidden' });
  if (!reportFirmId) return res.status(400).json({ error: 'Report firm could not be resolved' });

  const allocationIds = flight.ticketAllocations.map((allocation) => allocation.id);
  const transactions = await prisma.transaction.findMany({
    where: {
      deletedAt: null,
      AND: [
        { OR: [{ flightId: flight.id }, ...(allocationIds.length ? [{ subjectType: 'TICKET_ALLOCATION', subjectId: { in: allocationIds } }] : [])] },
        ...(role === 'FIRM' ? [{ OR: [{ firmId: authFirmId }, { payerFirmId: authFirmId }, { receiverFirmId: authFirmId }] }] : []),
      ],
    },
    select: {
      id: true, type: true, firmId: true, payerFirmId: true, receiverFirmId: true, subjectType: true, subjectId: true,
      originalAmount: true, baseAmount: true, currency: true, sourceMode: true, status: true,
      reversedTransactionId: true, deletedAt: true, metadata: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  const inventorySummary = buildTicketInventorySummary({
    tickets: flight.tickets,
    allocations: flight.ticketAllocations,
    sales: flight.ticketSales,
    transactions,
    sourceFirmId: reportFirmId,
    originOwnerFirmId: flight.ownerFirmId || flight.airline?.firmId,
    migrationIssueCount: flight.ticketLegMigrationIssues.length,
  });
  const legacyDebt = transactions.filter((row) => isPayableDebtType(row.type)).reduce((sum, row) => sum + Number(row.baseAmount), 0);
  const legacyRevenue = transactions.filter((row) => row.type === 'SALE').reduce((sum, row) => sum + Number(row.baseAmount), 0);
  const legacyPaid = transactions.filter((row) => row.type === 'PAYMENT').reduce((sum, row) => sum + Number(row.baseAmount), 0);
  const maySeeReconciliation = (inventorySummary as any).reportType === 'OWNER' || role === 'SUPERADMIN';

  return res.json({
    reportType: (inventorySummary as any).reportType,
    flight: {
      id: flight.id, flightNumber: flight.flightNumber, route: flight.route, tripType: flight.tripType,
      departure: flight.departure, arrival: flight.arrival, returnDeparture: flight.returnDeparture, returnArrival: flight.returnArrival,
      outboundOrigin: flight.outboundOrigin, outboundDestination: flight.outboundDestination,
      returnOrigin: flight.returnOrigin, returnDestination: flight.returnDestination,
      currency: flight.currency, status: flight.status, airline: flight.airline,
      ...((inventorySummary as any).reportType === 'OWNER' ? { ownerFirm: flight.ownerFirm } : {}),
    },
    flightId: flight.id,
    inventorySummary,
    allocations: (inventorySummary as any).allocations || [],
    transactions,
    reconciliation: { required: maySeeReconciliation && flight.ticketLegMigrationIssues.length > 0, issues: maySeeReconciliation ? flight.ticketLegMigrationIssues : [] },
    revenue: legacyRevenue,
    debt: legacyDebt,
    paid: legacyPaid,
    profit: legacyRevenue - legacyDebt,
    outstanding: Math.max(legacyDebt - legacyPaid, 0),
    total_allocated: legacyDebt,
    total_sales: legacyRevenue,
    total_payments: legacyPaid,
    tickets: {
      total: (inventorySummary as any).totalAcquiredTicketCount || 0,
      available: (inventorySummary as any).remainingAvailableTicketCount || 0,
      assigned: (inventorySummary as any).acceptedAllocatedTicketCount || 0,
      sold: (inventorySummary as any).directSoldTicketCount || 0,
    },
    firms: (inventorySummary as any).recipients || [],
  });
};

export const reconcileFlightInventory = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  if (!['FIRM', 'ADMIN', 'SUPERADMIN'].includes(role) || (role === 'FIRM' && !canManageFirmWork(authUser))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const flightId = String(req.body?.flightId || req.query.flightId || req.query.flight_id || '').trim();
  if (!flightId) return res.status(400).json({ error: 'flightId is required' });
  const authFirmId = String(authUser.firmId || '').trim();
  const requestedFirmId = String(req.body?.firmId || req.query.firmId || req.query.firm_id || '').trim();
  const accessibleFirmIds = role === 'ADMIN' ? await getAccessibleFirmIds(authUser) || [] : undefined;
  const scopeWhere: Prisma.FlightWhereInput | undefined = role === 'FIRM' ? {
    OR: [
      { ownerFirmId: authFirmId }, { ownerFirmId: null, airline: { firmId: authFirmId } },
      { ticketLegs: { some: { currentOwnerFirmId: authFirmId } } },
      { ticketAllocations: { some: { OR: [{ fromFirmId: authFirmId }, { toFirmId: authFirmId }] } } },
      { ticketSales: { some: { sellerFirmId: authFirmId } } },
    ],
  } : role === 'ADMIN' ? {
    OR: [
      { ownerFirmId: { in: accessibleFirmIds } }, { ownerFirmId: null, airline: { firmId: { in: accessibleFirmIds } } },
      { ticketLegs: { some: { currentOwnerFirmId: { in: accessibleFirmIds } } } },
      { ticketAllocations: { some: { OR: [{ fromFirmId: { in: accessibleFirmIds } }, { toFirmId: { in: accessibleFirmIds } }] } } },
    ],
  } : undefined;
  const flight = await prisma.flight.findFirst({
    where: { id: flightId, AND: [activeFlightWhere(), ...(scopeWhere ? [scopeWhere] : [])] },
    select: {
      id: true, flightNumber: true, ownerFirmId: true, airline: { select: { firmId: true } },
      tickets: {
        where: { deletedAt: null, status: { not: 'DELETED' } },
        select: { id: true, ticketType: true, legs: { select: { id: true, ticketId: true, status: true, currentOwnerFirmId: true } } },
      },
      ticketAllocations: {
        select: { id: true, fromFirmId: true, toFirmId: true, status: true, segmentCount: true, legItems: { where: { status: 'ACTIVE' }, select: { ticketLegId: true } } },
      },
      ticketSales: {
        select: { id: true, sellerFirmId: true, status: true, segmentCount: true, items: { where: { status: 'CONFIRMED' }, select: { ticketLegId: true } } },
      },
      ticketLegMigrationIssues: { where: { resolvedAt: null }, select: { id: true, code: true } },
    },
  });
  if (!flight) return res.status(role === 'SUPERADMIN' ? 404 : 403).json({ error: role === 'SUPERADMIN' ? 'Flight not found' : 'Forbidden' });

  const originOwnerFirmId = flight.ownerFirmId || flight.airline?.firmId || '';
  const reportFirmId = role === 'FIRM' ? authFirmId : requestedFirmId || originOwnerFirmId;
  if (!reportFirmId) return res.status(400).json({ error: 'Report firm could not be resolved' });
  if (role === 'ADMIN' && !accessibleFirmIds?.includes(reportFirmId)) return res.status(403).json({ error: 'Forbidden' });

  const relevantAllocations = flight.ticketAllocations.filter((row) => row.fromFirmId === reportFirmId || row.toFirmId === reportFirmId);
  const relevantSales = flight.ticketSales.filter((row) => row.sellerFirmId === reportFirmId);
  const ownerView = Boolean(originOwnerFirmId) && reportFirmId === originOwnerFirmId;
  const acquiredLegIds = new Set<string>();
  if (ownerView) {
    flight.tickets.flatMap((ticket) => ticket.legs).forEach((leg) => acquiredLegIds.add(leg.id));
  } else {
    relevantAllocations.filter((row) => row.toFirmId === reportFirmId && row.status === 'ACCEPTED')
      .flatMap((row) => row.legItems).forEach((item) => acquiredLegIds.add(item.ticketLegId));
  }
  const visibleLegs = flight.tickets.flatMap((ticket) => ticket.legs).filter((leg) => acquiredLegIds.has(leg.id));
  const discrepancies: Array<{ code: string; entityId?: string; expected?: number; actual?: number }> = [];
  if (ownerView) {
    const expectedLegs = flight.tickets.reduce((sum, ticket) => sum + (ticket.ticketType === 'ROUND_TRIP' ? 2 : 1), 0);
    const actualLegs = flight.tickets.reduce((sum, ticket) => sum + ticket.legs.length, 0);
    if (expectedLegs !== actualLegs) discrepancies.push({ code: 'TICKET_LEG_COUNT_MISMATCH', expected: expectedLegs, actual: actualLegs });
    flight.ticketLegMigrationIssues.forEach((issue) => discrepancies.push({ code: issue.code, entityId: issue.id }));
  }
  relevantAllocations.filter((row) => ['PENDING', 'ACCEPTED'].includes(row.status)).forEach((row) => {
    if (row.segmentCount !== row.legItems.length) discrepancies.push({ code: 'ALLOCATION_SEGMENT_COUNT_MISMATCH', entityId: row.id, expected: row.segmentCount, actual: row.legItems.length });
  });
  relevantSales.filter((row) => row.status === 'CONFIRMED').forEach((row) => {
    if (row.segmentCount !== row.items.length) discrepancies.push({ code: 'SALE_SEGMENT_COUNT_MISMATCH', entityId: row.id, expected: row.segmentCount, actual: row.items.length });
  });

  const allocationIds = relevantAllocations.map((row) => row.id);
  const transactions = await prisma.transaction.findMany({
    where: {
      deletedAt: null,
      AND: [
        { OR: [{ flightId }, ...(allocationIds.length ? [{ subjectType: 'TICKET_ALLOCATION', subjectId: { in: allocationIds } }] : [])] },
        { OR: [{ firmId: reportFirmId }, { payerFirmId: reportFirmId }, { receiverFirmId: reportFirmId }] },
      ],
    },
    select: { id: true, type: true, status: true, sourceMode: true, originalAmount: true, currency: true, reversedTransactionId: true },
  });
  const reversedIds = new Set(transactions.map((row) => row.reversedTransactionId).filter((id): id is string => Boolean(id)));
  const validPayments = transactions.filter((row) => row.type === 'PAYMENT' && row.status === 'CONFIRMED' && row.sourceMode !== 'REVERSAL' && !reversedIds.has(row.id));
  const paymentTotals = Array.from(validPayments.reduce((map, row) => map.set(row.currency, (map.get(row.currency) || 0) + Number(row.originalAmount)), new Map<string, number>()))
    .map(([currency, total]) => ({ currency, total }));
  const result = {
    required: discrepancies.length > 0,
    checkedAt: new Date().toISOString(),
    reportType: ownerView ? 'OWNER' : 'AGENT',
    comparisons: {
      acquiredParentTickets: new Set(visibleLegs.map((leg) => leg.ticketId)).size,
      acquiredSegments: visibleLegs.length,
      currentAvailableSegments: visibleLegs.filter((leg) => leg.currentOwnerFirmId === reportFirmId && ['AVAILABLE', 'ASSIGNED'].includes(leg.status)).length,
      pendingAllocationSegments: relevantAllocations.filter((row) => row.fromFirmId === reportFirmId && row.status === 'PENDING').reduce((sum, row) => sum + row.legItems.length, 0),
      acceptedAllocationSegments: relevantAllocations.filter((row) => row.fromFirmId === reportFirmId && row.status === 'ACCEPTED').reduce((sum, row) => sum + row.legItems.length, 0),
      confirmedSaleSegments: relevantSales.filter((row) => row.status === 'CONFIRMED').reduce((sum, row) => sum + row.items.length, 0),
      tourReservedSegments: visibleLegs.filter((leg) => leg.currentOwnerFirmId === reportFirmId && leg.status === 'RESERVED_FOR_TOUR').length,
      paymentTotals,
    },
    discrepancies,
  };
  await writeAuditLog(req, {
    action: 'FLIGHT_INVENTORY_RECONCILED', entityType: 'flight', entityId: flight.id, entityLabel: flight.flightNumber,
    summary: `Flight inventory reconciliation completed with ${discrepancies.length} issue(s)`, after: result,
    metadata: { reportFirmId },
  });
  return res.json(result);
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
    select: { id: true, name: true, creditLimit: true, currency: true, status: true },
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
      where: { assignedFirmId: resolvedFirmId, deletedAt: null, status: { not: 'DELETED' } },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ['flightId', 'status'],
      where: { assignedFirmId: resolvedFirmId, deletedAt: null, status: { not: 'DELETED' } },
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
    if (isPayableDebtType(row.type)) totals.debt += totalBaseAmount;
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
    const flightId = row.flightId || '';
    const existing =
      byFlight.get(flightId) ||
      {
        flightId: flightId,
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
    if (isPayableDebtType(row.type)) existing.debt += val;
    if (row.type === 'SALE') existing.revenue += val;
    if (row.type === 'PAYMENT') existing.paid += val;
    byFlight.set(flightId, existing);
  }

  for (const row of ticketsByFlightAndStatus) {
    const flightId = row.flightId || '';
    const existing =
      byFlight.get(flightId) ||
      {
        flightId: flightId,
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
    byFlight.set(flightId, existing);
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
      outstanding: Math.max(debt - paid, 0),
      balance: paid - debt,
      credit: Math.max(paid - debt, 0),
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
      _sum: { baseAmount: true, originalAmount: true },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['paymentMethod'],
      where,
      _sum: { baseAmount: true, originalAmount: true },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['currency'],
      where,
      _sum: { baseAmount: true, originalAmount: true },
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
      totalOriginalAmount: sumToNumber(totals._sum?.originalAmount),
    },
    byMethod: byMethod
      .map((row) => ({
        method: normalizePaymentMethod(row.paymentMethod),
        count: row._count?._all || 0,
        totalBaseAmount: sumToNumber(row._sum?.baseAmount),
        totalOriginalAmount: sumToNumber(row._sum?.originalAmount),
      }))
      .sort((a, b) => a.method.localeCompare(b.method)),
    byCurrency: byCurrency
      .map((row) => ({
        currency: row.currency,
        count: row._count?._all || 0,
        totalBaseAmount: sumToNumber(row._sum?.baseAmount),
        totalOriginalAmount: sumToNumber(row._sum?.originalAmount),
      }))
      .sort((a, b) => (a.currency || '').localeCompare(b.currency || '')),
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

  const [totals, byType, byCurrency, byKassaDesk] = await Promise.all([
    prisma.transaction.aggregate({
      where,
      _sum: { baseAmount: true, originalAmount: true },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['type'],
      where,
      _sum: { baseAmount: true, originalAmount: true },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['currency'],
      where,
      _sum: { baseAmount: true, originalAmount: true },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['kassaDeskId', 'paymentMethod'],
      where: {
        ...where,
        kassaDeskId: { not: null },
      },
      _sum: { baseAmount: true, originalAmount: true },
      _count: { _all: true },
    }),
  ]);
  const kassaDeskIds = Array.from(new Set(byKassaDesk.map((row) => row.kassaDeskId).filter((id): id is string => Boolean(id))));
  const kassaDesks = kassaDeskIds.length
    ? await prisma.kassaDesk.findMany({
        where: { id: { in: kassaDeskIds } },
        select: { id: true, name: true, code: true, firm: { select: { id: true, name: true } } },
      })
    : [];
  const kassaDeskById = new Map(kassaDesks.map((desk) => [desk.id, desk] as const));

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
      totalOriginalAmount: sumToNumber(totals._sum?.originalAmount),
    },
    byType: byType
      .map((row) => ({
        type: row.type,
        count: row._count?._all || 0,
        totalBaseAmount: sumToNumber(row._sum?.baseAmount),
        totalOriginalAmount: sumToNumber(row._sum?.originalAmount),
      }))
      .sort((a, b) => String(a.type).localeCompare(String(b.type))),
    byCurrency: byCurrency
      .map((row) => ({
        currency: row.currency,
        count: row._count?._all || 0,
        totalBaseAmount: sumToNumber(row._sum?.baseAmount),
        totalOriginalAmount: sumToNumber(row._sum?.originalAmount),
      }))
      .sort((a, b) => (a.currency || '').localeCompare(b.currency || '')),
    byKassaDesk: byKassaDesk
      .map((row) => {
        const desk = row.kassaDeskId ? kassaDeskById.get(row.kassaDeskId) : null;
        return {
          kassaDeskId: row.kassaDeskId,
          kassaDeskName: desk?.name || null,
          kassaDeskCode: desk?.code || null,
          firmId: desk?.firm?.id || null,
          firmName: desk?.firm?.name || null,
          paymentMethod: row.paymentMethod || null,
          count: row._count?._all || 0,
          totalBaseAmount: sumToNumber(row._sum?.baseAmount),
          totalOriginalAmount: sumToNumber(row._sum?.originalAmount),
        };
      })
      .sort((a, b) => `${a.firmName || ''}${a.kassaDeskName || ''}`.localeCompare(`${b.firmName || ''}${b.kassaDeskName || ''}`)),
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

    if (isPayableDebtType(row.type)) {
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
  const requestedFirmId = firmId || firm_id ? String(firmId || firm_id) : undefined;
  const accessibleFirmIds = role === 'ADMIN' ? await getAccessibleFirmIds(authUser) || [] : [];
  if (role === 'ADMIN' && requestedFirmId && !accessibleFirmIds.includes(requestedFirmId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const scopedFirmIds = resolveReportFirmIds(role, authUser.firmId, accessibleFirmIds, requestedFirmId);

  if (role === 'FIRM' && !scopedFirmIds?.length) {
    return res.status(400).json({ error: 'Firm account is missing firmId' });
  }

  const data: any[] = scopedFirmIds === undefined
    ? await prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('month', "createdAt") as month, 
          type, 
          SUM("baseAmount") as total
        FROM "Transaction"
        GROUP BY month, type 
        ORDER BY month DESC;
      `
    : scopedFirmIds.length
      ? await prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('month', "createdAt") as month, 
          type, 
          SUM("baseAmount") as total
        FROM "Transaction"
        WHERE "firmId" IN (${Prisma.join(scopedFirmIds)})
        GROUP BY month, type 
        ORDER BY month DESC;
      `
      : [];

  const formatted: Record<string, any> = {};

  data.forEach((row) => {
    const m = new Date(row.month).toISOString().substring(0, 7); // "YYYY-MM"
    if (!formatted[m]) {
      formatted[m] = { month: m, allocations: 0, sales: 0, payments: 0 };
    }
    const val = Number(row.total || 0);
    if (isPayableDebtType(row.type)) formatted[m].allocations += val;
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
        ...activeFlightWhere(),
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
  try {
    const authUser = getAuthUser(req);
    const role = normalizeRole(authUser.role);

    const firmScopeId = role === 'FIRM'
      ? (authUser.firmId ? String(authUser.firmId) : undefined)
      : undefined;
    const adminFirmIds = role === 'ADMIN' ? await getAccessibleFirmIds(authUser) || [] : undefined;
    
    if (role === 'FIRM' && !firmScopeId) {
      return res.status(400).json({ error: 'Firm account is missing firmId' });
    }

    if (role === 'FIRM') {
      const [pendingGroups, dueGroups] = await Promise.all([
        prisma.ticket.groupBy({
          by: ['flightId'],
          where: { assignedFirmId: firmScopeId, status: 'PENDING', deletedAt: null, flight: activeFlightWhere() },
          _count: { _all: true },
        }),
        prisma.transaction.groupBy({
          by: ['type'],
          where: {
            firmId: firmScopeId,
            type: payableAndPaymentTypeFilter,
          },
          _sum: { baseAmount: true },
        }),
      ]);

      const pendingFlightIds = pendingGroups.map((g) => g.flightId).filter((id): id is string => !!id);
      const flightIds = Array.from(new Set([...pendingFlightIds]));

      const flights = flightIds.length
        ? await prisma.flight.findMany({
            where: { id: { in: flightIds } },
            select: { id: true, flightNumber: true, departure: true, arrival: true },
          })
        : [];
      const flightById = new Map(flights.map((f) => [f.id, f] as const));

      const pendingItems = pendingGroups
        .map((g) => {
          const f = flightById.get(g.flightId || '');
          return {
            flightId: g.flightId,
            flightNumber: f?.flightNumber || null,
            departure: f?.departure || null,
            count: g._count?._all || 0,
          };
        })
        .sort((a, b) => String(a.departure || '').localeCompare(String(b.departure || '')));

      let debt = 0;
      let paid = 0;
      for (const row of dueGroups) {
        const val = sumToNumber(row._sum?.baseAmount);
        if (isPayableDebtType(row.type)) debt += val;
        if (row.type === 'PAYMENT') paid += val;
      }

      const balance = paid - debt;
      const totalOutstanding = Math.max(-balance, 0);

      const pendingTotal = pendingItems.reduce((acc, i) => acc + (i.count || 0), 0);

      return res.json({
        role,
        todos: [
          { key: 'pending_allocations', label: 'Confirm pending allocations', count: pendingTotal },
          { key: 'due_payments', label: 'Make payments (outstanding balance)', count: totalOutstanding > 0 ? 1 : 0, amount: totalOutstanding },
        ],
        pendingAllocations: {
          total: pendingTotal,
          byFlight: pendingItems,
        },
        duePayments: {
          totalOutstanding,
          balance,
          debt,
          paid,
          byFlight: [],
        },
      });
    }

    // Admin / Superadmin Dashboard logic
    const [pendingGroups, dueGroups] = await Promise.all([
      prisma.ticket.groupBy({
        by: ['assignedFirmId', 'flightId'],
        where: { status: 'PENDING', assignedFirmId: adminFirmIds ? { in: adminFirmIds } : { not: null }, deletedAt: null, flight: activeFlightWhere() },
        _count: { _all: true },
      }),
      prisma.transaction.groupBy({
        by: ['firmId', 'type'],
        where: { type: payableAndPaymentTypeFilter, ...(adminFirmIds ? { firmId: { in: adminFirmIds } } : {}) },
        _sum: { baseAmount: true },
      }),
    ]);

    const firmIds = new Set<string>();
    const flightIds = new Set<string>();
    for (const g of pendingGroups) {
      if (g.assignedFirmId) firmIds.add(String(g.assignedFirmId));
      if (g.flightId) flightIds.add(String(g.flightId));
    }
    for (const g of dueGroups) {
      if (g.firmId) firmIds.add(String(g.firmId));
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
        const flightIdVal = g.flightId ? String(g.flightId) : '';
        const flight = flightIdVal ? flightById.get(flightIdVal) : undefined;
        return {
          firmId: firmIdVal,
          firmName: firm?.name || null,
          flightId: flightIdVal,
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
      const firmId = row.firmId || '';
      if (!firmId) continue;
      if (isPayableDebtType(row.type)) debtByFirm.set(firmId, (debtByFirm.get(firmId) || 0) + val);
      if (row.type === 'PAYMENT') paidByFirm.set(firmId, (paidByFirm.get(firmId) || 0) + val);
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
  } catch (error) {
    console.error('Error in getDashboardReport:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

async function sendFinancialAnalytics(req: Request, res: Response, pick?: keyof Awaited<ReturnType<typeof buildFinancialAnalyticsReport>>) {
  try {
    const report = await buildFinancialAnalyticsReport(getAuthUser(req), req.query);
    if (!pick) return res.json(report);
    return res.json({
      period: report.period,
      filters: report.filters,
      notes: report.notes,
      [pick]: report[pick],
      ...(pick === 'profitability' ? { monthly: report.monthly } : {}),
      ...(pick === 'cashFlow' ? { monthly: report.monthly } : {}),
      ...(pick === 'receivables' ? { rows: report.receivables.rows } : {}),
      ...(pick === 'payables' ? { rows: report.payables.rows } : {}),
    });
  } catch (error: any) {
    return sendApiError(res, mapKnownError(error, ERROR_CODES.REPORT_BUILD_FAILED));
  }
}

export const getFinancialAnalytics = async (req: Request, res: Response) => sendFinancialAnalytics(req, res);
export const getFinancialHealthReport = async (req: Request, res: Response) => sendFinancialAnalytics(req, res);
export const getProfitabilityAnalyticsReport = async (req: Request, res: Response) => sendFinancialAnalytics(req, res, 'profitability');
export const getCashFlowAnalyticsReport = async (req: Request, res: Response) => sendFinancialAnalytics(req, res, 'cashFlow');
export const getReceivablesAnalyticsReport = async (req: Request, res: Response) => sendFinancialAnalytics(req, res, 'receivables');
export const getPayablesAnalyticsReport = async (req: Request, res: Response) => sendFinancialAnalytics(req, res, 'payables');
export const getFlightProfitabilityReport = async (req: Request, res: Response) => sendFinancialAnalytics(req, res, 'flightProfitability');
