import { prisma } from '../db';

export type ScopedAuthUser = {
  userId?: string;
  role?: string | null;
  firmId?: string | null;
};

export function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

export function isSuperAdmin(authUser: ScopedAuthUser): boolean {
  return normalizeRole(authUser.role) === 'SUPERADMIN';
}

export function isAdmin(authUser: ScopedAuthUser): boolean {
  const role = normalizeRole(authUser.role);
  return role === 'ADMIN' || role === 'SUPERADMIN';
}

export function resolveAccessibleFirmIds(roleValue: unknown, firmIdValue: unknown, adminFirmIds: string[] = []): string[] | undefined {
  const role = normalizeRole(roleValue);
  if (role === 'SUPERADMIN') return undefined;
  if (role === 'FIRM') return firmIdValue ? [String(firmIdValue)] : [];
  if (role === 'ADMIN') return adminFirmIds;
  return [];
}

type FirmRelationScope = {
  connections?: Array<{ airlineFirmId: string; firmId: string }>;
  allocations?: Array<{ fromFirmId: string; toFirmId: string }>;
  tourSales?: Array<{ sellerFirmId: string; buyerFirmId: string }>;
  serviceAssignments?: Array<{ providerFirmId: string; recipientFirmId: string }>;
  transactions?: Array<{ firmId: string; payerFirmId: string | null; receiverFirmId: string | null }>;
  createdFirmIds?: string[];
};

export function collectRelatedFirmIds(firmId: string, relations: FirmRelationScope): string[] {
  const ids = new Set<string>([firmId]);
  const addPair = (left: string | null | undefined, right: string | null | undefined) => {
    if (left === firmId && right) ids.add(right);
    if (right === firmId && left) ids.add(left);
  };
  for (const row of relations.connections || []) addPair(row.airlineFirmId, row.firmId);
  for (const row of relations.allocations || []) addPair(row.fromFirmId, row.toFirmId);
  for (const row of relations.tourSales || []) addPair(row.sellerFirmId, row.buyerFirmId);
  for (const row of relations.serviceAssignments || []) addPair(row.providerFirmId, row.recipientFirmId);
  for (const row of relations.transactions || []) {
    addPair(row.payerFirmId, row.receiverFirmId);
    addPair(row.firmId, row.payerFirmId);
    addPair(row.firmId, row.receiverFirmId);
  }
  for (const id of relations.createdFirmIds || []) ids.add(id);
  return [...ids];
}

/**
 * Returns the firms whose tenant-owned data the actor may operate.
 *
 * Keep this scope deliberately narrow. A commercial relationship makes a firm
 * visible as a counterparty, but must never expose that firm's employees,
 * accounts, transactions, notifications, kassa desks, or other private data.
 */
export async function getAccessibleFirmIds(authUser: ScopedAuthUser): Promise<string[] | undefined> {
  const role = normalizeRole(authUser.role);
  if (role !== 'ADMIN') return resolveAccessibleFirmIds(role, authUser.firmId);

  const userId = authUser.userId ? String(authUser.userId) : '';
  if (!userId) return [];

  const rows = await prisma.userFirmAccess.findMany({
    where: { userId },
    select: { firmId: true },
  });
  return resolveAccessibleFirmIds(role, authUser.firmId, rows.map((row) => row.firmId));
}

/**
 * Returns firms that may be shown in counterparty/directory surfaces.
 * Do not use this scope to authorize access to tenant-owned operational data.
 */
export async function getRelatedFirmIds(authUser: ScopedAuthUser): Promise<string[] | undefined> {
  const role = normalizeRole(authUser.role);
  if (role === 'SUPERADMIN') return undefined;
  if (role === 'FIRM') {
    if (!authUser.firmId) return [];
    const firmId = String(authUser.firmId);
    const [connections, allocations, tourSales, serviceAssignments, transactions, created] = await Promise.all([
      prisma.airlineFirmConnection.findMany({
        where: { status: 'ACTIVE', OR: [{ airlineFirmId: firmId }, { firmId }] },
        select: { airlineFirmId: true, firmId: true },
      }),
      prisma.ticketAllocation.findMany({
        where: { status: 'ACCEPTED', OR: [{ fromFirmId: firmId }, { toFirmId: firmId }] },
        select: { fromFirmId: true, toFirmId: true },
      }),
      prisma.tourPackageSale.findMany({
        where: { OR: [{ sellerFirmId: firmId }, { buyerFirmId: firmId }] },
        select: { sellerFirmId: true, buyerFirmId: true },
      }),
      prisma.serviceAssignment.findMany({
        where: { status: { not: 'CANCELLED' }, OR: [{ providerFirmId: firmId }, { recipientFirmId: firmId }] },
        select: { providerFirmId: true, recipientFirmId: true },
      }),
      prisma.transaction.findMany({
        where: {
          deletedAt: null,
          status: 'CONFIRMED',
          OR: [{ firmId }, { payerFirmId: firmId }, { receiverFirmId: firmId }],
        },
        select: { firmId: true, payerFirmId: true, receiverFirmId: true },
      }),
      prisma.firm.findMany({
        where: {
          OR: [
            { createdByFirmId: firmId },
            ...(authUser.userId ? [{ createdByUserId: String(authUser.userId) }] : []),
          ],
        },
        select: { id: true },
      }),
    ]);
    return collectRelatedFirmIds(firmId, {
      connections,
      allocations,
      tourSales,
      serviceAssignments,
      transactions,
      createdFirmIds: created.map((firm) => firm.id),
    });
  }
  return getAccessibleFirmIds(authUser);
}

export async function canAccessFirm(authUser: ScopedAuthUser, firmId: string): Promise<boolean> {
  if (isSuperAdmin(authUser)) return true;
  const scoped = await getAccessibleFirmIds(authUser);
  return Boolean(scoped?.includes(firmId));
}

export async function canViewRelatedFirm(authUser: ScopedAuthUser, firmId: string): Promise<boolean> {
  if (isSuperAdmin(authUser)) return true;
  const scoped = await getRelatedFirmIds(authUser);
  return Boolean(scoped?.includes(firmId));
}
