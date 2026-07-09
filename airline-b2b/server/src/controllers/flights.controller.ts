import { Request, Response } from 'express';
import { prisma } from '../db';
import { logger } from '../logger';
import { isPayableDebtType } from '../utils/transaction-types';

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

// GET /flights - Get all flights
export const getAllFlights = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = normalizeRole(req.user?.role);
    const firmId = req.user?.firmId ? String(req.user.firmId) : '';
    const firmKind = role === 'FIRM' ? await getFirmKind(firmId) : null;
    const txWhere = role === 'FIRM'
      ? (firmId ? { firmId } : undefined)
      : undefined;
    const where = {
      status: { not: 'DELETED' },
      deletedAt: null,
      ...(role === 'FIRM' && firmKind === 'AIRLINE'
        ? {
            airline: { firmId },
          }
        : {}),
      ...(role === 'FIRM' && firmKind !== 'AIRLINE'
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
        ...(role === 'FIRM'
          ? {}
          : {
              _count: {
                select: { tickets: true },
              },
            }),
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
            total_allocated,
            total_sales,
            total_payments
        };
    });
    res.json(flightData);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get flights');
    res.status(500).json({ error: 'Failed to retrieve flights' });
  }
};

// GET /flights/:id - Get a single flight by ID
export const getFlightById = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const role = normalizeRole((req as any).user?.role);
    const firmId = (req as any).user?.firmId ? String((req as any).user.firmId) : '';
    const firmKind = role === 'FIRM' ? await getFirmKind(firmId) : null;
    if (role === 'FIRM' && !firmId) {
      return res.status(400).json({ error: 'Firm account is missing firmId' });
    }

    const flight = await prisma.flight.findUnique({
      where: { id },
      include: {
        tickets: {
          where: {
            status: { not: 'DELETED' },
            deletedAt: null,
            ...(role === 'FIRM' && firmKind !== 'AIRLINE' ? { assignedFirmId: firmId } : {}),
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
      return res.status(404).json({ error: 'Flight not found' });
    }
    if (role === 'FIRM' && firmKind === 'AIRLINE' && flight.airline?.firmId !== firmId) {
      return res.status(404).json({ error: 'Flight not found' });
    }
    if (role === 'FIRM' && firmKind !== 'AIRLINE' && flight.tickets.length === 0) {
      return res.status(404).json({ error: 'Flight not found' });
    }
    res.json(flight);
  } catch (error) {
    logger.error({ err: error, flightId: id }, 'Failed to get flight');
    res.status(500).json({ error: 'Failed to retrieve flight' });
  }
};

// POST /flights - Create a new flight
export const createFlight = async (req: Request, res: Response) => {
  const { flightNumber, route, departure, arrival, ticketCount, ticketPrice, currency } = req.body;
  try {
    const role = normalizeRole((req as any).user?.role);
    const firmId = (req as any).user?.firmId ? String((req as any).user.firmId) : '';
    if (role !== 'FIRM' || !firmId) {
      return res.status(403).json({ error: 'Only airline accounts can create flights and ticket inventory' });
    }

    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { id: true, name: true, kind: true },
    });
    if (!firm || firm.kind !== 'AIRLINE') {
      return res.status(403).json({ error: 'Only airline accounts can create flights and ticket inventory' });
    }

    const airline = await prisma.airline.findFirst({
      where: { firmId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (!airline) return res.status(400).json({ error: 'Airline not found' });

    const newFlight = await prisma.flight.create({
      data: {
        flightNumber,
        route: route || 'UNKNOWN',
        airlineId: airline.id,
        departure: new Date(departure),
        arrival: new Date(arrival),
        currency: currency || 'USD',
        tickets: {
          create: Array.from({ length: ticketCount }, () => ({
            basePrice: ticketPrice,
            currency: currency,
            status: 'AVAILABLE',
          })),
        },
      },
      include: {
        tickets: true,
        airline: { select: { id: true, name: true, code: true } },
      }
    });
    res.status(201).json(newFlight);
  } catch (error) {
    logger.error({ err: error }, 'Failed to create flight');
    res.status(500).json({ error: 'Failed to create flight' });
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
    res.status(500).json({ error: 'Failed to update flight' });
  }
};

// DELETE /flights/:id - Cancel a flight (soft delete)
export const deleteFlight = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const flight = await prisma.flight.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!flight) {
      return res.status(404).json({ error: 'Flight not found' });
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
    return res.status(500).json({ error: 'Failed to cancel flight' });
  }
};
