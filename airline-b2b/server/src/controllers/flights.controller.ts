import { Request, Response } from 'express';
import { prisma } from '../db';
import { logger } from '../logger';
import { isPayableDebtType } from '../utils/transaction-types';
import { AppError, mapKnownError } from '../errors/app-error';
import { ERROR_CODES } from '../errors/catalog';
import { sendApiError } from '../errors/http';
import { canManageFirmWork } from '../utils/firm-user-roles';

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

// GET /flights - Get all flights
export const getAllFlights = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = normalizeRole(req.user?.role);
    const firmId = req.user?.firmId ? String(req.user.firmId) : '';
    const txWhere = role === 'FIRM'
      ? (firmId ? { firmId } : undefined)
      : undefined;
    const where = {
      status: { not: 'DELETED' },
      deletedAt: null,
      ...(role === 'FIRM'
        ? {
            tickets: {
              some: {
                assignedFirmId: firmId,
                status: { not: 'DELETED' as const },
                deletedAt: null,
              },
            },
          }
        : {}),
    };

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
        return {
            ...rest,
            ticketCount: (flight as any)._count?.tickets || 0,
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
    if (role === 'FIRM' && flight.tickets.length === 0) {
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
      if (airlineId) {
        const airline = await tx.airline.findUnique({
          where: { id: String(airlineId) },
          select: { id: true, name: true, firmId: true, status: true, deletedAt: true },
        });
        if (!airline || airline.status !== 'ACTIVE' || airline.deletedAt) throw new Error('Airline not found');
        if (airline.firmId) {
          const connection = await tx.airlineFirmConnection.findFirst({
            where: { airlineFirmId: airline.firmId, firmId, status: 'ACTIVE' },
            select: { id: true },
          });
          if (!connection) throw new Error('Your firm is not connected to this listed airline');
        }
        return airline.id;
      }

      const externalName = normalizeOptionalString(airlineName);
      if (!externalName) throw new Error('Airline is required');
      const existing = await tx.airline.findUnique({
        where: { name: externalName },
        select: { id: true, firmId: true, status: true, deletedAt: true },
      });
      if (existing?.firmId) {
        throw new Error('This listed airline requires superadmin connection before your firm can create flights with it');
      }
      if (existing) {
        const updated = await tx.airline.update({
          where: { id: existing.id },
          data: {
            code: normalizeAirlineCode(airlineCode),
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
          code: normalizeAirlineCode(airlineCode),
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      return airline.id;
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
  const { flightNumber, departure, arrival } = req.body;
  try {
    const updatedFlight = await prisma.flight.update({
      where: { id },
      data: {
        flightNumber,
        departure: departure ? new Date(departure) : undefined,
        arrival: arrival ? new Date(arrival) : undefined,
      },
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
