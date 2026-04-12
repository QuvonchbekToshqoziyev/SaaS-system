import { Request, Response } from 'express';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';

export const getTickets = async (req: Request, res: Response) => {
  const { flightId, flight_id } = req.query;
  const id = flightId || flight_id;
  const where = id ? { flightId: String(id) } : {};
  const tickets = await prisma.ticket.findMany({ where, include: { assignedFirm: true } });
  res.json(tickets);
};

export const createTickets = async (req: Request, res: Response) => {
  const { flightId, price, currency, quantity } = req.body;
  const newTickets = Array.from({ length: quantity }).map(() => ({
    flightId,
    price,
    currency,
    status: 'AVAILABLE' as const,
  }));
  const result = await prisma.ticket.createMany({ data: newTickets });
  res.json({ success: true, count: result.count });
};

export const allocateTicket = async (req: Request, res: Response) => {
  const { ticketId, firmId } = req.body;
  
  try {
    await prisma.$transaction(async (tx) => {
      // Find ticket
      const tickets: any[] = await tx.$queryRaw`SELECT * FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];
      
      if (ticket.status !== 'AVAILABLE') throw new Error('Ticket is not available for allocation');

      // Get Exchange Rate
      let exRate = 1.0;
      if (ticket.currency !== 'USD') {
        const rate = await tx.currencyRate.findFirst({
          where: { targetCurrency: ticket.currency },
          orderBy: { recordedAt: 'desc' }
        });
        if (rate) exRate = Number(rate.rate);
      }
      
      const baseAmount = Number(ticket.price) / exRate;

      // Update ticket
      await tx.ticket.update({
        where: { id: ticketId },
        data: { status: 'ASSIGNED', assignedFirmId: firmId }
      });

      // Create transaction for Debt (PAYABLE)
      await tx.transaction.create({
        data: {
          firmId,
          flightId: ticket.flightId,
          ticketId,
          type: 'PAYABLE',
          originalAmount: ticket.price,
          currency: ticket.currency,
          exchangeRate: exRate,
          baseAmount,
          metadata: { note: 'Ticket allocated, debt incurred' }
        }
      });
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const sellTicket = async (req: Request, res: Response) => {
  const { ticketId } = req.body;
  const user = (req as any).user;
  
  try {
    await prisma.$transaction(async (tx) => {
      const tickets: any[] = await tx.$queryRaw`SELECT * FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];
      
      if (ticket.status !== 'ASSIGNED') throw new Error('Ticket is not assigned');
      if (user.role === 'FIRM' && ticket.assignedFirmId !== user.firmId) {
         throw new Error('Not your ticket');
      }

      let exRate = 1.0;
      if (ticket.currency !== 'USD') {
        const rate = await tx.currencyRate.findFirst({
          where: { targetCurrency: ticket.currency },
          orderBy: { recordedAt: 'desc' }
        });
        if (rate) exRate = Number(rate.rate);
      }
      
      const baseAmount = Number(ticket.price) / exRate;

      await tx.ticket.update({
        where: { id: ticketId },
        data: { status: 'SOLD' }
      });

      await tx.transaction.create({
        data: {
          firmId: ticket.assignedFirmId, // revenue for assigned firm
          flightId: ticket.flightId,
          ticketId,
          type: 'SALE',
          originalAmount: ticket.price,
          currency: ticket.currency,
          exchangeRate: exRate,
          baseAmount,
          metadata: { note: 'Ticket sold, revenue generated' }
        }
      });
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};
