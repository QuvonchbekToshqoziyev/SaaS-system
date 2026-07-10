import { Request, Response } from 'express';
import { prisma } from '../db';
import { logger } from '../logger';
import { isPayableDebtType } from '../utils/transaction-types';
import { AppError, mapKnownError } from '../errors/app-error';
import { ERROR_CODES } from '../errors/catalog';
import { sendApiError } from '../errors/http';
import { canManageFirmWork } from '../utils/firm-user-roles';
import type { Prisma } from '@prisma/client';

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

function activeFlightWhere(): Prisma.FlightWhereInput {
  return {
    deletedAt: null,
    OR: [
      { status: null },
      { status: { not: 'DELETED' } },
    ],
  };
}

async function resolveAirlineIdForFlight(
  tx: Prisma.TransactionClient,
  input: { airlineId?: unknown; airlineName?: unknown; airlineCode?: unknown },
  actor: { role: string; firmId?: string },
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
    const txWhere = role === 'FIRM'
      ? (firmId ? { firmId } : undefined)
      : undefined;
    const where = activeFlightWhere();

    const flights = await prisma.flight.findMany({
      where,
      orderBy: { departure: 'asc' },
      include: {
        _count: {
          select: { tickets: true },
        },
        transactions: {
          ...(txWhere ? { where: txWhere } : {}),
          select: {
            type: true,
            baseAmount: true
          }
        },
        airline: { select: { id: true, name: true, code: true, firmId: true } },
        tickets: {
          where: { deletedAt: null, status: { not: 'DELETED' } },
          select: { basePrice: true, currency: true, status: true, deletedAt: true },
        },
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
        const { transactions, ...rest } = flight;
        const activeTickets = (flight as any).tickets || [];
        const referenceTicket = activeTickets.find((ticket: any) => ticket.status !== 'SOLD') || activeTickets[0];
        return {
            ...rest,
            tickets: undefined,
            ticketCount: activeTickets.length,
            ticketPrice: referenceTicket ? Number(referenceTicket.basePrice) : 0,
            currency: referenceTicket?.currency || flight.currency,
            total_allocated,
            total_sales,
            total_payments
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

    const flight = await prisma.flight.findUnique({
      where: { id },
      include: {
        tickets: {
          where: {
            status: { not: 'DELETED' },
            deletedAt: null,
            ...(role === 'FIRM' ? { assignedFirmId: firmId } : {}),
          },
          include: {
            assignedFirm: {
              select: { id: true, name: true }
            }
          }
        },
        airline: { select: { id: true, name: true, code: true, firmId: true } },
      }
    });
    if (!flight || flight.status === 'DELETED' || flight.deletedAt) {
      return sendApiError(res, new AppError(ERROR_CODES.FLIGHT_NOT_FOUND));
    }
    res.json(flight);
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

    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { id: true, name: true, kind: true },
    });
    if (!firm) return sendApiError(res, new AppError(ERROR_CODES.FIRM_NOT_FOUND));

    const resolvedAirlineId = await prisma.$transaction(async (tx) => {
      const resolved = await resolveAirlineIdForFlight(tx, { airlineId, airlineName, airlineCode }, { role, firmId });
      if (!resolved) throw new Error('Airline is required');
      return resolved;
    });

    const newFlight = await prisma.flight.create({
      data: {
        flightNumber: String(flightNumber).trim(),
        route: route || 'UNKNOWN',
        airlineId: resolvedAirlineId,
        departure: new Date(departure),
        arrival: new Date(arrival),
        currency: currency || 'UZS',
        tickets: {
          create: Array.from({ length: resolvedTicketCount }, () => ({
            basePrice: resolvedTicketPrice,
            currency: currency || 'UZS',
            status: 'ASSIGNED',
            assignedFirmId: firmId,
          })),
        },
      },
      include: {
        tickets: true,
        airline: { select: { id: true, name: true, code: true, firmId: true } },
      }
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
  } = req.body;
  try {
    const authUser = ((req as any).user || {}) as any;
    const role = normalizeRole(authUser.role);
    const firmId = authUser.firmId ? String(authUser.firmId) : '';
    if (role === 'FIRM' && (!firmId || !canManageFirmWork(authUser))) {
      return sendApiError(res, new AppError(ERROR_CODES.AUTH_FORBIDDEN, 'Only firm admins and managers can edit flights'));
    }

    const updatedFlight = await prisma.$transaction(async (tx) => {
      const flight = await tx.flight.findUnique({
        where: { id },
        include: {
          airline: { select: { id: true, name: true, firmId: true } },
          tickets: {
            where: { deletedAt: null, status: { not: 'DELETED' } },
            select: { id: true, status: true, assignedFirmId: true, deletedAt: true, soldPrice: true, purchaserInfo: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      if (!flight || flight.status === 'DELETED' || flight.deletedAt) {
        throw new AppError(ERROR_CODES.FLIGHT_NOT_FOUND);
      }
      if (role === 'FIRM' && !flight.tickets.some((ticket) => ticket.assignedFirmId === firmId)) {
        throw new AppError(ERROR_CODES.AUTH_FORBIDDEN, 'You can edit only flights in your firm inventory');
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

      const resolvedAirlineId = airlineId || normalizeOptionalString(airlineName)
        ? await resolveAirlineIdForFlight(tx, { airlineId, airlineName, airlineCode }, { role, firmId })
        : undefined;

      const currentCount = flight.tickets.length;
      const editableTickets = flight.tickets.filter(isEditableTicket);
      if (nextTicketCount !== undefined && nextTicketCount < currentCount) {
        const removeCount = currentCount - nextTicketCount;
        if (editableTickets.length < removeCount) {
          throw new AppError(
            ERROR_CODES.TICKET_INVALID_STATE,
            `Cannot reduce ticket count to ${nextTicketCount}; only ${editableTickets.length} unsold tickets can be removed`,
          );
        }
        await tx.ticket.updateMany({
          where: { id: { in: editableTickets.slice(0, removeCount).map((ticket) => ticket.id) } },
          data: { status: 'DELETED', deletedAt: new Date(), deleteReason: 'Removed by flight edit' },
        });
      } else if (nextTicketCount !== undefined && nextTicketCount > currentCount) {
        const addCount = nextTicketCount - currentCount;
        const assignedFirmIds = Array.from(new Set(flight.tickets.map((ticket) => ticket.assignedFirmId).filter(Boolean) as string[]));
        const newAssignedFirmId = role === 'FIRM'
          ? firmId
          : assignedFirmIds.length === 1
            ? assignedFirmIds[0]
            : null;
        await tx.ticket.createMany({
          data: Array.from({ length: addCount }, () => ({
            flightId: id,
            basePrice: nextTicketPrice ?? 0,
            currency: nextCurrency || flight.currency,
            status: newAssignedFirmId ? 'ASSIGNED' : 'AVAILABLE',
            assignedFirmId: newAssignedFirmId,
          })),
        });
      }

      if (nextTicketPrice !== undefined || nextCurrency !== undefined) {
        await tx.ticket.updateMany({
          where: {
            id: { in: editableTickets.map((ticket) => ticket.id) },
          },
          data: {
            ...(nextTicketPrice !== undefined ? { basePrice: nextTicketPrice } : {}),
            ...(nextCurrency ? { currency: nextCurrency } : {}),
          },
        });
      }

      return tx.flight.update({
        where: { id },
        data: {
          ...(normalizeOptionalString(flightNumber) ? { flightNumber: String(flightNumber).trim() } : {}),
          ...(route != null ? { route: String(route || '').trim() || 'UNKNOWN' } : {}),
          ...(departure ? { departure: new Date(departure) } : {}),
          ...(arrival ? { arrival: new Date(arrival) } : {}),
          ...(nextCurrency ? { currency: nextCurrency } : {}),
          ...(resolvedAirlineId ? { airlineId: resolvedAirlineId } : {}),
        },
        include: {
          airline: { select: { id: true, name: true, code: true, firmId: true } },
          tickets: { where: { deletedAt: null, status: { not: 'DELETED' } } },
        },
      });
    });
    res.json(updatedFlight);
  } catch (error) {
    logger.error({ err: error, flightId: id }, 'Failed to update flight');
    sendApiError(res, mapKnownError(error, ERROR_CODES.DATABASE_ERROR));
  }
};

// DELETE /flights/:id - Cancel a flight (soft delete)
export const deleteFlight = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const flight = await prisma.flight.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!flight) {
      return sendApiError(res, new AppError(ERROR_CODES.FLIGHT_NOT_FOUND));
    }

    if (flight.status !== 'CANCELLED') {
      await prisma.flight.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
    }

    return res.status(204).send();
  } catch (error) {
    logger.error({ err: error, flightId: id }, 'Failed to cancel flight');
    return sendApiError(res, mapKnownError(error, ERROR_CODES.DATABASE_ERROR));
  }
};
