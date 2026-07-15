import { Prisma } from '@prisma/client';

export function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '') return null;
  const parsed = typeof raw === 'number' ? Math.floor(raw) : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeCurrency(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

export function parsePositiveDecimal(value: unknown): Prisma.Decimal | null {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  try {
    const decimal = new Prisma.Decimal(raw);
    return decimal.isFinite() && decimal.gt(0) ? decimal : null;
  } catch {
    return null;
  }
}

export function parseAllocationRows(value: unknown): Array<{ quantity: number; price: Prisma.Decimal }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const quantity = parsePositiveInt(row.quantity ?? row.count);
    const price = parsePositiveDecimal(row.allocationPrice ?? row.price);
    return quantity && price ? [{ quantity, price: price.toDecimalPlaces(4) }] : [];
  });
}

export function normalizeOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return String(value).trim() || undefined;
}

export function validateAllocationRejectionReason(value: unknown): string {
  const reason = normalizeOptionalString(value);
  if (!reason || reason.length < 5) throw new Error('Ajratmani rad etish sababini yozing.');
  if (reason.length > 500) throw new Error('Rad etish sababi 500 belgidan oshmasligi kerak.');
  return reason;
}

export function parsePurchaserInfo(value: unknown): { name: string; idNumber: string; phone?: string; email?: string; notes?: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const name = normalizeOptionalString(row.name);
  const idNumber = normalizeOptionalString(row.idNumber ?? row.id);
  if (!name || !idNumber) return null;
  const phone = normalizeOptionalString(row.phone);
  const email = normalizeOptionalString(row.email);
  const notes = normalizeOptionalString(row.notes);
  return { name, idNumber, ...(phone && { phone }), ...(email && { email }), ...(notes && { notes }) };
}

export function canManageFlightInventory(
  firmId: string,
  ownerFirmId: string | null | undefined,
  airlineFirmId: string | null | undefined,
  ownedTicketCount: number,
): boolean {
  return Boolean(firmId) && (ownerFirmId === firmId || (!ownerFirmId && airlineFirmId === firmId) || ownedTicketCount > 0);
}

export function requiresAirlineConnectionForAllocation(isOriginOwner: boolean): boolean {
  return isOriginOwner;
}

export function requiresAllocationApproval(activeDirectUsers: number, activeScopedUsers: number): boolean {
  return activeDirectUsers + activeScopedUsers > 0;
}

export function allocationDirection(sourceFirmKind: unknown): 'AIRLINE_TO_FIRM' | 'FIRM_TO_FIRM' {
  return String(sourceFirmKind || '').toUpperCase() === 'AIRLINE' ? 'AIRLINE_TO_FIRM' : 'FIRM_TO_FIRM';
}

export function restoredTicketState(sourceFirmId: unknown): { status: 'ASSIGNED' | 'AVAILABLE'; assignedFirmId: string | null } {
  const resolved = normalizeOptionalString(sourceFirmId);
  return resolved
    ? { status: 'ASSIGNED', assignedFirmId: resolved }
    : { status: 'AVAILABLE', assignedFirmId: null };
}
