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

export async function getAccessibleFirmIds(authUser: ScopedAuthUser): Promise<string[] | undefined> {
  const role = normalizeRole(authUser.role);
  if (role === 'SUPERADMIN') return undefined;
  if (role === 'FIRM') {
    const ids = new Set<string>();
    if (authUser.firmId) ids.add(String(authUser.firmId));
    const airlines = await prisma.firm.findMany({
      where: { kind: 'AIRLINE', status: { not: 'DELETED' }, deletedAt: null },
      select: { id: true },
    });
    for (const firm of airlines) ids.add(firm.id);
    if (authUser.firmId) {
      const connected = await prisma.airlineFirmConnection.findMany({
        where: { airlineFirmId: String(authUser.firmId), status: 'ACTIVE' },
        select: { firmId: true },
      });
      for (const row of connected) ids.add(row.firmId);
    }
    if (authUser.userId || authUser.firmId) {
      const created = await prisma.firm.findMany({
        where: {
          OR: [
            ...(authUser.firmId ? [{ createdByFirmId: String(authUser.firmId) }] : []),
            ...(authUser.userId ? [{ createdByUserId: String(authUser.userId) }] : []),
          ],
        },
        select: { id: true },
      });
      for (const firm of created) ids.add(firm.id);
    }
    return [...ids];
  }
  if (role !== 'ADMIN') return [];

  const userId = authUser.userId ? String(authUser.userId) : '';
  if (!userId) return [];

  const rows = await prisma.userFirmAccess.findMany({
    where: { userId },
    select: { firmId: true },
  });
  return rows.map((row) => row.firmId);
}

export async function canAccessFirm(authUser: ScopedAuthUser, firmId: string): Promise<boolean> {
  if (isSuperAdmin(authUser)) return true;
  const scoped = await getAccessibleFirmIds(authUser);
  return Boolean(scoped?.includes(firmId));
}
