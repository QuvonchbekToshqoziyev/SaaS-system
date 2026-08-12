import { Request, Response } from 'express';
import { Prisma, TicketLegDirection, TicketLegStatus, TicketProductType } from '@prisma/client';
import { prisma } from '../db';
import { canAccessFirm, getAccessibleFirmIds, getRelatedFirmIds } from '../utils/access';
import { writeAuditLog } from '../utils/audit';
import { canManageFirmWork } from '../utils/firm-user-roles';
import { resolveExchangeRateToUzs } from '../services/currency-rates.service';
import { calculateTourCosts, conversionMultiplier, parseTourServices } from '../domains/tours/tour-cost';
import { normalizeTicketDirection, normalizeTicketProductType, syncParentTickets } from '../domains/tickets/ticket-leg-inventory';
import { activeFlightWhere, firmFlightParticipationWhere } from '../domains/flights/flight-scope';
import { calculateTourSaleFinancials, canApproveFullTourDiscount, validateTourSaleNote } from '../domains/tours/tour-sale';

type AuthUser = { userId?: string; role?: string; firmId?: string | null; firmRole?: string | null };
const auth = (req: Request) => ((req as any).user || {}) as AuthUser;
const role = (req: Request) => String(auth(req).role || '').toUpperCase();
const currency = (value: unknown) => String(value || '').trim().toUpperCase();
const integer = (value: unknown) => Math.floor(Number(value || 0));

const packageInclude = {
  ownerFirm: { select: { id: true, name: true } },
  flight: { select: { id: true, flightNumber: true, route: true, tripType: true, departure: true, arrival: true, returnDeparture: true, returnArrival: true, currency: true } },
  components: { include: { service: { include: { providerFirm: { select: { id: true, name: true } } } } }, orderBy: { createdAt: 'asc' as const } },
  sales: { where: { status: 'CONFIRMED', deletedAt: null }, include: { buyerFirm: { select: { id: true, name: true } }, sellerFirm: { select: { id: true, name: true } }, transaction: { include: { createdBy: { select: { id: true, fullName: true, email: true } }, kassaDesk: { select: { id: true, name: true, code: true } } } } }, orderBy: { createdAt: 'desc' as const } },
};

export const firmTourVisibilityWhere = (firmId: string): Prisma.TourPackageWhereInput => ({
  OR: [
    { ownerFirmId: firmId },
    { sales: { some: { buyerFirmId: firmId, status: 'CONFIRMED', deletedAt: null } } },
  ],
});

function fail(message: string, status = 400): never {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  throw error;
}

function sendError(res: Response, error: any, fallback: string) {
  return res.status(Number(error?.status || 400)).json({ error: error?.message || fallback });
}

async function assertOwnerOrSuperadmin(req: Request, ownerFirmId: string, reason?: string) {
  const user = auth(req);
  if (role(req) === 'SUPERADMIN') {
    if (!String(reason || '').trim()) fail('Superadmin tuzatishi uchun sabab kiritilishi shart.');
    return;
  }
  if (role(req) !== 'FIRM' || user.firmId !== ownerFirmId || !canManageFirmWork(user)) fail('Bu amal faqat firma admini yoki manager uchun ruxsat etilgan.', 403);
}

function crossRate(source: string, target: string, raw: unknown): Prisma.Decimal {
  if (source === target) return new Prisma.Decimal(1);
  const supplied = new Prisma.Decimal(String(raw || 0));
  if (!supplied.gt(0)) fail(`${source} dan ${target} ga konvertatsiya qilish uchun valyuta kursini kiriting.`);
  return new Prisma.Decimal(conversionMultiplier(source, target, supplied.toNumber()));
}

async function reserveTickets(tx: Prisma.TransactionClient, input: {
  flightId: string; firmId: string; count: number; tourId: string; rawRate: unknown; packageCurrency: string;
  productType: TicketProductType; direction?: TicketLegDirection;
}) {
  let ticketIds: string[] = [];
  let legIds: string[] = [];
  if (input.productType === TicketProductType.ROUND_TRIP) {
    const rows = await tx.$queryRaw<Array<{ ticketId: string }>>(Prisma.sql`
      SELECT ticket.id AS "ticketId" FROM "Ticket" ticket
      JOIN "TicketLeg" outbound ON outbound."ticketId" = ticket.id AND outbound.direction = 'OUTBOUND'
      JOIN "TicketLeg" return_leg ON return_leg."ticketId" = ticket.id AND return_leg.direction = 'RETURN'
      WHERE ticket."flightId" = ${input.flightId} AND ticket."deletedAt" IS NULL
        AND outbound."currentOwnerFirmId" = ${input.firmId} AND return_leg."currentOwnerFirmId" = ${input.firmId}
        AND outbound.status IN ('AVAILABLE', 'ASSIGNED') AND return_leg.status IN ('AVAILABLE', 'ASSIGNED')
      ORDER BY ticket."createdAt" ASC FOR UPDATE OF outbound, return_leg SKIP LOCKED LIMIT ${input.count}
    `);
    ticketIds = rows.map((row) => row.ticketId);
    if (ticketIds.length === input.count) {
      legIds = (await tx.ticketLeg.findMany({ where: { ticketId: { in: ticketIds }, direction: { in: ['OUTBOUND', 'RETURN'] } }, select: { id: true } })).map((leg) => leg.id);
    }
  } else {
    if (!input.direction) fail('OW tur bileti uchun OUTBOUND yoki RETURN yo‘nalishini tanlang.');
    const rows = await tx.$queryRaw<Array<{ id: string; ticketId: string }>>(Prisma.sql`
      SELECT leg.id, leg."ticketId" FROM "TicketLeg" leg
      JOIN "Ticket" ticket ON ticket.id = leg."ticketId"
      WHERE leg."flightId" = ${input.flightId} AND leg."currentOwnerFirmId" = ${input.firmId}
        AND leg.direction = ${input.direction}::"TicketLegDirection" AND leg.status IN ('AVAILABLE', 'ASSIGNED')
        AND ticket."deletedAt" IS NULL
      ORDER BY ticket."createdAt" ASC FOR UPDATE OF leg SKIP LOCKED LIMIT ${input.count}
    `);
    ticketIds = rows.map((row) => row.ticketId);
    legIds = rows.map((row) => row.id);
  }
  if (ticketIds.length !== input.count) fail(`Bilet inventari yetarli emas: ${input.count} ta ${input.productType === 'ROUND_TRIP' ? 'RT' : `OW ${input.direction}`} kerak, ${ticketIds.length} ta mavjud.`);
  const rows = await tx.ticketLeg.findMany({ where: { id: { in: legIds } }, select: { id: true, acquisitionCostSnapshot: true, currencySnapshot: true } });
  const currencies = new Set(rows.map((leg) => currency(leg.currencySnapshot)));
  if (currencies.size > 1) fail('Tanlangan segmentlar tannarx valyutalari turlicha. Avval inventarni to‘g‘rilang.');
  const sourceCurrency = currency(rows[0]?.currencySnapshot || input.packageCurrency);
  const multiplier = crossRate(sourceCurrency, input.packageCurrency, input.rawRate);
  const originalTotal = rows.reduce((sum, leg) => sum.add(leg.acquisitionCostSnapshot), new Prisma.Decimal(0));
  const total = originalTotal.mul(multiplier).toDecimalPlaces(4);
  const changed = await tx.ticketLeg.updateMany({ where: { id: { in: legIds }, status: { in: [TicketLegStatus.AVAILABLE, TicketLegStatus.ASSIGNED] } }, data: { status: TicketLegStatus.RESERVED_FOR_TOUR, tourPackageId: input.tourId } });
  if (changed.count !== legIds.length) fail('Bilet segmentlari bir vaqtda boshqa amal tomonidan o‘zgartirildi. Qayta urinib ko‘ring.');
  await syncParentTickets(tx, ticketIds);
  return { ids: ticketIds, legIds, sourceCurrency, multiplier, originalTotal, total };
}

