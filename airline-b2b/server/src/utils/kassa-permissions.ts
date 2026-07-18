import { prisma } from '../db';
import { getAccessibleFirmIds, normalizeRole } from './access';
import { canOperateFirmKassa } from './firm-user-roles';

export type KassaAuthUser = {
  userId?: string;
  role?: string | null;
  firmRole?: string | null;
  firmId?: string | null;
};

const KASSA_ROLE_PATTERN = /(kassir|cashier|kassa|кассир)/i;

function roleLooksLikeKassir(role: unknown) {
  return KASSA_ROLE_PATTERN.test(String(role || '').trim());
}

export async function canOperateKassa(authUser: KassaAuthUser): Promise<boolean> {
  const role = normalizeRole(authUser.role);
  if (role === 'SUPERADMIN') return true;
  if (canOperateFirmKassa(authUser)) return true;

  const userId = authUser.userId ? String(authUser.userId) : '';
  if (!userId) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true, firmId: true, status: true, deletedAt: true },
  });
  if (!user || user.status !== 'ACTIVE' || user.deletedAt) return false;

  const firmIds = await getAccessibleFirmIds(authUser);
  const searchableNames = [user.fullName]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (!searchableNames.length) return false;

  const employee = await prisma.employee.findFirst({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      OR: [
        { role: { contains: 'kass', mode: 'insensitive' } },
        { role: { contains: 'cashier', mode: 'insensitive' } },
        { role: { contains: 'кассир', mode: 'insensitive' } },
      ],
      name: { in: searchableNames, mode: 'insensitive' },
      ...(firmIds ? { firmId: { in: firmIds } } : {}),
    },
    select: { id: true, role: true },
  });

  return Boolean(employee && roleLooksLikeKassir(employee.role));
}

export async function assertCanOperateKassa(authUser: KassaAuthUser) {
  if (!(await canOperateKassa(authUser))) {
    throw new Error('Only platform admins, firm admins, managers, or active kassirs can operate kassa');
  }
}
