import { Request, Response } from 'express';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';

function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const asInt = Math.floor(value);
    if (asInt <= 0) return null;
    return asInt;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asInt = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(asInt) || asInt <= 0) return null;
    return asInt;
  }
  return null;
}

function normalizeCurrency(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function parsePositiveDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  try {
    const d = new Prisma.Decimal(raw);
    if (!d.isFinite() || !d.gt(0)) return null;
    return d;
  } catch {
    return null;
  }
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : undefined;
}

function parsePurchaserInfo(value: unknown):
  | { name: string; idNumber: string; phone?: string; email?: string; notes?: string }
  | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v: any = value as any;
  const name = normalizeOptionalString(v.name);
  const idNumber = normalizeOptionalString(v.idNumber ?? v.id);
  if (!name || !idNumber) return null;
  const phone = normalizeOptionalString(v.phone);
  const email = normalizeOptionalString(v.email);
  const notes = normalizeOptionalString(v.notes);
  return {
    name,
    idNumber,
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(notes ? { notes } : {}),
  };
}

export const getTickets = async (req: Request, res: Response) => {
  const { flightId, flight_id } = req.query;
  const id = flightId || flight_id;
  const user = (req as any).user;
  const role = String(user?.role || '').toUpperCase();
  const ownFirmId = user?.firmId ? String(user.firmId) : '';

  const where: any = id ? { flightId: String(id) } : {};
  if (role === 'FIRM') {
    if (!ownFirmId) {
      return res.status(400).json({ error: 'Firm account is missing firmId' });
    }
    where.assignedFirmId = ownFirmId;
  }
  const tickets = await prisma.ticket.findMany({ where, include: { assignedFirm: true } });
  res.json(tickets);
};

export const createTickets = async (req: Request, res: Response) => {
  const { flightId, price, currency, quantity } = req.body;
  if (!flightId || typeof flightId !== 'string' || !flightId.trim()) {
    return res.status(400).json({ error: 'flightId is required' });
  }
  const resolvedQuantity = parsePositiveInt(quantity);
  if (!resolvedQuantity) {
    return res.status(400).json({ error: 'quantity is required' });
  }

  const flight = await prisma.flight.findUnique({
    where: { id: flightId.trim() },
    select: { id: true, status: true },
  });
  if (!flight) {
    return res.status(404).json({ error: 'Flight not found' });
  }
  if (flight.status === 'CANCELLED') {
    return res.status(400).json({ error: 'Cannot create tickets for a cancelled flight' });
  }

  const newTickets = Array.from({ length: resolvedQuantity }).map(() => ({
    flightId: flightId.trim(),
    price,
    currency,
    status: 'AVAILABLE' as const,
  }));
  const result = await prisma.ticket.createMany({ data: newTickets });
  res.json({ success: true, count: result.count });
};

