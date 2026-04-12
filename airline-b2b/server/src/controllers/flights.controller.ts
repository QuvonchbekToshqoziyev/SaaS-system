import { Request, Response } from 'express';
import { prisma } from '../db';

export interface AuthenticatedRequest extends Request {
  user?: any;
}

// GET /flights - Get all flights
export const getAllFlights = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Superadmin sees all flights. Firms see all flights too, but details might be limited elsewhere.
    const flights = await prisma.flight.findMany({
      orderBy: { departure: 'asc' },
      include: {
        _count: {
          select: { tickets: true }
        },
        transactions: {
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
    console.error('Failed to get flights:', error);
    res.status(500).json({ error: 'Failed to retrieve flights' });
  }
};

// GET /flights/:id - Get a single flight by ID
export const getFlightById = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const flight = await prisma.flight.findUnique({
      where: { id },
      include: {
        tickets: {
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
    console.error('Failed to create flight:', error);
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
    res.status(500).json({ error: 'Failed to update flight' });
  }
};

// DELETE /flights/:id - Delete a flight
export const deleteFlight = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    // Ensure no tickets are sold before deleting
    const soldTickets = await prisma.ticket.count({
      where: { flightId: id, status: 'SOLD' },
    });

    if (soldTickets > 0) {
      return res.status(400).json({ error: 'Cannot delete flight with sold tickets. Please handle transactions first.' });
    }

    // Use a transaction to delete tickets and then the flight
    await prisma.$transaction([
      prisma.ticket.deleteMany({ where: { flightId: id } }),
      prisma.flight.delete({ where: { id } }),
    ]);
    
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete flight' });
  }
};
