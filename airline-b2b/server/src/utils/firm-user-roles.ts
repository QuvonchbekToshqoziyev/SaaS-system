import { FirmUserRole } from '@prisma/client';

export type FirmRoleAuthUser = {
  role?: string | null;
  firmRole?: string | null;
};

export function normalizeFirmUserRole(value: unknown): FirmUserRole {
  const role = String(value || '').trim().toUpperCase();
  if (role === FirmUserRole.KASSIR || role === 'KASSA' || role === 'KASSA_OPERATOR' || role === 'CASHIER') {
    return FirmUserRole.KASSIR;
  }
  if (role === FirmUserRole.MANAGER) return FirmUserRole.MANAGER;
  if (role === FirmUserRole.FIRM_ADMIN) return FirmUserRole.FIRM_ADMIN;
  return FirmUserRole.MANAGER;
}

export function isFirmAdminLike(authUser: FirmRoleAuthUser): boolean {
  const platformRole = String(authUser.role || '').toUpperCase();
  if (platformRole === 'SUPERADMIN') return true;
  if (platformRole !== 'FIRM') return false;
  return normalizeFirmUserRole(authUser.firmRole) === FirmUserRole.FIRM_ADMIN;
}

export function canManageFirmWork(authUser: FirmRoleAuthUser): boolean {
  const platformRole = String(authUser.role || '').toUpperCase();
  if (platformRole === 'SUPERADMIN' || platformRole === 'ADMIN') return true;
  if (platformRole !== 'FIRM') return false;
  const firmRole = normalizeFirmUserRole(authUser.firmRole);
  return firmRole === FirmUserRole.FIRM_ADMIN || firmRole === FirmUserRole.MANAGER;
}

export function canOperateFirmKassa(authUser: FirmRoleAuthUser): boolean {
  const platformRole = String(authUser.role || '').toUpperCase();
  if (platformRole === 'SUPERADMIN') return true;
  if (platformRole !== 'FIRM') return false;
  const firmRole = normalizeFirmUserRole(authUser.firmRole);
  return firmRole === FirmUserRole.FIRM_ADMIN || firmRole === FirmUserRole.KASSIR;
}