async function releaseTourLegs(tx: Prisma.TransactionClient, tourId: string, legIds?: string[]) {
  const legs = await tx.ticketLeg.findMany({
    where: { tourPackageId: tourId, status: TicketLegStatus.RESERVED_FOR_TOUR, ...(legIds ? { id: { in: legIds } } : {}) },
    include: { ticket: { select: { originalOwnerFirmId: true } } },
  });
  for (const leg of legs) {
    await tx.ticketLeg.update({
      where: { id: leg.id },
      data: {
        status: leg.currentOwnerFirmId === leg.ticket.originalOwnerFirmId ? TicketLegStatus.AVAILABLE : TicketLegStatus.ASSIGNED,
        tourPackageId: null,
      },
    });
  }
  await syncParentTickets(tx, legs.map((leg) => leg.ticketId));
  return legs;
}

type SaleLeg = { id: string; ticketId: string; direction: TicketLegDirection };

export function selectTourSaleLegs(legs: SaleLeg[], input: { productType: TicketProductType; ticketDirection?: TicketLegDirection | null; parentTicketCount: number }) {
  if (input.productType === TicketProductType.ONE_WAY) {
    const selected = legs.filter((leg) => !input.ticketDirection || leg.direction === input.ticketDirection).slice(0, input.parentTicketCount);
    if (selected.length !== input.parentTicketCount) fail('Tur uchun kerakli OW biletlar yetarli emas.');
    return selected;
  }
  const byTicket = new Map<string, SaleLeg[]>();
  legs.forEach((leg) => byTicket.set(leg.ticketId, [...(byTicket.get(leg.ticketId) || []), leg]));
  const ticketIds = Array.from(byTicket.entries())
    .filter(([, ticketLegs]) => ticketLegs.some((leg) => leg.direction === TicketLegDirection.OUTBOUND) && ticketLegs.some((leg) => leg.direction === TicketLegDirection.RETURN))
    .slice(0, input.parentTicketCount)
    .map(([ticketId]) => ticketId);
  if (ticketIds.length !== input.parentTicketCount) fail('Tur uchun kerakli to‘liq RT biletlar yetarli emas.');
  return legs.filter((leg) => ticketIds.includes(leg.ticketId));
}

function transactionLegIds(transaction: { metadata: unknown } | null | undefined) {
  const metadata = transaction?.metadata && typeof transaction.metadata === 'object' && !Array.isArray(transaction.metadata)
    ? transaction.metadata as Record<string, unknown>
    : {};
  return Array.isArray(metadata.ticketLegIds) ? metadata.ticketLegIds.map(String).filter(Boolean) : [];
}

async function loadAndValidateServices(tx: Prisma.TransactionClient, firmId: string, flightId: string, packageCurrency: string, quantity: number, rawServices: unknown) {
  const selected = parseTourServices(rawServices);
  const ids = selected.map((row) => row.serviceId);
  const offerings = ids.length ? await tx.serviceOffering.findMany({
    where: { id: { in: ids }, ownerFirmId: firmId, status: 'ACTIVE', deletedAt: null },
    include: { providerFirm: { select: { id: true, name: true } } },
  }) : [];
  if (offerings.length !== ids.length) fail('Tanlangan xizmat topilmadi yoki undan foydalanish huquqi yo‘q.');
  const byId = new Map(offerings.map((service) => [service.id, service]));
  return selected.map((row) => {
    const service = byId.get(row.serviceId)!;
    if (service.flightId && service.flightId !== flightId) fail(`${service.name} boshqa reysga biriktirilgan.`);
    const unitCost = new Prisma.Decimal(service.unitPrice);
    if (!unitCost.gt(0)) fail('Tanlangan xizmat uchun bir dona tannarx kiritilmagan.');
    const required = quantity * row.quantityPerTour;
    if (service.availableQuantity < required) fail(`${service.name}: ${required} ta kerak, ${service.availableQuantity} ta mavjud.`);
    const sourceCurrency = currency(service.currency);
    const multiplier = crossRate(sourceCurrency, packageCurrency, row.exchangeRate);
    const costPerTour = unitCost.mul(row.quantityPerTour).mul(multiplier).toDecimalPlaces(4);
    return { row, service, required, unitCost, sourceCurrency, multiplier, costPerTour, totalCost: costPerTour.mul(quantity).toDecimalPlaces(4) };
  });
}

export const listTourPackages = async (req: Request, res: Response) => {
  const user = auth(req);
  const userRole = role(req);
  const status = String(req.query.status || 'ACTIVE').trim().toUpperCase();
  const where: Prisma.TourPackageWhereInput = { status: { not: 'DELETED' } };
  if (status !== 'ALL') where.status = status;
  if (userRole === 'FIRM') {
    if (!user.firmId) return res.status(400).json({ error: 'Firm account is missing firmId' });
    where.AND = [firmTourVisibilityWhere(user.firmId)];
  } else if (userRole === 'ADMIN') {
    const firmIds = await getAccessibleFirmIds(user);
    where.ownerFirmId = { in: firmIds };
  }
  return res.json(await prisma.tourPackage.findMany({ where, include: packageInclude, orderBy: { createdAt: 'desc' } }));
};

export const listTourServices = async (req: Request, res: Response) => {
  const user = auth(req);
  if (role(req) !== 'FIRM' || !user.firmId) return res.status(403).json({ error: 'Faqat firma foydalanuvchisi xizmat inventarini ko‘radi.' });
  return res.json(await prisma.serviceOffering.findMany({
    where: { ownerFirmId: user.firmId, status: 'ACTIVE', deletedAt: null },
    include: { providerFirm: { select: { id: true, name: true } } }, orderBy: { name: 'asc' },
  }));
};

export const listTourFlights = async (req: Request, res: Response) => {
  const user = auth(req);
  if (role(req) !== 'FIRM' || !user.firmId) return res.status(403).json({ error: 'Faqat firma foydalanuvchisi tur reyslarini ko‘radi.' });
  const flights = await prisma.flight.findMany({
    where: {
      AND: [activeFlightWhere(), { OR: [
        { ticketLegs: { some: { currentOwnerFirmId: user.firmId, status: { in: [TicketLegStatus.AVAILABLE, TicketLegStatus.ASSIGNED] } } } },
        { tourPackages: { some: { ownerFirmId: user.firmId, deletedAt: null } } },
      ] }],
    },
    select: {
      id: true, flightNumber: true, route: true, tripType: true, departure: true, arrival: true,
      returnDeparture: true, returnArrival: true, currency: true,
      ticketLegs: {
        where: { currentOwnerFirmId: user.firmId, status: { in: [TicketLegStatus.AVAILABLE, TicketLegStatus.ASSIGNED] } },
        select: { ticketId: true, direction: true, acquisitionCostSnapshot: true, currencySnapshot: true },
      },
    },
    orderBy: { departure: 'asc' },
  });
  return res.json(flights.map(({ ticketLegs, ...flight }) => {
    const byTicket = new Map<string, Set<string>>();
    ticketLegs.forEach((leg) => byTicket.set(leg.ticketId, new Set([...(byTicket.get(leg.ticketId) || []), leg.direction])));
    return {
      ...flight,
      availableTicketCount: byTicket.size,
      availableRoundTripCount: Array.from(byTicket.values()).filter((directions) => directions.has('OUTBOUND') && directions.has('RETURN')).length,
      availableOutboundCount: ticketLegs.filter((leg) => leg.direction === 'OUTBOUND').length,
      availableReturnCount: ticketLegs.filter((leg) => leg.direction === 'RETURN').length,
      ticketCurrency: ticketLegs[0]?.currencySnapshot || flight.currency,
    };
  }));
};

