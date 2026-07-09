import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { canAccessFirm, getAccessibleFirmIds, isSuperAdmin, normalizeRole } from '../utils/access';
import { isFirmAdminLike } from '../utils/firm-user-roles';

export type AuthUser = {
  userId?: string;
  role?: string;
  firmId?: string | null;
  firmRole?: string | null;
};

export class ServiceError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

function parseSalary(value: unknown): Prisma.Decimal {
  const salary = new Prisma.Decimal(String(value ?? '0').trim() || '0');
  if (!salary.isFinite() || salary.lt(0)) throw new ServiceError('Salary must be zero or greater');
  return salary.toDecimalPlaces(4);
}

function normalizeCurrency(value: unknown): string {
  const currency = String(value || 'UZS').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new ServiceError('Invalid currency code');
  return currency;
}

function employeeInclude() {
  return { firm: { select: { id: true, name: true } } } satisfies Prisma.EmployeeInclude;
}

export async function listEmployeesService(authUser: AuthUser, input: { firmId?: unknown }) {
  const role = normalizeRole(authUser.role);
  const scopedFirmIds = await getAccessibleFirmIds(authUser);
  const requestedFirmId = typeof input.firmId === 'string' ? input.firmId.trim() : '';

  if (requestedFirmId && !(await canAccessFirm(authUser, requestedFirmId))) {
    throw new ServiceError('Forbidden', 403);
  }

  return prisma.employee.findMany({
    where: {
      status: { not: 'DELETED' },
      deletedAt: null,
      ...(requestedFirmId ? { firmId: requestedFirmId } : {}),
      ...(!requestedFirmId && scopedFirmIds
        ? role === 'FIRM'
          ? { firmId: { in: scopedFirmIds } }
          : { OR: [{ firmId: { in: scopedFirmIds } }, { firmId: null }] }
        : {}),
    },
    include: employeeInclude(),
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function createEmployeeService(authUser: AuthUser, input: Record<string, unknown>) {
  const actorRole = normalizeRole(authUser.role);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const employeeRole = typeof input.role === 'string' ? input.role.trim() : '';
  const requestedFirmId = typeof input.firmId === 'string' && input.firmId.trim() ? input.firmId.trim() : null;
  const firmId = actorRole === 'FIRM' ? (authUser.firmId ? String(authUser.firmId) : null) : requestedFirmId;

  if (!name) throw new ServiceError('Employee name is required');
  if (!employeeRole) throw new ServiceError('Employee role is required');
  if (actorRole === 'FIRM' && !isFirmAdminLike(authUser)) throw new ServiceError('Only firm admins can create employees', 403);
  if (firmId && !(await canAccessFirm(authUser, firmId))) throw new ServiceError('Forbidden', 403);
  if (!firmId && !isSuperAdmin(authUser)) throw new ServiceError('Firm is required');

  return prisma.employee.create({
    data: {
      name,
      role: employeeRole,
      salary: parseSalary(input.salary),
      currency: normalizeCurrency(input.currency),
      firmId,
      status: String(input.status || 'ACTIVE').toUpperCase() === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
    },
    include: employeeInclude(),
  });
}

export async function updateEmployeeService(authUser: AuthUser, id: string, input: Record<string, unknown>) {
  if (!id) throw new ServiceError('Employee id is required');

  const actorRole = normalizeRole(authUser.role);
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing || existing.status === 'DELETED' || existing.deletedAt) throw new ServiceError('Employee not found', 404);
  if (!isSuperAdmin(authUser) && !existing.firmId) {
    throw new ServiceError('Only superadmin can update system-wide employees', 403);
  }
  if (actorRole === 'FIRM' && !isFirmAdminLike(authUser)) throw new ServiceError('Only firm admins can update employees', 403);
  if (existing.firmId && !(await canAccessFirm(authUser, existing.firmId))) {
    throw new ServiceError('Forbidden', 403);
  }

  const data: Prisma.EmployeeUpdateInput = {};
  if (typeof input.name === 'string' && input.name.trim()) data.name = input.name.trim();
  if (typeof input.role === 'string' && input.role.trim()) data.role = input.role.trim();
  if (input.salary !== undefined) data.salary = parseSalary(input.salary);
  if (input.currency !== undefined) data.currency = normalizeCurrency(input.currency);
  if (typeof input.status === 'string') {
    const status = input.status.toUpperCase();
    if (status === 'ACTIVE' || status === 'SUSPENDED') data.status = status;
  }
  if (input.firmId !== undefined) {
    const nextFirmId = actorRole === 'FIRM'
      ? existing.firmId
      : typeof input.firmId === 'string' && input.firmId.trim()
        ? input.firmId.trim()
        : null;
    if (nextFirmId && !(await canAccessFirm(authUser, nextFirmId))) throw new ServiceError('Forbidden', 403);
    if (!nextFirmId && !isSuperAdmin(authUser)) throw new ServiceError('Firm is required');
    data.firm = nextFirmId ? { connect: { id: nextFirmId } } : { disconnect: true };
  }

  const updated = await prisma.employee.update({
    where: { id },
    data,
    include: employeeInclude(),
  });

  return { before: existing, after: updated, fields: Object.keys(data) };
}

export async function softDeleteEmployeeService(authUser: AuthUser, id: string, input: { reason?: unknown }) {
  if (!id) throw new ServiceError('Employee id is required');

  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing || existing.status === 'DELETED' || existing.deletedAt) throw new ServiceError('Employee not found', 404);
  if (!isSuperAdmin(authUser) && !existing.firmId) {
    throw new ServiceError('Only superadmin can delete system-wide employees', 403);
  }
  if (normalizeRole(authUser.role) === 'FIRM' && !isFirmAdminLike(authUser)) throw new ServiceError('Only firm admins can delete employees', 403);
  if (existing.firmId && !(await canAccessFirm(authUser, existing.firmId))) {
    throw new ServiceError('Forbidden', 403);
  }

  const deleted = await prisma.employee.update({
    where: { id },
    data: {
      status: 'DELETED',
      deletedAt: new Date(),
      deletedByUserId: authUser.userId ? String(authUser.userId) : null,
      deleteReason: typeof input.reason === 'string' ? input.reason.trim() || null : null,
    },
    include: employeeInclude(),
  });

  return { before: existing, after: deleted };
}
