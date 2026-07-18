import { Request, Response } from 'express';
import { Prisma, TicketProductType } from '@prisma/client';
import { prisma } from '../db';
import { canAccessFirm } from '../utils/access';
import { canManageFirmWork } from '../utils/firm-user-roles';
import { assertActiveKassaDesk, assertKassaDeskForFirmSelection } from '../utils/kassa-desk-policy';
import { createFirmNotification } from '../utils/notifications';
import { writeAuditLog } from '../utils/audit';
import { resolveExchangeRateToUzs } from '../services/currency-rates.service';
import { activeFlightWhere } from '../domains/flights/flight-scope';
import {
  normalizeCurrency,
  normalizeOptionalString,
  parseAllocationRows,
  parsePositiveDecimal,
  parsePositiveInt,
  parsePurchaserInfo,
  requiresAirlineConnectionForAllocation,
  requiresAllocationApproval,
  validateAllocationRejectionReason,
} from '../domains/tickets/ticket-input';
import {
  acceptLegAllocation,
  allocateLegInventory,
  cancelLegSale,
  normalizeTicketDirection,
  normalizeTicketProductType,
  rejectLegAllocation,
  sellLegInventory,
} from '../domains/tickets/ticket-leg-inventory';

const roleOf = (user: any) => String(user?.role || '').trim().toUpperCase();

async function resolveSourceFirm(user: any, flightId: string, requestedSourceFirmId: unknown) {
  const role = roleOf(user);
  const sourceFirmId = role === 'FIRM'
    ? normalizeOptionalString(user?.firmId)
    : normalizeOptionalString(requestedSourceFirmId);
  if (!sourceFirmId) throw new Error('sourceFirmId is required');
  if (role === 'FIRM' && (!canManageFirmWork(user) || sourceFirmId !== String(user.firmId || ''))) throw new Error('Forbidden');
  if (role === 'ADMIN' && !(await canAccessFirm(user, sourceFirmId))) throw new Error('Forbidden');
  if (!['FIRM', 'ADMIN', 'SUPERADMIN'].includes(role)) throw new Error('Forbidden');

  const [flight, sourceFirm] = await Promise.all([
    prisma.flight.findFirst({
      where: { id: flightId, AND: [activeFlightWhere()] },
      select: {
        id: true, flightNumber: true, tripType: true, currency: true, ownerFirmId: true,
        airline: { select: { id: true, name: true, firmId: true } },
        _count: { select: { ticketLegs: { where: { currentOwnerFirmId: sourceFirmId } } } },
      },
    }),
    prisma.firm.findUnique({ where: { id: sourceFirmId }, select: { id: true, name: true, kind: true } }),
  ]);
  if (!flight || !sourceFirm) throw new Error('Flight not found');
  const isAirlineOwner = flight.airline?.firmId === sourceFirmId;
  const isOriginOwner = flight.ownerFirmId === sourceFirmId || (!flight.ownerFirmId && flight.airline?.firmId === sourceFirmId);
  if (!isOriginOwner && flight._count.ticketLegs === 0) throw new Error('Flight not found');
  return { sourceFirmId, sourceFirm, flight, isAirlineOwner, isOriginOwner };
}