export const createTourPackage = async (req: Request, res: Response) => {
  const user = auth(req);
  if (role(req) !== 'FIRM' || !user.firmId || !canManageFirmWork(user)) return res.status(403).json({ error: 'Tur paketini faqat firma admini yoki manager yaratadi.' });
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const flightId = String(body.flightId || '').trim();
  const tourQuantity = integer(body.quantity);
  const ticketsPerTour = integer(body.ticketsPerTour || 1);
  const packageCurrency = currency(body.currency || 'UZS');
  if (!name || !flightId || tourQuantity <= 0 || ticketsPerTour <= 0) return res.status(400).json({ error: 'Tur nomi, reys va musbat miqdorlar kiritilishi shart.' });
  if (!['UZS', 'USD'].includes(packageCurrency)) return res.status(400).json({ error: 'Valyuta UZS yoki USD bo‘lishi kerak.' });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const flight = await tx.flight.findFirst({ where: { id: flightId, AND: [activeFlightWhere(), firmFlightParticipationWhere([user.firmId!])] }, select: { id: true, route: true, tripType: true } });
      if (!flight) fail('Faol reys topilmadi.', 404);
      const ticketProductType = normalizeTicketProductType(body.ticketProductType ?? body.ticketType, flight.tripType);
      const ticketDirection = ticketProductType === TicketProductType.ONE_WAY ? normalizeTicketDirection(body.ticketDirection ?? body.direction) : undefined;
      if (ticketProductType === TicketProductType.ONE_WAY && !ticketDirection) fail('OW tur bileti uchun OUTBOUND yoki RETURN yo‘nalishini tanlang.');
      const services = await loadAndValidateServices(tx, user.firmId!, flightId, packageCurrency, tourQuantity, body.services);
      const created = await tx.tourPackage.create({ data: {
        ownerFirmId: user.firmId!, flightId, name, destination: String(body.destination || '').trim() || flight.route,
        quantity: tourQuantity, availableQuantity: tourQuantity, soldQuantity: 0, ticketsPerTour,
        ticketProductType, ticketDirection,
        unitPrice: 0, ticketPrice: 0, servicePrice: 0, totalCost: 0, currency: packageCurrency,
        notes: String(body.notes || '').trim() || undefined, createdByUserId: user.userId,
      } });
      const tickets = await reserveTickets(tx, { flightId, firmId: user.firmId!, count: tourQuantity * ticketsPerTour, tourId: created.id, rawRate: body.ticketExchangeRate, packageCurrency, productType: ticketProductType, direction: ticketDirection });
      const ticketCostPerTour = tickets.total.div(tourQuantity).toDecimalPlaces(4);
      await tx.tourComponent.create({ data: {
        tourId: created.id, componentType: 'TICKET', ticketProductType, ticketDirection, segmentCount: tickets.legIds.length,
        quantityPerTour: ticketsPerTour, totalReservedQuantity: tickets.ids.length,
        unitCostSnapshot: tickets.originalTotal.div(tickets.ids.length).toDecimalPlaces(4), originalCurrency: tickets.sourceCurrency,
        currencySnapshot: packageCurrency, exchangeRateSnapshot: tickets.multiplier, costPerTourSnapshot: ticketCostPerTour, totalCostSnapshot: tickets.total,
      } });
      for (const item of services) {
        const reserved = await tx.serviceOffering.updateMany({ where: { id: item.service.id, availableQuantity: { gte: item.required } }, data: { availableQuantity: { decrement: item.required }, reservedQuantity: { increment: item.required } } });
        if (reserved.count !== 1) fail(`${item.service.name} inventari bir vaqtda o‘zgardi. Qayta urinib ko‘ring.`);
        await tx.tourComponent.create({ data: {
          tourId: created.id, componentType: 'SERVICE', serviceId: item.service.id, quantityPerTour: item.row.quantityPerTour,
          totalReservedQuantity: item.required, unitCostSnapshot: item.unitCost, originalCurrency: item.sourceCurrency,
          currencySnapshot: packageCurrency, exchangeRateSnapshot: item.multiplier, costPerTourSnapshot: item.costPerTour, totalCostSnapshot: item.totalCost,
        } });
      }
      const costs = calculateTourCosts(ticketCostPerTour.toNumber(), services.map((item) => item.costPerTour.toNumber()), tourQuantity);
      const finalRow = await tx.tourPackage.update({ where: { id: created.id }, data: {
        ticketPrice: ticketCostPerTour, servicePrice: costs.serviceCostPerTour, unitPrice: costs.unitTourCost, totalCost: costs.totalTourCost,
      }, include: packageInclude });
      await writeAuditLog(req, { action: 'TOUR_CREATED', entityType: 'tourPackage', entityId: created.id, entityLabel: name, summary: `Tur paketi yaratildi: ${name}`, after: finalRow, metadata: { affectedTicketIds: tickets.ids, affectedTicketLegIds: tickets.legIds, ticketProductType, ticketDirection, affectedServiceIds: services.map((item) => item.service.id) } }, tx);
      await writeAuditLog(req, { action: 'TOUR_COMPONENT_ADDED', entityType: 'tourPackage', entityId: created.id, summary: `Tur komponentlari qo‘shildi: ${name}`, after: finalRow.components, metadata: { affectedTicketIds: tickets.ids, affectedServiceIds: services.map((item) => item.service.id) } }, tx);
      await writeAuditLog(req, { action: 'TOUR_COST_RECALCULATED', entityType: 'tourPackage', entityId: created.id, summary: `Tur tannarxi hisoblandi: ${name}`, after: { unitCost: costs.unitTourCost, totalCost: costs.totalTourCost } }, tx);
      return finalRow;
    });
    return res.status(201).json(result);
  } catch (error) { return sendError(res, error, 'Tur paketini yaratib bo‘lmadi.'); }
};

