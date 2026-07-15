import { prisma } from '../db';
import { KassaStatus, Prisma } from '@prisma/client';

export function parseBusinessDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function formatBusinessDateKey(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('Invalid business date');
  }
  return date.toISOString().slice(0, 10);
}

export function startOfDayUtc(d: Date): Date {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new Error('Invalid business date');
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export function normalizeBusinessDate(d: Date): Date {
  return startOfDayUtc(d);
}

export function nextDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function getTransactionBusinessDateKey(tx: {
  type: string;
  paymentMethod?: string | null;
  metadata?: unknown;
  createdAt?: Date | string | null;
}): string {
  if (tx.type === 'PAYMENT' || tx.type === 'ADJUSTMENT') {
    const meta = isRecord(tx.metadata) ? tx.metadata : null;
    const dateValue = meta?.date;
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue.trim())) {
      return dateValue.trim();
    }
  }
  const createdAt = tx.createdAt instanceof Date
    ? tx.createdAt
    : typeof tx.createdAt === 'string'
      ? new Date(tx.createdAt)
      : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) {
    throw new Error('Transaction createdAt is required for kassa business date');
  }
  return formatBusinessDateKey(startOfDayUtc(createdAt));
}

export function kassaSessionWhere(businessDate: Date, cashDeskId?: string | null) {
  return { businessDate: normalizeBusinessDate(businessDate), cashDeskId: cashDeskId || '__no_cash_desk__' };
}

export async function findKassaForDate(businessDate: Date, cashDeskId?: string | null) {
  return prisma.kassaDay.findFirst({
    where: kassaSessionWhere(businessDate, cashDeskId),
    include: {
      openedBy: { select: { id: true, email: true } },
      closedBy: { select: { id: true, email: true } },
    },
  });
}

export async function assertKassaOpenForDate(businessDate: Date, cashDeskId?: string | null): Promise<void> {
  const kassa = await findKassaForDate(businessDate, cashDeskId);
  const dayKey = formatBusinessDateKey(businessDate);

  if (!kassa) {
    throw new Error(`Kassa is not open for ${dayKey}`);
  }
  if (kassa.status === KassaStatus.CLOSED) {
    throw new Error(`Kassa is closed for ${dayKey}. No new transactions or payments allowed.`);
  }
}

export function sumToNumber(value: Prisma.Decimal | null | undefined): number {
  if (value == null) return 0;
  const n = Number(String(value));
  return Number.isFinite(n) ? n : 0;
}
