import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { canAccessFirm } from '../utils/access';
import { writeAuditLog } from '../utils/audit';
import { canManageFirmWork } from '../utils/firm-user-roles';

type AuthUser = {
  userId?: string;
  role?: string;
  firmId?: string | null;
  firmRole?: string | null;
};

function getAuthUser(req: Request): AuthUser {
  return ((req as any).user || {}) as AuthUser;
}

function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

function normalizeCurrency(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function parseDecimal(value: unknown): Prisma.Decimal | undefined {
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Prisma.Decimal(String(value));
  if (typeof value === 'string' && value.trim()) return new Prisma.Decimal(value.trim());
  return undefined;
}

function actorFirmScope(req: Request) {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  const firmId = authUser.firmId ? String(authUser.firmId) : '';
  return { authUser, role, firmId };
}

export const listTourPackages = async (req: Request, res: Response) => {
  const { role, firmId } = actorFirmScope(req);
  const status = String(req.query.status || 'ACTIVE').trim().toUpperCase();

  const where: Prisma.TourPackageWhereInput = { status: { not: 'DELETED' }, deletedAt: null };
  if (status && status !== 'ALL') where.status = status === 'DELETED' ? { not: 'DELETED' } : status;
  if (role === 'FIRM') {
    if (!firmId) return res.status(400).json({ error: 'Firm account is missing firmId' });
    where.OR = [
      { ownerFirmId: firmId },
      { availableQuantity: { gt: 0 }, status: 'ACTIVE' },
    ];
  }

  const packages = await prisma.tourPackage.findMany({
    where,
    include: {
      ownerFirm: { select: { id: true, name: true } },
      flight: { select: { id: true, flightNumber: true, route: true, departure: true, arrival: true, currency: true } },
      sales: {
        include: {
          buyerFirm: { select: { id: true, name: true } },
          sellerFirm: { select: { id: true, name: true } },
          transaction: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(packages);
};

export const createTourPackage = async (req: Request, res: Response) => {
  const { role, firmId } = actorFirmScope(req);
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const destination = String(body.destination || '').trim();
  const flightId = String(body.flightId || '').trim();
  const quantity = Math.floor(Number(body.quantity || 0));
  const ticketPrice = parseDecimal(body.ticketPrice);
  const servicePrice = parseDecimal(body.servicePrice);
  const explicitUnitPrice = parseDecimal(body.unitPrice);
  const currency = normalizeCurrency(body.currency || 'UZS');
  const ownerFirmId = firmId;

  if (role === 'FIRM' && !firmId) return res.status(400).json({ error: 'Firm account is missing firmId' });
  if (role !== 'FIRM') return res.status(403).json({ error: 'Only firm accounts can create tour packages' });
  if (!canManageFirmWork(getAuthUser(req))) return res.status(403).json({ error: 'Only firm admins and managers can create tour packages' });
  if (!ownerFirmId || !flightId || !name || !ticketPrice || !servicePrice || !currency) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (quantity <= 0) return res.status(400).json({ error: 'Quantity must be greater than 0' });
  if (ticketPrice.lt(0) || servicePrice.lt(0)) return res.status(400).json({ error: 'Price parts cannot be negative' });
  const unitPrice = explicitUnitPrice?.gt(0) ? explicitUnitPrice : ticketPrice.add(servicePrice);
  if (!unitPrice.gt(0)) return res.status(400).json({ error: 'Unit price must be greater than 0' });
  if (!unitPrice.equals(ticketPrice.add(servicePrice))) {
    return res.status(400).json({ error: 'Unit price must equal ticket price plus service price' });
  }
  if (!/^[A-Z]{3}$/.test(currency)) return res.status(400).json({ error: 'Invalid currency code' });

  const [owner, flight] = await Promise.all([
    prisma.firm.findUnique({ where: { id: ownerFirmId }, select: { id: true } }),
    prisma.flight.findUnique({
      where: { id: flightId },
      select: { id: true, route: true },
    }),
  ]);
  if (!owner) return res.status(404).json({ error: 'Owner firm not found' });
  if (!flight) return res.status(404).json({ error: 'Flight not found' });

  let created: Awaited<ReturnType<typeof prisma.tourPackage.create>>;
  try {
    created = await prisma.$transaction(async (tx) => {
      const tickets: Array<{ id: string }> = await tx.$queryRaw`
        SELECT id
        FROM "Ticket"
        WHERE "flightId" = ${flightId}
          AND "allocatedFirmId" = ${ownerFirmId}
          AND status = 'ASSIGNED'
          AND "deletedAt" IS NULL
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${quantity}
      `;

      if (tickets.length < quantity) {
        throw new Error(`Not enough assigned tickets to create this tour (requested ${quantity}, available ${tickets.length})`);
      }

      const ticketIds = tickets.map((ticket) => ticket.id);
      await tx.ticket.updateMany({
        where: { id: { in: ticketIds } },
        data: { status: 'ALLOCATED' },
      });

      return tx.tourPackage.create({
        data: {
          ownerFirmId,
          flightId,
          name,
          destination: destination || flight.route,
          quantity,
          availableQuantity: quantity,
          unitPrice: unitPrice.toDecimalPlaces(4),
          ticketPrice: ticketPrice.toDecimalPlaces(4),
          servicePrice: servicePrice.toDecimalPlaces(4),
          currency,
          notes: typeof body.notes === 'string' ? body.notes.trim() : undefined,
        },
        include: {
          ownerFirm: { select: { id: true, name: true } },
          flight: { select: { id: true, flightNumber: true, route: true, departure: true, arrival: true, currency: true } },
          sales: true,
        },
      });
    });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to reserve tickets for tour package' });
  }

  await writeAuditLog(req, {
    action: 'CREATE',
    entityType: 'tourPackage',
    entityId: created.id,
    entityLabel: created.name,
    summary: `Created tour package ${created.name}`,
    after: created,
    metadata: { reservedTicketCount: quantity },
  });
  res.status(201).json(created);
};

export const sellTourPackage = async (req: Request, res: Response) => {
  const { authUser, role, firmId } = actorFirmScope(req);
  const packageId = String(req.params.id || '').trim();
  const body = req.body || {};
  const buyerFirmId = String(body.buyerFirmId || '').trim();
  const quantity = Math.floor(Number(body.quantity || 0));
  const overrideUnitPrice = parseDecimal(body.unitPrice);

  if (!packageId || !buyerFirmId) return res.status(400).json({ error: 'Missing required fields' });
  if (quantity <= 0) return res.status(400).json({ error: 'Quantity must be greater than 0' });
  if (!['SUPERADMIN', 'ADMIN', 'FIRM'].includes(role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (role === 'FIRM' && !canManageFirmWork(authUser)) {
    return res.status(403).json({ error: 'Only firm admins and managers can sell tour packages' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const pkg = await tx.tourPackage.findUnique({
        where: { id: packageId },
        include: {
          ownerFirm: { select: { id: true, name: true } },
          flight: { select: { id: true, flightNumber: true, route: true } },
        },
      });
      if (!pkg) throw new Error('Tour package not found');
      if (pkg.status !== 'ACTIVE') throw new Error('Tour package is not active');
      if (role === 'FIRM' && pkg.ownerFirmId !== firmId) throw new Error('Only the owner firm can sell this package');
      if (role === 'ADMIN' && !(await canAccessFirm(authUser, pkg.ownerFirmId))) {
        throw new Error('Only the owner firm admin can sell this package');
      }
      if (buyerFirmId === pkg.ownerFirmId) throw new Error('Buyer and seller must be different firms');
      if (pkg.availableQuantity < quantity) throw new Error('Not enough package quantity available');

      const buyer = await tx.firm.findUnique({ where: { id: buyerFirmId }, select: { id: true, name: true } });
      if (!buyer) throw new Error('Buyer firm not found');

      const unitPrice = overrideUnitPrice?.gt(0) ? overrideUnitPrice : new Prisma.Decimal(String(pkg.unitPrice));
      const totalAmount = unitPrice.mul(quantity).toDecimalPlaces(4);
      const currency = normalizeCurrency(pkg.currency);
      const exchangeRate = new Prisma.Decimal(1);
      const baseAmount = totalAmount.toDecimalPlaces(4);

      const txRow = await tx.transaction.create({
        data: {
          firmId: pkg.ownerFirmId,
          flightId: pkg.flightId || undefined,
          payerFirmId: buyerFirmId,
          receiverFirmId: pkg.ownerFirmId,
          direction: 'FIRM_TO_FIRM',
          subjectType: 'TOUR_PACKAGE',
          subjectId: packageId,
          createdByUserId: authUser.userId ? String(authUser.userId) : undefined,
          type: 'SALE',
          originalAmount: totalAmount,
          currency,
          exchangeRate: exchangeRate.toDecimalPlaces(6),
          baseAmount,
          metadata: {
            packageId,
            packageName: pkg.name,
            destination: pkg.destination,
            flightId: pkg.flightId,
            flightNumber: pkg.flight?.flightNumber,
            flightRoute: pkg.flight?.route,
            quantity,
            unitPrice: unitPrice.toString(),
            ticketPrice: pkg.ticketPrice.toString(),
            servicePrice: pkg.servicePrice.toString(),
            payerLabel: buyer.name,
            receiverLabel: pkg.ownerFirm.name,
            directionLabel: `${buyer.name} -> ${pkg.ownerFirm.name}`,
            reason: 'Tour package sold firm-to-firm',
          },
        },
      });

      const sale = await tx.tourPackageSale.create({
        data: {
          packageId,
          sellerFirmId: pkg.ownerFirmId,
          buyerFirmId,
          quantity,
          unitPrice: unitPrice.toDecimalPlaces(4),
          currency,
          totalAmount,
          transactionId: txRow.id,
          notes: typeof body.notes === 'string' ? body.notes.trim() : undefined,
        },
        include: {
          package: true,
          sellerFirm: { select: { id: true, name: true } },
          buyerFirm: { select: { id: true, name: true } },
          transaction: true,
        },
      });

      await tx.tourPackage.update({
        where: { id: packageId },
        data: { availableQuantity: { decrement: quantity } },
      });

      return sale;
    });

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'tourPackageSale',
      entityId: result.id,
      entityLabel: result.package?.name || packageId,
      summary: `Sold tour package ${result.package?.name || packageId}`,
      after: result,
      metadata: { packageId, buyerFirmId, quantity },
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to sell tour package' });
  }
};

export const listTourPackageSales = async (req: Request, res: Response) => {
  const { role, firmId } = actorFirmScope(req);
  const where: Prisma.TourPackageSaleWhereInput = {};
  if (role === 'FIRM') {
    if (!firmId) return res.status(400).json({ error: 'Firm account is missing firmId' });
    where.OR = [{ sellerFirmId: firmId }, { buyerFirmId: firmId }];
  }

  const sales = await prisma.tourPackageSale.findMany({
    where,
    include: {
      package: {
        include: {
          flight: { select: { id: true, flightNumber: true, route: true, departure: true, arrival: true, currency: true } },
        },
      },
      sellerFirm: { select: { id: true, name: true } },
      buyerFirm: { select: { id: true, name: true } },
      transaction: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(sales);
};

export const listTourCounterpartyFirms = async (_req: Request, res: Response) => {
  const firms = await prisma.firm.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  res.json(firms);
};