export const updateTourPackage = async (req: Request, res: Response) => {
  const id = String(req.params.id || '');
  const body = req.body || {};
  try {
    const existing = await prisma.tourPackage.findUnique({ where: { id }, include: { components: true } });
    if (!existing || existing.deletedAt) fail('Tur paketi topilmadi.', 404);
    await assertOwnerOrSuperadmin(req, existing.ownerFirmId, body.reason);
    if (existing.soldQuantity > 0) {
      const forbidden = ['flightId', 'quantity', 'ticketsPerTour', 'ticketProductType', 'ticketDirection', 'services', 'currency'].some((key) => body[key] !== undefined);
      if (forbidden) fail('Ushbu tur paketidan sotuv amalga oshirilgan. Reys, miqdor va komponentlarni o‘zgartirish mumkin emas.');
      const updated = await prisma.tourPackage.update({ where: { id }, data: { name: String(body.name || existing.name).trim(), notes: body.notes === undefined ? existing.notes : String(body.notes || '').trim() || null, status: body.status || existing.status }, include: packageInclude });
      await writeAuditLog(req, { action: 'TOUR_UPDATED', entityType: 'tourPackage', entityId: id, summary: `Sotilgan tur metama’lumoti yangilandi: ${updated.name}`, before: existing, after: updated, metadata: { reason: body.reason } });
      return res.json(updated);
    }
    const flightId = String(body.flightId || existing.flightId || '');
    const tourQuantity = integer(body.quantity ?? existing.quantity);
    const ticketsPerTour = integer(body.ticketsPerTour ?? existing.ticketsPerTour);
    const packageCurrency = currency(body.currency || existing.currency);
    if (!flightId || tourQuantity <= 0 || ticketsPerTour <= 0 || !['UZS', 'USD'].includes(packageCurrency)) fail('Reys, miqdor va valyutani tekshiring.');
    const updated = await prisma.$transaction(async (tx) => {
      const flight = await tx.flight.findFirst({ where: { id: flightId, AND: [activeFlightWhere(), firmFlightParticipationWhere([existing.ownerFirmId])] }, select: { route: true, tripType: true } });
      if (!flight) fail('Faol reys topilmadi.', 404);
      const ticketProductType = normalizeTicketProductType(body.ticketProductType ?? body.ticketType, existing.ticketProductType || flight.tripType);
      const ticketDirection = ticketProductType === TicketProductType.ONE_WAY
        ? normalizeTicketDirection(body.ticketDirection ?? body.direction ?? existing.ticketDirection)
        : undefined;
      if (ticketProductType === TicketProductType.ONE_WAY && !ticketDirection) fail('OW tur bileti uchun OUTBOUND yoki RETURN yo‘nalishini tanlang.');
      const selected = parseTourServices(body.services);
      const serviceIds = selected.map((row) => row.serviceId);
      const offerings = serviceIds.length ? await tx.serviceOffering.findMany({ where: { id: { in: serviceIds }, ownerFirmId: existing.ownerFirmId, status: 'ACTIVE', deletedAt: null } }) : [];
      if (offerings.length !== serviceIds.length) fail('Tanlangan xizmat topilmadi yoki ruxsat yo‘q.');
      const oldServiceComponents = existing.components.filter((component) => component.componentType === 'SERVICE');
      const oldByService = new Map(oldServiceComponents.map((component) => [component.serviceId!, component]));
      const prepared = selected.map((row) => {
        const service = offerings.find((item) => item.id === row.serviceId)!;
        if (service.flightId && service.flightId !== flightId) fail(`${service.name} boshqa reysga tegishli.`);
        const unitCost = new Prisma.Decimal(service.unitPrice);
        if (!unitCost.gt(0)) fail('Tanlangan xizmat uchun bir dona tannarx kiritilmagan.');
        const required = tourQuantity * row.quantityPerTour;
        const oldReserved = oldByService.get(service.id)?.totalReservedQuantity || 0;
        if (service.availableQuantity + oldReserved < required) fail(`${service.name}: inventar yetarli emas.`);
        const multiplier = crossRate(currency(service.currency), packageCurrency, row.exchangeRate);
        const perTour = unitCost.mul(row.quantityPerTour).mul(multiplier).toDecimalPlaces(4);
        return { row, service, required, oldReserved, unitCost, multiplier, perTour, total: perTour.mul(tourQuantity).toDecimalPlaces(4) };
      });
      const neededTickets = tourQuantity * ticketsPerTour;
      const oldLegs = await tx.ticketLeg.findMany({
        where: { tourPackageId: id, status: TicketLegStatus.RESERVED_FOR_TOUR },
        orderBy: { createdAt: 'asc' },
        select: { id: true, ticketId: true, direction: true },
      });
      const oldUnits = existing.ticketProductType === TicketProductType.ROUND_TRIP
        ? Array.from(new Set(oldLegs.map((leg) => leg.ticketId))).length
        : oldLegs.length;
      const configurationChanged = flightId !== existing.flightId
        || ticketProductType !== existing.ticketProductType
        || ticketDirection !== (existing.ticketDirection || undefined);
      if (configurationChanged) {
        await reserveTickets(tx, { flightId, firmId: existing.ownerFirmId, count: neededTickets, tourId: id, rawRate: body.ticketExchangeRate, packageCurrency, productType: ticketProductType, direction: ticketDirection });
        await releaseTourLegs(tx, id, oldLegs.map((leg) => leg.id));
      } else if (neededTickets > oldUnits) {
        await reserveTickets(tx, { flightId, firmId: existing.ownerFirmId, count: neededTickets - oldUnits, tourId: id, rawRate: body.ticketExchangeRate, packageCurrency, productType: ticketProductType, direction: ticketDirection });
      } else if (neededTickets < oldUnits) {
        const releaseLegIds = ticketProductType === TicketProductType.ROUND_TRIP
          ? (() => {
              const releaseTicketIds = Array.from(new Set(oldLegs.map((leg) => leg.ticketId))).slice(neededTickets);
              return oldLegs.filter((leg) => releaseTicketIds.includes(leg.ticketId)).map((leg) => leg.id);
            })()
          : oldLegs.slice(neededTickets).map((leg) => leg.id);
        await releaseTourLegs(tx, id, releaseLegIds);
      }
      const ticketLegRows = await tx.ticketLeg.findMany({
        where: { tourPackageId: id, status: TicketLegStatus.RESERVED_FOR_TOUR },
        select: { id: true, ticketId: true, acquisitionCostSnapshot: true, currencySnapshot: true },
      });
      const ticketIds = Array.from(new Set(ticketLegRows.map((leg) => leg.ticketId)));
      const ticketSourceCurrency = currency(ticketLegRows[0]?.currencySnapshot || packageCurrency);
      if (new Set(ticketLegRows.map((leg) => currency(leg.currencySnapshot))).size > 1) fail('Bilet segmentlari tannarx valyutalari turlicha.');
      const ticketMultiplier = crossRate(ticketSourceCurrency, packageCurrency, body.ticketExchangeRate);
      const ticketOriginalTotal = ticketLegRows.reduce((sum, leg) => sum.add(leg.acquisitionCostSnapshot), new Prisma.Decimal(0));
      const ticketTotal = ticketOriginalTotal.mul(ticketMultiplier).toDecimalPlaces(4);
      for (const old of oldServiceComponents) {
        const next = prepared.find((item) => item.service.id === old.serviceId);
        const nextReserved = next?.required || 0;
        const delta = nextReserved - old.totalReservedQuantity;
        if (delta > 0) {
          const changed = await tx.serviceOffering.updateMany({ where: { id: old.serviceId!, availableQuantity: { gte: delta } }, data: { availableQuantity: { decrement: delta }, reservedQuantity: { increment: delta } } });
          if (changed.count !== 1) fail('Xizmat inventari bir vaqtda o‘zgardi. Qayta urinib ko‘ring.');
        }
        if (delta < 0) await tx.serviceOffering.update({ where: { id: old.serviceId! }, data: { availableQuantity: { increment: -delta }, reservedQuantity: { decrement: -delta } } });
      }
      for (const item of prepared.filter((entry) => !oldByService.has(entry.service.id))) {
        const changed = await tx.serviceOffering.updateMany({ where: { id: item.service.id, availableQuantity: { gte: item.required } }, data: { availableQuantity: { decrement: item.required }, reservedQuantity: { increment: item.required } } });
        if (changed.count !== 1) fail(`${item.service.name} inventari bir vaqtda o‘zgardi. Qayta urinib ko‘ring.`);
      }
      await tx.tourComponent.deleteMany({ where: { tourId: id } });
      const ticketPerTour = ticketTotal.div(tourQuantity).toDecimalPlaces(4);
      await tx.tourComponent.create({ data: { tourId: id, componentType: 'TICKET', ticketProductType, ticketDirection, segmentCount: ticketLegRows.length, quantityPerTour: ticketsPerTour, totalReservedQuantity: neededTickets, unitCostSnapshot: ticketOriginalTotal.div(neededTickets).toDecimalPlaces(4), originalCurrency: ticketSourceCurrency, currencySnapshot: packageCurrency, exchangeRateSnapshot: ticketMultiplier, costPerTourSnapshot: ticketPerTour, totalCostSnapshot: ticketTotal } });
      for (const item of prepared) await tx.tourComponent.create({ data: { tourId: id, componentType: 'SERVICE', serviceId: item.service.id, quantityPerTour: item.row.quantityPerTour, totalReservedQuantity: item.required, unitCostSnapshot: item.unitCost, originalCurrency: currency(item.service.currency), currencySnapshot: packageCurrency, exchangeRateSnapshot: item.multiplier, costPerTourSnapshot: item.perTour, totalCostSnapshot: item.total } });
      const costs = calculateTourCosts(ticketPerTour.toNumber(), prepared.map((item) => item.perTour.toNumber()), tourQuantity);
      const row = await tx.tourPackage.update({ where: { id }, data: { name: String(body.name || existing.name).trim(), destination: String(body.destination || '').trim() || flight.route, flightId, quantity: tourQuantity, availableQuantity: tourQuantity, ticketsPerTour, ticketProductType, ticketDirection, currency: packageCurrency, ticketPrice: ticketPerTour, servicePrice: costs.serviceCostPerTour, unitPrice: costs.unitTourCost, totalCost: costs.totalTourCost, notes: body.notes === undefined ? existing.notes : String(body.notes || '').trim() || null }, include: packageInclude });
      await writeAuditLog(req, { action: 'TOUR_UPDATED', entityType: 'tourPackage', entityId: id, summary: `Tur paketi yangilandi: ${row.name}`, before: existing, after: row, metadata: { reason: body.reason, affectedTicketIds: ticketIds, affectedServiceIds: serviceIds } }, tx);
      if (tourQuantity !== existing.quantity) await writeAuditLog(req, { action: 'TOUR_QUANTITY_CHANGED', entityType: 'tourPackage', entityId: id, summary: `Tur miqdori ${existing.quantity} dan ${tourQuantity} ga o‘zgardi`, before: { quantity: existing.quantity }, after: { quantity: tourQuantity }, metadata: { reason: body.reason } }, tx);
      const removedServiceIds = oldServiceComponents.map((item) => item.serviceId!).filter((serviceId) => !serviceIds.includes(serviceId));
      const addedServiceIds = serviceIds.filter((serviceId) => !oldByService.has(serviceId));
      if (removedServiceIds.length) await writeAuditLog(req, { action: 'TOUR_COMPONENT_REMOVED', entityType: 'tourPackage', entityId: id, summary: `Tur xizmatlari olib tashlandi: ${row.name}`, metadata: { affectedServiceIds: removedServiceIds, reason: body.reason } }, tx);
      if (addedServiceIds.length) await writeAuditLog(req, { action: 'TOUR_COMPONENT_ADDED', entityType: 'tourPackage', entityId: id, summary: `Tur xizmatlari qo‘shildi: ${row.name}`, metadata: { affectedServiceIds: addedServiceIds, reason: body.reason } }, tx);
      await writeAuditLog(req, { action: 'TOUR_COST_RECALCULATED', entityType: 'tourPackage', entityId: id, summary: `Tur tannarxi qayta hisoblandi: ${row.name}`, before: { unitCost: existing.unitPrice, totalCost: existing.totalCost }, after: { unitCost: costs.unitTourCost, totalCost: costs.totalTourCost }, metadata: { reason: body.reason } }, tx);
      return row;
    });
    return res.json(updated);
  } catch (error) { return sendError(res, error, 'Tur paketini yangilab bo‘lmadi.'); }
};

