import { Request, Response } from 'express';
import { prisma } from '../db';
import { Prisma, Role } from '@prisma/client';

const BASE_CURRENCY = 'UZS' as const;

type AuthUser = {
  userId?: string;
  role?: Role | string;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseDecimal(value: unknown): Prisma.Decimal | undefined {
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return new Prisma.Decimal(String(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return new Prisma.Decimal(trimmed);
  }
  return undefined;
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function nextDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0));
}

const PAYMENT_METHODS = new Set(['cash', 'card']);

export const processPayment = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  const actorUserId = authUser.userId ? String(authUser.userId) : undefined;

  const rawFirmId = (req.body as any)?.firmId;
  const rawFlightId = (req.body as any)?.flightId;
  const rawAmount = (req.body as any)?.amount;
  const rawCurrency = (req.body as any)?.currency;
  const rawMethod = (req.body as any)?.method;
  const rawMetadata = (req.body as any)?.metadata;
  const rawExchangeRate = (req.body as any)?.exchangeRate;

  const method = String(rawMethod || '').trim().toLowerCase();
  const currency = normalizeCurrency(rawCurrency);
  const amount = parseDecimal(rawAmount);
  const manualExchangeRate = parseDecimal(rawExchangeRate);

  let firmId = typeof rawFirmId === 'string' ? rawFirmId.trim() : '';
  const flightId = typeof rawFlightId === 'string' ? rawFlightId.trim() : '';

  if (role === 'FIRM') {
    const ownFirmId = authUser.firmId ? String(authUser.firmId) : '';
    if (!ownFirmId) {
      return res.status(400).json({ error: 'Firm account is missing firmId' });
    }
    if (firmId && firmId !== ownFirmId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    firmId = ownFirmId;
  }

  if (!firmId || !flightId || !amount || !currency || !method) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!PAYMENT_METHODS.has(method)) {
    return res.status(400).json({ error: 'Unsupported payment method' });
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return res.status(400).json({ error: 'Invalid currency code' });
  }
  if (!amount.gt(0)) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }

  if (!isPlainObject(rawMetadata)) {
    return res.status(400).json({ error: 'metadata must be an object' });
  }

  if (method === 'cash') {
    const dateValue = rawMetadata.date;
    if (typeof dateValue !== 'string' || !dateValue.trim()) {
      return res.status(400).json({ error: 'Cash requires date in metadata' });
    }
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'Invalid cash payment date' });
    }
  }

  if (method === 'card') {
    const ref = rawMetadata.transaction_reference;
    const provider = rawMetadata.payment_provider;
    if (typeof ref !== 'string' || !ref.trim()) {
      return res.status(400).json({ error: 'Card requires transaction_reference in metadata' });
    }
    if (typeof provider !== 'string' || !provider.trim()) {
      return res.status(400).json({ error: 'Card requires payment_provider in metadata' });
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const [firm, flight] = await Promise.all([
        tx.firm.findUnique({ where: { id: firmId }, select: { id: true } }),
        tx.flight.findUnique({ where: { id: flightId }, select: { id: true } }),
      ]);

      if (!firm) throw new Error('Firm not found');
      if (!flight) throw new Error('Flight not found');

      let paymentDate = new Date();
      if (method === 'cash') {
        paymentDate = new Date(String((rawMetadata as any).date));
      } else if (typeof (rawMetadata as any).date === 'string' && String((rawMetadata as any).date).trim()) {
        const parsed = new Date(String((rawMetadata as any).date));
        if (Number.isNaN(parsed.getTime())) {
          throw new Error('Invalid payment date');
        }
        paymentDate = parsed;
      }

      const dayStart = startOfDayUtc(paymentDate);
      const dayEnd = nextDayUtc(paymentDate);
      const dayKey = dayStart.toISOString().slice(0, 10);

      let exchangeRate = new Prisma.Decimal(1);
      if (currency !== BASE_CURRENCY) {
        if (manualExchangeRate) {
          if (!manualExchangeRate.gt(0)) {
            throw new Error('Invalid exchange rate');
          }
          exchangeRate = manualExchangeRate;

          const existing = await tx.currencyRate.findFirst({
            where: {
              baseCurrency: BASE_CURRENCY,
              targetCurrency: currency,
              recordedAt: { gte: dayStart, lt: dayEnd },
              rate: manualExchangeRate,
            },
            orderBy: { recordedAt: 'desc' },
          });

          if (!existing) {
            await tx.currencyRate.create({
              data: {
                baseCurrency: BASE_CURRENCY,
                targetCurrency: currency,
                rate: manualExchangeRate.toDecimalPlaces(6),
                source: 'manual',
                recordedAt: dayStart,
              },
            });
          }
        } else {
          const rate = await tx.currencyRate.findFirst({
            where: {
              baseCurrency: BASE_CURRENCY,
              targetCurrency: currency,
              recordedAt: { gte: dayStart, lt: dayEnd },
            },
            orderBy: { recordedAt: 'desc' },
          });

          const legacyRate = rate
            ? null
            : await tx.currencyRate.findFirst({
                where: {
                  baseCurrency: currency,
                  targetCurrency: BASE_CURRENCY,
                  recordedAt: { gte: dayStart, lt: dayEnd },
                },
                orderBy: { recordedAt: 'desc' },
              });

          const resolved = rate ?? legacyRate;
          if (!resolved) {
            throw new Error(`Missing exchange rate for ${currency} on ${dayKey}`);
          }
          exchangeRate = new Prisma.Decimal(String(resolved.rate));
        }
      }

      if (!exchangeRate.gt(0)) {
        throw new Error('Invalid exchange rate');
      }

      const baseAmount = amount.mul(exchangeRate).toDecimalPlaces(4);

      await tx.transaction.create({
        data: {
          firmId,
          flightId,
          createdByUserId: actorUserId,
          type: 'PAYMENT',
          originalAmount: amount.toDecimalPlaces(4),
          currency,
          exchangeRate: exchangeRate.toDecimalPlaces(6),
          baseAmount,
          paymentMethod: method,
          metadata: rawMetadata as Prisma.InputJsonValue,
        }
      });
    });
    res.json({ success: true, message: 'Payment recorded' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};