export const allocateTicket = async (req: Request, res: Response) => {
  const { ticketId, firmId, flightId, flight_id, quantity, count } = req.body;

  const resolvedFlightId = (flightId || flight_id) && typeof (flightId || flight_id) === 'string'
    ? String(flightId || flight_id).trim()
    : '';
  const resolvedQuantity = parsePositiveInt(quantity ?? count);

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
      const result = await prisma.$transaction(async (tx) => {
        const [firm, flight] = await Promise.all([
          tx.firm.findUnique({ where: { id: targetFirmId }, select: { id: true } }),
          tx.flight.findUnique({ where: { id: resolvedFlightId }, select: { id: true, status: true } }),
        ]);
        if (!firm) throw new Error('Firm not found');
        if (!flight) throw new Error('Flight not found');
        if (flight.status === 'CANCELLED') throw new Error('Cannot allocate tickets for a cancelled flight');

        const tickets: any[] = await tx.$queryRaw`
          SELECT *
          FROM "Ticket"
          WHERE "flightId" = ${resolvedFlightId}
            AND status = 'AVAILABLE'
            AND "assignedFirmId" IS NULL
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${resolvedQuantity}
        `;

        if (tickets.length < resolvedQuantity) {
          throw new Error(`Not enough available tickets (requested ${resolvedQuantity}, found ${tickets.length})`);
        }

        const ticketIds = tickets.map((t) => String(t.id));
        await tx.ticket.updateMany({
          where: { id: { in: ticketIds } },
          data: { status: 'PENDING', assignedFirmId: targetFirmId },
        });
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
  if (!firmId || typeof firmId !== 'string') {
    return res.status(400).json({ error: 'firmId is required' });
  }
  
  try {
    await prisma.$transaction(async (tx) => {
      // Find ticket
      const tickets: any[] = await tx.$queryRaw`SELECT * FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];

      const flight = await tx.flight.findUnique({
        where: { id: String(ticket.flightId) },
        select: { status: true },
      });
      if (!flight) throw new Error('Flight not found');
      if (flight.status === 'CANCELLED') throw new Error('Cannot allocate tickets for a cancelled flight');
      
      if (ticket.status !== 'AVAILABLE') throw new Error('Ticket is not available for allocation');
      if (ticket.assignedFirmId) throw new Error('Ticket is already allocated');

      const firm = await tx.firm.findUnique({ where: { id: firmId }, select: { id: true } });
      if (!firm) throw new Error('Firm not found');

      // Update ticket
      await tx.ticket.update({
        where: { id: ticketId },
        data: { status: 'PENDING', assignedFirmId: firmId }
      });
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const confirmAllocation = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const role = normalizeRole(user?.role);
  const actorUserId = user?.userId ? String(user.userId) : undefined;

  if (role !== 'FIRM') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const ownFirmId = user?.firmId ? String(user.firmId) : '';
  if (!ownFirmId) {
    return res.status(400).json({ error: 'Firm account is missing firmId' });
  }

  const { ticketId, flightId, flight_id, quantity, count } = req.body;
  const resolvedFlightId = (flightId || flight_id) && typeof (flightId || flight_id) === 'string'
    ? String(flightId || flight_id).trim()
    : '';
  const resolvedQuantity = parsePositiveInt(quantity ?? count);

  // Batch confirm: firm confirms N pending allocations for a flight
  if (!ticketId && resolvedFlightId && resolvedQuantity) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const flight = await tx.flight.findUnique({
          where: { id: resolvedFlightId },
          select: { status: true },
        });
        if (!flight) throw new Error('Flight not found');
        if (flight.status === 'CANCELLED') throw new Error('Cannot confirm allocation for a cancelled flight');

        const tickets: any[] = await tx.$queryRaw`
          SELECT *
          FROM "Ticket"
          WHERE "flightId" = ${resolvedFlightId}
            AND status = 'PENDING'
            AND "assignedFirmId" = ${ownFirmId}
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${resolvedQuantity}
        `;

        if (tickets.length < resolvedQuantity) {
          throw new Error(`Not enough pending tickets (requested ${resolvedQuantity}, found ${tickets.length})`);
        }

        const ticketIds = tickets.map((t) => String(t.id));
        await tx.ticket.updateMany({
          where: { id: { in: ticketIds } },
          data: { status: 'ASSIGNED' },
        });

        const currencies = Array.from(
          new Set(tickets.map((t) => normalizeCurrency(t.currency)).filter((c) => c && c !== 'USD')),
        );
        const rateByCurrency = new Map<string, Prisma.Decimal>();
        for (const c of currencies) {
          const rate = await tx.currencyRate.findFirst({
            where: { baseCurrency: 'USD', targetCurrency: c },
            orderBy: { recordedAt: 'desc' },
          });
          if (!rate) throw new Error(`Missing exchange rate for ${c}`);
          const rateDecimal = new Prisma.Decimal(String(rate.rate));
          if (!rateDecimal.gt(0)) throw new Error('Invalid exchange rate');
          rateByCurrency.set(c, rateDecimal);
        }

        const transactionRows = tickets.map((t) => {
          const originalAmount = new Prisma.Decimal(String(t.price)).toDecimalPlaces(4);
          const currency = normalizeCurrency(t.currency);
          const exchangeRate = currency === 'USD'
            ? new Prisma.Decimal(1)
            : (rateByCurrency.get(currency) as Prisma.Decimal);
          if (!exchangeRate || !exchangeRate.gt(0)) throw new Error('Invalid exchange rate');

          const baseAmount = originalAmount.div(exchangeRate).toDecimalPlaces(4);

          return {
            firmId: ownFirmId,
            flightId: String(t.flightId),
            ticketId: String(t.id),
            createdByUserId: actorUserId,
            type: 'PAYABLE' as const,
            originalAmount,
            currency,
            exchangeRate: exchangeRate.toDecimalPlaces(6),
            baseAmount,
            metadata: { note: 'Allocation confirmed by firm, debt incurred' } as any,
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
      const tickets: any[] = await tx.$queryRaw`SELECT * FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];

      const flight = await tx.flight.findUnique({
        where: { id: String(ticket.flightId) },
        select: { status: true },
      });
      if (!flight) throw new Error('Flight not found');
      if (flight.status === 'CANCELLED') throw new Error('Cannot confirm allocation for a cancelled flight');

      if (ticket.status !== 'PENDING') throw new Error('Ticket is not pending confirmation');
      if (String(ticket.assignedFirmId || '') !== ownFirmId) throw new Error('Not your ticket');

      const originalAmount = new Prisma.Decimal(String(ticket.price));
      const currency = normalizeCurrency(ticket.currency);

      let exchangeRate = new Prisma.Decimal(1);
      if (currency !== 'USD') {
        const rate = await tx.currencyRate.findFirst({
          where: { baseCurrency: 'USD', targetCurrency: currency },
          orderBy: { recordedAt: 'desc' },
        });
        if (!rate) throw new Error(`Missing exchange rate for ${currency}`);
        exchangeRate = new Prisma.Decimal(String(rate.rate));
      }
      if (!exchangeRate.gt(0)) throw new Error('Invalid exchange rate');

      const baseAmount = originalAmount.div(exchangeRate).toDecimalPlaces(4);

      await tx.ticket.update({
        where: { id: ticketId },
        data: { status: 'ASSIGNED' },
      });

      await tx.transaction.create({
        data: {
          firmId: ownFirmId,
          flightId: String(ticket.flightId),
          ticketId: String(ticketId),
          createdByUserId: actorUserId,
          type: 'PAYABLE',
          originalAmount: originalAmount.toDecimalPlaces(4),
          currency,
          exchangeRate: exchangeRate.toDecimalPlaces(6),
          baseAmount,
          metadata: { note: 'Allocation confirmed by firm, debt incurred' },
        },
      });
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
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

    try {
      const result = await prisma.$transaction(async (tx) => {
        const [firm, flight] = await Promise.all([
          tx.firm.findUnique({ where: { id: targetFirmId }, select: { id: true } }),
          tx.flight.findUnique({ where: { id: resolvedFlightId }, select: { id: true } }),
        ]);
        if (!firm) throw new Error('Firm not found');
        if (!flight) throw new Error('Flight not found');

        const tickets: any[] = await tx.$queryRaw`
          SELECT *
          FROM "Ticket"
          WHERE "flightId" = ${resolvedFlightId}
            AND "assignedFirmId" = ${targetFirmId}
            AND status IN ('PENDING', 'ASSIGNED')
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${resolvedQuantity}
        `;

        if (tickets.length < resolvedQuantity) {
          throw new Error(`Not enough allocated tickets (requested ${resolvedQuantity}, found ${tickets.length})`);
        }

        const ticketIds = tickets.map((t) => String(t.id));
        const assignedTicketIds = tickets
          .filter((t) => String(t.status) === 'ASSIGNED')
          .map((t) => String(t.id));

        await tx.ticket.updateMany({
          where: { id: { in: ticketIds } },
          data: { status: 'AVAILABLE', assignedFirmId: null },
        });

        if (assignedTicketIds.length > 0) {
          const payables = await tx.transaction.findMany({
            where: {
              ticketId: { in: assignedTicketIds },
              type: 'PAYABLE',
              baseAmount: { gt: new Prisma.Decimal(0) },
            },
            orderBy: { createdAt: 'desc' },
          });

          const payableByTicketId = new Map<string, any>();
          for (const p of payables) {
            const tid = String(p.ticketId || '');
            if (!tid) continue;
            if (!payableByTicketId.has(tid)) payableByTicketId.set(tid, p);
          }

          const reversalRows = assignedTicketIds.map((tid) => {
            const payable = payableByTicketId.get(tid);
            if (!payable) throw new Error(`Missing PAYABLE transaction for ticket ${tid}`);

            const originalAmount = new Prisma.Decimal(String(payable.originalAmount)).mul(-1).toDecimalPlaces(4);
            const exchangeRate = new Prisma.Decimal(String(payable.exchangeRate)).toDecimalPlaces(6);
            const baseAmount = new Prisma.Decimal(String(payable.baseAmount)).mul(-1).toDecimalPlaces(4);

            return {
              firmId: targetFirmId,
              flightId: String(payable.flightId),
              ticketId: tid,
              createdByUserId: actorUserId,
              type: 'PAYABLE' as const,
              originalAmount,
              currency: String(payable.currency),
              exchangeRate,
              baseAmount,
              metadata: {
                note: 'Ticket deallocated, debt reversed',
                reversedTransactionId: String(payable.id),
              } as any,
            };
          });

          await tx.transaction.createMany({ data: reversalRows });
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
      const tickets: any[] = await tx.$queryRaw`SELECT * FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];

      const prevStatus = String(ticket.status || '');
      const prevFirmId = ticket.assignedFirmId ? String(ticket.assignedFirmId) : '';

      if (prevStatus === 'SOLD') throw new Error('Cannot deallocate a sold ticket');
      if (!prevFirmId || prevStatus === 'AVAILABLE') throw new Error('Ticket is not allocated');

      await tx.ticket.update({
        where: { id: ticketId },
        data: { status: 'AVAILABLE', assignedFirmId: null },
      });

      if (prevStatus === 'ASSIGNED') {
        const payable = await tx.transaction.findFirst({
          where: {
            ticketId: String(ticketId),
            type: 'PAYABLE',
            baseAmount: { gt: new Prisma.Decimal(0) },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!payable) throw new Error('Missing PAYABLE transaction for ticket');

        const originalAmount = new Prisma.Decimal(String(payable.originalAmount)).mul(-1).toDecimalPlaces(4);
        const exchangeRate = new Prisma.Decimal(String(payable.exchangeRate)).toDecimalPlaces(6);
        const baseAmount = new Prisma.Decimal(String(payable.baseAmount)).mul(-1).toDecimalPlaces(4);

        await tx.transaction.create({
          data: {
            firmId: prevFirmId,
            flightId: String(ticket.flightId),
            ticketId: String(ticketId),
            createdByUserId: actorUserId,
            type: 'PAYABLE',
            originalAmount,
            currency: String(payable.currency),
            exchangeRate,
            baseAmount,
            metadata: {
              note: 'Ticket deallocated, debt reversed',
              reversedTransactionId: String(payable.id),
            },
          },
        });
      }
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};

export const sellTicket = async (req: Request, res: Response) => {
  const { ticketId, flightId, flight_id, quantity, count, salePrice, saleCurrency } = req.body;
  const user = (req as any).user;
  const actorUserId = user?.userId as string | undefined;

  const role = normalizeRole(user?.role);
  const resolvedFlightId = (flightId || flight_id) && typeof (flightId || flight_id) === 'string'
    ? String(flightId || flight_id).trim()
    : '';
  const resolvedQuantity = parsePositiveInt(quantity ?? count);

  const saleAmount = parsePositiveDecimal(salePrice);
  const currency = normalizeCurrency(saleCurrency);
  if (!saleAmount) {
    return res.status(400).json({ error: 'salePrice is required' });
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return res.status(400).json({ error: 'saleCurrency must be a 3-letter code (e.g. USD)' });
  }

  const purchaserRaw = (req.body as any).purchaser ?? (req.body as any).purchaserInfo;
  const purchaserInfo = parsePurchaserInfo(purchaserRaw);
  if (!purchaserInfo) {
    return res.status(400).json({ error: 'purchaser info is required (name and idNumber)' });
  }

  // Batch sell: firm marks N of their assigned tickets for a flight as SOLD
  if (!ticketId && resolvedFlightId && resolvedQuantity) {
    if (role !== 'FIRM') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const ownFirmId = user?.firmId ? String(user.firmId) : '';
    if (!ownFirmId) {
      return res.status(400).json({ error: 'Firm account is missing firmId' });
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
          SELECT *
          FROM "Ticket"
          WHERE "flightId" = ${resolvedFlightId}
            AND status = 'ASSIGNED'
            AND "assignedFirmId" = ${ownFirmId}
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${resolvedQuantity}
        `;

        if (tickets.length < resolvedQuantity) {
          throw new Error(`Not enough assigned tickets (requested ${resolvedQuantity}, found ${tickets.length})`);
        }

        let exchangeRate = new Prisma.Decimal(1);
        if (currency !== 'USD') {
          const rate = await tx.currencyRate.findFirst({
            where: { baseCurrency: 'USD', targetCurrency: currency },
            orderBy: { recordedAt: 'desc' },
          });
          if (!rate) throw new Error(`Missing exchange rate for ${currency}`);
          exchangeRate = new Prisma.Decimal(String(rate.rate));
        }
        if (!exchangeRate.gt(0)) throw new Error('Invalid exchange rate');
        const baseAmount = saleAmount.div(exchangeRate).toDecimalPlaces(4);

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
            firmId: ownFirmId,
            flightId: String(t.flightId),
            ticketId: String(t.id),
            createdByUserId: actorUserId,
            type: 'SALE' as const,
            originalAmount: saleAmount.toDecimalPlaces(4),
            currency,
            exchangeRate: exchangeRate.toDecimalPlaces(6),
            baseAmount,
            metadata: {
              note: 'Tickets sold, revenue generated',
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
      const tickets: any[] = await tx.$queryRaw`SELECT * FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];

      const flight = await tx.flight.findUnique({
        where: { id: String(ticket.flightId) },
        select: { status: true },
      });
      if (!flight) throw new Error('Flight not found');
      if (flight.status === 'CANCELLED') throw new Error('Cannot sell tickets for a cancelled flight');
      
      if (ticket.status !== 'ASSIGNED') throw new Error('Ticket is not assigned');
      if (role === 'FIRM' && ticket.assignedFirmId !== user.firmId) {
         throw new Error('Not your ticket');
      }

      if (!ticket.assignedFirmId) throw new Error('Ticket is missing assigned firm');

      let exchangeRate = new Prisma.Decimal(1);
      if (currency !== 'USD') {
        const rate = await tx.currencyRate.findFirst({
          where: { baseCurrency: 'USD', targetCurrency: currency },
          orderBy: { recordedAt: 'desc' },
        });
        if (!rate) throw new Error(`Missing exchange rate for ${currency}`);
        exchangeRate = new Prisma.Decimal(String(rate.rate));
      }

      if (!exchangeRate.gt(0)) throw new Error('Invalid exchange rate');

      const baseAmount = saleAmount.div(exchangeRate).toDecimalPlaces(4);

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
          firmId: ticket.assignedFirmId, // revenue for assigned firm
          flightId: ticket.flightId,
          ticketId,
          createdByUserId: actorUserId,
          type: 'SALE',
          originalAmount: saleAmount.toDecimalPlaces(4),
          currency,
          exchangeRate: exchangeRate.toDecimalPlaces(6),
          baseAmount,
          metadata: {
            note: 'Ticket sold, revenue generated',
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
