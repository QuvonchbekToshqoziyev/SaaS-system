import { Request, Response } from 'express';
import { prisma } from '../db';
import { logger } from '../logger';
import { isPayableDebtType } from '../utils/transaction-types';
import { AppError, mapKnownError } from '../errors/app-error';
import { ERROR_CODES } from '../errors/catalog';
import { sendApiError } from '../errors/http';
import { canManageFirmWork } from '../utils/firm-user-roles';
import { getAccessibleFirmIds } from '../utils/access';
import { TicketProductType, type Prisma } from '@prisma/client';
import { canManageFlight } from '../domains/flights/flight-permissions';
import { activeFlightWhere, firmFlightParticipationWhere } from '../domains/flights/flight-scope';
import { visibleTransactionWhere } from '../utils/transaction-visibility';
import { writeAuditLog } from '../utils/audit';
import { buildTicketInventorySummary } from '../domains/tickets/inventory-summary';
import { createTicketLegInventory, normalizeTicketProductType, validateLegCosts } from '../domains/tickets/ticket-leg-inventory';
import { ensureExternalAirlineFirm } from '../services/external-airline-firms';

export interface AuthenticatedRequest extends Request {
  user?: any;
}

function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

async function getFirmKind(firmId: string) {
  if (!firmId) return null;
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { id: true, kind: true },
  });
  return firm?.kind || null;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const trimmed = String(value || '').trim();
  return trimmed || undefined;
}

function normalizeAirlineCode(value: unknown): string | undefined {
  const code = String(value || '').trim().toUpperCase();
  return code || undefined;
}

function normalizeCurrencyCode(value: unknown): string {
  const code = String(value || 'UZS').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

function routeParts(value: unknown) {
  return String(value || '').split(/\s*(?:→|->|–|—|-)\s*/).map((part) => part.trim()).filter(Boolean);
}

function validDate(value: unknown, label: string, required = true): Date | null {
  if (!value && !required) return null;
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) throw new AppError(ERROR_CODES.VALIDATION_FAILED, `${label} is required`);
  return date;
}

