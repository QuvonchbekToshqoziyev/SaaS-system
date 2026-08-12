import bcrypt from 'bcrypt';
import { FirmUserRole, Prisma, Role } from '@prisma/client';
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

function maxZero(value: Prisma.Decimal) {
  return value.gt(0) ? value : new Prisma.Decimal(0);
}

function employeeInclude() {
  return { firm: { select: { id: true, name: true } } } satisfies Prisma.EmployeeInclude;
}

export function loginRoleForEmployee(employeeRole: unknown): FirmUserRole {
  const role = String(employeeRole || '').trim().toUpperCase();
  if (role === 'KASSIR') return FirmUserRole.KASSIR;
  if (role === 'OMBOR_MUDIRI' || role === 'OMBORCHI') return FirmUserRole.OMBOR_MUDIRI;
  return FirmUserRole.MANAGER;
}

export function shouldProvisionKassaForEmployee(employeeRole: unknown, wantsLogin: boolean): boolean {
  return wantsLogin && loginRoleForEmployee(employeeRole) === FirmUserRole.KASSIR;
}

function assertFirmEmployeeScope(authUser: AuthUser, firmId: string | null) {
  if (normalizeRole(authUser.role) === 'FIRM' && firmId !== String(authUser.firmId || '')) {
    throw new ServiceError('Forbidden', 403);
  }
}

