import { Request, Response } from 'express';
import { prisma } from '../db';
import { logger } from '../logger';

export interface AuthenticatedRequest extends Request {
  user?: any;
}

function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

// GET /flights - Get all flights
export const getAllFlights = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = normalizeRole(req.user?.role);
    const firmId = req.user?.firmId ? String(req.user.firmId) : '';
    const txWhere = role === 'FIRM'
      ? (firmId ? { firmId } : undefined)
      : undefined;

    // Superadmin sees all flights. Firms see all flights too, but details might be limited elsewhere.
    const flights = await prisma.flight.findMany({
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
        }
      }
    });
    const flightData = flights.map(flight => {
        let total_allocated = 0;
        let total_sales = 0;
        let total_payments = 0;
        flight.transactions.forEach((t: any) => {
            if (t.type === 'PAYABLE') total_allocated += Number(t.baseAmount);
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
    if (role === 'FIRM' && !firmId) {
      return res.status(400).json({ error: 'Firm account is missing firmId' });
    }

    const flight = await prisma.flight.findUnique({
      where: { id },
      include: {
        tickets: {
          ...(role === 'FIRM' ? { where: { assignedFirmId: firmId } } : {}),
          include: {
            assignedFirm: {
              select: { id: true, name: true }
            }
          }
        }
      }
    });
    if (!flight) {
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
  const { flightNumber, departure, arrival, ticketCount, ticketPrice, currency } = req.body;
  try {
    const newFlight = await prisma.flight.create({
      data: {
        flightNumber,
        departure: new Date(departure),
        arrival: new Date(arrival),
        tickets: {
          create: Array.from({ length: ticketCount }, () => ({
            price: ticketPrice,
            currency: currency,
            status: 'AVAILABLE',
          })),
        },
      },
      include: {
        tickets: true,
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