async function resolveAirlineIdForFlight(
  tx: Prisma.TransactionClient,
  input: { airlineId?: unknown; airlineName?: unknown; airlineCode?: unknown },
  actor: { role: string; firmId?: string; userId?: string; currency?: string },
) {
  if (input.airlineId) {
    const airline = await tx.airline.findUnique({
      where: { id: String(input.airlineId) },
      select: { id: true, name: true, firmId: true, status: true, deletedAt: true },
    });
    if (!airline || airline.status !== 'ACTIVE' || airline.deletedAt) throw new Error('Airline not found');
    if (actor.role === 'FIRM' && airline.firmId) {
      const connection = await tx.airlineFirmConnection.findFirst({
        where: { airlineFirmId: airline.firmId, firmId: actor.firmId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!connection) throw new Error('Your firm is not connected to this listed airline');
    }
    return airline.id;
  }

  const externalName = normalizeOptionalString(input.airlineName);
  if (!externalName) return undefined;
  const existing = await tx.airline.findUnique({
    where: { name: externalName },
    select: { id: true, firmId: true, status: true, deletedAt: true },
  });
  if (actor.role === 'FIRM' && existing?.firmId) {
    throw new Error('This listed airline requires superadmin connection before your firm can create flights with it');
  }
  if (existing) {
    const updated = await tx.airline.update({
      where: { id: existing.id },
      data: {
        code: normalizeAirlineCode(input.airlineCode),
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
    });
    if (actor.role === 'FIRM' && actor.firmId) {
      await ensureExternalAirlineFirm(tx, {
        id: updated.id, name: externalName, ownerFirmIds: [actor.firmId],
        createdByUserId: actor.userId, currency: actor.currency,
      });
    }
    return updated.id;
  }
  const airline = await tx.airline.create({
    data: {
      name: externalName,
      code: normalizeAirlineCode(input.airlineCode),
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  if (actor.role === 'FIRM' && actor.firmId) {
    await ensureExternalAirlineFirm(tx, {
      id: airline.id, name: externalName, ownerFirmIds: [actor.firmId],
      createdByUserId: actor.userId, currency: actor.currency,
    });
  }
  return airline.id;
}

const EDITABLE_TICKET_STATUSES = ['AVAILABLE', 'ASSIGNED', 'ALLOCATED'];

function isEditableTicket(ticket: { status: string; deletedAt: Date | null; soldPrice?: unknown; purchaserInfo?: unknown }) {
  return !ticket.deletedAt && EDITABLE_TICKET_STATUSES.includes(ticket.status) && ticket.soldPrice == null && ticket.purchaserInfo == null;
}

// GET /flights - Get all flights
export const getAllFlights = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = normalizeRole(req.user?.role);
    const firmId = req.user?.firmId ? String(req.user.firmId) : '';
    if (role === 'FIRM' && !firmId) return sendApiError(res, new AppError(ERROR_CODES.FIRM_ACCOUNT_MISSING));
    const scopedFirmIds = role === 'FIRM'
      ? [firmId]
      : role === 'ADMIN'
        ? await getAccessibleFirmIds(req.user || {}) || []
        : undefined;
    const txWhere: Prisma.TransactionWhereInput | undefined = role === 'FIRM'
      ? (firmId ? { OR: [{ firmId }, { payerFirmId: firmId }, { receiverFirmId: firmId }] } : undefined)
      : undefined;
    const where: Prisma.FlightWhereInput = {
      AND: [
        activeFlightWhere(),
        ...(scopedFirmIds ? [firmFlightParticipationWhere(scopedFirmIds)] : []),
      ],
    };

    const flights = await prisma.flight.findMany({
      where,
      orderBy: { departure: 'asc' },
      include: {
        transactions: {
          where: visibleTransactionWhere(txWhere || {}),
          select: {
            type: true,
            baseAmount: true,
            id: true,
            firmId: true,
            payerFirmId: true,
            receiverFirmId: true,
            subjectType: true,
            subjectId: true,
            originalAmount: true,
            currency: true,
            sourceMode: true,
            status: true,
            reversedTransactionId: true,
            deletedAt: true,
            metadata: true,
          }
        },
        ownerFirm: { select: { id: true, name: true } },
        airline: { select: { id: true, name: true, code: true, firmId: true } },
        tickets: {
          where: { deletedAt: null, status: { not: 'DELETED' } },
          select: {
            id: true, basePrice: true, originPrice: true, currency: true, status: true, ticketType: true,
            assignedFirmId: true, originalOwnerFirmId: true, allocationSourceFirmId: true,
            soldPrice: true, soldCurrency: true, purchaserInfo: true, deletedAt: true,
            legs: { select: { id: true, ticketId: true, direction: true, status: true, currentOwnerFirmId: true, acquisitionCostSnapshot: true, originalCostSnapshot: true, allocationPriceSnapshot: true, currencySnapshot: true } },
          },
        },
        ticketAllocations: {
          select: {
            id: true, fromFirmId: true, toFirmId: true, status: true, productType: true, direction: true,
            parentTicketCount: true, segmentCount: true, currency: true, totalAmount: true, createdAt: true, acceptedAt: true,
            fromFirm: { select: { id: true, name: true } },
            toFirm: { select: { id: true, name: true } },
            priceRows: { select: { quantity: true, unitPrice: true, totalAmount: true } },
            legItems: { select: { ticketLegId: true, status: true, direction: true, acquisitionCostSnapshot: true, allocationPriceSnapshot: true, currencySnapshot: true, acquisitionCurrencySnapshot: true, allocationCurrencySnapshot: true } },
          },
        },
        ticketSales: {
          select: {
            id: true, sellerFirmId: true, status: true, productType: true, direction: true, quantity: true,
            segmentCount: true, unitPrice: true, totalAmount: true, currency: true, purchaserInfo: true, createdAt: true,
            items: { select: { ticketLegId: true, status: true, acquisitionCostSnapshot: true, salePriceSnapshot: true, currencySnapshot: true, acquisitionCurrencySnapshot: true, saleCurrencySnapshot: true } },
          },
        },
        _count: { select: { ticketLegMigrationIssues: { where: { resolvedAt: null } } } },
      }
    });
    const flightData = flights.map(flight => {
        let total_allocated = 0;
        let total_sales = 0;
        let total_payments = 0;
        flight.transactions.forEach((t: any) => {
            if (isPayableDebtType(t.type)) total_allocated += Number(t.baseAmount);
            if (t.type === 'SALE') total_sales += Number(t.baseAmount);
            if (t.type === 'PAYMENT') total_payments += Number(t.baseAmount);
        });
        const { transactions, tickets: inventoryTickets, ticketAllocations, ticketSales, _count, ...rest } = flight;
        const ownsFlight = Boolean(scopedFirmIds?.some((id) => id === flight.ownerFirmId || (!flight.ownerFirmId && id === flight.airline?.firmId)));
        const activeTickets = inventoryTickets.filter((ticket: any) =>
          !scopedFirmIds
          || ownsFlight
          || scopedFirmIds.includes(String(ticket.assignedFirmId || ''))
          || (ticket.status === 'PENDING' && scopedFirmIds.includes(String(ticket.allocationSourceFirmId || '')))
        );
        const referenceTicket = activeTickets.find((ticket: any) => ticket.status !== 'SOLD') || activeTickets[0];
        const referenceOutboundLeg = referenceTicket?.legs?.find((leg: any) => leg.direction === 'OUTBOUND');
        const referenceReturnLeg = referenceTicket?.legs?.find((leg: any) => leg.direction === 'RETURN');
        const inventorySummary = buildTicketInventorySummary({
          tickets: inventoryTickets,
          allocations: ticketAllocations,
          sales: ticketSales,
          transactions,
          sourceFirmId: role === 'FIRM' ? firmId : (flight.ownerFirmId || flight.airline?.firmId),
          originOwnerFirmId: flight.ownerFirmId || flight.airline?.firmId,
          migrationIssueCount: _count.ticketLegMigrationIssues,
        });
        return {
            ...rest,
            ticketCount: ownsFlight ? inventoryTickets.length : inventorySummary.remaining.count,
            ticketPrice: referenceTicket ? Number(referenceTicket.basePrice) : 0,
            outboundCost: referenceOutboundLeg ? Number(referenceOutboundLeg.originalCostSnapshot) : 0,
            returnCost: referenceReturnLeg ? Number(referenceReturnLeg.originalCostSnapshot) : 0,
            currency: referenceTicket?.currency || flight.currency,
            canEdit: canManageFlight(role, ownsFlight, canManageFirmWork(req.user || {})),
            canDelete: canManageFlight(role, ownsFlight, canManageFirmWork(req.user || {})),
            total_allocated,
            total_sales,
            total_payments,
            inventorySummary,
        };
    });
    res.json(flightData);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get flights');
    sendApiError(res, mapKnownError(error, ERROR_CODES.DATABASE_ERROR));
  }
};

// GET /flights/:id - Get a single flight by ID
export const getFlightById = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const role = normalizeRole((req as any).user?.role);
    const firmId = (req as any).user?.firmId ? String((req as any).user.firmId) : '';
    if (role === 'FIRM' && !firmId) {
      return sendApiError(res, new AppError(ERROR_CODES.FIRM_ACCOUNT_MISSING));
    }
    const scopedFirmIds = role === 'FIRM'
      ? [firmId]
      : role === 'ADMIN'
        ? await getAccessibleFirmIds((req as any).user || {}) || []
        : undefined;

    const flight = await prisma.flight.findFirst({
      where: {
        id,
        AND: [
          activeFlightWhere(),
          ...(scopedFirmIds ? [firmFlightParticipationWhere(scopedFirmIds)] : []),
        ],
      },
      include: {
        tickets: {
          where: {
            status: { not: 'DELETED' },
            deletedAt: null,
          },
          include: {
            assignedFirm: {
              select: { id: true, name: true }
            },
            allocationSourceFirm: { select: { id: true, name: true } },
          }
        },
        ownerFirm: { select: { id: true, name: true } },
        airline: { select: { id: true, name: true, code: true, firmId: true } },
      }
    });
    if (!flight || flight.status === 'DELETED' || flight.deletedAt) {
      return sendApiError(res, new AppError(ERROR_CODES.FLIGHT_NOT_FOUND));
    }
    const ownsFlight = Boolean(scopedFirmIds?.some((firmScopeId) => firmScopeId === flight.ownerFirmId || (!flight.ownerFirmId && firmScopeId === flight.airline?.firmId)));
    const tickets = flight.tickets
      .filter((ticket) => !scopedFirmIds || ownsFlight || scopedFirmIds.includes(String(ticket.assignedFirmId || '')) || (ticket.status === 'PENDING' && scopedFirmIds.includes(String(ticket.allocationSourceFirmId || ''))))
      .map((ticket) => ({ ...ticket, price: Number(ticket.basePrice), basePrice: Number(ticket.basePrice) }));
    const canManage = canManageFlight(role, ownsFlight, canManageFirmWork((req as any).user || {}));
    res.json({ ...flight, tickets, canEdit: canManage, canDelete: canManage });
  } catch (error) {
    logger.error({ err: error, flightId: id }, 'Failed to get flight');
    sendApiError(res, mapKnownError(error, ERROR_CODES.DATABASE_ERROR));
  }
};

// POST /flights - Create a new flight
export const createFlight = async (req: Request, res: Response) => {
  const {
    flightNumber,
    route,
    departure,
    arrival,
    ticketCount,
    ticketPrice,
    currency,
    airlineId,
    airlineName,
    airlineCode,
    tripType,
    ticketType,
    outboundOrigin,
    outboundDestination,
    returnOrigin,
    returnDestination,
    returnDeparture,
    returnArrival,
    outboundCost,
    returnCost,
  } = req.body;
  try {
    const authUser = ((req as any).user || {}) as any;
    const role = normalizeRole((req as any).user?.role);
    const firmId = (req as any).user?.firmId ? String((req as any).user.firmId) : '';
    if (role !== 'FIRM' || !firmId) {
      return sendApiError(res, new AppError(ERROR_CODES.AUTH_FORBIDDEN, 'Only firm accounts can create flights and ticket inventory'));
    }
    if (!canManageFirmWork(authUser)) {
      return sendApiError(res, new AppError(ERROR_CODES.AUTH_FORBIDDEN, 'Only firm admins and managers can create flights'));
    }
    if (!normalizeOptionalString(flightNumber)) {
      return sendApiError(res, new AppError(ERROR_CODES.VALIDATION_FAILED, 'Flight number is required'));
    }
    const resolvedTicketCount = Math.floor(Number(ticketCount || 0));
    if (!Number.isFinite(resolvedTicketCount) || resolvedTicketCount <= 0) {
      return sendApiError(res, new AppError(ERROR_CODES.VALIDATION_FAILED, 'Ticket count must be greater than 0'));
    }
    const resolvedTicketPrice = Number(ticketPrice || 0);
    if (!Number.isFinite(resolvedTicketPrice) || resolvedTicketPrice < 0) {
      return sendApiError(res, new AppError(ERROR_CODES.VALIDATION_FAILED, 'Ticket price must be zero or greater'));
    }
    const productType = normalizeTicketProductType(tripType ?? ticketType, TicketProductType.ONE_WAY);
    const departureDate = validDate(departure, 'Outbound departure')!;
    const arrivalDate = validDate(arrival, 'Outbound arrival')!;
    if (arrivalDate <= departureDate) {
      return sendApiError(res, new AppError(ERROR_CODES.VALIDATION_FAILED, 'Arrival must be after departure'));
    }
    const returnDepartureDate = validDate(returnDeparture, 'Return departure', productType === TicketProductType.ROUND_TRIP);
    const returnArrivalDate = validDate(returnArrival, 'Return arrival', productType === TicketProductType.ROUND_TRIP);
    if (returnDepartureDate && returnArrivalDate && returnArrivalDate <= returnDepartureDate) {
      return sendApiError(res, new AppError(ERROR_CODES.VALIDATION_FAILED, 'Return arrival must be after return departure'));
    }
    const parts = routeParts(route);
    const resolvedOutboundOrigin = normalizeOptionalString(outboundOrigin) || parts[0];
    const resolvedOutboundDestination = normalizeOptionalString(outboundDestination) || parts[1];
    const resolvedReturnOrigin = productType === TicketProductType.ROUND_TRIP
      ? normalizeOptionalString(returnOrigin) || parts.at(-2) || resolvedOutboundDestination
      : undefined;
    const resolvedReturnDestination = productType === TicketProductType.ROUND_TRIP
      ? normalizeOptionalString(returnDestination) || parts.at(-1) || resolvedOutboundOrigin
      : undefined;
    if (!resolvedOutboundOrigin || !resolvedOutboundDestination) {
      return sendApiError(res, new AppError(ERROR_CODES.VALIDATION_FAILED, 'Outbound origin and destination are required'));
    }

    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { id: true, name: true, kind: true },
    });
    if (!firm) return sendApiError(res, new AppError(ERROR_CODES.FIRM_NOT_FOUND));

    const resolvedCurrency = normalizeCurrencyCode(currency || 'UZS');
    if (!resolvedCurrency) return sendApiError(res, new AppError(ERROR_CODES.VALIDATION_FAILED, 'Invalid currency code'));
    const newFlight = await prisma.$transaction(async (tx) => {
      const resolvedAirlineId = await resolveAirlineIdForFlight(tx, { airlineId, airlineName, airlineCode }, {
        role, firmId, userId: authUser.userId ? String(authUser.userId) : undefined, currency: resolvedCurrency,
      });
      if (!resolvedAirlineId) throw new Error('Airline is required');
      const created = await tx.flight.create({
        data: {
          flightNumber: String(flightNumber).trim(),
          route: normalizeOptionalString(route) || (productType === TicketProductType.ROUND_TRIP
            ? `${resolvedOutboundOrigin} → ${resolvedOutboundDestination} → ${resolvedReturnDestination}`
            : `${resolvedOutboundOrigin} → ${resolvedOutboundDestination}`),
          airlineId: resolvedAirlineId,
          ownerFirmId: firmId,
          departure: departureDate,
          arrival: arrivalDate,
          tripType: productType,
          outboundOrigin: resolvedOutboundOrigin,
          outboundDestination: resolvedOutboundDestination,
          returnOrigin: resolvedReturnOrigin,
          returnDestination: resolvedReturnDestination,
          returnDeparture: returnDepartureDate,
          returnArrival: returnArrivalDate,
          currency: resolvedCurrency,
        },
      });
      await createTicketLegInventory(tx, {
        flightId: created.id, ownerFirmId: firmId, productType, quantity: resolvedTicketCount,
        totalCost: resolvedTicketPrice, outboundCost, returnCost, currency: resolvedCurrency,
        outboundOrigin: resolvedOutboundOrigin, outboundDestination: resolvedOutboundDestination,
        outboundDeparture: departureDate, outboundArrival: arrivalDate,
        returnOrigin: resolvedReturnOrigin, returnDestination: resolvedReturnDestination,
        returnDeparture: returnDepartureDate, returnArrival: returnArrivalDate,
      });
      return tx.flight.findUniqueOrThrow({
        where: { id: created.id },
        include: { tickets: { include: { legs: true } }, airline: { select: { id: true, name: true, code: true, firmId: true } } },
      });
    });
    res.status(201).json(newFlight);
  } catch (error) {
    logger.error({ err: error }, 'Failed to create flight');
    sendApiError(res, mapKnownError(error, ERROR_CODES.FLIGHT_CREATE_FAILED));
  }
};

