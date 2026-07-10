import { Request, Response } from 'express';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';
import { payableDebtTypeFilter } from '../utils/transaction-types';
import { canAccessFirm, getAccessibleFirmIds } from '../utils/access';
import { assertActiveKassaDesk, assertKassaDeskForFirmSelection } from '../utils/kassa-desk-policy';
import { canManageFirmWork } from '../utils/firm-user-roles';
import { createFirmNotification } from '../utils/notifications';
import { resolveExchangeRateToUzs } from '../services/currency-rates.service';

function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

async function getFirmKind(firmId: string) {
  if (!firmId) return null;
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { kind: true },
  });
  return firm?.kind || null;
}

async function assertCanManageAirlineFlight(user: any, flightId: string) {
  const role = normalizeRole(user?.role);
  const firmId = user?.firmId ? String(user.firmId) : '';
  if (role !== 'FIRM' || !firmId) throw new Error('Forbidden');
  const firmKind = await getFirmKind(firmId);
  if (firmKind !== 'AIRLINE') throw new Error('Only airline accounts can manage origin ticket stock');

  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    select: { airline: { select: { firmId: true } } },
  });
  if (!flight || flight.airline?.firmId !== firmId) throw new Error('Flight not found');
}

async function assertCanManageFirmFlightInventory(user: any, flightId: string) {
  const role = normalizeRole(user?.role);
  const firmId = user?.firmId ? String(user.firmId) : '';
  if (role !== 'FIRM' || !firmId) throw new Error('Forbidden');
  if (!canManageFirmWork(user)) throw new Error('Only firm admins and managers can manage flight inventory');

  const ownedTickets = await prisma.ticket.count({
    where: {
      flightId,
      assignedFirmId: firmId,
      deletedAt: null,
    },
  });
  if (ownedTickets <= 0) throw new Error('Flight not found');
  return firmId;
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

function parseAllocationRows(value: unknown): Array<{ quantity: number; price: Prisma.Decimal }> {
  if (!Array.isArray(value)) return [];
  const rows: Array<{ quantity: number; price: Prisma.Decimal }> = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as any;
    const quantity = parsePositiveInt(raw.quantity ?? raw.count);
    const price = parsePositiveDecimal(raw.allocationPrice ?? raw.price);
    if (quantity && price) rows.push({ quantity, price: price.toDecimalPlaces(4) });
  }
  return rows;
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

async function resolveKassaDesk(user: any, rawKassaDeskId: unknown) {
  const kassaDeskId = typeof rawKassaDeskId === 'string' ? rawKassaDeskId.trim() : '';
  if (!kassaDeskId) return null;

  const desk = await prisma.kassaDesk.findUnique({
    where: { id: kassaDeskId },
    select: { id: true, firmId: true, name: true, status: true, deletedAt: true },
  });
  assertActiveKassaDesk(desk);

  const accessibleFirmIds = await getAccessibleFirmIds(user);
  if (accessibleFirmIds && !accessibleFirmIds.includes(desk.firmId)) {
    throw new Error('Forbidden');
  }

  return desk;
}

async function assertKassaDeskForFirm(kassaDesk: Awaited<ReturnType<typeof resolveKassaDesk>>, firmId: string) {
  const activeDeskCount = await prisma.kassaDesk.count({
    where: { firmId, status: 'ACTIVE', deletedAt: null },
  });
  try {
    assertKassaDeskForFirmSelection(kassaDesk, firmId, activeDeskCount);
  } catch (err: any) {
    if (err?.message === 'Kassa desk must belong to the selected firm') {
      throw new Error('Kassa desk must belong to the selling firm');
    }
    throw err;
  }
}

export const getTickets = async (req: Request, res: Response) => {
  const { flightId, flight_id } = req.query;
  const id = flightId || flight_id;
  const user = (req as any).user;
  const role = String(user?.role || '').toUpperCase();
  const ownFirmId = user?.firmId ? String(user.firmId) : '';
  const firmKind = role === 'FIRM' ? await getFirmKind(ownFirmId) : null;

  const where: any = id ? { flightId: String(id) } : {};
  if (role === 'FIRM' && firmKind === 'AIRLINE') {
    if (!ownFirmId) {
      return res.status(400).json({ error: 'Firm account is missing firmId' });
    }
    where.flight = { airline: { firmId: ownFirmId } };
  } else if (role === 'FIRM') {
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
  let ownerFirmId = '';
  try {
    ownerFirmId = await assertCanManageFirmFlightInventory((req as any).user, flightId.trim());
  } catch (err: any) {
    const message = err?.message || 'Forbidden';
    return res.status(message === 'Flight not found' ? 404 : 403).json({ error: message });
  }

  const newTickets = Array.from({ length: resolvedQuantity }).map(() => ({
    flightId: flightId.trim(),
    basePrice: price,
    currency,
    status: 'ASSIGNED' as const,
    assignedFirmId: ownerFirmId,
  }));
  const result = await prisma.ticket.createMany({ data: newTickets });
  res.json({ success: true, count: result.count });
};

export const allocateTicket = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { ticketId, firmId, flightId, flight_id, quantity, count, allocationPrice, price, allocationRows } = req.body;
  const overridePrice = parsePositiveDecimal(allocationPrice ?? price);
  const parsedAllocationRows = parseAllocationRows(allocationRows);

  const resolvedFlightId = (flightId || flight_id) && typeof (flightId || flight_id) === 'string'
    ? String(flightId || flight_id).trim()
    : '';
  const resolvedQuantity = parsedAllocationRows.length
    ? parsedAllocationRows.reduce((sum, row) => sum + row.quantity, 0)
    : parsePositiveInt(quantity ?? count);

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
      const sourceFirmId = await assertCanManageFirmFlightInventory(user, resolvedFlightId);
      if (sourceFirmId === targetFirmId) {
        return res.status(400).json({ error: 'Select a different firm for allocation' });
      }
      const result = await prisma.$transaction(async (tx) => {
        const [firm, flight] = await Promise.all([
          tx.firm.findUnique({ where: { id: targetFirmId }, select: { id: true, name: true } }),
          tx.flight.findUnique({
            where: { id: resolvedFlightId },
            select: { id: true, status: true, flightNumber: true, airline: { select: { id: true, name: true, firmId: true } } },
          }),
        ]);
        if (!firm) throw new Error('Firm not found');
        if (!flight) throw new Error('Flight not found');
        if (flight.status === 'CANCELLED') throw new Error('Cannot allocate tickets for a cancelled flight');
        if (flight.airline?.firmId) {
          const connection = await tx.airlineFirmConnection.findFirst({
            where: { airlineFirmId: flight.airline.firmId, firmId: targetFirmId, status: 'ACTIVE' },
            select: { id: true },
          });
          if (!connection) throw new Error('Airline is not connected to this firm');
        }

        const tickets: any[] = await tx.$queryRaw`
          SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
          FROM "Ticket"
          WHERE "flightId" = ${resolvedFlightId}
            AND status IN ('AVAILABLE', 'ASSIGNED')
            AND "allocatedFirmId" = ${sourceFirmId}
            AND "deletedAt" IS NULL
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${resolvedQuantity}
        `;

        if (tickets.length < resolvedQuantity) {
          throw new Error(`Not enough available tickets (requested ${resolvedQuantity}, found ${tickets.length})`);
        }

        const ticketIds = tickets.map((t) => String(t.id));
        if (parsedAllocationRows.length) {
          let offset = 0;
          for (const row of parsedAllocationRows) {
            const rowTicketIds = ticketIds.slice(offset, offset + row.quantity);
            offset += row.quantity;
            if (!rowTicketIds.length) continue;
            await tx.ticket.updateMany({
              where: { id: { in: rowTicketIds } },
              data: {
                status: 'PENDING',
                assignedFirmId: targetFirmId,
                basePrice: row.price,
              },
            });
          }
        } else {
          await tx.ticket.updateMany({
            where: { id: { in: ticketIds } },
            data: {
              status: 'PENDING',
              assignedFirmId: targetFirmId,
              ...(overridePrice?.gt(0) ? { basePrice: overridePrice.toDecimalPlaces(4) } : {}),
            },
          });
        }
        await createFirmNotification(tx, targetFirmId, {
          title: 'Ticket allocation pending',
          body: `${ticketIds.length} ticket(s) for ${flight.flightNumber || 'flight'} were allocated to your firm. Accept them to start managing these tickets.`,
          type: 'TICKET_ALLOCATION_PENDING',
          entityType: 'flight',
          entityId: resolvedFlightId,
          metadata: {
            flightId: resolvedFlightId,
            flightNumber: flight.flightNumber,
            count: ticketIds.length,
            airlineId: flight.airline?.id,
            airlineName: flight.airline?.name,
            airlineFirmId: flight.airline?.firmId,
          },
        });
        await createFirmNotification(tx, flight.airline?.firmId, {
          title: 'Tickets allocated',
          body: `${ticketIds.length} ticket(s) for ${flight.flightNumber || 'flight'} were allocated to ${firm.name}.`,
          type: 'TICKET_ALLOCATED',
          entityType: 'flight',
          entityId: resolvedFlightId,
          metadata: { flightId: resolvedFlightId, flightNumber: flight.flightNumber, count: ticketIds.length, firmId: targetFirmId, firmName: firm.name },
        });
        return {
          count: ticketIds.length,
          priceRows: parsedAllocationRows.map((row) => ({ quantity: row.quantity, price: row.price.toString() })),
        };
      });

      return res.json({ success: true, count: result.count, priceRows: result.priceRows });
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
    const ticketFlight = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { flightId: true, assignedFirmId: true },
    });
    if (!ticketFlight) return res.status(404).json({ error: 'Ticket not found' });
    const sourceFirmId = await assertCanManageFirmFlightInventory(user, ticketFlight.flightId);
    if (sourceFirmId === firmId) {
      return res.status(400).json({ error: 'Select a different firm for allocation' });
    }
    await prisma.$transaction(async (tx) => {
      // Find ticket
      const tickets: any[] = await tx.$queryRaw`
        SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
        FROM "Ticket"
        WHERE id = ${ticketId}
        FOR UPDATE
      `;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];

      const flight = await tx.flight.findUnique({
        where: { id: String(ticket.flightId) },
        select: { id: true, status: true, flightNumber: true, airline: { select: { id: true, name: true, firmId: true } } },
      });
      if (!flight) throw new Error('Flight not found');
      if (flight.status === 'CANCELLED') throw new Error('Cannot allocate tickets for a cancelled flight');
      if (flight.airline?.firmId) {
        const connection = await tx.airlineFirmConnection.findFirst({
          where: { airlineFirmId: flight.airline.firmId, firmId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!connection) throw new Error('Airline is not connected to this firm');
      }
      
      if (!['AVAILABLE', 'ASSIGNED'].includes(String(ticket.status))) throw new Error('Ticket is not available for allocation');
      if (String(ticket.assignedFirmId || '') !== sourceFirmId) throw new Error('Ticket is not in your inventory');

      const firm = await tx.firm.findUnique({ where: { id: firmId }, select: { id: true, name: true } });
      if (!firm) throw new Error('Firm not found');

      // Update ticket
      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: 'PENDING',
          assignedFirmId: firmId,
          ...(overridePrice?.gt(0) ? { basePrice: overridePrice.toDecimalPlaces(4) } : {}),
        }
      });
      await createFirmNotification(tx, firmId, {
        title: 'Ticket allocation pending',
        body: `A ticket for ${flight.flightNumber || 'flight'} was allocated to your firm. Accept it to start managing this ticket.`,
        type: 'TICKET_ALLOCATION_PENDING',
        entityType: 'ticket',
        entityId: ticketId,
        metadata: { flightId: flight.id, flightNumber: flight.flightNumber, ticketId, airlineId: flight.airline?.id, airlineName: flight.airline?.name, airlineFirmId: flight.airline?.firmId },
      });
      await createFirmNotification(tx, flight.airline?.firmId, {
        title: 'Ticket allocated',
        body: `A ticket for ${flight.flightNumber || 'flight'} was allocated to ${firm.name}.`,
        type: 'TICKET_ALLOCATED',
        entityType: 'ticket',
        entityId: ticketId,
        metadata: { flightId: flight.id, flightNumber: flight.flightNumber, ticketId, firmId, firmName: firm.name },
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
  if (!canManageFirmWork(user)) {
    return res.status(403).json({ error: 'Only firm admins and managers can confirm ticket allocations' });
  }

  const ownFirmId = user?.firmId ? String(user.firmId) : '';
  if (!ownFirmId) {
    return res.status(400).json({ error: 'Firm account is missing firmId' });
  }

  const kassaDesk = await resolveKassaDesk(user, req.body?.kassaDeskId);

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
          select: { status: true, flightNumber: true, airline: { select: { id: true, name: true, firmId: true } } },
        });
        if (!flight) throw new Error('Flight not found');
        if (flight.status === 'CANCELLED') throw new Error('Cannot confirm allocation for a cancelled flight');
        const airlineFirmId = flight.airline?.firmId || null;

        const tickets: any[] = await tx.$queryRaw`
          SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
          FROM "Ticket"
          WHERE "flightId" = ${resolvedFlightId}
            AND status = 'PENDING'
            AND "allocatedFirmId" = ${ownFirmId}
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

        const transactionRows = await Promise.all(tickets.map(async (t) => {
          const originalAmount = new Prisma.Decimal(String(t.basePrice)).toDecimalPlaces(4);
          const currency = normalizeCurrency(t.currency);
          const exchangeRate = await resolveExchangeRateToUzs(user, {
            currency,
            overrideRate: req.body?.exchangeRate,
          });
          const baseAmount = originalAmount.mul(exchangeRate).toDecimalPlaces(4);

          return {
            firmId: ownFirmId,
            payerFirmId: ownFirmId,
            receiverFirmId: airlineFirmId,
            flightId: String(t.flightId),
            ticketId: String(t.id),
            createdByUserId: actorUserId,
            kassaDeskId: kassaDesk?.id,
            type: 'PAYABLE' as const,
            originalAmount,
            currency,
            exchangeRate: exchangeRate.toDecimalPlaces(6),
            baseAmount,
            direction: airlineFirmId ? 'AIRLINE_TO_FIRM' : undefined,
            metadata: {
              note: airlineFirmId ? 'Airline ticket allocation confirmed, firm owes airline' : 'Allocation confirmed by firm, debt incurred',
              airlineId: flight.airline?.id,
              airlineName: flight.airline?.name,
              airlineFirmId,
              kassaDeskId: kassaDesk?.id,
              kassaDeskLabel: kassaDesk?.name,
            } as any,
          };
        }));

        await tx.transaction.createMany({ data: transactionRows });
        await createFirmNotification(tx, ownFirmId, {
          title: 'Ticket allocation accepted',
          body: `${ticketIds.length} ticket(s) for ${flight.flightNumber || 'flight'} are now active in your firm inventory.`,
          type: 'TICKET_ALLOCATION_ACCEPTED',
          entityType: 'flight',
          entityId: resolvedFlightId,
          metadata: { flightId: resolvedFlightId, flightNumber: flight.flightNumber, count: ticketIds.length, airlineId: flight.airline?.id, airlineName: flight.airline?.name, airlineFirmId },
        });
        await createFirmNotification(tx, airlineFirmId, {
          title: 'Firm accepted tickets',
          body: `${ticketIds.length} ticket(s) for ${flight.flightNumber || 'flight'} were accepted by the firm.`,
          type: 'TICKET_ALLOCATION_ACCEPTED',
          entityType: 'flight',
          entityId: resolvedFlightId,
          metadata: { flightId: resolvedFlightId, flightNumber: flight.flightNumber, count: ticketIds.length, firmId: ownFirmId },
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

  try {
    await prisma.$transaction(async (tx) => {
      const tickets: any[] = await tx.$queryRaw`
        SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
        FROM "Ticket"
        WHERE id = ${ticketId}
        FOR UPDATE
      `;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];

      const flight = await tx.flight.findUnique({
        where: { id: String(ticket.flightId) },
        select: { status: true, flightNumber: true, airline: { select: { id: true, name: true, firmId: true } } },
      });
      if (!flight) throw new Error('Flight not found');
      if (flight.status === 'CANCELLED') throw new Error('Cannot confirm allocation for a cancelled flight');

      if (ticket.status !== 'PENDING') throw new Error('Ticket is not pending confirmation');
      if (String(ticket.assignedFirmId || '') !== ownFirmId) throw new Error('Not your ticket');

      const originalAmount = new Prisma.Decimal(String(ticket.basePrice));
      const currency = normalizeCurrency(ticket.currency);

      const exchangeRate = await resolveExchangeRateToUzs(user, {
        currency,
        overrideRate: req.body?.exchangeRate,
      });
      const baseAmount = originalAmount.mul(exchangeRate).toDecimalPlaces(4);
      const airlineFirmId = flight.airline?.firmId || null;

      await tx.ticket.update({
        where: { id: ticketId },
        data: { status: 'ASSIGNED' },
      });

      await tx.transaction.create({
        data: {
          firmId: ownFirmId,
          payerFirmId: ownFirmId,
          receiverFirmId: airlineFirmId,
          flightId: String(ticket.flightId),
          ticketId: String(ticketId),
          createdByUserId: actorUserId,
          kassaDeskId: kassaDesk?.id,
          type: 'PAYABLE',
          originalAmount: originalAmount.toDecimalPlaces(4),
          currency,
          exchangeRate: exchangeRate.toDecimalPlaces(6),
          baseAmount,
          direction: airlineFirmId ? 'AIRLINE_TO_FIRM' : undefined,
          metadata: {
            note: airlineFirmId ? 'Airline ticket allocation confirmed, firm owes airline' : 'Allocation confirmed by firm, debt incurred',
            airlineId: flight.airline?.id,
            airlineName: flight.airline?.name,
            airlineFirmId,
            kassaDeskId: kassaDesk?.id,
            kassaDeskLabel: kassaDesk?.name,
          },
        },
      });
      await createFirmNotification(tx, ownFirmId, {
        title: 'Ticket allocation accepted',
        body: `A ticket for ${flight.flightNumber || 'flight'} is now active in your firm inventory.`,
        type: 'TICKET_ALLOCATION_ACCEPTED',
        entityType: 'ticket',
        entityId: ticketId,
        metadata: { flightId: String(ticket.flightId), flightNumber: flight.flightNumber, ticketId, airlineId: flight.airline?.id, airlineName: flight.airline?.name, airlineFirmId },
      });
      await createFirmNotification(tx, airlineFirmId, {
        title: 'Firm accepted ticket',
        body: `A ticket for ${flight.flightNumber || 'flight'} was accepted by the firm.`,
        type: 'TICKET_ALLOCATION_ACCEPTED',
        entityType: 'ticket',
        entityId: ticketId,
        metadata: { flightId: String(ticket.flightId), flightNumber: flight.flightNumber, ticketId, firmId: ownFirmId },
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
          SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
          FROM "Ticket"
          WHERE "flightId" = ${resolvedFlightId}
            AND "allocatedFirmId" = ${targetFirmId}
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
              type: payableDebtTypeFilter,
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
      const tickets: any[] = await tx.$queryRaw`
        SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
        FROM "Ticket"
        WHERE id = ${ticketId}
        FOR UPDATE
      `;
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
            type: payableDebtTypeFilter,
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
  const { ticketId, flightId, flight_id, firmId, quantity, count, salePrice, saleCurrency } = req.body;
  const user = (req as any).user;
  const actorUserId = user?.userId as string | undefined;

  const role = normalizeRole(user?.role);
  let kassaDesk: Awaited<ReturnType<typeof resolveKassaDesk>> = null;
  const resolvedFlightId = (flightId || flight_id) && typeof (flightId || flight_id) === 'string'
    ? String(flightId || flight_id).trim()
    : '';
  const resolvedQuantity = parsePositiveInt(quantity ?? count);

  if (!['SUPERADMIN', 'ADMIN', 'FIRM'].includes(role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (role === 'FIRM' && !canManageFirmWork(user)) {
    return res.status(403).json({ error: 'Only firm admins and managers can sell tickets' });
  }

  const saleAmount = parsePositiveDecimal(salePrice);
  const currency = normalizeCurrency(saleCurrency);
  const rawExchangeRate = (req.body as any)?.exchangeRate;
  if (!saleAmount) {
    return res.status(400).json({ error: 'salePrice is required' });
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return res.status(400).json({ error: 'saleCurrency must be a 3-letter code (e.g. UZS)' });
  }
  let saleExchangeRate: Prisma.Decimal;
  try {
    saleExchangeRate = await resolveExchangeRateToUzs(user, {
      currency,
      overrideRate: rawExchangeRate,
    });
  } catch (err: any) {
    return res.status(err?.statusCode || 400).json({ error: err?.message || 'Exchange rate to UZS is required' });
  }

  const purchaserRaw = (req.body as any).purchaser ?? (req.body as any).purchaserInfo;
  const purchaserInfo = parsePurchaserInfo(purchaserRaw);
  if (!purchaserInfo) {
    return res.status(400).json({ error: 'purchaser info is required (name and idNumber)' });
  }

  // Batch sell: firm marks N of their assigned tickets for a flight as SOLD
  if (!ticketId && resolvedFlightId && resolvedQuantity) {
    const sellerFirmId = role === 'FIRM'
      ? (user?.firmId ? String(user.firmId) : '')
      : typeof firmId === 'string' && firmId.trim()
        ? firmId.trim()
        : '';
    if (!sellerFirmId) {
      return res.status(400).json({ error: 'firmId is required' });
    }
    if (role !== 'SUPERADMIN' && !(await canAccessFirm(user, sellerFirmId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      kassaDesk = await resolveKassaDesk(user, req.body?.kassaDeskId);
      await assertKassaDeskForFirm(kassaDesk, sellerFirmId);
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Invalid kassa desk' });
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
          SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
          FROM "Ticket"
          WHERE "flightId" = ${resolvedFlightId}
            AND status = 'ASSIGNED'
            AND "allocatedFirmId" = ${sellerFirmId}
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${resolvedQuantity}
        `;

        if (tickets.length < resolvedQuantity) {
          throw new Error(`Not enough assigned tickets (requested ${resolvedQuantity}, found ${tickets.length})`);
        }

        const exchangeRate = saleExchangeRate;
        const baseAmount = saleAmount.mul(exchangeRate).toDecimalPlaces(4);

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
            firmId: sellerFirmId,
            flightId: String(t.flightId),
            ticketId: String(t.id),
            createdByUserId: actorUserId,
            kassaDeskId: kassaDesk?.id,
            type: 'SALE' as const,
            originalAmount: saleAmount.toDecimalPlaces(4),
            currency,
            exchangeRate: exchangeRate.toDecimalPlaces(6),
            baseAmount,
            metadata: {
              note: 'Tickets sold, revenue generated',
              kassaDeskId: kassaDesk?.id,
              kassaDeskLabel: kassaDesk?.name,
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
      const tickets: any[] = await tx.$queryRaw`
        SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
        FROM "Ticket"
        WHERE id = ${ticketId}
        FOR UPDATE
      `;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];

      const flight = await tx.flight.findUnique({
        where: { id: String(ticket.flightId) },
        select: { status: true },
      });
      if (!flight) throw new Error('Flight not found');
      if (flight.status === 'CANCELLED') throw new Error('Cannot sell tickets for a cancelled flight');
      
      if (ticket.status !== 'ASSIGNED') throw new Error('Ticket is not assigned');
      if (!ticket.assignedFirmId) throw new Error('Ticket is missing assigned firm');
      const assignedFirmId = String(ticket.assignedFirmId);
      if (role !== 'SUPERADMIN' && !(await canAccessFirm(user, assignedFirmId))) {
        throw new Error('Not your ticket');
      }
      kassaDesk = await resolveKassaDesk(user, req.body?.kassaDeskId);
      await assertKassaDeskForFirm(kassaDesk, assignedFirmId);

      const exchangeRate = saleExchangeRate;
      const baseAmount = saleAmount.mul(exchangeRate).toDecimalPlaces(4);

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
          firmId: assignedFirmId,
          flightId: ticket.flightId,
          ticketId,
          createdByUserId: actorUserId,
          kassaDeskId: kassaDesk?.id,
          type: 'SALE',
          originalAmount: saleAmount.toDecimalPlaces(4),
          currency,
          exchangeRate: exchangeRate.toDecimalPlaces(6),
          baseAmount,
          metadata: {
            note: 'Ticket sold, revenue generated',
            kassaDeskId: kassaDesk?.id,
            kassaDeskLabel: kassaDesk?.name,
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

export const cancelSale = async (req: Request, res: Response) => {
  const { ticketId } = req.body;
  const user = (req as any).user;
  const actorUserId = user?.userId ? String(user.userId) : undefined;
  const role = normalizeRole(user?.role);

  if (!['SUPERADMIN', 'ADMIN'].includes(role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!ticketId || typeof ticketId !== 'string' || !ticketId.trim()) {
    return res.status(400).json({ error: 'ticketId is required' });
  }

  const resolvedTicketId = ticketId.trim();

  try {
    await prisma.$transaction(async (tx) => {
      const tickets: any[] = await tx.$queryRaw`
        SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
        FROM "Ticket"
        WHERE id = ${resolvedTicketId}
        FOR UPDATE
      `;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];

      if (String(ticket.status || '') !== 'SOLD') throw new Error('Ticket is not sold');

      const sale = await tx.transaction.findFirst({
        where: {
          ticketId: resolvedTicketId,
          type: 'SALE',
          baseAmount: { gt: new Prisma.Decimal(0) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!sale) throw new Error('Missing SALE transaction for ticket');

      const originalAmount = new Prisma.Decimal(String(sale.originalAmount)).mul(-1).toDecimalPlaces(4);
      const exchangeRate = new Prisma.Decimal(String(sale.exchangeRate)).toDecimalPlaces(6);
      const baseAmount = new Prisma.Decimal(String(sale.baseAmount)).mul(-1).toDecimalPlaces(4);

      await tx.transaction.create({
        data: {
          firmId: String(sale.firmId),
          flightId: String(sale.flightId),
          ticketId: resolvedTicketId,
          createdByUserId: actorUserId,
          type: 'SALE',
          originalAmount,
          currency: String(sale.currency),
          exchangeRate,
          baseAmount,
          metadata: {
            note: 'Sale cancelled (admin), revenue reversed',
            reversedTransactionId: String(sale.id),
          },
        },
      });

      await tx.ticket.update({
        where: { id: resolvedTicketId },
        data: {
          status: 'ASSIGNED',
          soldPrice: null,
          soldCurrency: null,
          purchaserInfo: Prisma.DbNull,
        },
      });
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};

export const createSaleCancellationRequest = async (req: Request, res: Response) => {
  const { ticketId } = req.body;
  const reasonRaw = (req.body as any)?.reason ?? (req.body as any)?.requestReason;
  const user = (req as any).user;
  const role = normalizeRole(user?.role);
  const actorUserId = user?.userId ? String(user.userId) : '';

  if (role !== 'FIRM') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!canManageFirmWork(user)) {
    return res.status(403).json({ error: 'Only firm admins and managers can request sale cancellation' });
  }

  const ownFirmId = user?.firmId ? String(user.firmId) : '';
  if (!ownFirmId) {
    return res.status(400).json({ error: 'Firm account is missing firmId' });
  }

  if (!actorUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!ticketId || typeof ticketId !== 'string' || !ticketId.trim()) {
    return res.status(400).json({ error: 'ticketId is required' });
  }

  const reason = normalizeOptionalString(reasonRaw);
  if (!reason) {
    return res.status(400).json({ error: 'reason is required' });
  }
  if (reason.length > 500) {
    return res.status(400).json({ error: 'reason is too long (max 500 chars)' });
  }

  const resolvedTicketId = ticketId.trim();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const tickets: any[] = await tx.$queryRaw`
        SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
        FROM "Ticket"
        WHERE id = ${resolvedTicketId}
        FOR UPDATE
      `;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];

      if (String(ticket.status || '') !== 'SOLD') throw new Error('Ticket is not sold');
      if (String(ticket.assignedFirmId || '') !== ownFirmId) throw new Error('Not your ticket');

      const existing = await tx.saleCancellationRequest.findFirst({
        where: { ticketId: resolvedTicketId, status: 'PENDING' },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) throw new Error('Cancellation request already pending for this ticket');

      return tx.saleCancellationRequest.create({
        data: {
          flightId: String(ticket.flightId),
          ticketId: resolvedTicketId,
          firmId: ownFirmId,
          status: 'PENDING',
          reason,
          createdByUserId: actorUserId,
        },
        select: {
          id: true,
          ticketId: true,
          status: true,
          reason: true,
          createdAt: true,
        },
      });
    });

    return res.json({ success: true, request: created });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};

export const listSaleCancellationRequests = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const role = normalizeRole(user?.role);

  if (!['SUPERADMIN', 'ADMIN', 'FIRM'].includes(role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const ownFirmId = user?.firmId ? String(user.firmId) : '';
  if (role === 'FIRM' && !ownFirmId) {
    return res.status(400).json({ error: 'Firm account is missing firmId' });
  }

  const { flightId, flight_id, status } = req.query as any;
  const resolvedFlightId = (flightId || flight_id) && typeof (flightId || flight_id) === 'string'
    ? String(flightId || flight_id).trim()
    : '';

  const rawStatus = typeof status === 'string' ? status.trim().toUpperCase() : 'PENDING';
  const resolvedStatus = ['PENDING', 'APPROVED', 'REJECTED'].includes(rawStatus) ? rawStatus : 'PENDING';

  const where: any = { status: resolvedStatus };
  if (resolvedFlightId) where.flightId = resolvedFlightId;
  if (role === 'FIRM') where.firmId = ownFirmId;

  const requests = await prisma.saleCancellationRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      flightId: true,
      ticketId: true,
      firmId: true,
      status: true,
      reason: true,
      decisionReason: true,
      createdAt: true,
      decidedAt: true,
      firm: { select: { id: true, name: true } },
      createdBy: { select: { id: true, email: true } },
      decidedBy: { select: { id: true, email: true } },
    },
  });

  return res.json(requests);
};

export const approveSaleCancellationRequest = async (req: Request, res: Response) => {
  const { requestId } = req.body as any;
  const decisionReasonRaw = (req.body as any)?.decisionReason ?? (req.body as any)?.reason;
  const user = (req as any).user;
  const role = normalizeRole(user?.role);
  const actorUserId = user?.userId ? String(user.userId) : '';

  if (!['SUPERADMIN', 'ADMIN'].includes(role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!actorUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!requestId || typeof requestId !== 'string' || !requestId.trim()) {
    return res.status(400).json({ error: 'requestId is required' });
  }

  const decisionReason = normalizeOptionalString(decisionReasonRaw);
  if (!decisionReason) {
    return res.status(400).json({ error: 'decisionReason is required' });
  }
  if (decisionReason.length > 500) {
    return res.status(400).json({ error: 'decisionReason is too long (max 500 chars)' });
  }

  const resolvedRequestId = requestId.trim();

  try {
    await prisma.$transaction(async (tx) => {
      const rows: any[] = await tx.$queryRaw`
        SELECT *
        FROM "SaleCancellationRequest"
        WHERE id = ${resolvedRequestId}
        FOR UPDATE
      `;

      if (rows.length === 0) throw new Error('Request not found');
      const reqRow = rows[0];

      if (String(reqRow.status || '') !== 'PENDING') throw new Error('Request is not pending');

      const ticketId = String(reqRow.ticketId || '');
      const firmId = String(reqRow.firmId || '');
      const firmReason = String(reqRow.reason || '');

      if (!ticketId) throw new Error('Invalid request: missing ticketId');
      if (!firmId) throw new Error('Invalid request: missing firmId');

      const tickets: any[] = await tx.$queryRaw`
        SELECT *, "allocatedFirmId" AS "assignedFirmId", "price" AS "basePrice"
        FROM "Ticket"
        WHERE id = ${ticketId}
        FOR UPDATE
      `;
      if (tickets.length === 0) throw new Error('Ticket not found');
      const ticket = tickets[0];

      if (String(ticket.status || '') !== 'SOLD') throw new Error('Ticket is not sold');
      if (String(ticket.assignedFirmId || '') !== firmId) throw new Error('Ticket is not assigned to the request firm');

      const sale = await tx.transaction.findFirst({
        where: {
          ticketId,
          type: 'SALE',
          baseAmount: { gt: new Prisma.Decimal(0) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!sale) throw new Error('Missing SALE transaction for ticket');

      if (String(sale.firmId) !== firmId) {
        throw new Error('SALE transaction firm does not match request firm');
      }

      const originalAmount = new Prisma.Decimal(String(sale.originalAmount)).mul(-1).toDecimalPlaces(4);
      const exchangeRate = new Prisma.Decimal(String(sale.exchangeRate)).toDecimalPlaces(6);
      const baseAmount = new Prisma.Decimal(String(sale.baseAmount)).mul(-1).toDecimalPlaces(4);

      await tx.transaction.create({
        data: {
          firmId,
          flightId: String(sale.flightId),
          ticketId,
          createdByUserId: actorUserId,
          type: 'SALE',
          originalAmount,
          currency: String(sale.currency),
          exchangeRate,
          baseAmount,
          metadata: {
            note: 'Sale cancelled after firm request, revenue reversed',
            reversedTransactionId: String(sale.id),
            saleCancellationRequestId: resolvedRequestId,
            firmReason,
            adminReason: decisionReason,
          } as any,
        },
      });

      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: 'ASSIGNED',
          soldPrice: null,
          soldCurrency: null,
          purchaserInfo: Prisma.DbNull,
        },
      });

      await tx.saleCancellationRequest.update({
        where: { id: resolvedRequestId },
        data: {
          status: 'APPROVED',
          decisionReason,
          decidedByUserId: actorUserId,
          decidedAt: new Date(),
        },
      });
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};