async function resolveTargetFirm(source: Awaited<ReturnType<typeof resolveSourceFirm>>, targetFirmId: string) {
  if (!targetFirmId || targetFirmId === source.sourceFirmId) throw new Error('Select a different firm for allocation');
  const target = await prisma.firm.findFirst({
    where: { id: targetFirmId, kind: { not: 'AIRLINE' }, status: 'ACTIVE', deletedAt: null },
    select: {
      id: true, name: true,
      _count: { select: { users: { where: { status: 'ACTIVE', deletedAt: null } }, userAccesses: { where: { user: { status: 'ACTIVE', deletedAt: null } } } } },
    },
  });
  if (!target) throw new Error('Firm not found');
  if (requiresAirlineConnectionForAllocation(source.isAirlineOwner) && source.flight.airline?.firmId) {
    const connection = await prisma.airlineFirmConnection.findFirst({
      where: { airlineFirmId: source.flight.airline.firmId, firmId: targetFirmId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!connection) throw new Error('Airline is not connected to this firm');
  }
  return target;
}

function productSelection(body: any, fallback: TicketProductType) {
  const productType = normalizeTicketProductType(body?.productType ?? body?.allocationType ?? body?.saleType, fallback);
  const direction = normalizeTicketDirection(body?.direction);
  if (productType === TicketProductType.ONE_WAY && !direction) throw new Error('ONE WAY uchun OUTBOUND yoki RETURN yo‘nalishini tanlang');
  return { productType, direction: productType === TicketProductType.ONE_WAY ? direction : undefined };
}

function allocationPriceRows(body: any, quantity: number) {
  const parsed = parseAllocationRows(body?.allocationRows);
  if (Array.isArray(body?.allocationRows) && body.allocationRows.length && parsed.length !== body.allocationRows.length) {
    throw new Error('Har bir narx qatorida musbat miqdor va narx bo‘lishi kerak');
  }
  const rows = parsed.length
    ? parsed.map((row) => ({ quantity: row.quantity, unitPrice: row.price }))
    : [{ quantity, unitPrice: parsePositiveDecimal(body?.allocationPrice ?? body?.price) }];
  if (rows.some((row) => !row.unitPrice) || rows.reduce((sum, row) => sum + row.quantity, 0) !== quantity) {
    throw new Error('Ajratma narxi va miqdori noto‘g‘ri');
  }
  return rows as Array<{ quantity: number; unitPrice: Prisma.Decimal }>;
}

export const allocateTicketLegs = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const body = req.body || {};
  const ticketId = normalizeOptionalString(body.ticketId);
  let flightId = normalizeOptionalString(body.flightId ?? body.flight_id);
  if (!flightId && ticketId) {
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { flightId: true } });
    flightId = ticket?.flightId;
  }
  const quantity = ticketId ? 1 : parsePositiveInt(body.quantity ?? body.count);
  const targetFirmId = normalizeOptionalString(body.firmId ?? body.toFirmId);
  if (!flightId || !quantity || !targetFirmId) return res.status(400).json({ error: 'flightId, firmId and positive quantity are required' });

  try {
    const source = await resolveSourceFirm(user, flightId, body.sourceFirmId);
    const target = await resolveTargetFirm(source, targetFirmId);
    const { productType, direction } = productSelection(body, source.flight.tripType);
    const priceRows = allocationPriceRows(body, quantity);
    const currency = normalizeCurrency(body.currency || source.flight.currency);
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('currency must be a 3-letter code');
    const approvalRequired = requiresAllocationApproval(target._count.users, target._count.userAccesses);
    const result = await prisma.$transaction(async (tx) => {
      const allocated = await allocateLegInventory(tx, {
        flightId, sourceFirmId: source.sourceFirmId, targetFirmId, productType, direction, quantity, ticketId,
        currency, priceRows, approvalRequired, createdByUserId: normalizeOptionalString(user?.userId), note: normalizeOptionalString(body.note),
      });
      await createFirmNotification(tx, targetFirmId, {
        title: approvalRequired ? 'Ticket allocation pending' : 'Ticket allocation accepted',
        body: `${source.flight.flightNumber}: ${quantity} ${productType === 'ROUND_TRIP' ? 'RT' : `OW ${direction}`} — ${allocated.totalAmount.toString()} ${currency}`,
        type: approvalRequired ? 'TICKET_ALLOCATION_PENDING' : 'TICKET_ALLOCATION_ACCEPTED',
        entityType: 'ticketAllocation', entityId: allocated.allocation.id,
        metadata: { allocationId: allocated.allocation.id, flightId, productType, direction, quantity, segmentCount: allocated.allocation.segmentCount },
      });
      await writeAuditLog(req, {
        action: approvalRequired ? 'TICKET_ALLOCATION_CREATED' : 'TICKET_ALLOCATION_AUTO_ACCEPTED',
        entityType: 'ticketAllocation', entityId: allocated.allocation.id, entityLabel: source.flight.flightNumber,
        summary: `${quantity} ${productType === 'ROUND_TRIP' ? 'RT' : `OW ${direction}`} ajratildi`,
        after: { status: allocated.allocation.status, fromFirmId: source.sourceFirmId, toFirmId: targetFirmId, quantity, productType, direction, totalAmount: allocated.totalAmount.toString(), currency },
      }, tx);
      return allocated;
    });
    return res.json({ success: true, count: quantity, segmentCount: result.allocation.segmentCount, allocationId: result.allocation.id, status: result.allocation.status, approvalRequired, totalAmount: result.totalAmount.toString(), currency, productType, direction: direction || null });
  } catch (error: any) {
    return res.status(error?.message === 'Forbidden' ? 403 : 400).json({ error: error?.message || 'Allocation failed' });
  }
};