export const cancelTourPackage = async (req: Request, res: Response) => {
  const id = String(req.params.id || '');
  const reasonText = String(req.body?.reason || '').trim();
  if (!reasonText) return res.status(400).json({ error: 'Bekor qilish sababi majburiy.' });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const pkg = await tx.tourPackage.findUnique({ where: { id }, include: { components: true } });
      if (!pkg || pkg.deletedAt) fail('Tur paketi topilmadi.', 404);
      await assertOwnerOrSuperadmin(req, pkg.ownerFirmId, reasonText);
      if (pkg.status === 'CANCELLED') fail('Tur paketi allaqachon bekor qilingan.');
      const reservedLegs = await releaseTourLegs(tx, id);
      for (const component of pkg.components.filter((row) => row.componentType === 'TICKET')) {
        await tx.tourComponent.update({
          where: { id: component.id },
          data: {
            totalReservedQuantity: component.consumedQuantity,
            segmentCount: component.consumedQuantity * (pkg.ticketProductType === TicketProductType.ROUND_TRIP ? 2 : 1),
          },
        });
      }
      for (const component of pkg.components.filter((row) => row.componentType === 'SERVICE' && row.serviceId)) {
        const releasable = Math.max(component.totalReservedQuantity - component.consumedQuantity, 0);
        if (releasable) await tx.serviceOffering.update({ where: { id: component.serviceId! }, data: { availableQuantity: { increment: releasable }, reservedQuantity: { decrement: releasable } } });
        await tx.tourComponent.update({ where: { id: component.id }, data: { totalReservedQuantity: component.consumedQuantity } });
      }
      const updated = await tx.tourPackage.update({ where: { id }, data: { status: 'CANCELLED', availableQuantity: 0, deletedAt: new Date(), deletedByUserId: auth(req).userId, deleteReason: reasonText }, include: packageInclude });
      await writeAuditLog(req, { action: 'TOUR_RESERVATION_RELEASED', entityType: 'tourPackage', entityId: id, summary: `Tur rezervlari bo‘shatildi: ${pkg.name}`, metadata: { reason: reasonText, affectedTicketIds: Array.from(new Set(reservedLegs.map((leg) => leg.ticketId))), affectedTicketLegIds: reservedLegs.map((leg) => leg.id), affectedServiceIds: pkg.components.filter((item) => item.serviceId).map((item) => item.serviceId) } }, tx);
      await writeAuditLog(req, { action: 'TOUR_CANCELLED', entityType: 'tourPackage', entityId: id, entityLabel: pkg.name, summary: `Tur paketi bekor qilindi: ${pkg.name}`, before: pkg, after: updated, metadata: { reason: reasonText, releasedTicketLegIds: reservedLegs.map((leg) => leg.id) } }, tx);
      return updated;
    });
    return res.json(result);
  } catch (error) { return sendError(res, error, 'Tur paketini bekor qilib bo‘lmadi.'); }
};

