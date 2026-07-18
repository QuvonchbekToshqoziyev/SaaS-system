import { prisma } from '../db';
import { normalizeRole } from './access';
import { visibleTransactionWhere } from './transaction-visibility';

export type DeskAuthUser = { userId?: string; role?: string | null; firmRole?: string | null; firmId?: string | null };

export class KassaDeskAccessError extends Error {
  readonly statusCode = 403;
}

export function isKassirUser(user: DeskAuthUser) {
  return normalizeRole(user.role) === 'FIRM' && String(user.firmRole || '').toUpperCase() === 'KASSIR';
}

export async function getBoundKassaDeskId(user: DeskAuthUser): Promise<string | null> {
  if (!isKassirUser(user) || !user.userId) return null;
  const assignedDesk = await prisma.kassaDesk.findFirst({
    where: { assignedCashierUserId: String(user.userId), status: 'ACTIVE', deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (assignedDesk) return assignedDesk.id;
  const firstDeskTransaction = await prisma.transaction.findFirst({
    where: visibleTransactionWhere({ createdByUserId: String(user.userId), kassaDeskId: { not: null } }),
    select: { kassaDeskId: true },
    orderBy: { createdAt: 'asc' },
  });
  return firstDeskTransaction?.kassaDeskId || null;
}

export async function assertKassirDeskAccess(user: DeskAuthUser, deskId?: string | null) {
  if (!isKassirUser(user)) return;
  if (!deskId) throw new Error('Kassir must select a kassa');
  const boundDeskId = await getBoundKassaDeskId(user);
  assertKassirBoundDesk(deskId, boundDeskId);
}

export function assertKassirBoundDesk(deskId: string, boundDeskId?: string | null) {
  if (!boundDeskId) throw new KassaDeskAccessError('Kassir is not assigned to an active kassa');
  if (boundDeskId !== deskId) throw new KassaDeskAccessError('Kassir can access only their own kassa');
}