// PUT /flights/:id - Update a flight
export const updateFlight = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const {
    flightNumber,
    route,
    departure,
    arrival,
    ticketCount,
    ticketPrice,
    currency,
    airlineId,
    airlineName,
    airlineCode,
    tripType,
    ticketType,
    outboundOrigin,
    outboundDestination,
    returnOrigin,
    returnDestination,
    returnDeparture,
    returnArrival,
    outboundCost,
    returnCost,
  } = req.body;
  try {
    const authUser = ((req as any).user || {}) as any;
    const role = normalizeRole(authUser.role);
    const firmId = authUser.firmId ? String(authUser.firmId) : '';
    const accessibleFirmIds = role === 'ADMIN' ? await getAccessibleFirmIds(authUser) || [] : [];

    const updatedFlight = await prisma.$transaction(async (tx) => {
      const flight = await tx.flight.findUnique({
        where: { id },
        include: {
          airline: { select: { id: true, name: true, firmId: true } },
          tickets: {
            where: { deletedAt: null, status: { not: 'DELETED' } },
            include: { legs: { orderBy: { direction: 'asc' } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      if (!flight || flight.status === 'DELETED' || flight.deletedAt) {
        throw new AppError(ERROR_CODES.FLIGHT_NOT_FOUND);
      }
      const ownerFirmId = flight.ownerFirmId || flight.airline?.firmId || '';
      const ownsFlight = role === 'ADMIN' ? accessibleFirmIds.includes(ownerFirmId) : ownerFirmId === firmId;
      if (!canManageFlight(role, ownsFlight, canManageFirmWork(authUser))) {
        throw new AppError(ERROR_CODES.AUTH_FORBIDDEN, 'You can edit only flights managed by your role and firm scope');
      }

      const nextTicketCount = ticketCount == null || String(ticketCount).trim() === ''
        ? undefined
        : Math.floor(Number(ticketCount));
      if (nextTicketCount !== undefined && (!Number.isFinite(nextTicketCount) || nextTicketCount < 0)) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Ticket count must be zero or greater');
      }

      const nextTicketPrice = ticketPrice == null || String(ticketPrice).trim() === ''
        ? undefined
        : Number(ticketPrice);
      if (nextTicketPrice !== undefined && (!Number.isFinite(nextTicketPrice) || nextTicketPrice < 0)) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Ticket price must be zero or greater');
      }

      const nextCurrency = currency == null || String(currency).trim() === ''
        ? undefined
        : normalizeCurrencyCode(currency);
      if (currency != null && !nextCurrency) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Invalid currency code');
      }
      const nextDeparture = departure ? new Date(departure) : flight.departure;
      const nextArrival = arrival ? new Date(arrival) : flight.arrival;
      if (Number.isNaN(nextDeparture.getTime()) || (nextArrival && Number.isNaN(nextArrival.getTime()))) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Valid departure and arrival times are required');
      }
      if (nextArrival && nextArrival <= nextDeparture) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Arrival must be after departure');
      }
      const productType = normalizeTicketProductType(tripType ?? ticketType, flight.tripType);
      if (productType !== flight.tripType && flight.tickets.length) {
        throw new AppError(ERROR_CODES.TICKET_INVALID_STATE, 'Mavjud biletli reysning RT/OW turini o‘zgartirib bo‘lmaydi. Yangi reys yarating.');
      }
      const nextReturnDeparture = returnDeparture ? new Date(returnDeparture) : flight.returnDeparture;
      const nextReturnArrival = returnArrival ? new Date(returnArrival) : flight.returnArrival;
      if (productType === TicketProductType.ROUND_TRIP) {
        if (!nextReturnDeparture || !nextReturnArrival || Number.isNaN(nextReturnDeparture.getTime()) || Number.isNaN(nextReturnArrival.getTime())) {
          throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'ROUND TRIP uchun qaytish vaqtlari majburiy');
        }
        if (nextReturnArrival <= nextReturnDeparture) {
          throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Qaytish yetib kelish vaqti jo‘nash vaqtidan keyin bo‘lishi kerak');
        }
      }
      const routeTokens = routeParts(route ?? flight.route);
      const nextOutboundOrigin = normalizeOptionalString(outboundOrigin) || flight.outboundOrigin || routeTokens[0];
      const nextOutboundDestination = normalizeOptionalString(outboundDestination) || flight.outboundDestination || routeTokens[1];
      const nextReturnOrigin = productType === TicketProductType.ROUND_TRIP
        ? normalizeOptionalString(returnOrigin) || flight.returnOrigin || nextOutboundDestination
        : undefined;
      const nextReturnDestination = productType === TicketProductType.ROUND_TRIP
        ? normalizeOptionalString(returnDestination) || flight.returnDestination || nextOutboundOrigin
        : undefined;
      if (!nextOutboundOrigin || !nextOutboundDestination || (productType === TicketProductType.ROUND_TRIP && (!nextReturnOrigin || !nextReturnDestination))) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Reys yo‘nalishlari to‘liq kiritilishi kerak');
      }

      const resolvedAirlineId = airlineId || normalizeOptionalString(airlineName)
        ? await resolveAirlineIdForFlight(tx, { airlineId, airlineName, airlineCode }, {
            role, firmId, userId: authUser.userId ? String(authUser.userId) : undefined, currency: nextCurrency || flight.currency,
          })
        : undefined;

      const currentCount = flight.tickets.length;
      const inventoryOwnerFirmId = flight.ownerFirmId || flight.airline?.firmId || null;
      const editableTickets = flight.tickets.filter((ticket) =>
        ticket.originalOwnerFirmId === inventoryOwnerFirmId
        && ticket.legs.length === (productType === TicketProductType.ROUND_TRIP ? 2 : 1)
        && ticket.legs.every((leg) => leg.currentOwnerFirmId === inventoryOwnerFirmId
          && leg.status === 'AVAILABLE'
          && !leg.pendingAllocationId
          && !leg.acceptedAllocationId
          && !leg.tourPackageId)
      );
      const removedTicketIds = new Set<string>();
      if (nextTicketCount !== undefined && nextTicketCount < currentCount) {
        const removeCount = currentCount - nextTicketCount;
        if (editableTickets.length < removeCount) {
          throw new AppError(
            ERROR_CODES.TICKET_INVALID_STATE,
            `Cannot reduce ticket count to ${nextTicketCount}; only ${editableTickets.length} unsold tickets can be removed`,
          );
        }
        const ticketIdsToRemove = editableTickets.slice(0, removeCount).map((ticket) => ticket.id);
        ticketIdsToRemove.forEach((ticketId) => removedTicketIds.add(ticketId));
        await tx.ticket.updateMany({
          where: { id: { in: ticketIdsToRemove } },
          data: { status: 'DELETED', deletedAt: new Date(), deleteReason: 'Removed by flight edit' },
        });
        await tx.ticketLeg.updateMany({
          where: { ticketId: { in: ticketIdsToRemove } },
          data: { status: 'DELETED' },
        });
      } else if (nextTicketCount !== undefined && nextTicketCount > currentCount) {
        const addCount = nextTicketCount - currentCount;
        if (!inventoryOwnerFirmId) throw new AppError(ERROR_CODES.TICKET_INVALID_STATE, 'Bilet egasi firma topilmadi');
        const fallbackTotal = nextTicketPrice ?? Number(flight.tickets[0]?.originPrice || flight.tickets[0]?.basePrice || 0);
        await createTicketLegInventory(tx, {
          flightId: id,
          ownerFirmId: inventoryOwnerFirmId,
          productType,
          quantity: addCount,
          totalCost: fallbackTotal,
          outboundCost,
          returnCost,
          currency: nextCurrency || flight.currency,
          outboundOrigin: nextOutboundOrigin,
          outboundDestination: nextOutboundDestination,
          outboundDeparture: nextDeparture,
          outboundArrival: nextArrival,
          returnOrigin: nextReturnOrigin,
          returnDestination: nextReturnDestination,
          returnDeparture: nextReturnDeparture,
          returnArrival: nextReturnArrival,
        });
      }

      if (nextTicketPrice !== undefined || nextCurrency !== undefined) {
        for (const ticket of editableTickets.filter((row) => !removedTicketIds.has(row.id))) {
          const totalCost = nextTicketPrice ?? ticket.originPrice;
          const oldOutbound = ticket.legs.find((leg) => leg.direction === 'OUTBOUND')?.originalCostSnapshot;
          const oldReturn = ticket.legs.find((leg) => leg.direction === 'RETURN')?.originalCostSnapshot;
          const costs = validateLegCosts({
            productType,
            totalCost,
            outboundCost: outboundCost ?? (nextTicketPrice === undefined ? oldOutbound : undefined),
            returnCost: returnCost ?? (nextTicketPrice === undefined ? oldReturn : undefined),
          });
          await tx.ticket.update({
            where: { id: ticket.id },
            data: {
              ...(nextTicketPrice !== undefined ? { basePrice: costs.totalCost, originPrice: costs.totalCost } : {}),
              ...(nextCurrency ? { currency: nextCurrency } : {}),
            },
          });
          for (const leg of ticket.legs) {
            const legCost = leg.direction === 'OUTBOUND' ? costs.outboundCost : costs.returnCost;
            await tx.ticketLeg.update({
              where: { id: leg.id },
              data: {
                ...(nextTicketPrice !== undefined || outboundCost != null || returnCost != null
                  ? { acquisitionCostSnapshot: legCost, originalCostSnapshot: legCost }
                  : {}),
                ...(nextCurrency ? { currencySnapshot: nextCurrency } : {}),
              },
            });
          }
        }
      }

      const retainedEditableTicketIds = editableTickets
        .filter((ticket) => !removedTicketIds.has(ticket.id))
        .map((ticket) => ticket.id);
      if (retainedEditableTicketIds.length) {
        await tx.ticketLeg.updateMany({
          where: { ticketId: { in: retainedEditableTicketIds }, direction: 'OUTBOUND' },
          data: { origin: nextOutboundOrigin, destination: nextOutboundDestination, departureAt: nextDeparture, arrivalAt: nextArrival },
        });
        if (productType === TicketProductType.ROUND_TRIP) {
          await tx.ticketLeg.updateMany({
            where: { ticketId: { in: retainedEditableTicketIds }, direction: 'RETURN' },
            data: { origin: nextReturnOrigin!, destination: nextReturnDestination!, departureAt: nextReturnDeparture!, arrivalAt: nextReturnArrival! },
          });
        }
      }

      const updated = await tx.flight.update({
        where: { id },
        data: {
          ...(normalizeOptionalString(flightNumber) ? { flightNumber: String(flightNumber).trim() } : {}),
          ...(route != null ? { route: String(route || '').trim() || 'UNKNOWN' } : {}),
          ...(departure ? { departure: nextDeparture } : {}),
          ...(arrival ? { arrival: nextArrival } : {}),
          tripType: productType,
          outboundOrigin: nextOutboundOrigin,
          outboundDestination: nextOutboundDestination,
          returnOrigin: nextReturnOrigin || null,
          returnDestination: nextReturnDestination || null,
          returnDeparture: productType === TicketProductType.ROUND_TRIP ? nextReturnDeparture : null,
          returnArrival: productType === TicketProductType.ROUND_TRIP ? nextReturnArrival : null,
          ...(nextCurrency ? { currency: nextCurrency } : {}),
          ...(resolvedAirlineId ? { airlineId: resolvedAirlineId } : {}),
        },
        include: {
          airline: { select: { id: true, name: true, code: true, firmId: true } },
          tickets: { where: { deletedAt: null, status: { not: 'DELETED' } }, include: { legs: true } },
        },
      });
      await writeAuditLog(req, {
        action: 'UPDATE',
        entityType: 'flight',
        entityId: id,
        entityLabel: updated.flightNumber,
        summary: `Updated flight ${updated.flightNumber}`,
        before: { flightNumber: flight.flightNumber, route: flight.route, departure: flight.departure, arrival: flight.arrival, currency: flight.currency, airlineId: flight.airlineId, ticketCount: currentCount },
        after: { flightNumber: updated.flightNumber, route: updated.route, departure: updated.departure, arrival: updated.arrival, currency: updated.currency, airlineId: updated.airlineId, ticketCount: updated.tickets.length },
      }, tx);
      return updated;
    });
    res.json(updatedFlight);
  } catch (error) {
    logger.error({ err: error, flightId: id }, 'Failed to update flight');
    sendApiError(res, mapKnownError(error, ERROR_CODES.DATABASE_ERROR));
  }
};

