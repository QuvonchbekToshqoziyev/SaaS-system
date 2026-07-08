import { Prisma, Role } from '@prisma/client';
import { prisma } from '../db';

const BASE_CURRENCY = 'UZS' as const;

export type AuthUser = {
  userId?: string;
  role?: Role | string;
  firmId?: string | null;
};

export class ServiceError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
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

export async function listCurrencyRatesService(input: {
  date?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  baseCurrency?: unknown;
  targetCurrency?: unknown;
}) {
  const parsedDate = parseDateOnly(input.date);
  const parsedFrom = parseDateOnly(input.dateFrom);
  const parsedTo = parseDateOnly(input.dateTo);

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
  if (typeof input.baseCurrency === 'string' && input.baseCurrency.trim()) {
    where.baseCurrency = normalizeCurrency(input.baseCurrency);
  }
  if (typeof input.targetCurrency === 'string' && input.targetCurrency.trim()) {
    where.targetCurrency = normalizeCurrency(input.targetCurrency);
  }
  if (start || end) {
    where.recordedAt = {
      ...(start ? { gte: start } : {}),
      ...(end ? { lt: end } : {}),
    };
  }

  return prisma.currencyRate.findMany({
    where,
    orderBy: { recordedAt: 'desc' },
  });
}

export async function createCurrencyRateService(authUser: AuthUser, input: Record<string, unknown>) {
  const role = normalizeRole(authUser.role);
  if (!['SUPERADMIN', 'ADMIN'].includes(role)) {
    throw new ServiceError('Forbidden', 403);
  }

  const base = normalizeCurrency(input.baseCurrency || BASE_CURRENCY);
  const target = normalizeCurrency(input.targetCurrency);
  const rate = parseDecimal(input.rate);
  const day = parseDateOnly(input.date);
  const source = typeof input.source === 'string' && input.source.trim() ? input.source.trim() : 'manual';

  if (!/^[A-Z]{3}$/.test(base)) throw new ServiceError('Invalid baseCurrency');
  if (base !== BASE_CURRENCY) throw new ServiceError(`baseCurrency must be ${BASE_CURRENCY}`);
  if (!/^[A-Z]{3}$/.test(target)) throw new ServiceError('Invalid targetCurrency');
  if (!rate || !rate.gt(0)) throw new ServiceError('rate must be > 0');
  if (!day) throw new ServiceError('date is required (YYYY-MM-DD)');

  return prisma.currencyRate.create({
    data: {
      baseCurrency: base,
      targetCurrency: target,
      rate: rate.toDecimalPlaces(6),
      source,
      recordedAt: startOfDayUtc(day),
    },
  });
}
