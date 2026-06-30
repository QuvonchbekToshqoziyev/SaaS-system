import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';

const BASE_CURRENCY = 'UZS';

type AuthUser = {
  userId?: string;
  role?: string;
  firmId?: string | null;
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

function parseOptionalDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

async function resolveExchangeRate(currency: string, explicitRate: Prisma.Decimal | undefined) {
  if (currency === BASE_CURRENCY) return new Prisma.Decimal(1);
  if (explicitRate?.gt(0)) return explicitRate;

  const rate = await prisma.currencyRate.findFirst({
    where: { baseCurrency: BASE_CURRENCY, targetCurrency: currency },
    orderBy: { recordedAt: 'desc' },
  });
  if (!rate) throw new Error(`Missing exchange rate for ${currency}`);
  return new Prisma.Decimal(String(rate.rate));
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

  const where: Prisma.TourPackageWhereInput = {};
  if (status && status !== 'ALL') where.status = status;
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
  const quantity = Math.floor(Number(body.quantity || 0));
  const unitPrice = parseDecimal(body.unitPrice);
  const currency = normalizeCurrency(body.currency || 'UZS');
  const ownerFirmId = role === 'FIRM' ? firmId : String(body.ownerFirmId || '').trim();

  if (role === 'FIRM' && !firmId) return res.status(400).json({ error: 'Firm account is missing firmId' });
  if (!ownerFirmId || !name || !destination || !unitPrice || !currency) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (quantity <= 0) return res.status(400).json({ error: 'Quantity must be greater than 0' });
  if (!unitPrice.gt(0)) return res.status(400).json({ error: 'Unit price must be greater than 0' });
  if (!/^[A-Z]{3}$/.test(currency)) return res.status(400).json({ error: 'Invalid currency code' });

  const owner = await prisma.firm.findUnique({ where: { id: ownerFirmId }, select: { id: true } });
  if (!owner) return res.status(404).json({ error: 'Owner firm not found' });

  const created = await prisma.tourPackage.create({
    data: {
      ownerFirmId,
      name,
      destination,
      startDate: parseOptionalDate(body.startDate),
      endDate: parseOptionalDate(body.endDate),
      quantity,
      availableQuantity: quantity,
      unitPrice: unitPrice.toDecimalPlaces(4),
      currency,
      notes: typeof body.notes === 'string' ? body.notes.trim() : undefined,
    },
    include: { ownerFirm: { select: { id: true, name: true } }, sales: true },
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
  const explicitRate = parseDecimal(body.exchangeRate);

  if (!packageId || !buyerFirmId) return res.status(400).json({ error: 'Missing required fields' });
  if (quantity <= 0) return res.status(400).json({ error: 'Quantity must be greater than 0' });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const pkg = await tx.tourPackage.findUnique({
        where: { id: packageId },
        include: { ownerFirm: { select: { id: true, name: true } } },
      });
      if (!pkg) throw new Error('Tour package not found');
      if (pkg.status !== 'ACTIVE') throw new Error('Tour package is not active');
      if (role === 'FIRM' && pkg.ownerFirmId !== firmId) throw new Error('Only the owner firm can sell this package');
      if (buyerFirmId === pkg.ownerFirmId) throw new Error('Buyer and seller must be different firms');
      if (pkg.availableQuantity < quantity) throw new Error('Not enough package quantity available');

      const buyer = await tx.firm.findUnique({ where: { id: buyerFirmId }, select: { id: true, name: true } });
      if (!buyer) throw new Error('Buyer firm not found');

      const unitPrice = overrideUnitPrice?.gt(0) ? overrideUnitPrice : new Prisma.Decimal(String(pkg.unitPrice));
      const totalAmount = unitPrice.mul(quantity).toDecimalPlaces(4);
      const currency = normalizeCurrency(pkg.currency);
      const exchangeRate = await resolveExchangeRate(currency, explicitRate);
      const baseAmount = totalAmount.mul(exchangeRate).toDecimalPlaces(4);

      const txRow = await tx.transaction.create({
        data: {
          firmId: pkg.ownerFirmId,
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
            quantity,
            unitPrice: unitPrice.toString(),
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
      package: true,
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
