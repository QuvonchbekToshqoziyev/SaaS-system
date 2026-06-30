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
  return date.toISOString().slice(0, 10);
}

export function startOfDayUtc(d: Date): Date {
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
  createdAt: Date;
}): string {
  if (tx.type === 'PAYMENT') {
    const meta = isRecord(tx.metadata) ? tx.metadata : null;
    const dateValue = meta?.date;
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue.trim())) {
      return dateValue.trim();
    }
  }
  return formatBusinessDateKey(startOfDayUtc(tx.createdAt));
}

export async function findKassaForDate(businessDate: Date) {
  return prisma.kassaDay.findUnique({
    where: { businessDate: normalizeBusinessDate(businessDate) },
    include: {
      openedBy: { select: { id: true, email: true } },
      closedBy: { select: { id: true, email: true } },
    },
  });
}

export async function assertKassaOpenForDate(businessDate: Date): Promise<void> {
  const kassa = await findKassaForDate(businessDate);
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