export const confirmTicketLegAllocation = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const allocationId = normalizeOptionalString(req.body?.allocationId);
  if (!allocationId) return res.status(400).json({ error: 'allocationId is required' });
  try {
    const allocation = await prisma.ticketAllocation.findUnique({ where: { id: allocationId }, include: { fromFirm: { select: { kind: true } } } });
    if (!allocation) return res.status(404).json({ error: 'Allocation not found' });
    const role = roleOf(user);
    const mayAct = role === 'SUPERADMIN'
      || (role === 'FIRM' && canManageFirmWork(user) && String(user?.firmId || '') === allocation.toFirmId)
      || (role === 'ADMIN' && await canAccessFirm(user, allocation.toFirmId));
    if (!mayAct) return res.status(403).json({ error: 'Forbidden' });
    const result = await prisma.$transaction(async (tx) => {
      const accepted = await acceptLegAllocation(tx, { allocationId, acceptedByUserId: normalizeOptionalString(user?.userId) });
      await createFirmNotification(tx, allocation.fromFirmId, {
        title: 'Ajratma tasdiqlandi', body: `${allocation.parentTicketCount} ta ${allocation.productType === 'ROUND_TRIP' ? 'RT' : `OW ${allocation.direction}`} tasdiqlandi.`,
        type: 'TICKET_ALLOCATION_ACCEPTED', entityType: 'ticketAllocation', entityId: allocation.id,
        metadata: { allocationId, flightId: allocation.flightId, productType: allocation.productType, direction: allocation.direction, quantity: allocation.parentTicketCount },
      });
      await writeAuditLog(req, { action: 'TICKET_ALLOCATION_ACCEPTED', entityType: 'ticketAllocation', entityId: allocation.id, summary: 'Segment ajratmasi tasdiqlandi', before: { status: 'PENDING' }, after: { status: 'ACCEPTED' } }, tx);
      return accepted;
    });
    return res.json({ success: true, allocationId, count: result.allocation.parentTicketCount, segmentCount: result.allocation.segmentCount, status: 'ACCEPTED' });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Failed to confirm allocation' });
  }
};

export const rejectTicketLegAllocation = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const allocationId = normalizeOptionalString(req.body?.allocationId);
  if (!allocationId) return res.status(400).json({ error: 'allocationId is required' });
  try {
    const reason = validateAllocationRejectionReason(req.body?.rejectionReason ?? req.body?.reason);
    const allocation = await prisma.ticketAllocation.findUnique({ where: { id: allocationId } });
    if (!allocation) return res.status(404).json({ error: 'Allocation not found' });
    const role = roleOf(user);
    const mayAct = role === 'SUPERADMIN'
      || (role === 'FIRM' && canManageFirmWork(user) && String(user?.firmId || '') === allocation.toFirmId)
      || (role === 'ADMIN' && await canAccessFirm(user, allocation.toFirmId));
    if (!mayAct) return res.status(403).json({ error: 'Forbidden' });
    const result = await prisma.$transaction(async (tx) => {
      const rejected = await rejectLegAllocation(tx, { allocationId, reason, rejectedByUserId: normalizeOptionalString(user?.userId) });
      await createFirmNotification(tx, allocation.fromFirmId, { title: 'Chipta ajratmasi rad etildi', body: reason, type: 'TICKET_ALLOCATION_REJECTED', entityType: 'ticketAllocation', entityId: allocationId, metadata: { allocationId, reason } });
      await writeAuditLog(req, { action: 'TICKET_ALLOCATION_REJECTED', entityType: 'ticketAllocation', entityId: allocationId, summary: 'Segment ajratmasi rad etildi', before: { status: 'PENDING' }, after: { status: 'REJECTED', reason } }, tx);
      return rejected;
    });
    return res.json({ success: true, allocationId, status: result.status });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Failed to reject allocation' });
  }
};

async function resolveSaleDesk(user: any, firmId: string, rawDeskId: unknown) {
  const deskId = normalizeOptionalString(rawDeskId);
  const activeDeskCount = await prisma.kassaDesk.count({ where: { firmId, status: 'ACTIVE', deletedAt: null } });
  const desk = deskId ? await prisma.kassaDesk.findUnique({ where: { id: deskId }, select: { id: true, firmId: true, status: true, deletedAt: true } }) : null;
  if (desk) assertActiveKassaDesk(desk);
  assertKassaDeskForFirmSelection(desk, firmId, activeDeskCount);
  return desk;
}