export const sellTourPackage = async (req: Request, res: Response) => {
  const user = auth(req); const packageId = String(req.params.id || ''); const body = req.body || {};
  const buyerFirmId = String(body.buyerFirmId || ''); const saleQuantity = integer(body.quantity);
  if (!buyerFirmId || saleQuantity <= 0) return res.status(400).json({ error: 'Xaridor firma va musbat miqdor kerak.' });
  try {
    const saleNote = validateTourSaleNote(body.saleNote ?? body.notes);
    const result = await prisma.$transaction(async (tx) => {
      const pkg = await tx.tourPackage.findUnique({ where: { id: packageId }, include: { ownerFirm: { select: { id: true, name: true } }, flight: { select: { flightNumber: true, route: true } }, components: true } });
      if (!pkg || pkg.deletedAt || pkg.status !== 'ACTIVE') fail('Faol tur paketi topilmadi.', 404);
      if (role(req) === 'FIRM' && (pkg.ownerFirmId !== user.firmId || !canManageFirmWork(user))) fail('Faqat paket egasi sotishi mumkin.', 403);
      if (role(req) === 'ADMIN' && !(await canAccessFirm(user, pkg.ownerFirmId))) fail('Forbidden', 403);
      if (!['FIRM', 'ADMIN', 'SUPERADMIN'].includes(role(req))) fail('Forbidden', 403);
      if (pkg.availableQuantity < saleQuantity) fail('Paket qoldig‘i yetarli emas.');
      if (buyerFirmId === pkg.ownerFirmId) fail('Xaridor va sotuvchi bir firma bo‘lishi mumkin emas.');
      const buyer = await tx.firm.findUnique({ where: { id: buyerFirmId }, select: { id: true, name: true } });
      if (!buyer) fail('Xaridor firma topilmadi.', 404);
      const ticketCount = saleQuantity * pkg.ticketsPerTour;
      const reservedLegs = await tx.ticketLeg.findMany({
        where: { tourPackageId: packageId, status: TicketLegStatus.RESERVED_FOR_TOUR, ...(pkg.ticketProductType === TicketProductType.ONE_WAY && pkg.ticketDirection ? { direction: pkg.ticketDirection } : {}) },
        orderBy: { createdAt: 'asc' },
      });
      const soldLegs = selectTourSaleLegs(reservedLegs, { productType: pkg.ticketProductType, ticketDirection: pkg.ticketDirection, parentTicketCount: ticketCount });
      await tx.ticketLeg.updateMany({ where: { id: { in: soldLegs.map((leg) => leg.id) }, status: TicketLegStatus.RESERVED_FOR_TOUR }, data: { status: TicketLegStatus.SOLD } });
      await syncParentTickets(tx, soldLegs.map((leg) => leg.ticketId));
      await tx.tourComponent.updateMany({ where: { tourId: packageId, componentType: 'TICKET' }, data: { consumedQuantity: { increment: ticketCount } } });
      for (const component of pkg.components.filter((row) => row.componentType === 'SERVICE' && row.serviceId)) {
        const consume = saleQuantity * component.quantityPerTour;
        await tx.serviceOffering.update({ where: { id: component.serviceId! }, data: { reservedQuantity: { decrement: consume }, consumedQuantity: { increment: consume } } });
        await tx.tourComponent.update({ where: { id: component.id }, data: { consumedQuantity: { increment: consume } } });
      }
      const unitPrice = new Prisma.Decimal(String(body.unitPrice || pkg.unitPrice));
      if (!unitPrice.gt(0)) fail('Sotuv narxi musbat bo‘lishi kerak.');
      const exchangeRate = await resolveExchangeRateToUzs(user, { currency: pkg.currency, overrideRate: body.exchangeRate });
      const financials = calculateTourSaleFinancials({ quantity: saleQuantity, unitPrice, discountAmount: body.discountAmount ?? 0, exchangeRate, unitCost: pkg.unitPrice });
      if (financials.fullDiscount && !canApproveFullTourDiscount(user)) fail('100% chegirma faqat firma admini yoki vakolatli manager tasdig‘i bilan mumkin.', 403);
      if (financials.fullDiscount && body.confirmFullDiscount !== true) fail('100% chegirmali sotuv uchun qo‘shimcha tasdiq kerak.');
      const transaction = await tx.transaction.create({ data: { firmId: pkg.ownerFirmId, flightId: pkg.flightId || undefined, payerFirmId: buyerFirmId, receiverFirmId: pkg.ownerFirmId, direction: 'FIRM_TO_FIRM', subjectType: 'TOUR_PACKAGE', subjectId: packageId, createdByUserId: user.userId, type: 'SALE', sourceMode: 'AUTO_TOUR_SALE', status: 'CONFIRMED', originalAmount: financials.netAmount, currency: pkg.currency, exchangeRate, baseAmount: financials.netAmountBaseCurrency, metadata: { packageId, packageName: pkg.name, quantity: saleQuantity, unitCost: pkg.unitPrice.toString(), grossAmount: financials.grossAmount.toString(), discountAmount: financials.discountAmount.toString(), netAmount: financials.netAmount.toString(), saleNote, ticketProductType: pkg.ticketProductType, ticketDirection: pkg.ticketDirection, ticketIds: Array.from(new Set(soldLegs.map((leg) => leg.ticketId))), ticketLegIds: soldLegs.map((leg) => leg.id) } } });
      const sale = await tx.tourPackageSale.create({ data: { packageId, sellerFirmId: pkg.ownerFirmId, buyerFirmId, quantity: saleQuantity, unitPrice: financials.unitPrice, currency: pkg.currency, totalAmount: financials.netAmount, grossAmount: financials.grossAmount, discountAmount: financials.discountAmount, netAmount: financials.netAmount, discountPercent: financials.discountPercent, saleNote, exchangeRateSnapshot: financials.exchangeRate, grossAmountBaseCurrency: financials.grossAmountBaseCurrency, discountAmountBaseCurrency: financials.discountAmountBaseCurrency, netAmountBaseCurrency: financials.netAmountBaseCurrency, unitCostSnapshot: financials.unitCostSnapshot, costOfGoodsSold: financials.costOfGoodsSold, grossProfit: financials.grossProfit, transactionId: transaction.id, notes: saleNote }, include: { package: true, sellerFirm: { select: { id: true, name: true } }, buyerFirm: { select: { id: true, name: true } }, transaction: true } });
      await tx.tourPackage.update({ where: { id: packageId }, data: { availableQuantity: { decrement: saleQuantity }, soldQuantity: { increment: saleQuantity } } });
      await writeAuditLog(req, { action: 'TOUR_SOLD', entityType: 'tourPackageSale', entityId: sale.id, summary: `Tur paketi sotildi: ${pkg.name}`, after: sale, metadata: { ticketIds: Array.from(new Set(soldLegs.map((leg) => leg.ticketId))), ticketLegIds: soldLegs.map((leg) => leg.id), ticketProductType: pkg.ticketProductType, ticketDirection: pkg.ticketDirection, quantity: saleQuantity } }, tx);
      await writeAuditLog(req, { action: 'TOUR_SALE_CREATED', entityType: 'tourPackageSale', entityId: sale.id, entityLabel: pkg.name, summary: `Tur sotuv yaratildi: ${financials.netAmount.toFixed(4)} ${pkg.currency}`, after: sale, metadata: { tourId: packageId, saleId: sale.id, amount: financials.netAmount.toString(), discountAmount: financials.discountAmount.toString(), currency: pkg.currency, note: saleNote } }, tx);
      if (financials.discountAmount.gt(0)) await writeAuditLog(req, { action: 'TOUR_SALE_DISCOUNT_APPLIED', entityType: 'tourPackageSale', entityId: sale.id, entityLabel: pkg.name, summary: `Tur sotuviga ${financials.discountAmount.toFixed(4)} ${pkg.currency} chegirma qo‘llandi`, metadata: { tourId: packageId, saleId: sale.id, discountAmount: financials.discountAmount.toString(), discountPercent: financials.discountPercent.toString(), note: saleNote } }, tx);
      if (financials.fullDiscount) await writeAuditLog(req, { action: 'TOUR_SALE_FULL_DISCOUNT', entityType: 'tourPackageSale', entityId: sale.id, entityLabel: pkg.name, summary: 'Tur 100% chegirma bilan sotildi', metadata: { tourId: packageId, saleId: sale.id, discountAmount: financials.discountAmount.toString(), note: saleNote } }, tx);
      await writeAuditLog(req, { action: 'TOUR_SALE_NOTE_RECORDED', entityType: 'tourPackageSale', entityId: sale.id, entityLabel: pkg.name, summary: 'Tur sotuv izohi saqlandi', metadata: { tourId: packageId, saleId: sale.id, note: saleNote } }, tx);
      return sale;
    });
    return res.status(201).json(result);
  } catch (error) { return sendError(res, error, 'Tur paketini sotib bo‘lmadi.'); }
};

