import { Request, Response } from 'express';
import { prisma } from '../db';
import { Prisma, TicketProductType } from '@prisma/client';
import { canAccessFirm, getAccessibleFirmIds } from '../utils/access';
import { assertActiveKassaDesk, assertKassaDeskForFirmSelection } from '../utils/kassa-desk-policy';
import { canManageFirmWork } from '../utils/firm-user-roles';
import { createFirmNotification } from '../utils/notifications';
import { resolveExchangeRateToUzs } from '../services/currency-rates.service';
import { canManageFlightInventory, normalizeCurrency, normalizeOptionalString, parseAllocationRows, parsePositiveDecimal, parsePositiveInt, parsePurchaserInfo, requiresAirlineConnectionForAllocation, requiresAllocationApproval, restoredTicketState, validateAllocationRejectionReason } from '../domains/tickets/ticket-input';
import { writeAuditLog } from '../utils/audit';
import { cancelLegSale, changeLegAllocation, countCancellableLegAllocationUnits, createTicketLegInventory, previewLegAllocationCancellation, summarizeLegAllocationUnits } from '../domains/tickets/ticket-leg-inventory';
import { buildAllocationFinancialDetails } from '../domains/tickets/inventory-summary';
import { visibleTransactionWhere } from '../utils/transaction-visibility';

function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

async function assertCanManageFirmFlightInventory(user: any, flightId: string, requestedSourceFirmId?: unknown) {
  const role = normalizeRole(user?.role);
  const firmId = role === 'FIRM'
    ? normalizeOptionalString(user?.firmId) || ''
    : normalizeOptionalString(requestedSourceFirmId) || '';
  if (!['FIRM', 'ADMIN', 'SUPERADMIN'].includes(role) || !firmId) throw new Error('sourceFirmId is required');
  if (role === 'FIRM' && !canManageFirmWork(user)) throw new Error('Only firm admins and managers can manage flight inventory');
  if (role === 'ADMIN' && !(await canAccessFirm(user, firmId))) throw new Error('Forbidden');

  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    select: {
      ownerFirmId: true,
      airline: { select: { firmId: true } },
      _count: {
        select: {
          tickets: { where: { assignedFirmId: firmId, deletedAt: null } },
        },
      },
    },
  });
  const isAirlineOwner = flight?.airline?.firmId === firmId;
  const isFlightOwner = flight?.ownerFirmId === firmId || (!flight?.ownerFirmId && isAirlineOwner);
  if (!flight || !canManageFlightInventory(firmId, flight.ownerFirmId, flight.airline?.firmId, flight._count.tickets)) throw new Error('Flight not found');
  return { firmId, isAirlineOwner, isFlightOwner };
}

function allocationTargetWhere(sourceFirmId: string, targetFirmId?: string): Prisma.FirmWhereInput {
  return {
    kind: { not: 'AIRLINE' },
    status: 'ACTIVE',
    deletedAt: null,
    AND: [
      { id: { not: sourceFirmId } },
      ...(targetFirmId ? [{ id: targetFirmId }] : []),
    ],
  };
}