export const sellTicketLegs = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const body = req.body || {};
  const role = roleOf(user);
  if (!['FIRM', 'ADMIN', 'SUPERADMIN'].includes(role) || (role === 'FIRM' && !canManageFirmWork(user))) return res.status(403).json({ error: 'Forbidden' });
  const ticketId = normalizeOptionalString(body.ticketId);
  let flightId = normalizeOptionalString(body.flightId ?? body.flight_id);
  if (!flightId && ticketId) flightId = (await prisma.ticket.findUnique({ where: { id: ticketId }, select: { flightId: true } }))?.flightId;
  const quantity = ticketId ? 1 : parsePositiveInt(body.quantity ?? body.count);
  if (!flightId || !quantity) return res.status(400).json({ error: 'flightId and positive quantity are required' });
  try {
    const source = await resolveSourceFirm(user, flightId, body.firmId ?? body.sourceFirmId);
    const { productType, direction } = productSelection(body, source.flight.tripType);
    const unitPrice = parsePositiveDecimal(body.salePrice);
    const currency = normalizeCurrency(body.saleCurrency || source.flight.currency);
    if (!unitPrice || !['USD', 'UZS'].includes(currency)) throw new Error('salePrice and USD/UZS saleCurrency are required');
    const purchaserInfo = parsePurchaserInfo(body.purchaser ?? body.purchaserInfo);
    if (!purchaserInfo) throw new Error('purchaser info is required (name and idNumber)');
    const [exchangeRate, desk] = await Promise.all([
      resolveExchangeRateToUzs(user, { currency, overrideRate: body.exchangeRate, rateFirmId: source.sourceFirmId }),
      resolveSaleDesk(user, source.sourceFirmId, body.kassaDeskId),
    ]);
    const result = await prisma.$transaction(async (tx) => {
      const sold = await sellLegInventory(tx, {
        flightId, sellerFirmId: source.sourceFirmId, productType, direction, quantity, ticketId,
        unitPrice, currency, purchaserInfo, createdByUserId: normalizeOptionalString(user?.userId), kassaDeskId: desk?.id, exchangeRate,
      });
      await writeAuditLog(req, {
        action: 'TICKET_SEGMENTS_SOLD', entityType: 'ticketSale', entityId: sold.sale.id, entityLabel: source.flight.flightNumber,
        summary: `${quantity} ${productType === 'ROUND_TRIP' ? 'RT' : `OW ${direction}`} sotildi`,
        after: { flightId, sellerFirmId: source.sourceFirmId, productType, direction, quantity, segmentCount: sold.segmentCount, totalAmount: sold.sale.totalAmount.toString(), currency },
      }, tx);
      return sold;
    });
    return res.json({ success: true, saleId: result.sale.id, transactionId: result.transaction.id, count: result.count, segmentCount: result.segmentCount, productType, direction: direction || null });
  } catch (error: any) {
    return res.status(error?.message === 'Forbidden' ? 403 : 400).json({ error: error?.message || 'Sale failed' });
  }
};

export const cancelTicketLegSale = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const role = roleOf(user);
  const saleId = normalizeOptionalString(req.body?.saleId);
  const reason = normalizeOptionalString(req.body?.reason);
  if (!saleId || !reason || reason.length < 5) return res.status(400).json({ error: 'saleId and cancellation reason are required' });
  if (!['SUPERADMIN', 'ADMIN'].includes(role)) return res.status(403).json({ error: 'Direct cancellation requires platform approval' });
  const sale = await prisma.ticketSale.findUnique({ where: { id: saleId }, select: { sellerFirmId: true } });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (role === 'ADMIN' && !(await canAccessFirm(user, sale.sellerFirmId))) return res.status(403).json({ error: 'Forbidden' });
  try {
    await prisma.$transaction(async (tx) => {
      await cancelLegSale(tx, { saleId, reason, cancelledByUserId: normalizeOptionalString(user?.userId) });
      await writeAuditLog(req, { action: 'TICKET_SEGMENT_SALE_CANCELLED', entityType: 'ticketSale', entityId: saleId, summary: 'RT/OW sotuv bekor qilindi', after: { status: 'CANCELLED', reason } }, tx);
    });
    return res.json({ success: true, saleId, status: 'CANCELLED' });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Cancellation failed' });
  }
};
