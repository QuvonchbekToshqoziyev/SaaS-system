import { Prisma } from '@prisma/client';

export function parseDateParam(value: unknown): Date | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function sumToNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(typeof value === 'object' ? String(value) : value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizePaymentMethod(method: unknown): string {
  return String(method || '').trim().toLowerCase() || 'unknown';
}

export function buildCreatedAtFilter(dateFrom?: Date, dateTo?: Date): Prisma.DateTimeFilter | undefined {
  if (!dateFrom && !dateTo) return undefined;
  return { ...(dateFrom && { gte: dateFrom }), ...(dateTo && { lte: dateTo }) };
}

export function parseMonthParam(value: unknown, now = new Date()): { month: string; start: Date; end: Date } | undefined {
  let year = now.getUTCFullYear();
  let monthIndex = now.getUTCMonth();
  if (typeof value === 'string' && value.trim()) {
    const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
    if (!match) return undefined;
    year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return undefined;
    monthIndex = month - 1;
  }
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return { month: `${year}-${String(monthIndex + 1).padStart(2, '0')}`, start, end };
}

export function dateKeyUtc(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10);
}

export function resolveReportFirmIds(role: unknown, authFirmId: unknown, accessibleFirmIds: string[], requestedFirmId?: string): string[] | undefined {
  const normalizedRole = String(role || '').toUpperCase();
  if (normalizedRole === 'SUPERADMIN') return requestedFirmId ? [requestedFirmId] : undefined;
  if (normalizedRole === 'FIRM') return authFirmId ? [String(authFirmId)] : [];
  if (normalizedRole === 'ADMIN') return requestedFirmId ? accessibleFirmIds.filter((id) => id === requestedFirmId) : accessibleFirmIds;
  return [];
}