export const updateTourPackageSale = async (req: Request, res: Response) => {
  const saleId = String(req.params.saleId || '').trim();
  const body = req.body || {};
  const reason = String(body.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Tahrirlash sababini kiriting.' });
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TourPackageSale" WHERE id = ${saleId} FOR UPDATE`;
      const sale = await tx.tourPackageSale.findUnique({
        where: { id: saleId },
        include: {
          package: { include: { components: true, flight: { select: { flightNumber: true, route: true } } } },
          sellerFirm: { select: { id: true, name: true } }, buyerFirm: { select: { id: true, name: true } }, transaction: true,
        },
      });
      if (!sale || sale.deletedAt || sale.status !== 'CONFIRMED') fail('Faol tur sotuv topilmadi.', 404);
      if (sale.package.deletedAt || sale.package.status !== 'ACTIVE') fail('Bekor qilingan tur sotuvini tahrirlab bo‘lmaydi.');
      await assertOwnerOrSuperadmin(req, sale.sellerFirmId, reason);
      const buyerFirmId = String(body.buyerFirmId || sale.buyerFirmId).trim();
      const saleQuantity = integer(body.quantity ?? sale.quantity);
      const unitPrice = new Prisma.Decimal(String(body.unitPrice ?? sale.unitPrice));
      const saleNote = validateTourSaleNote(body.saleNote ?? body.notes ?? sale.saleNote ?? sale.notes);
      if (!buyerFirmId || buyerFirmId === sale.sellerFirmId) fail('Xaridor sotuvchidan boshqa firma bo‘lishi kerak.');
      if (saleQuantity <= 0 || !unitPrice.gt(0)) fail('Soni va bir dona narxi musbat bo‘lishi kerak.');
      const buyer = await tx.firm.findUnique({ where: { id: buyerFirmId }, select: { id: true, name: true } });
      if (!buyer) fail('Xaridor firma topilmadi.', 404);
      if (!sale.transactionId || !sale.transaction) fail('Sotuvning moliyaviy yozuvi topilmadi.');
      const currentLegIds = transactionLegIds(sale.transaction);
      if (!currentLegIds.length) fail('Eski sotuv bilet bog‘lanishlari topilmadi. Qo‘lda tekshirish kerak.');
      const currentLegs = await tx.ticketLeg.findMany({
        where: { id: { in: currentLegIds }, tourPackageId: sale.packageId, status: TicketLegStatus.SOLD },
        select: { id: true, ticketId: true, direction: true }, orderBy: { createdAt: 'asc' },
      });
      if (currentLegs.length !== currentLegIds.length) fail('Sotilgan tur biletlarining holati o‘zgargan. Qo‘lda tekshirish kerak.');
      const delta = saleQuantity - sale.quantity;
      const changedParentTickets = Math.abs(delta) * sale.package.ticketsPerTour;
      let nextLegs = currentLegs;
      if (delta > 0) {
        if (sale.package.availableQuantity < delta) fail('Tur paketi qoldig‘i yetarli emas.');
        const reservedLegs = await tx.ticketLeg.findMany({
          where: { tourPackageId: sale.packageId, status: TicketLegStatus.RESERVED_FOR_TOUR, ...(sale.package.ticketProductType === TicketProductType.ONE_WAY && sale.package.ticketDirection ? { direction: sale.package.ticketDirection } : {}) },
          select: { id: true, ticketId: true, direction: true }, orderBy: { createdAt: 'asc' },
        });
        const added = selectTourSaleLegs(reservedLegs, { productType: sale.package.ticketProductType, ticketDirection: sale.package.ticketDirection, parentTicketCount: changedParentTickets });
        const changed = await tx.ticketLeg.updateMany({ where: { id: { in: added.map((leg) => leg.id) }, status: TicketLegStatus.RESERVED_FOR_TOUR }, data: { status: TicketLegStatus.SOLD } });
        if (changed.count !== added.length) fail('Tur bilet inventari bir vaqtda o‘zgardi. Qayta urinib ko‘ring.');
        nextLegs = [...currentLegs, ...added];
      } else if (delta < 0) {
        const removed = selectTourSaleLegs(currentLegs, { productType: sale.package.ticketProductType, ticketDirection: sale.package.ticketDirection, parentTicketCount: changedParentTickets });
        const changed = await tx.ticketLeg.updateMany({ where: { id: { in: removed.map((leg) => leg.id) }, status: TicketLegStatus.SOLD }, data: { status: TicketLegStatus.RESERVED_FOR_TOUR } });
        if (changed.count !== removed.length) fail('Tur bilet inventari bir vaqtda o‘zgardi. Qayta urinib ko‘ring.');
        const removedIds = new Set(removed.map((leg) => leg.id));
        nextLegs = currentLegs.filter((leg) => !removedIds.has(leg.id));
      }
      if (delta) {
        const ticketComponent = sale.package.components.find((row) => row.componentType === 'TICKET');
        if (ticketComponent) await tx.tourComponent.update({ where: { id: ticketComponent.id }, data: { consumedQuantity: { increment: delta * sale.package.ticketsPerTour } } });
        for (const component of sale.package.components.filter((row) => row.componentType === 'SERVICE' && row.serviceId)) {
          const serviceDelta = delta * component.quantityPerTour;
          if (serviceDelta > 0) {
            const changed = await tx.serviceOffering.updateMany({ where: { id: component.serviceId!, reservedQuantity: { gte: serviceDelta } }, data: { reservedQuantity: { decrement: serviceDelta }, consumedQuantity: { increment: serviceDelta } } });
            if (changed.count !== 1) fail('Tur xizmati rezervi yetarli emas.');
          } else {
            const restored = -serviceDelta;
            const changed = await tx.serviceOffering.updateMany({ where: { id: component.serviceId!, consumedQuantity: { gte: restored } }, data: { reservedQuantity: { increment: restored }, consumedQuantity: { decrement: restored } } });
            if (changed.count !== 1) fail('Tur xizmati sarfi bilan sotuv mos emas.');
          }
          await tx.tourComponent.update({ where: { id: component.id }, data: { consumedQuantity: { increment: serviceDelta } } });
        }
        await tx.tourPackage.update({
          where: { id: sale.packageId },
          data: delta > 0
            ? { availableQuantity: { decrement: delta }, soldQuantity: { increment: delta } }
            : { availableQuantity: { increment: -delta }, soldQuantity: { decrement: -delta } },
        });
        await syncParentTickets(tx, [...currentLegs, ...nextLegs].map((leg) => leg.ticketId));
      }
      const exchangeRate = body.exchangeRate
        ? await resolveExchangeRateToUzs(auth(req), { currency: sale.currency, overrideRate: body.exchangeRate, rateFirmId: sale.sellerFirmId })
        : new Prisma.Decimal(sale.transaction.exchangeRate);
      const financials = calculateTourSaleFinancials({ quantity: saleQuantity, unitPrice, discountAmount: body.discountAmount ?? sale.discountAmount, exchangeRate, unitCost: sale.unitCostSnapshot.gt(0) ? sale.unitCostSnapshot : sale.package.unitPrice });
      if (financials.fullDiscount && !canApproveFullTourDiscount(auth(req))) fail('100% chegirma faqat firma admini yoki vakolatli manager tasdig‘i bilan mumkin.', 403);
      if (financials.fullDiscount && body.confirmFullDiscount !== true) fail('100% chegirmali sotuv uchun qo‘shimcha tasdiq kerak.');
      const oldMetadata = sale.transaction.metadata && typeof sale.transaction.metadata === 'object' && !Array.isArray(sale.transaction.metadata)
        ? sale.transaction.metadata as Record<string, unknown>
        : {};
      const transaction = await tx.transaction.update({
        where: { id: sale.transactionId },
        data: {
          payerFirmId: buyerFirmId, receiverFirmId: sale.sellerFirmId, originalAmount: financials.netAmount,
          exchangeRate: exchangeRate.toDecimalPlaces(6), baseAmount: financials.netAmountBaseCurrency,
          metadata: { ...oldMetadata, quantity: saleQuantity, grossAmount: financials.grossAmount.toString(), discountAmount: financials.discountAmount.toString(), netAmount: financials.netAmount.toString(), saleNote, ticketIds: Array.from(new Set(nextLegs.map((leg) => leg.ticketId))), ticketLegIds: nextLegs.map((leg) => leg.id), correctionReason: reason } as Prisma.InputJsonValue,
        },
      });
      const updated = await tx.tourPackageSale.update({
        where: { id: saleId },
        data: { buyerFirmId, quantity: saleQuantity, unitPrice: financials.unitPrice, totalAmount: financials.netAmount, grossAmount: financials.grossAmount, discountAmount: financials.discountAmount, netAmount: financials.netAmount, discountPercent: financials.discountPercent, saleNote, exchangeRateSnapshot: financials.exchangeRate, grossAmountBaseCurrency: financials.grossAmountBaseCurrency, discountAmountBaseCurrency: financials.discountAmountBaseCurrency, netAmountBaseCurrency: financials.netAmountBaseCurrency, unitCostSnapshot: financials.unitCostSnapshot, costOfGoodsSold: financials.costOfGoodsSold, grossProfit: financials.grossProfit, notes: saleNote },
        include: { package: { include: { flight: true } }, sellerFirm: { select: { id: true, name: true } }, buyerFirm: { select: { id: true, name: true } }, transaction: true },
      });
      await writeAuditLog(req, { action: 'TOUR_SALE_UPDATED', entityType: 'tourPackageSale', entityId: saleId, entityLabel: sale.package.name, summary: `Tur sotuv tahrirlandi: ${sale.package.name}`, before: sale, after: updated, metadata: { reason, previousTicketLegIds: currentLegIds, nextTicketLegIds: nextLegs.map((leg) => leg.id), transactionId: transaction.id } }, tx);
      if (financials.discountAmount.gt(0)) await writeAuditLog(req, { action: 'TOUR_SALE_DISCOUNT_APPLIED', entityType: 'tourPackageSale', entityId: saleId, entityLabel: sale.package.name, summary: `Tur sotuviga ${financials.discountAmount.toFixed(4)} ${sale.currency} chegirma qo‘llandi`, before: { discountAmount: sale.discountAmount }, after: { discountAmount: financials.discountAmount }, metadata: { tourId: sale.packageId, saleId, discountAmount: financials.discountAmount.toString(), discountPercent: financials.discountPercent.toString(), note: saleNote, reason } }, tx);
      if (financials.fullDiscount) await writeAuditLog(req, { action: 'TOUR_SALE_FULL_DISCOUNT', entityType: 'tourPackageSale', entityId: saleId, entityLabel: sale.package.name, summary: 'Tur sotuv 100% chegirmaga tahrirlandi', metadata: { tourId: sale.packageId, saleId, discountAmount: financials.discountAmount.toString(), note: saleNote, reason } }, tx);
      await writeAuditLog(req, { action: 'TOUR_SALE_NOTE_RECORDED', entityType: 'tourPackageSale', entityId: saleId, entityLabel: sale.package.name, summary: 'Tur sotuv izohi yangilandi', metadata: { tourId: sale.packageId, saleId, note: saleNote, reason } }, tx);
      return updated;
    });
    return res.json(result);
  } catch (error) { return sendError(res, error, 'Tur sotuvini tahrirlab bo‘lmadi.'); }
};

