import { Request, Response } from 'express';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';

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

export const getTransactions = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);

  const { dateFrom, dateTo, firmId, flightId, type, currency, page = '1', limit = '10' } = req.query;
  const where: Prisma.TransactionWhereInput = {};

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(String(dateFrom));
    if (dateTo) where.createdAt.lte = new Date(String(dateTo));
  }
  if (role === 'FIRM') {
    const ownFirmId = authUser.firmId ? String(authUser.firmId) : '';
    if (!ownFirmId) {
      return res.status(400).json({ error: 'Firm account is missing firmId' });
    }
    where.OR = [
      { firmId: ownFirmId },
      { payerFirmId: ownFirmId },
      { receiverFirmId: ownFirmId },
    ];
  } else if (firmId) {
    const scopedFirmId = String(firmId);
    where.OR = [
      { firmId: scopedFirmId },
      { payerFirmId: scopedFirmId },
      { receiverFirmId: scopedFirmId },
    ];
  }
  if (flightId) where.flightId = String(flightId);
  if (type) where.type = String(type).toUpperCase() as any;
  if (currency) where.currency = String(currency);

  const pageNum = Math.max(1, parseInt(String(page)) || 1);
  const limitNum = Math.max(1, parseInt(String(limit)) || 10);
  const skip = (pageNum - 1) * limitNum;

  const [total, data] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: { firm: true, flight: true, payerFirm: true, receiverFirm: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum
    })
  ]);
  
  res.json({
    data,
    meta: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    }
  });
};

export const getTransactionById = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);

  const { id } = req.params;
  const tx = await prisma.transaction.findUnique({
    where: { id: String(id) },
    include: { firm: true, flight: true, ticket: true, payerFirm: true, receiverFirm: true }
  });
  if (!tx) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  if (role === 'FIRM') {
    const ownFirmId = authUser.firmId ? String(authUser.firmId) : '';
    if (!ownFirmId || (tx.firmId !== ownFirmId && tx.payerFirmId !== ownFirmId && tx.receiverFirmId !== ownFirmId)) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
  }
  res.json(tx);
};

export const createDirectedTransaction = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  const body = req.body || {};

  const type = String(body.type || '').trim().toUpperCase();
  const payerFirmId = String(body.payerFirmId || '').trim();
  const receiverFirmId = String(body.receiverFirmId || '').trim();
  const flightId = String(body.flightId || '').trim() || undefined;
  const amount = parseDecimal(body.amount);
  const currency = normalizeCurrency(body.currency || BASE_CURRENCY);
  const exchangeRateInput = parseDecimal(body.exchangeRate);
  const note = typeof body.note === 'string' ? body.note.trim() : '';

  if (!['SALE', 'PAYMENT', 'REFUND', 'ADJUSTMENT', 'PAYABLE'].includes(type)) {
    return res.status(400).json({ error: 'Invalid transaction type' });
  }
  if (!payerFirmId || !receiverFirmId || !amount || !currency) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (payerFirmId === receiverFirmId) {
    return res.status(400).json({ error: 'Payer and receiver must be different' });
  }
  if (!amount.gt(0)) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return res.status(400).json({ error: 'Invalid currency code' });
  }

  if (role === 'FIRM') {
    const ownFirmId = authUser.firmId ? String(authUser.firmId) : '';
    if (!ownFirmId) return res.status(400).json({ error: 'Firm account is missing firmId' });
    if (payerFirmId !== ownFirmId && receiverFirmId !== ownFirmId) {
      return res.status(403).json({ error: 'Firm must be payer or receiver' });
    }
  }

  try {
    const [payer, receiver, flight] = await Promise.all([
      prisma.firm.findUnique({ where: { id: payerFirmId }, select: { id: true, name: true } }),
      prisma.firm.findUnique({ where: { id: receiverFirmId }, select: { id: true, name: true } }),
      flightId ? prisma.flight.findUnique({ where: { id: flightId }, select: { id: true, flightNumber: true } }) : Promise.resolve(null),
    ]);
    if (!payer) return res.status(404).json({ error: 'Payer firm not found' });
    if (!receiver) return res.status(404).json({ error: 'Receiver firm not found' });
    if (flightId && !flight) return res.status(404).json({ error: 'Flight not found' });

    let exchangeRate = new Prisma.Decimal(1);
    if (currency !== BASE_CURRENCY) {
      if (exchangeRateInput?.gt(0)) {
        exchangeRate = exchangeRateInput;
      } else {
        const rate = await prisma.currencyRate.findFirst({
          where: { baseCurrency: BASE_CURRENCY, targetCurrency: currency },
          orderBy: { recordedAt: 'desc' },
        });
        if (!rate) return res.status(400).json({ error: `Missing exchange rate for ${currency}` });
        exchangeRate = new Prisma.Decimal(String(rate.rate));
      }
    }

    const baseAmount = amount.mul(exchangeRate).toDecimalPlaces(4);
    const created = await prisma.transaction.create({
      data: {
        firmId: receiverFirmId,
        payerFirmId,
        receiverFirmId,
        flightId,
        createdByUserId: authUser.userId ? String(authUser.userId) : undefined,
        type: type as any,
        direction: 'FIRM_TO_FIRM',
        subjectType: flightId ? 'FLIGHT' : 'MANUAL',
        subjectId: flightId,
        originalAmount: amount.toDecimalPlaces(4),
        currency,
        exchangeRate: exchangeRate.toDecimalPlaces(6),
        baseAmount,
        metadata: {
          note,
          payerLabel: payer.name,
          receiverLabel: receiver.name,
          directionLabel: `${payer.name} -> ${receiver.name}`,
          flightNumber: flight?.flightNumber,
        },
      },
      include: { firm: true, flight: true, payerFirm: true, receiverFirm: true },
    });

    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create transaction' });
  }
};