// DELETE /flights/:id - Soft delete a flight
export const deleteFlight = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const authUser = ((req as any).user || {}) as any;
    const role = normalizeRole(authUser.role);
    const firmId = authUser.firmId ? String(authUser.firmId) : '';
    const accessibleFirmIds = role === 'ADMIN' ? await getAccessibleFirmIds(authUser) || [] : [];
    await prisma.$transaction(async (tx) => {
      const flight = await tx.flight.findUnique({
        where: { id },
        include: {
          airline: { select: { firmId: true } },
          tickets: { where: { deletedAt: null, status: { not: 'DELETED' } }, select: { status: true, assignedFirmId: true, deletedAt: true, soldPrice: true, purchaserInfo: true } },
          _count: { select: { transactions: true } },
        },
      });
      if (!flight || flight.status === 'DELETED' || flight.deletedAt) throw new AppError(ERROR_CODES.FLIGHT_NOT_FOUND);
      const ownerFirmId = flight.ownerFirmId || flight.airline?.firmId || '';
      const ownsFlight = role === 'ADMIN' ? accessibleFirmIds.includes(ownerFirmId) : ownerFirmId === firmId;
      if (!canManageFlight(role, ownsFlight, canManageFirmWork(authUser))) {
        throw new AppError(ERROR_CODES.AUTH_FORBIDDEN, 'You can delete only flights managed by your role and firm scope');
      }
      const protectedActivity = flight._count.transactions > 0 || flight.tickets.some((ticket) =>
        ticket.assignedFirmId !== ownerFirmId || !isEditableTicket(ticket)
      );
      if (role !== 'SUPERADMIN' && protectedActivity) {
        throw new AppError(ERROR_CODES.CONFLICT, 'Allocated, sold, or financially active flights can be deleted only by superadmin');
      }
      const deleted = await tx.flight.update({
        where: { id },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          deletedByUserId: String(authUser.userId || '') || undefined,
          deleteReason: normalizeOptionalString(req.body?.reason) || 'Deleted by authorized user',
        },
      });
      await writeAuditLog(req, {
        action: 'DELETE',
        entityType: 'flight',
        entityId: id,
        entityLabel: flight.flightNumber,
        summary: `Deleted flight ${flight.flightNumber}`,
        before: { flightNumber: flight.flightNumber, status: flight.status, ownerFirmId, ticketCount: flight.tickets.length, transactionCount: flight._count.transactions },
        after: { status: deleted.status, deletedAt: deleted.deletedAt, deletedByUserId: deleted.deletedByUserId },
      }, tx);
    });

    return res.status(204).send();
  } catch (error) {
    logger.error({ err: error, flightId: id }, 'Failed to cancel flight');
    return sendApiError(res, mapKnownError(error, ERROR_CODES.DATABASE_ERROR));
  }
};