export const deleteTourPackageSale = async (req: Request, res: Response) => {
  const saleId = String(req.params.saleId || '').trim();
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'O‘chirish sababini kiriting.' });
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TourPackageSale" WHERE id = ${saleId} FOR UPDATE`;
      const sale = await tx.tourPackageSale.findUnique({ where: { id: saleId }, include: { package: { include: { components: true } }, transaction: true } });
      if (!sale || sale.deletedAt || sale.status !== 'CONFIRMED') fail('Faol tur sotuv topilmadi.', 404);
      if (sale.package.deletedAt || sale.package.status !== 'ACTIVE') fail('Bekor qilingan tur sotuvini o‘chirib bo‘lmaydi.');
      await assertOwnerOrSuperadmin(req, sale.sellerFirmId, reason);
      const legIds = transactionLegIds(sale.transaction);
      if (!legIds.length) fail('Eski sotuv bilet bog‘lanishlari topilmadi. Qo‘lda tekshirish kerak.');
      const legs = await tx.ticketLeg.findMany({ where: { id: { in: legIds }, tourPackageId: sale.packageId, status: TicketLegStatus.SOLD }, select: { id: true, ticketId: true } });
      if (legs.length !== legIds.length) fail('Sotilgan tur biletlarining holati o‘zgargan. Qo‘lda tekshirish kerak.');
      const restored = await tx.ticketLeg.updateMany({ where: { id: { in: legIds }, status: TicketLegStatus.SOLD }, data: { status: TicketLegStatus.RESERVED_FOR_TOUR } });
      if (restored.count !== legIds.length) fail('Tur bilet inventari bir vaqtda o‘zgardi. Qayta urinib ko‘ring.');
      const parentTicketCount = sale.quantity * sale.package.ticketsPerTour;
      const ticketComponent = sale.package.components.find((row) => row.componentType === 'TICKET');
      if (ticketComponent) await tx.tourComponent.update({ where: { id: ticketComponent.id }, data: { consumedQuantity: { decrement: parentTicketCount } } });
      for (const component of sale.package.components.filter((row) => row.componentType === 'SERVICE' && row.serviceId)) {
        const serviceCount = sale.quantity * component.quantityPerTour;
        const changed = await tx.serviceOffering.updateMany({ where: { id: component.serviceId!, consumedQuantity: { gte: serviceCount } }, data: { reservedQuantity: { increment: serviceCount }, consumedQuantity: { decrement: serviceCount } } });
        if (changed.count !== 1) fail('Tur xizmati sarfi bilan sotuv mos emas.');
        await tx.tourComponent.update({ where: { id: component.id }, data: { consumedQuantity: { decrement: serviceCount } } });
      }
      await tx.tourPackage.update({ where: { id: sale.packageId }, data: { availableQuantity: { increment: sale.quantity }, soldQuantity: { decrement: sale.quantity } } });
      await syncParentTickets(tx, legs.map((leg) => leg.ticketId));
      const deletedAt = new Date();
      if (sale.transactionId) await tx.transaction.update({ where: { id: sale.transactionId }, data: { status: 'DELETED', deletedAt } });
      const deleted = await tx.tourPackageSale.update({ where: { id: saleId }, data: { status: 'CANCELLED', deletedAt, deletedByUserId: auth(req).userId || null, deleteReason: reason } });
      await writeAuditLog(req, { action: 'TOUR_SALE_DELETED', entityType: 'tourPackageSale', entityId: saleId, entityLabel: sale.package.name, summary: `Tur sotuv o‘chirildi: ${sale.package.name}`, before: sale, after: deleted, metadata: { reason, restoredTicketLegIds: legIds, transactionId: sale.transactionId } }, tx);
      return deleted;
    });
    return res.json(result);
  } catch (error) { return sendError(res, error, 'Tur sotuvini o‘chirib bo‘lmadi.'); }
};

export const listTourPackageSales = async (req: Request, res: Response) => {
  const user = auth(req); const where: Prisma.TourPackageSaleWhereInput = { status: 'CONFIRMED', deletedAt: null };
  if (role(req) === 'FIRM') where.OR = [{ sellerFirmId: user.firmId || '__missing__' }, { buyerFirmId: user.firmId || '__missing__' }];
  if (role(req) === 'ADMIN') { const ids = await getAccessibleFirmIds(user); where.OR = [{ sellerFirmId: { in: ids } }, { buyerFirmId: { in: ids } }]; }
  return res.json(await prisma.tourPackageSale.findMany({ where, include: { package: { include: { flight: { select: { id: true, flightNumber: true, route: true, departure: true, arrival: true, currency: true } } } }, sellerFirm: { select: { id: true, name: true } }, buyerFirm: { select: { id: true, name: true } }, transaction: { include: { createdBy: { select: { id: true, fullName: true, email: true } }, kassaDesk: { select: { id: true, name: true, code: true } } } } }, orderBy: { createdAt: 'desc' } }));
};

export const listTourCounterpartyFirms = async (req: Request, res: Response) => {
  const user = auth(req); const where: Prisma.FirmWhereInput = { status: 'ACTIVE', deletedAt: null };
  const relatedFirmIds = await getRelatedFirmIds(user);
  if (relatedFirmIds) where.id = { in: relatedFirmIds };
  return res.json(await prisma.firm.findMany({ where, select: { id: true, name: true, currency: true, kind: true }, orderBy: { name: 'asc' } }));
};