export async function listEmployeesService(authUser: AuthUser, input: { firmId?: unknown }) {
  const role = normalizeRole(authUser.role);
  const scopedFirmIds = role === 'FIRM'
    ? (authUser.firmId ? [String(authUser.firmId)] : [])
    : await getAccessibleFirmIds(authUser);
  const requestedFirmId = typeof input.firmId === 'string' ? input.firmId.trim() : '';

  if (requestedFirmId) assertFirmEmployeeScope(authUser, requestedFirmId);
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

export async function getEmployeeSalaryHistoryService(authUser: AuthUser, id: string) {
  if (!id) throw new ServiceError('Employee id is required');
  const employee = await prisma.employee.findUnique({ where: { id }, include: employeeInclude() });
  if (!employee || employee.status === 'DELETED' || employee.deletedAt) throw new ServiceError('Employee not found', 404);
  assertFirmEmployeeScope(authUser, employee.firmId);
  if (employee.firmId && !(await canAccessFirm(authUser, employee.firmId))) throw new ServiceError('Forbidden', 403);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const rows = await prisma.transaction.findMany({
    where: {
      employeeId: id,
      deletedAt: null,
      status: { in: ['CONFIRMED', 'APPLIED', 'POSTED', 'PAID'] },
      OR: [
        { expenseDirection: 'EMPLOYEE_PAYMENT' },
        { expenseCategory: { code: 'SALARY' } },
      ],
    },
    include: {
      ledgerEntries: true,
      kassaDesk: { select: { id: true, name: true, code: true } },
      paymentCard: { select: { id: true, ownerName: true, cardNumber: true } },
      sourceAccount: { select: { id: true, name: true, type: true } },
      createdBy: { select: { id: true, email: true, fullName: true } },
      expenseCategory: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
    take: 300,
  });
  const paid = (from: Date) => rows.filter((row) => (row.paymentDate || row.createdAt) >= from).reduce((sum, row) => sum.add(row.originalAmount), new Prisma.Decimal(0));
  const currentSalary = employee.salary;
  const currentMonthPaid = paid(monthStart);
  const ytdPaid = paid(yearStart);
  return {
    employee,
    summary: {
      currentSalary,
      currentMonthAccrued: currentSalary,
      currentMonthPaid,
      currentMonthRemaining: maxZero(currentSalary.sub(currentMonthPaid)),
      yearToDateAccrued: currentSalary.mul(now.getUTCMonth() + 1),
      yearToDatePaid: ytdPaid,
      advance: maxZero(currentMonthPaid.sub(currentSalary)),
      debt: maxZero(currentSalary.sub(currentMonthPaid)),
    },
    rows: rows.map((row) => ({
      id: row.id,
      date: (row.paymentDate || row.createdAt).toISOString().slice(0, 10),
      time: row.createdAt.toISOString(),
      salaryPeriod: row.reportingPeriod || (row.paymentDate || row.createdAt).toISOString().slice(0, 7),
      accruedSalary: employee.salary,
      paidAmount: row.originalAmount,
      originalCurrency: row.currency,
      uzsEquivalent: row.baseAmount,
      exchangeRate: row.exchangeRate,
      paymentMethod: row.paymentMethod,
      kassaDesk: row.kassaDesk,
      paymentCard: row.paymentCard,
      sourceAccount: row.sourceAccount,
      paidBy: row.createdBy,
      createdBy: row.createdBy,
      note: (row.metadata as any)?.note || null,
      documentNumber: row.documentNumber,
      status: row.status,
      audit: { transactionId: row.id, operationType: row.operationType, sourceMode: row.sourceMode },
    })),
  };
}

export async function createEmployeeService(authUser: AuthUser, input: Record<string, unknown>) {
  const actorRole = normalizeRole(authUser.role);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const employeeRole = typeof input.role === 'string' ? input.role.trim() : '';
  const requestedFirmId = typeof input.firmId === 'string' && input.firmId.trim() ? input.firmId.trim() : null;
  const firmId = actorRole === 'FIRM' ? (authUser.firmId ? String(authUser.firmId) : null) : requestedFirmId;
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const wantsLogin = Boolean(email || password);
  const provisionKassa = shouldProvisionKassaForEmployee(employeeRole, wantsLogin);

  if (!name) throw new ServiceError('Employee name is required');
  if (!employeeRole) throw new ServiceError('Employee role is required');
  if (actorRole === 'FIRM' && !isFirmAdminLike(authUser)) throw new ServiceError('Only firm admins can create employees', 403);
  assertFirmEmployeeScope(authUser, firmId);
  if (firmId && !(await canAccessFirm(authUser, firmId))) throw new ServiceError('Forbidden', 403);
  if (!firmId && !isSuperAdmin(authUser)) throw new ServiceError('Firm is required');
  if (wantsLogin && (!email || !password)) throw new ServiceError('Email and password are both required for login access');
  if (wantsLogin && password.length < 6) throw new ServiceError('Password must be at least 6 characters');
  if (loginRoleForEmployee(employeeRole) === FirmUserRole.KASSIR && !wantsLogin) throw new ServiceError('Kassir login email and password are required');
  if (wantsLogin && !firmId) throw new ServiceError('Firm is required for login access');
  if (wantsLogin && actorRole !== 'SUPERADMIN' && !(actorRole === 'FIRM' && isFirmAdminLike(authUser))) {
    throw new ServiceError('Only superadmin or firm admin can create employee login access', 403);
  }
  if (wantsLogin) {
    const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
    if (existing) throw new ServiceError('Account already exists for this email', 409);
  }

  const hashedPassword = wantsLogin ? await bcrypt.hash(password, 10) : null;
  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.create({
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
    let kassaDesk = null;
    if (wantsLogin) {
      const loginUser = await tx.user.create({
        data: {
          email,
          password: hashedPassword!,
          fullName: name,
          role: Role.FIRM,
          firmRole: loginRoleForEmployee(employeeRole),
          firmId: firmId!,
        },
      });
      if (provisionKassa) {
        kassaDesk = await tx.kassaDesk.create({
          data: {
            firmId: firmId!,
            name: `${name} kassasi`,
            createdByUserId: authUser.userId ? String(authUser.userId) : null,
            assignedCashierUserId: loginUser.id,
          },
          include: {
            firm: { select: { id: true, name: true } },
            assignedCashier: { select: { id: true, email: true, fullName: true, status: true } },
          },
        });
      }
    }
    return { ...employee, loginCreated: wantsLogin, loginEmail: wantsLogin ? email : null, kassaDesk };
  });
}

export async function updateEmployeeService(authUser: AuthUser, id: string, input: Record<string, unknown>) {
  if (!id) throw new ServiceError('Employee id is required');

  const actorRole = normalizeRole(authUser.role);
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing || existing.status === 'DELETED' || existing.deletedAt) throw new ServiceError('Employee not found', 404);
  assertFirmEmployeeScope(authUser, existing.firmId);
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
    assertFirmEmployeeScope(authUser, nextFirmId);
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
  assertFirmEmployeeScope(authUser, existing.firmId);
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