export const listAllocationTargets = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const role = normalizeRole(user?.role);
  const sourceFirmId = role === 'FIRM'
    ? normalizeOptionalString(user?.firmId) || ''
    : normalizeOptionalString(req.query?.sourceFirmId) || '';
  if (!sourceFirmId) return res.status(400).json({ error: 'sourceFirmId is required' });
  if (role === 'FIRM' && !canManageFirmWork(user)) return res.status(403).json({ error: 'Forbidden' });
  if (role === 'ADMIN' && !(await canAccessFirm(user, sourceFirmId))) return res.status(403).json({ error: 'Forbidden' });

  const sourceFirm = await prisma.firm.findUnique({ where: { id: sourceFirmId }, select: { kind: true } });
  const firms = await prisma.firm.findMany({
    where: {
      ...allocationTargetWhere(sourceFirmId),
      ...(sourceFirm?.kind === 'AIRLINE'
        ? { firmAirlineConnections: { some: { airlineFirmId: sourceFirmId, status: 'ACTIVE' } } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      kind: true,
      _count: {
        select: {
          users: { where: { status: 'ACTIVE', deletedAt: null } },
          userAccesses: { where: { user: { status: 'ACTIVE', deletedAt: null } } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });
  return res.json(firms.map((firm) => ({
    id: firm.id,
    name: firm.name,
    kind: firm.kind,
    approvalRequired: requiresAllocationApproval(firm._count.users, firm._count.userAccesses),
  })));
};

async function resolveKassaDesk(user: any, rawKassaDeskId: unknown) {
  const kassaDeskId = typeof rawKassaDeskId === 'string' ? rawKassaDeskId.trim() : '';
  if (!kassaDeskId) return null;

  const desk = await prisma.kassaDesk.findUnique({
    where: { id: kassaDeskId },
    select: { id: true, firmId: true, name: true, status: true, deletedAt: true },
  });
  assertActiveKassaDesk(desk);

  const accessibleFirmIds = await getAccessibleFirmIds(user);
  if (accessibleFirmIds && !accessibleFirmIds.includes(desk.firmId)) {
    throw new Error('Forbidden');
  }

  return desk;
}

async function assertKassaDeskForFirm(kassaDesk: Awaited<ReturnType<typeof resolveKassaDesk>>, firmId: string) {
  const activeDeskCount = await prisma.kassaDesk.count({
    where: { firmId, status: 'ACTIVE', deletedAt: null },
  });
  try {
    assertKassaDeskForFirmSelection(kassaDesk, firmId, activeDeskCount);
  } catch (err: any) {
    if (err?.message === 'Kassa desk must belong to the selected firm') {
      throw new Error('Kassa desk must belong to the selling firm');
    }
    throw err;
  }
}

export const getTickets = async (req: Request, res: Response) => {
  const { flightId, flight_id } = req.query;
  const id = flightId || flight_id;
  const user = (req as any).user;
  const role = String(user?.role || '').toUpperCase();
  const ownFirmId = user?.firmId ? String(user.firmId) : '';
  if (role === 'FIRM' && !ownFirmId) {
    return res.status(400).json({ error: 'Firm account is missing firmId' });
  }

  const accessibleFirmIds = role === 'ADMIN' ? await getAccessibleFirmIds(user) : undefined;
  const firmIds = role === 'FIRM' ? [ownFirmId] : role === 'ADMIN' ? accessibleFirmIds || [] : undefined;
  const where: Prisma.TicketWhereInput = {
    ...(id ? { flightId: String(id) } : {}),
    deletedAt: null,
    status: { not: 'DELETED' },
    ...(firmIds ? {
      OR: [
        { originalOwnerFirmId: { in: firmIds } },
        { legs: { some: { currentOwnerFirmId: { in: firmIds } } } },
        { assignedFirmId: { in: firmIds } },
        { allocationSourceFirmId: { in: firmIds }, status: 'PENDING' },
        { flight: { ownerFirmId: { in: firmIds } } },
        { flight: { ownerFirmId: null, airline: { firmId: { in: firmIds } } } },
      ],
    } : {}),
  };
  const tickets = await prisma.ticket.findMany({
    where,
    include: {
      assignedFirm: { select: { id: true, name: true } },
      allocationSourceFirm: { select: { id: true, name: true, kind: true } },
      flight: { select: { ownerFirmId: true, airline: { select: { firmId: true } } } },
      legs: {
        include: {
          currentOwnerFirm: { select: { id: true, name: true } },
          saleItems: { where: { status: 'CONFIRMED', sale: { status: 'CONFIRMED' } }, select: { saleId: true, salePriceSnapshot: true, saleCurrencySnapshot: true } },
        },
        orderBy: { direction: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(tickets.map((ticket) => {
    const ownsOrigin = !firmIds || firmIds.includes(String(ticket.originalOwnerFirmId || ticket.flight.ownerFirmId || ticket.flight.airline?.firmId || ''));
    const visibleLegs = !firmIds || ownsOrigin
      ? ticket.legs
      : ticket.legs.filter((leg) => firmIds.includes(String(leg.currentOwnerFirmId || '')));
    const sellableLegs = visibleLegs.filter((leg) => ['AVAILABLE', 'ASSIGNED'].includes(String(leg.status)));
    const visibleOwners = Array.from(new Set(visibleLegs.map((leg) => leg.currentOwnerFirmId).filter(Boolean)));
    const visibleCost = visibleLegs.reduce((sum, leg) => sum + Number(leg.acquisitionCostSnapshot), 0);
    const allSold = visibleLegs.length > 0 && visibleLegs.every((leg) => leg.status === 'SOLD');
    return {
      id: ticket.id,
      flightId: ticket.flightId,
      status: allSold ? 'SOLD' : visibleLegs.some((leg) => leg.status === 'PENDING_ALLOCATION') ? 'PENDING' : visibleLegs.some((leg) => leg.status === 'RESERVED_FOR_TOUR') ? 'RESERVED_FOR_TOUR' : 'ASSIGNED',
      ticketType: ticket.ticketType,
      assignedFirmId: visibleOwners.length === 1 ? visibleOwners[0] : null,
      assignedFirm: visibleOwners.length === 1 ? visibleLegs.find((leg) => leg.currentOwnerFirmId === visibleOwners[0])?.currentOwnerFirm || null : null,
      allocationSourceFirmId: ticket.allocationSourceFirmId,
      allocationSourceFirm: ticket.allocationSourceFirm,
      currency: visibleLegs[0]?.currencySnapshot || ticket.currency,
      price: visibleCost,
      basePrice: visibleCost,
      ...(ownsOrigin ? { originPrice: Number(ticket.originPrice), originalOwnerFirmId: ticket.originalOwnerFirmId } : {}),
      soldPrice: allSold ? visibleLegs.flatMap((leg) => leg.saleItems).reduce((sum, item) => sum + Number(item.salePriceSnapshot), 0) : null,
      soldCurrency: allSold ? visibleLegs.flatMap((leg) => leg.saleItems)[0]?.saleCurrencySnapshot || null : null,
      purchaserInfo: ownsOrigin || allSold ? ticket.purchaserInfo : undefined,
      legs: visibleLegs.map((leg) => ({
        id: leg.id, direction: leg.direction, status: leg.status, origin: leg.origin, destination: leg.destination,
        departureAt: leg.departureAt, arrivalAt: leg.arrivalAt, currentOwnerFirmId: leg.currentOwnerFirmId,
        currentOwnerFirm: leg.currentOwnerFirm, acquisitionCostSnapshot: Number(leg.acquisitionCostSnapshot),
        allocationPriceSnapshot: leg.allocationPriceSnapshot == null ? null : Number(leg.allocationPriceSnapshot),
        currencySnapshot: leg.currencySnapshot,
        saleId: leg.saleItems[0]?.saleId || null,
      })),
      availableRoundTrip: ticket.ticketType === 'ROUND_TRIP'
        && ['OUTBOUND', 'RETURN'].every((direction) => sellableLegs.some((leg) => leg.direction === direction)),
      availableOutbound: sellableLegs.some((leg) => leg.direction === 'OUTBOUND'),
      availableReturn: sellableLegs.some((leg) => leg.direction === 'RETURN'),
      canAllocate: sellableLegs.length > 0,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  }));
};

export const listTicketAllocations = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const role = normalizeRole(user?.role);
  const firmId = normalizeOptionalString(user?.firmId);
  const accessibleFirmIds = role === 'ADMIN' ? await getAccessibleFirmIds(user) : undefined;
  const scopedFirmIds = role === 'FIRM' ? (firmId ? [firmId] : []) : role === 'ADMIN' ? accessibleFirmIds || [] : undefined;
  if (role === 'FIRM' && !firmId) return res.status(400).json({ error: 'Firm account is missing firmId' });

  const flightId = normalizeOptionalString(req.query?.flightId ?? req.query?.flight_id);
  const includeFinance = String(req.query?.includeFinance || '').toLowerCase() === 'true';
  const includeHistory = String(req.query?.includeHistory || '').toLowerCase() === 'true';
  const allocations = await prisma.ticketAllocation.findMany({
    where: {
      ...(flightId ? { flightId } : {}),
      ...(!includeHistory ? { status: { not: 'CANCELLED' } } : {}),
      ...(scopedFirmIds ? { OR: [{ fromFirmId: { in: scopedFirmIds } }, { toFirmId: { in: scopedFirmIds } }] } : {}),
    },
    include: {
      flight: { select: { id: true, flightNumber: true, route: true, departure: true, arrival: true, ownerFirmId: true, status: true } },
      fromFirm: { select: { id: true, name: true } },
      toFirm: { select: { id: true, name: true } },
      priceRows: { orderBy: { position: 'asc' } },
      tickets: { where: { deletedAt: null }, select: { status: true } },
      legItems: {
        include: { ticketLeg: { include: { saleItems: { where: { status: 'CONFIRMED', sale: { status: 'CONFIRMED' } }, select: { id: true } } } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const allocationIds = allocations.map((allocation) => allocation.id);
  const transactions = includeFinance && (allocationIds.length || flightId)
    ? await prisma.transaction.findMany({
        where: visibleTransactionWhere({
          type: 'PAYMENT',
          OR: [
            ...(allocationIds.length ? [{ subjectType: 'TICKET_ALLOCATION', subjectId: { in: allocationIds } } as Prisma.TransactionWhereInput] : []),
            ...(flightId ? [{ flightId, subjectType: { not: 'TICKET_ALLOCATION' } } as Prisma.TransactionWhereInput] : []),
          ],
        }),
        select: { id: true, type: true, firmId: true, payerFirmId: true, receiverFirmId: true, subjectType: true, subjectId: true, originalAmount: true, currency: true, sourceMode: true, status: true, reversedTransactionId: true, deletedAt: true, metadata: true },
      })
    : [];
  const allocationFinance = includeFinance ? buildAllocationFinancialDetails(allocations as any, transactions) : null;
  const rows = allocations.map((allocation) => {
    const actorFirmIds = scopedFirmIds || [];
    const canManage = role !== 'FIRM' || canManageFirmWork(user);
    const mayReceive = role === 'SUPERADMIN' || (canManage && actorFirmIds.includes(allocation.toFirmId));
    const maySend = role === 'SUPERADMIN' || (canManage && actorFirmIds.includes(allocation.fromFirmId));
    const unitSummary = allocation.legItems.length ? summarizeLegAllocationUnits(allocation as any) : null;
    const allocatedQuantity = allocation.parentTicketCount || allocation.priceRows.reduce((sum, row) => sum + row.quantity, 0) || allocation.tickets.length;
    const cancellableQuantity = unitSummary
      ? unitSummary.cancellableQuantity
      : allocation.tickets.filter((ticket) => ticket.status === (allocation.status === 'PENDING' ? 'PENDING' : 'ASSIGNED')).length;
    const finance = allocationFinance?.details.find((row) => row.id === allocation.id);
    const activeLegItems = allocation.legItems.filter((item) => item.status === 'ACTIVE');
    return {
      id: allocation.id,
      flight: allocation.flight,
      fromFirm: allocation.fromFirm,
      toFirm: allocation.toFirm,
      allocatedQuantity,
      parentTicketCount: allocation.parentTicketCount,
      segmentCount: allocation.segmentCount || allocation.legItems.length,
      productType: allocation.productType,
      direction: allocation.direction,
      priceRows: allocation.priceRows.map((row) => ({ quantity: row.quantity, unitPrice: Number(row.unitPrice), totalAmount: Number(row.totalAmount), currency: row.currency, productType: row.productType, direction: row.direction })),
      totalAmount: Number(allocation.totalAmount),
      currency: allocation.currency,
      status: allocation.status,
      note: allocation.note,
      acceptedAt: allocation.acceptedAt,
      rejectionReason: allocation.rejectionReason,
      rejectedAt: allocation.rejectedAt,
      createdAt: allocation.createdAt,
      legs: activeLegItems.map((item) => ({
        id: item.ticketLeg.id, ticketId: item.ticketLeg.ticketId, direction: item.ticketLeg.direction,
        status: item.ticketLeg.status, currentOwnerFirmId: item.ticketLeg.currentOwnerFirmId,
        origin: item.ticketLeg.origin, destination: item.ticketLeg.destination,
        acquisitionCostSnapshot: Number(item.acquisitionCostSnapshot),
        allocationPriceSnapshot: Number(item.allocationPriceSnapshot),
        acquisitionCurrency: item.acquisitionCurrencySnapshot,
        allocationCurrency: item.allocationCurrencySnapshot,
      })),
      originalQuantity: unitSummary?.originalQuantity || allocatedQuantity,
      activeQuantity: unitSummary?.activeQuantity ?? allocatedQuantity,
      cancelledQuantity: unitSummary?.cancelledQuantity || 0,
      acceptedQuantity: allocation.status === 'ACCEPTED' ? allocatedQuantity : 0,
      availableQuantity: allocatedQuantity,
      soldQuantity: unitSummary?.soldQuantity || 0,
      reservedForTourQuantity: unitSummary?.reservedForTourQuantity || 0,
      cancellableQuantity,
      paidAmounts: finance?.paidAmounts || [],
      outstandingDebt: finance?.outstandingDebt || [],
      overpayment: finance?.overpayment || [],
      paidAmount: finance?.paidAmounts.find((row) => row.currency === allocation.currency)?.total || 0,
      outstandingDebtAmount: finance?.outstandingDebt.find((row) => row.currency === allocation.currency)?.total || 0,
      overpaymentAmount: finance?.overpayment.find((row) => row.currency === allocation.currency)?.total || 0,
      cancellationStatus: allocation.status === 'CANCELLED'
        ? 'FULLY_CANCELLED'
        : (unitSummary?.cancelledQuantity || 0) > 0 ? 'PARTIALLY_CANCELLED' : null,
      version: allocation.version,
      canConfirm: allocation.status === 'PENDING' && mayReceive,
      canReject: allocation.status === 'PENDING' && mayReceive,
      canEdit: ['PENDING', 'ACCEPTED'].includes(allocation.status) && maySend,
      canCancel: ['PENDING', 'ACCEPTED'].includes(allocation.status) && maySend,
      canFullyCancel: ['PENDING', 'ACCEPTED'].includes(allocation.status) && maySend && cancellableQuantity > 0 && cancellableQuantity === allocatedQuantity,
      canDelete: ['PENDING', 'ACCEPTED'].includes(allocation.status) && maySend && cancellableQuantity > 0 && cancellableQuantity === allocatedQuantity,
    };
  });
  return res.json(includeFinance ? { data: rows, unallocatedPayments: allocationFinance?.unallocatedPayments || [] } : rows);
};

type ChangePriceRow = { quantity: number; unitPrice: Prisma.Decimal; position: number };

function changeReason(value: unknown, label = 'O‘zgartirish sababini yozing.'): string {
  const reason = normalizeOptionalString(value);
  if (!reason || reason.length < 5) throw new Error(label);
  if (reason.length > 500) throw new Error('Sabab 500 belgidan oshmasligi kerak.');
  return reason;
}

function allocationRows(value: unknown): ChangePriceRow[] {
  return parseAllocationRows(value).map((row, position) => ({ quantity: row.quantity, unitPrice: row.price, position }));
}

function rowQuantity(rows: Array<{ quantity: number }>): number {
  return rows.reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row.quantity || 0))), 0);
}

function rowTotal(rows: ChangePriceRow[]): Prisma.Decimal {
  return rows.reduce((sum, row) => sum.add(row.unitPrice.mul(row.quantity)), new Prisma.Decimal(0)).toDecimalPlaces(4);
}

function resizePriceRows(rows: ChangePriceRow[], targetQuantity: number): ChangePriceRow[] {
  const next: ChangePriceRow[] = [];
  let remaining = targetQuantity;
  for (const row of rows) {
    if (remaining <= 0) break;
    const quantity = Math.min(row.quantity, remaining);
    if (quantity > 0) next.push({ quantity, unitPrice: row.unitPrice, position: next.length });
    remaining -= quantity;
  }
  if (remaining > 0) {
    const unitPrice = rows.at(-1)?.unitPrice;
    if (!unitPrice) throw new Error('Ajratma narxi topilmadi.');
    next.push({ quantity: remaining, unitPrice, position: next.length });
  }
  return next;
}

function subtractTicketPrices(rows: ChangePriceRow[], tickets: Array<{ basePrice: Prisma.Decimal }>): ChangePriceRow[] {
  const counts = new Map<string, number>();
  for (const ticket of tickets) {
    const key = new Prisma.Decimal(ticket.basePrice).toDecimalPlaces(4).toString();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const next: ChangePriceRow[] = [];
  for (const row of rows) {
    const key = row.unitPrice.toDecimalPlaces(4).toString();
    const remove = Math.min(row.quantity, counts.get(key) || 0);
    counts.set(key, (counts.get(key) || 0) - remove);
    if (row.quantity > remove) next.push({ quantity: row.quantity - remove, unitPrice: row.unitPrice, position: next.length });
  }
  const unmatched = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  return unmatched ? resizePriceRows(rows, Math.max(0, rowQuantity(rows) - tickets.length)) : next;
}

function priceRowsJson(rows: ChangePriceRow[]) {
  return rows.map((row) => ({ quantity: row.quantity, price: row.unitPrice.toString() }));
}

function allocationSnapshot(allocation: any) {
  const rows = allocation.priceRows.map((row: any, position: number) => ({
    quantity: Number(row.quantity),
    price: new Prisma.Decimal(row.unitPrice).toDecimalPlaces(4).toString(),
    position,
  }));
  return {
    quantity: rowQuantity(rows),
    priceRows: rows,
    totalAmount: new Prisma.Decimal(allocation.totalAmount).toDecimalPlaces(4).toString(),
    currency: allocation.currency,
    note: allocation.note,
    status: allocation.status,
    version: allocation.version,
  };
}

async function confirmedAllocationPaymentTotal(tx: Prisma.TransactionClient, allocationId: string, currency: string) {
  const payments = await tx.transaction.findMany({
    where: {
      type: 'PAYMENT', status: 'CONFIRMED', deletedAt: null, currency,
      OR: [
        { subjectType: 'TICKET_ALLOCATION', subjectId: allocationId },
        { metadata: { path: ['allocationId'], equals: allocationId } },
      ],
    },
    select: { id: true, originalAmount: true, reversedTransactionId: true },
  });
  const reversed = payments.length
    ? new Set((await tx.transaction.findMany({ where: { reversedTransactionId: { in: payments.map((row) => row.id) } }, select: { reversedTransactionId: true } })).map((row) => row.reversedTransactionId).filter(Boolean))
    : new Set<string>();
  return payments
    .filter((row) => !row.reversedTransactionId && !reversed.has(row.id))
    .reduce((sum, row) => sum.add(row.originalAmount), new Prisma.Decimal(0))
    .toDecimalPlaces(4);
}

async function recordAppliedAllocationCancellation(
  req: Request,
  tx: Prisma.TransactionClient,
  allocation: any,
  request: any,
  updated: any,
) {
  if (request.type !== 'CANCEL') return;
  const oldTotal = new Prisma.Decimal(allocation.totalAmount);
  const newTotal = new Prisma.Decimal(updated.totalAmount);
  const cancelledValue = Prisma.Decimal.max(oldTotal.sub(newTotal), 0).toDecimalPlaces(4);
  const paid = await confirmedAllocationPaymentTotal(tx, allocation.id, allocation.currency);
  const oldDebt = allocation.status === 'ACCEPTED' ? Prisma.Decimal.max(oldTotal.sub(paid), 0) : new Prisma.Decimal(0);
  const newDebt = allocation.status === 'ACCEPTED' ? Prisma.Decimal.max(newTotal.sub(paid), 0) : new Prisma.Decimal(0);
  const overpayment = Prisma.Decimal.max(paid.sub(newTotal), 0).toDecimalPlaces(4);
  const quantity = Number(request.proposedValuesJson?.cancelQuantity || 0);
  const financials = {
    ...request.proposedValuesJson,
    oldAllocationTotal: oldTotal.toFixed(4), cancelledValue: cancelledValue.toFixed(4), newAllocationTotal: newTotal.toFixed(4),
    confirmedPaidAmount: paid.toFixed(4), oldOutstandingDebt: oldDebt.toFixed(4), newOutstandingDebt: newDebt.toFixed(4), overpayment: overpayment.toFixed(4),
  };
  await tx.allocationChangeRequest.update({ where: { id: request.id }, data: { proposedValuesJson: financials } });

  if (allocation.status === 'ACCEPTED' && cancelledValue.gt(0)) {
    const exchangeRate = await resolveExchangeRateToUzs((req as any).user || {}, { currency: allocation.currency, rateFirmId: allocation.fromFirmId });
    await tx.transaction.create({
      data: {
        firmId: allocation.fromFirmId, flightId: allocation.flightId, payerFirmId: allocation.toFirmId, receiverFirmId: allocation.fromFirmId,
        createdByUserId: normalizeOptionalString((req as any).user?.userId), type: 'ADJUSTMENT', direction: 'ALLOCATION_DEBT_DECREASE',
        subjectType: 'TICKET_ALLOCATION_ADJUSTMENT', subjectId: allocation.id, sourceMode: 'AUTO_ALLOCATION_CANCEL', status: 'CONFIRMED',
        originalAmount: cancelledValue, currency: allocation.currency, exchangeRate, baseAmount: cancelledValue.mul(exchangeRate).toDecimalPlaces(4),
        idempotencyKey: `allocation-cancel:${request.id}`,
        metadata: { allocationId: allocation.id, changeRequestId: request.id, quantity, reason: request.reason, ...financials },
      },
    });
  }

  const full = String(updated.status).toUpperCase() === 'CANCELLED';
  const metadata = { allocationId: allocation.id, flightId: allocation.flightId, changeRequestId: request.id, quantity, currency: allocation.currency, reason: request.reason, ...financials };
  await writeAuditLog(req, { action: full ? 'ALLOCATION_FULLY_CANCELLED' : 'ALLOCATION_PARTIALLY_CANCELLED', entityType: 'ticketAllocation', entityId: allocation.id, entityLabel: allocation.flight?.flightNumber, summary: `${quantity} ta bilet ajratmasi ${full ? 'to‘liq' : 'qisman'} bekor qilindi`, before: allocationSnapshot(allocation), after: updated, metadata }, tx);
  await writeAuditLog(req, { action: 'TICKETS_RETURNED_TO_OWNER', entityType: 'ticketAllocation', entityId: allocation.id, entityLabel: allocation.flight?.flightNumber, summary: `${quantity} ta bilet yuboruvchi firmaga qaytarildi`, metadata }, tx);
  if (allocation.status === 'ACCEPTED') await writeAuditLog(req, { action: 'ALLOCATION_DEBT_ADJUSTED', entityType: 'ticketAllocation', entityId: allocation.id, entityLabel: allocation.flight?.flightNumber, summary: `Ajratma qarzi ${cancelledValue.toFixed(4)} ${allocation.currency} ga kamaytirildi`, before: { outstandingDebt: oldDebt.toFixed(4) }, after: { outstandingDebt: newDebt.toFixed(4), overpayment: overpayment.toFixed(4) }, metadata }, tx);
}

async function mayManageSendingFirm(user: any, fromFirmId: string): Promise<boolean> {
  const role = normalizeRole(user?.role);
  if (role === 'SUPERADMIN') return true;
  if (role === 'ADMIN') return canAccessFirm(user, fromFirmId);
  return role === 'FIRM' && normalizeOptionalString(user?.firmId) === fromFirmId && canManageFirmWork(user);
}

async function mayManageReceivingFirm(user: any, receivingFirmId: string): Promise<boolean> {
  const role = normalizeRole(user?.role);
  if (role === 'SUPERADMIN') return true;
  if (role === 'ADMIN') return canAccessFirm(user, receivingFirmId);
  return role === 'FIRM' && normalizeOptionalString(user?.firmId) === receivingFirmId && canManageFirmWork(user);
}

async function applyAllocationChange(
  tx: Prisma.TransactionClient,
  input: { allocation: any; request: any; actorUserId?: string },
) {
  const { allocation, request, actorUserId } = input;
  if (allocation.version !== request.baseVersion) throw new Error('Ajratma ma’lumotlari boshqa operatsiya orqali o‘zgargan. Sahifani yangilang.');
  if (!['PENDING', 'ACCEPTED'].includes(allocation.status)) throw new Error('Ushbu ajratmani endi o‘zgartirib bo‘lmaydi.');

  if (allocation.legItems?.length) {
    return changeLegAllocation(tx, {
      allocation,
      requestId: request.id,
      type: request.type,
      proposed: request.proposedValuesJson,
      actorUserId,
    });
  }

  const currentRows: ChangePriceRow[] = allocation.priceRows.map((row: any, position: number) => ({
    quantity: Number(row.quantity), unitPrice: new Prisma.Decimal(row.unitPrice), position,
  }));
  const currentQuantity = rowQuantity(currentRows);
  const freeStatus = allocation.status === 'PENDING' ? 'PENDING' : 'ASSIGNED';
  const freeTickets = allocation.tickets
    .filter((ticket: any) => ticket.status === freeStatus && !ticket.tourPackageId && ticket.soldPrice == null)
    .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
  const proposed = request.proposedValuesJson as any;
  let nextRows = currentRows;
  let nextNote = allocation.note;
  let nextCurrency = allocation.currency;
  let removedTickets: any[] = [];
  let addedTickets: any[] = [];

  if (request.type === 'CANCEL') {
    const cancelQuantity = parsePositiveInt(proposed.cancelQuantity);
    if (!cancelQuantity || cancelQuantity > freeTickets.length) {
      throw new Error(`Ushbu ajratmadan faqat ${freeTickets.length} ta chipta bekor qilinishi mumkin. Qolgan chiptalar sotilgan yoki boshqa operatsiyalarda band qilingan.`);
    }
    removedTickets = freeTickets.slice(0, cancelQuantity);
    nextRows = subtractTicketPrices(currentRows, removedTickets);
  } else {
    nextRows = allocationRows(proposed.priceRows);
    const nextQuantity = rowQuantity(nextRows);
    if (!nextQuantity) throw new Error('Yangi chipta miqdori musbat bo‘lishi kerak.');
    if (allocation.tickets.length !== currentQuantity) throw new Error('Boshqa operatsiyada ishlatilgan ajratmani faqat qisman bekor qilish mumkin.');
    if (allocation.status === 'ACCEPTED' && normalizeCurrency(proposed.currency) !== normalizeCurrency(allocation.currency)) {
      throw new Error('Tasdiqlangan ajratma valyutasini o‘zgartirib bo‘lmaydi.');
    }
    nextCurrency = normalizeCurrency(proposed.currency || allocation.currency);
    nextNote = normalizeOptionalString(proposed.note) || null;
    if (nextQuantity < currentQuantity) {
      const removeCount = currentQuantity - nextQuantity;
      if (removeCount > freeTickets.length) throw new Error(`Faqat ${freeTickets.length} ta erkin chipta kamaytirilishi mumkin.`);
      removedTickets = freeTickets.slice(0, removeCount);
    } else if (nextQuantity > currentQuantity) {
      const addCount = nextQuantity - currentQuantity;
      addedTickets = await tx.$queryRaw<any[]>`
        SELECT *, "allocatedFirmId" AS "assignedFirmId", price AS "basePrice"
        FROM "Ticket"
        WHERE "flightId" = ${allocation.flightId}
          AND "allocatedFirmId" = ${allocation.fromFirmId}
          AND status = 'ASSIGNED' AND "tourPackageId" IS NULL AND "deletedAt" IS NULL
        ORDER BY "createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT ${addCount}
      `;
      if (addedTickets.length !== addCount) throw new Error(`Qo‘shimcha ${addCount} ta chipta uchun yuboruvchi firma zaxirasi yetarli emas.`);
    }
  }

  for (const ticket of removedTickets) {
    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status: 'ASSIGNED', assignedFirmId: allocation.fromFirmId, allocationSourceFirmId: null,
        basePrice: ticket.allocationSourcePrice || ticket.basePrice, allocationSourcePrice: null, allocationId: null,
      },
    });
  }

  if (request.type === 'EDIT') {
    const retained = allocation.tickets
      .filter((ticket: any) => !removedTickets.some((removed) => removed.id === ticket.id))
      .sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime());
    const targetPrices = nextRows.flatMap((row) => Array.from({ length: row.quantity }, () => row.unitPrice));
    const finalTickets = [...retained, ...addedTickets];
    for (let index = 0; index < finalTickets.length; index += 1) {
      const ticket = finalTickets[index];
      const targetPrice = targetPrices[index];
      if (!targetPrice) throw new Error('Ajratma narx qatorlari chipta soniga mos emas.');
      const isAdded = addedTickets.some((added) => String(added.id) === String(ticket.id));
      await tx.ticket.update({
        where: { id: String(ticket.id) },
        data: {
          status: allocation.status === 'PENDING' ? 'PENDING' : (isAdded ? 'ASSIGNED' : ticket.status),
          assignedFirmId: allocation.toFirmId,
          allocationSourceFirmId: allocation.fromFirmId,
          ...(isAdded ? { allocationSourcePrice: new Prisma.Decimal(ticket.basePrice) } : {}),
          allocationId: allocation.id,
          basePrice: targetPrice,
          currency: nextCurrency,
        },
      });
    }
  }

  await tx.ticketAllocationPriceRow.deleteMany({ where: { allocationId: allocation.id } });
  if (nextRows.length) await tx.ticketAllocationPriceRow.createMany({
    data: nextRows.map((row, position) => ({ allocationId: allocation.id, quantity: row.quantity, unitPrice: row.unitPrice, position })),
  });
  const updatedStatus = nextRows.length ? allocation.status : 'CANCELLED';
  return tx.ticketAllocation.update({
    where: { id: allocation.id },
    data: {
      status: updatedStatus,
      totalAmount: rowTotal(nextRows),
      currency: nextCurrency,
      note: nextNote,
      version: { increment: 1 },
      ...(updatedStatus === 'CANCELLED' ? { cancelledAt: new Date(), cancelledByUserId: actorUserId || null } : {}),
    },
  });
}

export const createAllocationChangeRequest = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const allocationId = String(req.params.id || '').trim();
  const type = String(req.body?.type || '').trim().toUpperCase();
  if (!['EDIT', 'CANCEL'].includes(type)) return res.status(400).json({ error: 'type EDIT yoki CANCEL bo‘lishi kerak.' });
  try {
    const reason = changeReason(req.body?.reason, type === 'CANCEL' ? 'Bekor qilish sababini yozing.' : 'Tahrirlash sababini yozing.');
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TicketAllocation" WHERE id = ${allocationId} FOR UPDATE`;
      const allocation = await tx.ticketAllocation.findUnique({
        where: { id: allocationId },
        include: {
          fromFirm: { select: { id: true, name: true, kind: true } },
          toFirm: {
            select: { id: true, name: true, _count: { select: { users: { where: { status: 'ACTIVE', deletedAt: null } }, userAccesses: { where: { user: { status: 'ACTIVE', deletedAt: null } } } } } },
          },
          flight: { select: { id: true, flightNumber: true, route: true } },
          priceRows: { orderBy: { position: 'asc' } },
          tickets: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
          legItems: {
            where: { status: 'ACTIVE' },
            include: { ticketLeg: { include: { saleItems: { where: { status: 'CONFIRMED', sale: { status: 'CONFIRMED' } }, select: { id: true } } } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!allocation) throw new Error('Ajratma topilmadi.');
      if (!(await mayManageSendingFirm(user, allocation.fromFirmId))) throw new Error('Ushbu ajratmani o‘zgartirish huquqiga ega emassiz.');
      if (!['PENDING', 'ACCEPTED'].includes(allocation.status)) throw new Error('Ushbu ajratmani endi o‘zgartirib bo‘lmaydi.');
      if (await tx.allocationChangeRequest.count({ where: { allocationId, status: 'PENDING_APPROVAL' } })) throw new Error('Ushbu ajratma bo‘yicha faol o‘zgartirish so‘rovi mavjud.');

      const oldValues = allocationSnapshot(allocation);
      let proposedValues: any;
      if (type === 'EDIT') {
        const requestedRows = allocationRows(req.body?.allocationRows ?? req.body?.priceRows);
        const quantity = parsePositiveInt(req.body?.quantity) || (requestedRows.length ? rowQuantity(requestedRows) : oldValues.quantity);
        const rows = requestedRows.length ? requestedRows : resizePriceRows(allocation.priceRows.map((row, position) => ({ quantity: row.quantity, unitPrice: new Prisma.Decimal(row.unitPrice), position })), quantity);
        if (rowQuantity(rows) !== quantity) throw new Error('Narx qatorlari jami chipta miqdoriga mos emas.');
        if (allocation.legItems.length && quantity !== oldValues.quantity) {
          throw new Error('Miqdorni kamaytirish uchun “Bekor qilish”, oshirish uchun yangi ajratma yarating. Tahrirlashda narx va izoh o‘zgartiriladi.');
        }
        proposedValues = { quantity, priceRows: priceRowsJson(rows), currency: normalizeCurrency(req.body?.currency || allocation.currency), note: normalizeOptionalString(req.body?.note) || null };
      } else {
        const freeStatus = allocation.status === 'PENDING' ? 'PENDING' : 'ASSIGNED';
        const cancellableQuantity = allocation.legItems.length
          ? countCancellableLegAllocationUnits(allocation as any)
          : allocation.tickets.filter((ticket) => ticket.status === freeStatus && !ticket.tourPackageId && ticket.soldPrice == null).length;
        const cancelQuantity = parsePositiveInt(req.body?.quantity ?? req.body?.cancelQuantity) || cancellableQuantity;
        if (!cancelQuantity || cancelQuantity > cancellableQuantity) throw new Error(`Ushbu ajratmadan faqat ${cancellableQuantity} ta chipta bekor qilinishi mumkin.`);
        const oldTotal = new Prisma.Decimal(allocation.totalAmount);
        const cancelledValue = allocation.legItems.length
          ? previewLegAllocationCancellation(allocation as any, cancelQuantity).cancelledValue
          : oldTotal.sub(rowTotal(resizePriceRows(allocation.priceRows.map((row, position) => ({ quantity: row.quantity, unitPrice: new Prisma.Decimal(row.unitPrice), position })), Math.max(oldValues.quantity - cancelQuantity, 0))));
        const newTotal = Prisma.Decimal.max(oldTotal.sub(cancelledValue), 0).toDecimalPlaces(4);
        const paid = await confirmedAllocationPaymentTotal(tx, allocation.id, allocation.currency);
        proposedValues = {
          cancelQuantity,
          oldAllocationTotal: oldTotal.toFixed(4), cancelledValue: cancelledValue.toFixed(4), newAllocationTotal: newTotal.toFixed(4),
          confirmedPaidAmount: paid.toFixed(4),
          oldOutstandingDebt: allocation.status === 'ACCEPTED' ? Prisma.Decimal.max(oldTotal.sub(paid), 0).toFixed(4) : '0.0000',
          newOutstandingDebt: allocation.status === 'ACCEPTED' ? Prisma.Decimal.max(newTotal.sub(paid), 0).toFixed(4) : '0.0000',
          overpayment: Prisma.Decimal.max(paid.sub(newTotal), 0).toFixed(4),
        };
      }

      const requiresApproval = allocation.status === 'ACCEPTED'
        && normalizeRole(user?.role) !== 'SUPERADMIN'
        && requiresAllocationApproval(allocation.toFirm._count.users, allocation.toFirm._count.userAccesses);
      const request = await tx.allocationChangeRequest.create({
        data: {
          allocationId, requestedByFirmId: allocation.fromFirmId, requestedByUserId: normalizeOptionalString(user?.userId), receivingFirmId: allocation.toFirmId,
          type, oldValuesJson: oldValues, proposedValuesJson: proposedValues, reason,
          status: requiresApproval ? 'PENDING_APPROVAL' : 'APPROVED', requiresCounterpartyApproval: requiresApproval,
          autoApproved: !requiresApproval, baseVersion: allocation.version,
          ...(!requiresApproval ? { approvedAt: new Date(), appliedAt: new Date() } : {}),
        },
      });
      let updatedAllocation = null;
      if (!requiresApproval) {
        updatedAllocation = await applyAllocationChange(tx, { allocation, request, actorUserId: normalizeOptionalString(user?.userId) });
        await recordAppliedAllocationCancellation(req, tx, allocation, request, updatedAllocation);
      }
      await createFirmNotification(tx, allocation.toFirmId, {
        title: requiresApproval ? 'Ajratma bo‘yicha o‘zgarish so‘rovi' : 'Ajratma avtomatik yangilandi',
        body: `${allocation.fromFirm.name} ${allocation.flight.flightNumber || 'reys'} ajratmasi bo‘yicha ${type === 'EDIT' ? 'tahrir' : 'bekor qilish'} so‘rovini yaratdi.`,
        type: type === 'EDIT' ? 'ALLOCATION_EDIT_REQUESTED' : 'ALLOCATION_CANCEL_REQUESTED', entityType: 'allocationChangeRequest', entityId: request.id,
        metadata: { allocationId, changeRequestId: request.id, type, reason },
      });
      await writeAuditLog(req, {
        action: type === 'EDIT' ? 'ALLOCATION_EDIT_REQUESTED' : 'ALLOCATION_CANCEL_REQUESTED', entityType: 'allocationChangeRequest', entityId: request.id,
        entityLabel: allocation.flight.flightNumber, summary: `${allocation.fromFirm.name}: ajratma ${type === 'EDIT' ? 'tahriri' : 'bekor qilinishi'} so‘raldi`,
        before: oldValues, after: proposedValues, metadata: { allocationId, reason, autoApproved: !requiresApproval },
      }, tx);
      if (!requiresApproval && type === 'CANCEL') await writeAuditLog(req, {
        action: 'ALLOCATION_CANCEL_APPROVED', entityType: 'allocationChangeRequest', entityId: request.id,
        entityLabel: `${allocation.flight.flightNumber} · ${allocation.flight.route}`, summary: 'Ajratmani bekor qilish so‘rovi avtomatik tasdiqlandi',
        before: { status: 'PENDING_APPROVAL' }, after: { status: 'APPROVED', autoApproved: true }, metadata: { allocationId, reason },
      }, tx);
      return { request, updatedAllocation };
    });
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Ajratma so‘rovini yaratib bo‘lmadi.' });
  }
};

export const listAllocationChangeRequests = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const role = normalizeRole(user?.role);
  const firmId = normalizeOptionalString(user?.firmId);
  const accessibleFirmIds = role === 'ADMIN' ? await getAccessibleFirmIds(user) || [] : undefined;
  const flightId = normalizeOptionalString(req.query?.flightId ?? req.query?.flight_id);
  const rows = await prisma.allocationChangeRequest.findMany({
    where: {
      ...(flightId ? { allocation: { flightId } } : {}),
      ...(role === 'FIRM' ? { OR: [{ requestedByFirmId: firmId || '__missing__' }, { receivingFirmId: firmId || '__missing__' }] } : {}),
      ...(role === 'ADMIN' ? { OR: [{ requestedByFirmId: { in: accessibleFirmIds } }, { receivingFirmId: { in: accessibleFirmIds } }] } : {}),
    },
    include: { allocation: { include: { flight: { select: { id: true, flightNumber: true, route: true } }, fromFirm: { select: { id: true, name: true } }, toFirm: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  const canManage = role !== 'FIRM' || canManageFirmWork(user);
  return res.json(rows.map((row) => ({
    ...row,
    canApprove: canManage && row.status === 'PENDING_APPROVAL' && (role === 'SUPERADMIN' || (role === 'FIRM' ? row.receivingFirmId === firmId : accessibleFirmIds?.includes(row.receivingFirmId))),
    canReject: canManage && row.status === 'PENDING_APPROVAL' && (role === 'SUPERADMIN' || (role === 'FIRM' ? row.receivingFirmId === firmId : accessibleFirmIds?.includes(row.receivingFirmId))),
  })));
};

export const approveAllocationChangeRequest = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const requestId = String(req.params.id || '').trim();
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AllocationChangeRequest" WHERE id = ${requestId} FOR UPDATE`;
      const change = await tx.allocationChangeRequest.findUnique({ where: { id: requestId } });
      if (!change) throw new Error('O‘zgartirish so‘rovi topilmadi.');
      if (change.status !== 'PENDING_APPROVAL') throw new Error('Ushbu so‘rov allaqachon ko‘rib chiqilgan.');
      if (!(await mayManageReceivingFirm(user, change.receivingFirmId))) throw new Error('Ushbu so‘rovni tasdiqlash huquqiga ega emassiz.');
      await tx.$queryRaw`SELECT id FROM "TicketAllocation" WHERE id = ${change.allocationId} FOR UPDATE`;
      const allocation = await tx.ticketAllocation.findUnique({
        where: { id: change.allocationId },
        include: {
          fromFirm: { select: { id: true, name: true, kind: true } },
          toFirm: { select: { id: true, name: true } },
          flight: { select: { id: true, flightNumber: true, route: true } },
          priceRows: { orderBy: { position: 'asc' } },
          tickets: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
          legItems: {
            where: { status: 'ACTIVE' },
            include: { ticketLeg: { include: { saleItems: { where: { status: 'CONFIRMED', sale: { status: 'CONFIRMED' } }, select: { id: true } } } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!allocation) throw new Error('Ajratma topilmadi.');
      const actorUserId = normalizeOptionalString(user?.userId);
      const updated = await applyAllocationChange(tx, { allocation, request: change, actorUserId });
      await recordAppliedAllocationCancellation(req, tx, allocation, change, updated);
      const decided = await tx.allocationChangeRequest.update({ where: { id: requestId }, data: { status: 'APPROVED', approvedByUserId: actorUserId, approvedAt: new Date(), appliedAt: new Date() } });
      await createFirmNotification(tx, change.requestedByFirmId, { title: 'Ajratma o‘zgarishi tasdiqlandi', body: `${allocation.toFirm.name} ajratma bo‘yicha so‘rovni tasdiqladi.`, type: change.type === 'EDIT' ? 'ALLOCATION_EDIT_APPROVED' : 'ALLOCATION_CANCEL_APPROVED', entityType: 'allocationChangeRequest', entityId: requestId, metadata: { allocationId: allocation.id, changeRequestId: requestId } });
      await writeAuditLog(req, { action: change.type === 'EDIT' ? 'ALLOCATION_EDIT_APPROVED' : 'ALLOCATION_CANCEL_APPROVED', entityType: 'allocationChangeRequest', entityId: requestId, entityLabel: allocation.flight.flightNumber, summary: `${allocation.toFirm.name} ajratma o‘zgarishini tasdiqladi`, before: change.oldValuesJson, after: change.proposedValuesJson, metadata: { allocationId: allocation.id } }, tx);
      return { request: decided, allocation: updated };
    });
    return res.json(result);
  } catch (err: any) { return res.status(400).json({ error: err?.message || 'So‘rovni tasdiqlab bo‘lmadi.' }); }
};

export const rejectAllocationChangeRequest = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const requestId = String(req.params.id || '').trim();
  try {
    const rejectionReason = changeReason(req.body?.rejectionReason, 'Rad etish sababini yozing.');
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AllocationChangeRequest" WHERE id = ${requestId} FOR UPDATE`;
      const change = await tx.allocationChangeRequest.findUnique({ where: { id: requestId }, include: { allocation: { include: { flight: { select: { flightNumber: true, route: true } }, fromFirm: { select: { name: true } }, toFirm: { select: { name: true } } } } } });
      if (!change) throw new Error('O‘zgartirish so‘rovi topilmadi.');
      if (change.status !== 'PENDING_APPROVAL') throw new Error('Ushbu so‘rov allaqachon ko‘rib chiqilgan.');
      if (!(await mayManageReceivingFirm(user, change.receivingFirmId))) throw new Error('Ushbu so‘rovni rad etish huquqiga ega emassiz.');
      const rejected = await tx.allocationChangeRequest.update({ where: { id: requestId }, data: { status: 'REJECTED', rejectedByUserId: normalizeOptionalString(user?.userId), rejectionReason, rejectedAt: new Date() } });
      await createFirmNotification(tx, change.requestedByFirmId, { title: 'Ajratma o‘zgarishi rad etildi', body: `${change.allocation.toFirm.name} ${change.allocation.flight.flightNumber} · ${change.allocation.flight.route} reysi bo‘yicha biletlarni qaytarib olish so‘rovini rad etdi. Sababi: ${rejectionReason}`, type: change.type === 'EDIT' ? 'ALLOCATION_EDIT_REJECTED' : 'ALLOCATION_CANCEL_REJECTED', entityType: 'allocationChangeRequest', entityId: requestId, metadata: { allocationId: change.allocationId, changeRequestId: requestId, rejectionReason } });
      await writeAuditLog(req, { action: change.type === 'EDIT' ? 'ALLOCATION_EDIT_REJECTED' : 'ALLOCATION_CANCEL_REJECTED', entityType: 'allocationChangeRequest', entityId: requestId, entityLabel: change.allocation.flight.flightNumber, summary: `${change.allocation.toFirm.name} ajratma o‘zgarishini rad etdi`, before: change.oldValuesJson, after: { status: 'REJECTED', rejectionReason }, metadata: { allocationId: change.allocationId } }, tx);
      return rejected;
    });
    return res.json(result);
  } catch (err: any) { return res.status(400).json({ error: err?.message || 'So‘rovni rad etib bo‘lmadi.' }); }
};

export const createTickets = async (req: Request, res: Response) => {
  const { flightId, price, currency, quantity, outboundCost, returnCost } = req.body;
  if (!flightId || typeof flightId !== 'string' || !flightId.trim()) {
    return res.status(400).json({ error: 'flightId is required' });
  }
  const resolvedQuantity = parsePositiveInt(quantity);
  if (!resolvedQuantity) {
    return res.status(400).json({ error: 'quantity is required' });
  }
  const resolvedPrice = Number(price);
  const resolvedCurrency = normalizeCurrency(currency);
  if (!Number.isFinite(resolvedPrice) || resolvedPrice < 0) return res.status(400).json({ error: 'price must be zero or greater' });
  if (!/^[A-Z]{3}$/.test(resolvedCurrency)) return res.status(400).json({ error: 'currency must be a 3-letter code' });

  const flight = await prisma.flight.findUnique({
    where: { id: flightId.trim() },
    select: {
      id: true, status: true, tripType: true,
      outboundOrigin: true, outboundDestination: true, returnOrigin: true, returnDestination: true,
      departure: true, arrival: true, returnDeparture: true, returnArrival: true,
    },
  });
  if (!flight) {
    return res.status(404).json({ error: 'Flight not found' });
  }
  if (flight.status === 'CANCELLED') {
    return res.status(400).json({ error: 'Cannot create tickets for a cancelled flight' });
  }
  let ownerFirmId = '';
  try {
    const source = await assertCanManageFirmFlightInventory((req as any).user, flightId.trim());
    if (!source.isFlightOwner) throw new Error('Only the flight owner can add origin ticket stock');
    ownerFirmId = source.firmId;
  } catch (err: any) {
    const message = err?.message || 'Forbidden';
    return res.status(message === 'Flight not found' ? 404 : 403).json({ error: message });
  }

  try {
    const result = await prisma.$transaction((tx) => createTicketLegInventory(tx, {
      flightId: flight.id, ownerFirmId, productType: flight.tripType || TicketProductType.ONE_WAY,
      quantity: resolvedQuantity, totalCost: resolvedPrice, outboundCost, returnCost, currency: resolvedCurrency,
      outboundOrigin: flight.outboundOrigin || 'UNKNOWN', outboundDestination: flight.outboundDestination || 'UNKNOWN',
      outboundDeparture: flight.departure, outboundArrival: flight.arrival,
      returnOrigin: flight.returnOrigin, returnDestination: flight.returnDestination,
      returnDeparture: flight.returnDeparture, returnArrival: flight.returnArrival,
    }));
    res.json({ success: true, count: result.count, segmentCount: result.segmentCount });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to create tickets' });
  }
};

export const allocateTicket = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { ticketId, firmId, flightId, flight_id, quantity, count, allocationPrice, price, allocationRows } = req.body;
  const overridePrice = parsePositiveDecimal(allocationPrice ?? price);
  const parsedAllocationRows = parseAllocationRows(allocationRows);

  const resolvedFlightId = (flightId || flight_id) && typeof (flightId || flight_id) === 'string'
    ? String(flightId || flight_id).trim()
    : '';
  const resolvedQuantity = parsedAllocationRows.length
    ? parsedAllocationRows.reduce((sum, row) => sum + row.quantity, 0)
    : parsePositiveInt(quantity ?? count);

  // Batch allocate: allocate N available tickets for a flight to a firm
  if (!ticketId && resolvedFlightId && resolvedQuantity) {
    if (!firmId || typeof firmId !== 'string') {
      return res.status(400).json({ error: 'firmId is required' });
    }
    const targetFirmId = firmId.trim();
    if (!targetFirmId) {
      return res.status(400).json({ error: 'firmId is required' });
    }

    try {
      const source = await assertCanManageFirmFlightInventory(user, resolvedFlightId, req.body?.sourceFirmId);
      if (source.firmId === targetFirmId) {
        return res.status(400).json({ error: 'Select a different firm for allocation' });
      }
      const result = await prisma.$transaction(async (tx) => {
        const [firm, sourceFirm, flight] = await Promise.all([
          tx.firm.findFirst({
            where: allocationTargetWhere(source.firmId, targetFirmId),
            select: {
              id: true,
              name: true,
              _count: {
                select: {
                  users: { where: { status: 'ACTIVE', deletedAt: null } },
                  userAccesses: { where: { user: { status: 'ACTIVE', deletedAt: null } } },
                },
              },
            },
          }),
          tx.firm.findUnique({ where: { id: source.firmId }, select: { kind: true } }),
          tx.flight.findUnique({
            where: { id: resolvedFlightId },
            select: { id: true, status: true, flightNumber: true, airline: { select: { id: true, name: true, firmId: true } } },
          }),
        ]);
        if (!firm) throw new Error('Firm not found');
        if (!sourceFirm) throw new Error('Source firm not found');
        if (!flight) throw new Error('Flight not found');
        if (flight.status === 'CANCELLED') throw new Error('Cannot allocate tickets for a cancelled flight');
        if (flight.airline?.firmId && requiresAirlineConnectionForAllocation(source.isAirlineOwner)) {
          const connection = await tx.airlineFirmConnection.findFirst({
            where: { airlineFirmId: flight.airline.firmId, firmId: targetFirmId, status: 'ACTIVE' },
            select: { id: true },
          });
          if (!connection) throw new Error('Airline is not connected to this firm');
        }

        const tickets: any[] = await tx.$queryRaw`
          SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
          FROM "Ticket"
          WHERE "flightId" = ${resolvedFlightId}
            AND status IN ('AVAILABLE', 'ASSIGNED')
            AND ("allocatedFirmId" = ${source.firmId} OR (${source.isFlightOwner} = true AND "allocatedFirmId" IS NULL))
            AND "deletedAt" IS NULL
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${resolvedQuantity}
        `;

        if (tickets.length < resolvedQuantity) {
          throw new Error(`Not enough available tickets (requested ${resolvedQuantity}, found ${tickets.length})`);
        }

        const ticketIds = tickets.map((t) => String(t.id));
        const currencies = Array.from(new Set(tickets.map((ticket) => normalizeCurrency(ticket.currency))));
        if (currencies.length !== 1) throw new Error('Currencies cannot be mixed in one allocation');
        const priceRows = parsedAllocationRows.length
          ? parsedAllocationRows.map((row, position) => ({ quantity: row.quantity, unitPrice: row.price.toDecimalPlaces(4), position }))
          : (() => {
              const prices = new Map<string, number>();
              for (const ticket of tickets) {
                const unitPrice = overridePrice?.gt(0)
                  ? overridePrice.toDecimalPlaces(4)
                  : new Prisma.Decimal(String(ticket.basePrice)).toDecimalPlaces(4);
                const key = unitPrice.toString();
                prices.set(key, (prices.get(key) || 0) + 1);
              }
              return Array.from(prices.entries()).map(([unitPrice, rowQuantity], position) => ({
                quantity: rowQuantity,
                unitPrice: new Prisma.Decimal(unitPrice),
                position,
              }));
            })();
        const totalAmount = priceRows.reduce(
          (sum, row) => sum.add(row.unitPrice.mul(row.quantity)),
          new Prisma.Decimal(0),
        ).toDecimalPlaces(4);
        const approvalRequired = requiresAllocationApproval(firm._count.users, firm._count.userAccesses);
        const allocationStatus = approvalRequired ? 'PENDING' : 'ACCEPTED';
        const allocation = await tx.ticketAllocation.create({
          data: {
            flightId: resolvedFlightId,
            fromFirmId: source.firmId,
            toFirmId: targetFirmId,
            currency: currencies[0],
            totalAmount,
            status: allocationStatus,
            ...(!approvalRequired ? { acceptedAt: new Date(), acceptedByUserId: null } : {}),
            note: normalizeOptionalString(req.body?.note),
            createdByUserId: user?.userId ? String(user.userId) : null,
            priceRows: { create: priceRows },
          },
        });
        await tx.$executeRaw`
          UPDATE "Ticket" SET "allocationSourcePrice" = price
          WHERE id IN (${Prisma.join(ticketIds)})
        `;
        if (parsedAllocationRows.length) {
          let offset = 0;
          for (const row of parsedAllocationRows) {
            const rowTicketIds = ticketIds.slice(offset, offset + row.quantity);
            offset += row.quantity;
            if (!rowTicketIds.length) continue;
            await tx.ticket.updateMany({
              where: { id: { in: rowTicketIds } },
              data: {
                status: approvalRequired ? 'PENDING' : 'ASSIGNED',
                assignedFirmId: targetFirmId,
                allocationSourceFirmId: source.firmId,
                allocationId: allocation.id,
                basePrice: row.price,
              },
            });
          }
        } else {
          await tx.ticket.updateMany({
            where: { id: { in: ticketIds } },
            data: {
              status: approvalRequired ? 'PENDING' : 'ASSIGNED',
              assignedFirmId: targetFirmId,
              allocationSourceFirmId: source.firmId,
              allocationId: allocation.id,
              ...(overridePrice?.gt(0) ? { basePrice: overridePrice.toDecimalPlaces(4) } : {}),
            },
          });
        }
        if (approvalRequired) {
          await createFirmNotification(tx, targetFirmId, {
            title: 'Ticket allocation pending',
            body: `${flight.flightNumber || 'Flight'}: ${ticketIds.length} ticket(s), total ${totalAmount.toString()} ${currencies[0]}.`,
            type: 'TICKET_ALLOCATION_PENDING',
            entityType: 'flight',
            entityId: resolvedFlightId,
            metadata: {
              flightId: resolvedFlightId,
              flightNumber: flight.flightNumber,
              allocationId: allocation.id,
              count: ticketIds.length,
              totalAmount: totalAmount.toString(),
              currency: currencies[0],
              airlineId: flight.airline?.id,
              airlineName: flight.airline?.name,
              airlineFirmId: flight.airline?.firmId,
            },
          });
        } else {
          await writeAuditLog(req, {
            action: 'TICKET_ALLOCATION_AUTO_ACCEPTED',
            entityType: 'ticketAllocation',
            entityId: allocation.id,
            entityLabel: flight.flightNumber,
            summary: `${ticketIds.length} ta chipta tashqi firma uchun avtomatik tasdiqlandi`,
            before: { status: 'PENDING' },
            after: { status: 'ACCEPTED', acceptedByUserId: null },
            metadata: { flightId: resolvedFlightId, fromFirmId: source.firmId, toFirmId: targetFirmId, ticketQuantity: ticketIds.length, totalAmount: totalAmount.toString(), currency: currencies[0] },
          }, tx);
        }
        await createFirmNotification(tx, flight.airline?.firmId, {
          title: 'Tickets allocated',
          body: `${ticketIds.length} ticket(s) for ${flight.flightNumber || 'flight'} were allocated to ${firm.name}.`,
          type: 'TICKET_ALLOCATED',
          entityType: 'flight',
          entityId: resolvedFlightId,
          metadata: { flightId: resolvedFlightId, flightNumber: flight.flightNumber, count: ticketIds.length, firmId: targetFirmId, firmName: firm.name },
        });
        return {
          count: ticketIds.length,
          allocationId: allocation.id,
          priceRows: priceRows.map((row) => ({ quantity: row.quantity, price: row.unitPrice.toString() })),
          totalAmount: totalAmount.toString(),
          currency: currencies[0],
          status: allocationStatus,
          approvalRequired,
        };
      });

      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }

  if (!ticketId || typeof ticketId !== 'string') {
    return res.status(400).json({ error: 'ticketId is required' });
  }
  if (!firmId || typeof firmId !== 'string') {
    return res.status(400).json({ error: 'firmId is required' });
  }
  const targetFirmId = firmId.trim();
  if (!targetFirmId) return res.status(400).json({ error: 'firmId is required' });
  
  try {
    const ticketFlight = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { flightId: true, assignedFirmId: true },
    });
    if (!ticketFlight) return res.status(404).json({ error: 'Ticket not found' });
    const source = await assertCanManageFirmFlightInventory(user, ticketFlight.flightId, req.body?.sourceFirmId);
    if (source.firmId === targetFirmId) {
      return res.status(400).json({ error: 'Select a different firm for allocation' });
    }
    const result = await prisma.$transaction(async (tx) => {
      // Find ticket
      const tickets: any[] = await tx.$queryRaw`
        SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
        FROM "Ticket"
        WHERE id = ${ticketId}
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];

      const flight = await tx.flight.findUnique({
        where: { id: String(ticket.flightId) },
        select: { id: true, status: true, flightNumber: true, airline: { select: { id: true, name: true, firmId: true } } },
      });
      if (!flight) throw new Error('Flight not found');
      if (flight.status === 'CANCELLED') throw new Error('Cannot allocate tickets for a cancelled flight');
      if (flight.airline?.firmId && requiresAirlineConnectionForAllocation(source.isAirlineOwner)) {
        const connection = await tx.airlineFirmConnection.findFirst({
          where: { airlineFirmId: flight.airline.firmId, firmId: targetFirmId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!connection) throw new Error('Airline is not connected to this firm');
      }
      
      if (!['AVAILABLE', 'ASSIGNED'].includes(String(ticket.status))) throw new Error('Ticket is not available for allocation');
      if (String(ticket.assignedFirmId || '') !== source.firmId && !(source.isFlightOwner && !ticket.assignedFirmId)) throw new Error('Ticket is not in your inventory');

      const firm = await tx.firm.findFirst({
          where: allocationTargetWhere(source.firmId, targetFirmId),
          select: {
            id: true,
            name: true,
            _count: {
              select: {
                users: { where: { status: 'ACTIVE', deletedAt: null } },
                userAccesses: { where: { user: { status: 'ACTIVE', deletedAt: null } } },
              },
            },
          },
        });
      if (!firm) throw new Error('Firm not found');

      const unitPrice = overridePrice?.gt(0)
        ? overridePrice.toDecimalPlaces(4)
        : new Prisma.Decimal(String(ticket.basePrice)).toDecimalPlaces(4);
      const currency = normalizeCurrency(ticket.currency);
      const approvalRequired = requiresAllocationApproval(firm._count.users, firm._count.userAccesses);
      const allocationStatus = approvalRequired ? 'PENDING' : 'ACCEPTED';
      const allocation = await tx.ticketAllocation.create({
        data: {
          flightId: String(ticket.flightId),
          fromFirmId: source.firmId,
          toFirmId: targetFirmId,
          currency,
          totalAmount: unitPrice,
          status: allocationStatus,
          ...(!approvalRequired ? { acceptedAt: new Date(), acceptedByUserId: null } : {}),
          note: normalizeOptionalString(req.body?.note),
          createdByUserId: user?.userId ? String(user.userId) : null,
          priceRows: { create: [{ quantity: 1, unitPrice, position: 0 }] },
        },
      });
      // Update ticket
      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: approvalRequired ? 'PENDING' : 'ASSIGNED',
          assignedFirmId: targetFirmId,
          allocationSourceFirmId: source.firmId,
          allocationSourcePrice: new Prisma.Decimal(String(ticket.basePrice)).toDecimalPlaces(4),
          allocationId: allocation.id,
          ...(overridePrice?.gt(0) ? { basePrice: overridePrice.toDecimalPlaces(4) } : {}),
        }
      });
      if (approvalRequired) {
        await createFirmNotification(tx, targetFirmId, {
          title: 'Ticket allocation pending',
          body: `${flight.flightNumber || 'Flight'}: 1 ticket, total ${unitPrice.toString()} ${currency}.`,
          type: 'TICKET_ALLOCATION_PENDING',
          entityType: 'ticket',
          entityId: ticketId,
          metadata: { allocationId: allocation.id, flightId: flight.id, flightNumber: flight.flightNumber, ticketId, totalAmount: unitPrice.toString(), currency, airlineId: flight.airline?.id, airlineName: flight.airline?.name, airlineFirmId: flight.airline?.firmId },
        });
      } else {
        await writeAuditLog(req, {
          action: 'TICKET_ALLOCATION_AUTO_ACCEPTED',
          entityType: 'ticketAllocation',
          entityId: allocation.id,
          entityLabel: flight.flightNumber,
          summary: '1 ta chipta tashqi firma uchun avtomatik tasdiqlandi',
          before: { status: 'PENDING' },
          after: { status: 'ACCEPTED', acceptedByUserId: null },
          metadata: { flightId: String(ticket.flightId), fromFirmId: source.firmId, toFirmId: targetFirmId, ticketQuantity: 1, totalAmount: unitPrice.toString(), currency },
        }, tx);
      }
      await createFirmNotification(tx, flight.airline?.firmId, {
        title: 'Ticket allocated',
        body: `A ticket for ${flight.flightNumber || 'flight'} was allocated to ${firm.name}.`,
        type: 'TICKET_ALLOCATED',
        entityType: 'ticket',
        entityId: ticketId,
        metadata: { flightId: flight.id, flightNumber: flight.flightNumber, ticketId, firmId: targetFirmId, firmName: firm.name },
      });
      return { allocationId: allocation.id, status: allocationStatus, approvalRequired };
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const confirmAllocation = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const role = normalizeRole(user?.role);
  const actorUserId = user?.userId ? String(user.userId) : undefined;

  if (!['FIRM', 'ADMIN', 'SUPERADMIN'].includes(role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (role === 'FIRM' && !canManageFirmWork(user)) {
    return res.status(403).json({ error: 'Only firm admins and managers can confirm ticket allocations' });
  }

  const ownFirmId = user?.firmId ? String(user.firmId) : '';
  if (role === 'FIRM' && !ownFirmId) {
    return res.status(400).json({ error: 'Firm account is missing firmId' });
  }

  const { allocationId, ticketId, flightId, flight_id, quantity, count } = req.body;
  const resolvedFlightId = (flightId || flight_id) && typeof (flightId || flight_id) === 'string'
    ? String(flightId || flight_id).trim()
    : '';
  const resolvedQuantity = parsePositiveInt(quantity ?? count);
  const requestedFirmId = role === 'FIRM' ? ownFirmId : normalizeOptionalString(req.body?.firmId);

  if (normalizeOptionalString(allocationId)) {
    const resolvedAllocationId = String(allocationId).trim();
    try {
      const result = await prisma.$transaction(async (tx) => {
        const locked: Array<{ id: string }> = await tx.$queryRaw`
          SELECT id FROM "TicketAllocation" WHERE id = ${resolvedAllocationId} FOR UPDATE
        `;
        if (!locked.length) throw new Error('Allocation not found');
        const allocation = await tx.ticketAllocation.findUnique({
          where: { id: resolvedAllocationId },
          include: {
            flight: { select: { id: true, status: true, flightNumber: true, airline: { select: { id: true, name: true, firmId: true } } } },
            fromFirm: { select: { id: true, name: true, kind: true } },
            toFirm: { select: { id: true, name: true } },
            priceRows: true,
          },
        });
        if (!allocation) throw new Error('Allocation not found');
        if (allocation.status !== 'PENDING') throw new Error('Ushbu ajratma allaqachon ko‘rib chiqilgan.');
        if (allocation.flight.status === 'CANCELLED') throw new Error('Cannot confirm allocation for a cancelled flight');
        if (role === 'FIRM' ? allocation.toFirmId !== ownFirmId : !(await canAccessFirm(user, allocation.toFirmId))) {
          throw new Error('Siz ushbu ajratmani tasdiqlash huquqiga ega emassiz.');
        }

        const tickets: any[] = await tx.$queryRaw`
          SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
          FROM "Ticket"
          WHERE "allocationId" = ${resolvedAllocationId}
            AND status = 'PENDING'
            AND "deletedAt" IS NULL
          ORDER BY "createdAt" ASC
          FOR UPDATE
        `;
        const expectedQuantity = allocation.priceRows.reduce((sum, row) => sum + row.quantity, 0);
        if (!tickets.length || tickets.length !== expectedQuantity) throw new Error('Allocation ticket count is inconsistent');

        await tx.ticket.updateMany({
          where: { allocationId: resolvedAllocationId, status: 'PENDING', deletedAt: null },
          data: { status: 'ASSIGNED' },
        });
        await tx.ticketAllocation.update({
          where: { id: resolvedAllocationId },
          data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedByUserId: actorUserId || null },
        });
        await createFirmNotification(tx, allocation.fromFirmId, {
          title: 'Ajratma tasdiqlandi',
          body: `${allocation.toFirm.name} ${allocation.flight.flightNumber || 'reys'} bo‘yicha ${tickets.length} ta chipta ajratmasini tasdiqladi.`,
          type: 'TICKET_ALLOCATION_ACCEPTED',
          entityType: 'ticketAllocation',
          entityId: allocation.id,
          metadata: { allocationId: allocation.id, flightId: allocation.flightId, count: tickets.length, totalAmount: allocation.totalAmount.toString(), currency: allocation.currency },
        });
        await writeAuditLog(req, {
          action: 'TICKET_ALLOCATION_ACCEPTED',
          entityType: 'ticketAllocation',
          entityId: allocation.id,
          entityLabel: allocation.flight.flightNumber,
          summary: `${tickets.length} ta chipta ajratmasi tasdiqlandi`,
          before: { status: 'PENDING' },
          after: { status: 'ACCEPTED', acceptedByUserId: actorUserId },
          metadata: { flightId: allocation.flightId, fromFirmId: allocation.fromFirmId, toFirmId: allocation.toFirmId, ticketQuantity: tickets.length, totalAmount: allocation.totalAmount.toString(), currency: allocation.currency },
        }, tx);
        return { count: tickets.length, totalAmount: allocation.totalAmount.toString(), currency: allocation.currency };
      });
      return res.json({ success: true, allocationId: resolvedAllocationId, ...result });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to confirm allocation' });
    }
  }

  // Batch confirm: firm confirms N pending allocations for a flight
  if (!ticketId && resolvedFlightId && resolvedQuantity) {
    if (!requestedFirmId) return res.status(400).json({ error: 'firmId is required' });
    if (!(await canAccessFirm(user, requestedFirmId))) return res.status(403).json({ error: 'Forbidden' });
    try {
      const result = await prisma.$transaction(async (tx) => {
        const flight = await tx.flight.findUnique({
          where: { id: resolvedFlightId },
          select: { status: true, flightNumber: true, airline: { select: { id: true, name: true, firmId: true } } },
        });
        if (!flight) throw new Error('Flight not found');
        if (flight.status === 'CANCELLED') throw new Error('Cannot confirm allocation for a cancelled flight');
        const tickets: any[] = await tx.$queryRaw`
          SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
          FROM "Ticket"
          WHERE "flightId" = ${resolvedFlightId}
            AND status = 'PENDING'
            AND "allocatedFirmId" = ${requestedFirmId}
            AND "deletedAt" IS NULL
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${resolvedQuantity}
        `;

        if (tickets.length < resolvedQuantity) {
          throw new Error(`Not enough pending tickets (requested ${resolvedQuantity}, found ${tickets.length})`);
        }

        const ticketIds = tickets.map((t) => String(t.id));
        const sourceFirmIds = Array.from(new Set(tickets.map((ticket) => normalizeOptionalString(ticket.allocationSourceFirmId)).filter((value): value is string => Boolean(value))));
        await tx.ticket.updateMany({
          where: { id: { in: ticketIds } },
          data: { status: 'ASSIGNED' },
        });

        await createFirmNotification(tx, requestedFirmId, {
          title: 'Ticket allocation accepted',
          body: `${ticketIds.length} ticket(s) for ${flight.flightNumber || 'flight'} are now active in your firm inventory.`,
          type: 'TICKET_ALLOCATION_ACCEPTED',
          entityType: 'flight',
          entityId: resolvedFlightId,
          metadata: { flightId: resolvedFlightId, flightNumber: flight.flightNumber, count: ticketIds.length, airlineId: flight.airline?.id, airlineName: flight.airline?.name, airlineFirmId: flight.airline?.firmId || null },
        });
        for (const sourceFirmId of sourceFirmIds) {
          await createFirmNotification(tx, sourceFirmId, {
            title: 'Firm accepted tickets',
            body: `${ticketIds.filter((_, index) => String(tickets[index].allocationSourceFirmId || '') === sourceFirmId).length} ticket(s) for ${flight.flightNumber || 'flight'} were accepted by the receiving firm.`,
            type: 'TICKET_ALLOCATION_ACCEPTED',
            entityType: 'flight',
            entityId: resolvedFlightId,
            metadata: { flightId: resolvedFlightId, flightNumber: flight.flightNumber, count: ticketIds.length, firmId: requestedFirmId },
          });
        }
        return { count: ticketIds.length };
      });

      return res.json({ success: true, count: result.count });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }

  if (!ticketId || typeof ticketId !== 'string') {
    return res.status(400).json({ error: 'ticketId is required' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const tickets: any[] = await tx.$queryRaw`
        SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
        FROM "Ticket"
        WHERE id = ${ticketId}
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];

      const flight = await tx.flight.findUnique({
        where: { id: String(ticket.flightId) },
        select: { status: true, flightNumber: true, airline: { select: { id: true, name: true, firmId: true } } },
      });
      if (!flight) throw new Error('Flight not found');
      if (flight.status === 'CANCELLED') throw new Error('Cannot confirm allocation for a cancelled flight');

      if (ticket.status !== 'PENDING') throw new Error('Ticket is not pending confirmation');
      const receivingFirmId = String(ticket.assignedFirmId || '');
      if (!receivingFirmId) throw new Error('Ticket is missing receiving firm');
      if (role === 'FIRM' ? receivingFirmId !== ownFirmId : !(await canAccessFirm(user, receivingFirmId))) {
        throw new Error('Not your ticket');
      }

      const sourceFirmId = normalizeOptionalString(ticket.allocationSourceFirmId);

      await tx.ticket.update({
        where: { id: ticketId },
        data: { status: 'ASSIGNED' },
      });

      await createFirmNotification(tx, receivingFirmId, {
        title: 'Ticket allocation accepted',
        body: `A ticket for ${flight.flightNumber || 'flight'} is now active in your firm inventory.`,
        type: 'TICKET_ALLOCATION_ACCEPTED',
        entityType: 'ticket',
        entityId: ticketId,
        metadata: { flightId: String(ticket.flightId), flightNumber: flight.flightNumber, ticketId, airlineId: flight.airline?.id, airlineName: flight.airline?.name, airlineFirmId: flight.airline?.firmId || null },
      });
      await createFirmNotification(tx, sourceFirmId, {
        title: 'Firm accepted ticket',
        body: `A ticket for ${flight.flightNumber || 'flight'} was accepted by the firm.`,
        type: 'TICKET_ALLOCATION_ACCEPTED',
        entityType: 'ticket',
        entityId: ticketId,
        metadata: { flightId: String(ticket.flightId), flightNumber: flight.flightNumber, ticketId, firmId: receivingFirmId },
      });
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};

export const rejectAllocation = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const role = normalizeRole(user?.role);
  const allocationId = normalizeOptionalString(req.body?.allocationId);
  let rejectionReason: string | undefined;
  const actorUserId = normalizeOptionalString(user?.userId);
  if (allocationId) {
    try {
      rejectionReason = validateAllocationRejectionReason(req.body?.rejectionReason);
    } catch (err: any) {
      return res.status(400).json({ error: err?.message });
    }
    if (!['FIRM', 'ADMIN', 'SUPERADMIN'].includes(role)) return res.status(403).json({ error: 'Forbidden' });
    if (role === 'FIRM' && !canManageFirmWork(user)) return res.status(403).json({ error: 'Only firm admins and managers can reject ticket allocations' });
    try {
      const result = await prisma.$transaction(async (tx) => {
        const locked: Array<{ id: string }> = await tx.$queryRaw`
          SELECT id FROM "TicketAllocation" WHERE id = ${allocationId} FOR UPDATE
        `;
        if (!locked.length) throw new Error('Allocation not found');
        const allocation = await tx.ticketAllocation.findUnique({
          where: { id: allocationId },
          include: {
            flight: { select: { flightNumber: true } },
            fromFirm: { select: { id: true, name: true } },
            toFirm: { select: { id: true, name: true } },
            priceRows: true,
          },
        });
        if (!allocation) throw new Error('Allocation not found');
        if (allocation.status !== 'PENDING') throw new Error('Ushbu ajratma allaqachon ko‘rib chiqilgan.');
        const ownFirmId = normalizeOptionalString(user?.firmId);
        if (role === 'FIRM' ? allocation.toFirmId !== ownFirmId : !(await canAccessFirm(user, allocation.toFirmId))) {
          throw new Error('Siz ushbu ajratmani rad etish huquqiga ega emassiz.');
        }
        const tickets: Array<{ id: string; basePrice: Prisma.Decimal; allocationSourcePrice: Prisma.Decimal | null }> = await tx.$queryRaw`
          SELECT id, price AS "basePrice", "allocationSourcePrice" FROM "Ticket"
          WHERE "allocationId" = ${allocationId} AND status = 'PENDING' AND "deletedAt" IS NULL
          FOR UPDATE
        `;
        const expectedQuantity = allocation.priceRows.reduce((sum, row) => sum + row.quantity, 0);
        if (!tickets.length || tickets.length !== expectedQuantity) throw new Error('Allocation ticket count is inconsistent');

        for (const ticket of tickets) await tx.ticket.update({
          where: { id: ticket.id },
          data: {
            status: 'ASSIGNED', assignedFirmId: allocation.fromFirmId, allocationSourceFirmId: null,
            basePrice: ticket.allocationSourcePrice || ticket.basePrice, allocationSourcePrice: null, allocationId: null,
          },
        });
        const rejectedAt = new Date();
        await tx.ticketAllocation.update({
          where: { id: allocationId },
          data: { status: 'REJECTED', rejectionReason, rejectedAt, rejectedByUserId: actorUserId || null },
        });
        await createFirmNotification(tx, allocation.fromFirmId, {
          title: 'Chipta ajratmasi rad etildi',
          body: `${allocation.toFirm.name} firmasi ${allocation.flight.flightNumber || 'reys'} bo‘yicha ${tickets.length} ta chipta ajratmasini rad etdi. Sababi: ${rejectionReason}`,
          type: 'TICKET_ALLOCATION_REJECTED',
          entityType: 'ticketAllocation',
          entityId: allocation.id,
          metadata: { allocationId: allocation.id, flightId: allocation.flightId, ticketQuantity: tickets.length, totalAmount: allocation.totalAmount.toString(), currency: allocation.currency, rejectionReason, rejectedByUserId: actorUserId, rejectedAt },
        });
        await writeAuditLog(req, {
          action: 'TICKET_ALLOCATION_REJECTED',
          entityType: 'ticketAllocation',
          entityId: allocation.id,
          entityLabel: allocation.flight.flightNumber,
          summary: `${allocation.toFirm.name} ${tickets.length} ta chipta ajratmasini rad etdi`,
          before: { status: 'PENDING' },
          after: { status: 'REJECTED', rejectionReason, rejectedAt, rejectedByUserId: actorUserId },
          metadata: { allocationId: allocation.id, flightId: allocation.flightId, fromFirmId: allocation.fromFirmId, toFirmId: allocation.toFirmId, rejectedFirmName: allocation.toFirm.name, rejectionReason, ticketQuantity: tickets.length, totalAmount: allocation.totalAmount.toString(), currency: allocation.currency },
        }, tx);
        return { count: tickets.length, status: 'REJECTED', rejectionReason, rejectedAt };
      });
      return res.json({ success: true, allocationId, ...result });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to reject allocation' });
    }
  }
  const ticketId = normalizeOptionalString(req.body?.ticketId);
  if (!ticketId) return res.status(400).json({ error: 'ticketId is required' });
  if (!['FIRM', 'ADMIN', 'SUPERADMIN'].includes(role)) return res.status(403).json({ error: 'Forbidden' });
  if (role === 'FIRM' && !canManageFirmWork(user)) return res.status(403).json({ error: 'Only firm admins and managers can reject ticket allocations' });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows: any[] = await tx.$queryRaw`
        SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
        FROM "Ticket"
        WHERE id = ${ticketId}
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (!rows.length) throw new Error('Ticket not found');
      const ticket = rows[0];
      if (String(ticket.status) !== 'PENDING') throw new Error('Ticket is not pending confirmation');

      const receivingFirmId = normalizeOptionalString(ticket.assignedFirmId);
      const sourceFirmId = normalizeOptionalString(ticket.allocationSourceFirmId);
      const actorFirmId = normalizeOptionalString(user?.firmId);
      const mayAct = role === 'SUPERADMIN'
        || (role === 'FIRM' && Boolean(actorFirmId && [receivingFirmId, sourceFirmId].includes(actorFirmId)))
        || (role === 'ADMIN' && Boolean(
          (receivingFirmId && await canAccessFirm(user, receivingFirmId))
          || (sourceFirmId && await canAccessFirm(user, sourceFirmId))
        ));
      if (!mayAct) throw new Error('Not your ticket');

      const restored = restoredTicketState(sourceFirmId);
      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          ...restored, allocationSourceFirmId: null,
          basePrice: ticket.allocationSourcePrice || ticket.basePrice, allocationSourcePrice: null, allocationId: null,
        },
      });

      const flight = await tx.flight.findUnique({ where: { id: String(ticket.flightId) }, select: { flightNumber: true } });
      await createFirmNotification(tx, sourceFirmId, {
        title: 'Ticket allocation returned',
        body: `A pending ticket for ${flight?.flightNumber || 'flight'} was returned to your inventory.`,
        type: 'TICKET_ALLOCATION_REJECTED',
        entityType: 'ticket',
        entityId: ticketId,
        metadata: { ticketId, flightId: String(ticket.flightId), receivingFirmId },
      });
      await createFirmNotification(tx, receivingFirmId, {
        title: 'Ticket allocation cancelled',
        body: `A pending ticket for ${flight?.flightNumber || 'flight'} was cancelled.`,
        type: 'TICKET_ALLOCATION_REJECTED',
        entityType: 'ticket',
        entityId: ticketId,
        metadata: { ticketId, flightId: String(ticket.flightId), sourceFirmId },
      });
      return restored;
    });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to reject allocation' });
  }
};

export const deallocateTicket = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const role = normalizeRole(user?.role);
  const actorUserId = user?.userId ? String(user.userId) : undefined;

  if (!['SUPERADMIN', 'ADMIN'].includes(role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { ticketId, firmId, flightId, flight_id, quantity, count } = req.body;
  const resolvedFlightId = (flightId || flight_id) && typeof (flightId || flight_id) === 'string'
    ? String(flightId || flight_id).trim()
    : '';
  const resolvedQuantity = parsePositiveInt(quantity ?? count);

  // Batch deallocate: admin removes N pending/assigned tickets from a firm back to AVAILABLE
  if (!ticketId && resolvedFlightId && resolvedQuantity) {
    if (!firmId || typeof firmId !== 'string' || !firmId.trim()) {
      return res.status(400).json({ error: 'firmId is required' });
    }
    const targetFirmId = firmId.trim();
    if (role === 'ADMIN' && !(await canAccessFirm(user, targetFirmId))) return res.status(403).json({ error: 'Forbidden' });

    try {
      const result = await prisma.$transaction(async (tx) => {
        const [firm, flight] = await Promise.all([
          tx.firm.findUnique({ where: { id: targetFirmId }, select: { id: true } }),
          tx.flight.findUnique({ where: { id: resolvedFlightId }, select: { id: true } }),
        ]);
        if (!firm) throw new Error('Firm not found');
        if (!flight) throw new Error('Flight not found');

        const tickets: any[] = await tx.$queryRaw`
          SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
          FROM "Ticket"
          WHERE "flightId" = ${resolvedFlightId}
            AND "allocatedFirmId" = ${targetFirmId}
            AND status IN ('PENDING', 'ASSIGNED')
            AND "allocationId" IS NULL
            AND "deletedAt" IS NULL
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${resolvedQuantity}
        `;

        if (tickets.length < resolvedQuantity) {
          throw new Error(`Not enough allocated tickets (requested ${resolvedQuantity}, found ${tickets.length})`);
        }

        const ticketIds = tickets.map((t) => String(t.id));
        for (const ticket of tickets) {
          await tx.ticket.update({
            where: { id: String(ticket.id) },
            data: {
              ...restoredTicketState(ticket.allocationSourceFirmId), allocationSourceFirmId: null,
              basePrice: ticket.allocationSourcePrice || ticket.basePrice, allocationSourcePrice: null, allocationId: null,
            },
          });
        }

        return { count: ticketIds.length };
      });

      return res.json({ success: true, count: result.count });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }

  if (!ticketId || typeof ticketId !== 'string') {
    return res.status(400).json({ error: 'ticketId is required' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const tickets: any[] = await tx.$queryRaw`
        SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
        FROM "Ticket"
        WHERE id = ${ticketId}
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];

      if (ticket.allocationId) throw new Error('Ajratma bilan bog‘langan chipta uchun ajratma panelidagi bekor qilish so‘rovidan foydalaning.');

      const prevStatus = String(ticket.status || '');
      const prevFirmId = ticket.assignedFirmId ? String(ticket.assignedFirmId) : '';

      if (prevStatus === 'SOLD') throw new Error('Cannot deallocate a sold ticket');
      if (!prevFirmId || prevStatus === 'AVAILABLE') throw new Error('Ticket is not allocated');
      if (role === 'ADMIN' && !(await canAccessFirm(user, prevFirmId))) throw new Error('Forbidden');

      const restored = restoredTicketState(ticket.allocationSourceFirmId);
      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          ...restored, allocationSourceFirmId: null,
          basePrice: ticket.allocationSourcePrice || ticket.basePrice, allocationSourcePrice: null, allocationId: null,
        },
      });

    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};

export const sellTicket = async (req: Request, res: Response) => {
  const { ticketId, flightId, flight_id, firmId, quantity, count, salePrice, saleCurrency } = req.body;
  const user = (req as any).user;
  const actorUserId = user?.userId as string | undefined;

  const role = normalizeRole(user?.role);
  let kassaDesk: Awaited<ReturnType<typeof resolveKassaDesk>> = null;
  const resolvedFlightId = (flightId || flight_id) && typeof (flightId || flight_id) === 'string'
    ? String(flightId || flight_id).trim()
    : '';
  const resolvedQuantity = parsePositiveInt(quantity ?? count);

  if (!['SUPERADMIN', 'ADMIN', 'FIRM'].includes(role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (role === 'FIRM' && !canManageFirmWork(user)) {
    return res.status(403).json({ error: 'Only firm admins and managers can sell tickets' });
  }

  const saleAmount = parsePositiveDecimal(salePrice);
  const currency = normalizeCurrency(saleCurrency);
  const rawExchangeRate = (req.body as any)?.exchangeRate;
  if (!saleAmount) {
    return res.status(400).json({ error: 'salePrice is required' });
  }
  if (!['USD', 'UZS'].includes(currency)) {
    return res.status(400).json({ error: 'saleCurrency must be USD or UZS' });
  }
  let saleExchangeRate: Prisma.Decimal;
  try {
    saleExchangeRate = await resolveExchangeRateToUzs(user, {
      currency,
      overrideRate: rawExchangeRate,
    });
  } catch (err: any) {
    return res.status(err?.statusCode || 400).json({ error: err?.message || 'Exchange rate to UZS is required' });
  }

  const purchaserRaw = (req.body as any).purchaser ?? (req.body as any).purchaserInfo;
  const purchaserInfo = parsePurchaserInfo(purchaserRaw);
  if (!purchaserInfo) {
    return res.status(400).json({ error: 'purchaser info is required (name and idNumber)' });
  }

  // Batch sell: firm marks N of their assigned tickets for a flight as SOLD
  if (!ticketId && resolvedFlightId && resolvedQuantity) {
    const sellerFirmId = role === 'FIRM'
      ? (user?.firmId ? String(user.firmId) : '')
      : typeof firmId === 'string' && firmId.trim()
        ? firmId.trim()
        : '';
    if (!sellerFirmId) {
      return res.status(400).json({ error: 'firmId is required' });
    }
    if (role !== 'SUPERADMIN' && !(await canAccessFirm(user, sellerFirmId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      kassaDesk = await resolveKassaDesk(user, req.body?.kassaDeskId);
      await assertKassaDeskForFirm(kassaDesk, sellerFirmId);
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Invalid kassa desk' });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const flight = await tx.flight.findUnique({
          where: { id: resolvedFlightId },
          select: { status: true },
        });
        if (!flight) throw new Error('Flight not found');
        if (flight.status === 'CANCELLED') throw new Error('Cannot sell tickets for a cancelled flight');

        const tickets: any[] = await tx.$queryRaw`
          SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
          FROM "Ticket"
          WHERE "flightId" = ${resolvedFlightId}
            AND status = 'ASSIGNED'
            AND "allocatedFirmId" = ${sellerFirmId}
            AND "deletedAt" IS NULL
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${resolvedQuantity}
        `;

        if (tickets.length < resolvedQuantity) {
          throw new Error(`Not enough assigned tickets (requested ${resolvedQuantity}, found ${tickets.length})`);
        }

        const exchangeRate = saleExchangeRate;
        const baseAmount = saleAmount.mul(exchangeRate).toDecimalPlaces(4);

        const ticketIds = tickets.map((t) => String(t.id));
        await tx.ticket.updateMany({
          where: { id: { in: ticketIds } },
          data: {
            status: 'SOLD',
            soldPrice: saleAmount.toDecimalPlaces(4),
            soldCurrency: currency,
            purchaserInfo: purchaserInfo as any,
          },
        });

        const transactionRows = tickets.map((t) => {
          return {
            firmId: sellerFirmId,
            flightId: String(t.flightId),
            ticketId: String(t.id),
            createdByUserId: actorUserId,
            kassaDeskId: kassaDesk?.id,
            type: 'SALE' as const,
            originalAmount: saleAmount.toDecimalPlaces(4),
            currency,
            exchangeRate: exchangeRate.toDecimalPlaces(6),
            baseAmount,
            metadata: {
              note: 'Tickets sold, revenue generated',
              kassaDeskId: kassaDesk?.id,
              kassaDeskLabel: kassaDesk?.name,
              purchaser: purchaserInfo,
            } as any,
          };
        });

        await tx.transaction.createMany({ data: transactionRows });
        return { count: ticketIds.length };
      });

      return res.json({ success: true, count: result.count });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }

  if (!ticketId || typeof ticketId !== 'string') {
    return res.status(400).json({ error: 'ticketId is required' });
  }
  
  try {
    await prisma.$transaction(async (tx) => {
      const tickets: any[] = await tx.$queryRaw`
        SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
        FROM "Ticket"
        WHERE id = ${ticketId}
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];

      const flight = await tx.flight.findUnique({
        where: { id: String(ticket.flightId) },
        select: { status: true },
      });
      if (!flight) throw new Error('Flight not found');
      if (flight.status === 'CANCELLED') throw new Error('Cannot sell tickets for a cancelled flight');
      
      if (ticket.status !== 'ASSIGNED') throw new Error('Ticket is not assigned');
      if (!ticket.assignedFirmId) throw new Error('Ticket is missing assigned firm');
      const assignedFirmId = String(ticket.assignedFirmId);
      if (role !== 'SUPERADMIN' && !(await canAccessFirm(user, assignedFirmId))) {
        throw new Error('Not your ticket');
      }
      kassaDesk = await resolveKassaDesk(user, req.body?.kassaDeskId);
      await assertKassaDeskForFirm(kassaDesk, assignedFirmId);

      const exchangeRate = saleExchangeRate;
      const baseAmount = saleAmount.mul(exchangeRate).toDecimalPlaces(4);

      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: 'SOLD',
          soldPrice: saleAmount.toDecimalPlaces(4),
          soldCurrency: currency,
          purchaserInfo: purchaserInfo as any,
        }
      });

      await tx.transaction.create({
        data: {
          firmId: assignedFirmId,
          flightId: ticket.flightId,
          ticketId,
          createdByUserId: actorUserId,
          kassaDeskId: kassaDesk?.id,
          type: 'SALE',
          originalAmount: saleAmount.toDecimalPlaces(4),
          currency,
          exchangeRate: exchangeRate.toDecimalPlaces(6),
          baseAmount,
          metadata: {
            note: 'Ticket sold, revenue generated',
            kassaDeskId: kassaDesk?.id,
            kassaDeskLabel: kassaDesk?.name,
            purchaser: purchaserInfo,
          }
        }
      });
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const cancelSale = async (req: Request, res: Response) => {
  const { ticketId } = req.body;
  const user = (req as any).user;
  const actorUserId = user?.userId ? String(user.userId) : undefined;
  const role = normalizeRole(user?.role);

  if (!['SUPERADMIN', 'ADMIN'].includes(role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!ticketId || typeof ticketId !== 'string' || !ticketId.trim()) {
    return res.status(400).json({ error: 'ticketId is required' });
  }

  const resolvedTicketId = ticketId.trim();

  try {
    await prisma.$transaction(async (tx) => {
      const tickets: any[] = await tx.$queryRaw`
        SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
        FROM "Ticket"
        WHERE id = ${resolvedTicketId}
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];

      if (String(ticket.status || '') !== 'SOLD') throw new Error('Ticket is not sold');

      const sale = await tx.transaction.findFirst({
        where: {
          ticketId: resolvedTicketId,
          type: 'SALE',
          deletedAt: null,
          baseAmount: { gt: new Prisma.Decimal(0) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!sale) throw new Error('Missing SALE transaction for ticket');
      if (role === 'ADMIN' && !(await canAccessFirm(user, String(sale.firmId)))) throw new Error('Forbidden');

      const originalAmount = new Prisma.Decimal(String(sale.originalAmount)).mul(-1).toDecimalPlaces(4);
      const exchangeRate = new Prisma.Decimal(String(sale.exchangeRate)).toDecimalPlaces(6);
      const baseAmount = new Prisma.Decimal(String(sale.baseAmount)).mul(-1).toDecimalPlaces(4);

      await tx.transaction.create({
        data: {
          firmId: String(sale.firmId),
          flightId: String(sale.flightId),
          ticketId: resolvedTicketId,
          createdByUserId: actorUserId,
          type: 'SALE',
          originalAmount,
          currency: String(sale.currency),
          exchangeRate,
          baseAmount,
          metadata: {
            note: 'Sale cancelled (admin), revenue reversed',
            reversedTransactionId: String(sale.id),
          },
        },
      });

      await tx.ticket.update({
        where: { id: resolvedTicketId },
        data: {
          status: 'ASSIGNED',
          soldPrice: null,
          soldCurrency: null,
          purchaserInfo: Prisma.DbNull,
        },
      });
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};

export const createSaleCancellationRequest = async (req: Request, res: Response) => {
  const { ticketId } = req.body;
  const reasonRaw = (req.body as any)?.reason ?? (req.body as any)?.requestReason;
  const user = (req as any).user;
  const role = normalizeRole(user?.role);
  const actorUserId = user?.userId ? String(user.userId) : '';

  if (role !== 'FIRM') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!canManageFirmWork(user)) {
    return res.status(403).json({ error: 'Only firm admins and managers can request sale cancellation' });
  }

  const ownFirmId = user?.firmId ? String(user.firmId) : '';
  if (!ownFirmId) {
    return res.status(400).json({ error: 'Firm account is missing firmId' });
  }

  if (!actorUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!ticketId || typeof ticketId !== 'string' || !ticketId.trim()) {
    return res.status(400).json({ error: 'ticketId is required' });
  }

  const reason = normalizeOptionalString(reasonRaw);
  if (!reason) {
    return res.status(400).json({ error: 'reason is required' });
  }
  if (reason.length > 500) {
    return res.status(400).json({ error: 'reason is too long (max 500 chars)' });
  }

  const resolvedTicketId = ticketId.trim();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const tickets: any[] = await tx.$queryRaw`
        SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
        FROM "Ticket"
        WHERE id = ${resolvedTicketId}
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];

      if (String(ticket.status || '') !== 'SOLD') throw new Error('Ticket is not sold');
      if (String(ticket.assignedFirmId || '') !== ownFirmId) throw new Error('Not your ticket');

      const existing = await tx.saleCancellationRequest.findFirst({
        where: { ticketId: resolvedTicketId, status: 'PENDING' },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) throw new Error('Cancellation request already pending for this ticket');

      const activeSegmentSales = await tx.ticketSale.findMany({
        where: {
          sellerFirmId: ownFirmId,
          status: 'CONFIRMED',
          items: { some: { status: 'CONFIRMED', ticketLeg: { ticketId: resolvedTicketId } } },
        },
        select: { id: true },
      });
      if (activeSegmentSales.length > 1) throw new Error('Bu bilet segmentlari alohida sotilgan. Har bir sotuvni saleId bo‘yicha alohida bekor qiling.');

      return tx.saleCancellationRequest.create({
        data: {
          flightId: String(ticket.flightId),
          ticketId: resolvedTicketId,
          firmId: ownFirmId,
          status: 'PENDING',
          reason,
          createdByUserId: actorUserId,
          ticketSaleId: activeSegmentSales[0]?.id || null,
        },
        select: {
          id: true,
          ticketId: true,
          status: true,
          reason: true,
          createdAt: true,
        },
      });
    });

    return res.json({ success: true, request: created });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};

export const listSaleCancellationRequests = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const role = normalizeRole(user?.role);

  if (!['SUPERADMIN', 'ADMIN', 'FIRM'].includes(role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const ownFirmId = user?.firmId ? String(user.firmId) : '';
  if (role === 'FIRM' && !ownFirmId) {
    return res.status(400).json({ error: 'Firm account is missing firmId' });
  }

  const { flightId, flight_id, status } = req.query as any;
  const resolvedFlightId = (flightId || flight_id) && typeof (flightId || flight_id) === 'string'
    ? String(flightId || flight_id).trim()
    : '';

  const rawStatus = typeof status === 'string' ? status.trim().toUpperCase() : 'PENDING';
  const resolvedStatus = ['PENDING', 'APPROVED', 'REJECTED'].includes(rawStatus) ? rawStatus : 'PENDING';

  const where: any = { status: resolvedStatus };
  if (resolvedFlightId) where.flightId = resolvedFlightId;
  if (role === 'FIRM') where.firmId = ownFirmId;
  if (role === 'ADMIN') where.firmId = { in: await getAccessibleFirmIds(user) || [] };

  const requests = await prisma.saleCancellationRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      flightId: true,
      ticketId: true,
      ticketSaleId: true,
      firmId: true,
      status: true,
      reason: true,
      decisionReason: true,
      createdAt: true,
      decidedAt: true,
      firm: { select: { id: true, name: true } },
      createdBy: { select: { id: true, email: true } },
      decidedBy: { select: { id: true, email: true } },
    },
  });

  return res.json(requests);
};

export const approveSaleCancellationRequest = async (req: Request, res: Response) => {
  const { requestId } = req.body as any;
  const decisionReasonRaw = (req.body as any)?.decisionReason ?? (req.body as any)?.reason;
  const user = (req as any).user;
  const role = normalizeRole(user?.role);
  const actorUserId = user?.userId ? String(user.userId) : '';

  if (!['SUPERADMIN', 'ADMIN'].includes(role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!actorUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!requestId || typeof requestId !== 'string' || !requestId.trim()) {
    return res.status(400).json({ error: 'requestId is required' });
  }

  const decisionReason = normalizeOptionalString(decisionReasonRaw);
  if (!decisionReason) {
    return res.status(400).json({ error: 'decisionReason is required' });
  }
  if (decisionReason.length > 500) {
    return res.status(400).json({ error: 'decisionReason is too long (max 500 chars)' });
  }

  const resolvedRequestId = requestId.trim();
  if (role === 'ADMIN') {
    const request = await prisma.saleCancellationRequest.findUnique({ where: { id: resolvedRequestId }, select: { firmId: true } });
    if (!request || !(await canAccessFirm(user, request.firmId))) return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const rows: any[] = await tx.$queryRaw`
        SELECT *
        FROM "SaleCancellationRequest"
        WHERE id = ${resolvedRequestId}
        FOR UPDATE
      `;

      if (rows.length === 0) throw new Error('Request not found');
      const reqRow = rows[0];

      if (String(reqRow.status || '') !== 'PENDING') throw new Error('Request is not pending');

      const ticketId = String(reqRow.ticketId || '');
      const firmId = String(reqRow.firmId || '');
      const firmReason = String(reqRow.reason || '');

      if (!ticketId) throw new Error('Invalid request: missing ticketId');
      if (!firmId) throw new Error('Invalid request: missing firmId');

      if (reqRow.ticketSaleId) {
        const segmentSale = await tx.ticketSale.findUnique({ where: { id: String(reqRow.ticketSaleId) } });
        if (!segmentSale || segmentSale.sellerFirmId !== firmId) throw new Error('Segment sale does not match request firm');
        await cancelLegSale(tx, { saleId: segmentSale.id, cancelledByUserId: actorUserId, reason: `${firmReason}; ${decisionReason}` });
        await tx.saleCancellationRequest.update({
          where: { id: resolvedRequestId },
          data: { status: 'APPROVED', decisionReason, decidedByUserId: actorUserId, decidedAt: new Date() },
        });
        return;
      }

      const tickets: any[] = await tx.$queryRaw`
        SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
        FROM "Ticket"
        WHERE id = ${ticketId}
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];

      if (String(ticket.status || '') !== 'SOLD') throw new Error('Ticket is not sold');
      if (String(ticket.assignedFirmId || '') !== firmId) throw new Error('Ticket is not assigned to the request firm');

      const sale = await tx.transaction.findFirst({
        where: {
          ticketId,
          type: 'SALE',
          deletedAt: null,
          baseAmount: { gt: new Prisma.Decimal(0) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!sale) throw new Error('Missing SALE transaction for ticket');

      if (String(sale.firmId) !== firmId) {
        throw new Error('SALE transaction firm does not match request firm');
      }

      const originalAmount = new Prisma.Decimal(String(sale.originalAmount)).mul(-1).toDecimalPlaces(4);
      const exchangeRate = new Prisma.Decimal(String(sale.exchangeRate)).toDecimalPlaces(6);
      const baseAmount = new Prisma.Decimal(String(sale.baseAmount)).mul(-1).toDecimalPlaces(4);

      await tx.transaction.create({
        data: {
          firmId,
          flightId: String(sale.flightId),
          ticketId,
          createdByUserId: actorUserId,
          type: 'SALE',
          originalAmount,
          currency: String(sale.currency),
          exchangeRate,
          baseAmount,
          metadata: {
            note: 'Sale cancelled after firm request, revenue reversed',
            reversedTransactionId: String(sale.id),
            saleCancellationRequestId: resolvedRequestId,
            firmReason,
            adminReason: decisionReason,
          } as any,
        },
      });

      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: 'ASSIGNED',
          soldPrice: null,
          soldCurrency: null,
          purchaserInfo: Prisma.DbNull,
        },
      });

      await tx.saleCancellationRequest.update({
        where: { id: resolvedRequestId },
        data: {
          status: 'APPROVED',
          decisionReason,
          decidedByUserId: actorUserId,
          decidedAt: new Date(),
        },
      });
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};
