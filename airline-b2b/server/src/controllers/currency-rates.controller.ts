import { Request, Response } from 'express';
import { prisma } from '../db';
import { Prisma, Role } from '@prisma/client';

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

function parseDateOnly(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(trimmed);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return undefined;
  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > 31) return undefined;
  const dt = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (Number.isNaN(dt.getTime())) return undefined;
  return dt;
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function nextDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0));
}

export const listCurrencyRates = async (req: Request, res: Response) => {
  const { date, dateFrom, dateTo, baseCurrency, targetCurrency } = req.query;

  const parsedDate = parseDateOnly(date);
  const parsedFrom = parseDateOnly(dateFrom);
  const parsedTo = parseDateOnly(dateTo);

  let start: Date | undefined;
  let end: Date | undefined;

  if (parsedDate) {
    start = startOfDayUtc(parsedDate);
    end = nextDayUtc(parsedDate);
  } else if (parsedFrom || parsedTo) {
    if (parsedFrom) start = startOfDayUtc(parsedFrom);
    if (parsedTo) end = nextDayUtc(parsedTo);
  }

  const where: Prisma.CurrencyRateWhereInput = {};
  if (typeof baseCurrency === 'string' && baseCurrency.trim()) {
    where.baseCurrency = normalizeCurrency(baseCurrency);
  }
  if (typeof targetCurrency === 'string' && targetCurrency.trim()) {
    where.targetCurrency = normalizeCurrency(targetCurrency);
  }
  if (start || end) {
    where.recordedAt = {
      ...(start ? { gte: start } : {}),
      ...(end ? { lt: end } : {}),
    };
  }

  const rates = await prisma.currencyRate.findMany({
    where,
    orderBy: { recordedAt: 'desc' },
  });

  return res.json(rates);
};

export const createCurrencyRate = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  if (!['SUPERADMIN', 'ADMIN'].includes(role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const rawBase = (req.body as any)?.baseCurrency;
  const rawTarget = (req.body as any)?.targetCurrency;
  const rawRate = (req.body as any)?.rate;
  const rawDate = (req.body as any)?.date;
  const rawSource = (req.body as any)?.source;

  const base = normalizeCurrency(rawBase || 'USD');
  const target = normalizeCurrency(rawTarget);
  const rate = parseDecimal(rawRate);
  const day = parseDateOnly(rawDate);
  const source = typeof rawSource === 'string' && rawSource.trim() ? rawSource.trim() : 'manual';

  if (!/^[A-Z]{3}$/.test(base)) {
    return res.status(400).json({ error: 'Invalid baseCurrency' });
  }
  if (!/^[A-Z]{3}$/.test(target)) {
    return res.status(400).json({ error: 'Invalid targetCurrency' });
  }
  if (!rate || !rate.gt(0)) {
    return res.status(400).json({ error: 'rate must be > 0' });
  }
  if (!day) {
    return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
  }

  const recordedAt = startOfDayUtc(day);

  const created = await prisma.currencyRate.create({
    data: {
      baseCurrency: base,
      targetCurrency: target,
      rate: rate.toDecimalPlaces(6),
      source,
      recordedAt,
    },
  });

  return res.status(201).json(created);
};
