import { FirmUserRole } from '@prisma/client';

export type FirmRoleAuthUser = {
  role?: string | null;
  firmRole?: string | null;
};

export type FirmPermission =
  | 'finance.settlement.create'
  | 'finance.settlement.approve'
  | 'expense.view_details'
  | 'inventory.receipt.edit'
  | 'inventory.receipt.cancel'
  | 'inventory.issue.edit'
  | 'inventory.issue.cancel'
  | 'inventory.sale.edit'
  | 'inventory.sale.cancel'
  | 'inventory.adjustment.approve'
  | 'cash.transfer.cash_to_card'
  | 'cash.transfer.card_to_cash'
  | 'cash.transfer.k2k'
  | 'cash.exchange.vash'
  | 'payroll.payment.view'
  | 'payroll.payment.create'
  | 'payroll.payment.reverse';

export function normalizeFirmUserRole(value: unknown): FirmUserRole {
  const role = String(value || '').trim().toUpperCase();
  if (role === FirmUserRole.KASSIR || role === 'KASSA' || role === 'KASSA_OPERATOR' || role === 'CASHIER') {
    return FirmUserRole.KASSIR;
  }
  if (role === FirmUserRole.OMBOR_MUDIRI || role === 'OMBORCHI') return FirmUserRole.OMBOR_MUDIRI;
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
  if (platformRole === 'SUPERADMIN' || platformRole === 'ADMIN') return true;
  if (platformRole !== 'FIRM') return false;
  const firmRole = normalizeFirmUserRole(authUser.firmRole);
  return firmRole === FirmUserRole.FIRM_ADMIN || firmRole === FirmUserRole.MANAGER || firmRole === FirmUserRole.KASSIR;
}

export function hasFirmPermission(authUser: FirmRoleAuthUser, permission: FirmPermission): boolean {
  const platformRole = String(authUser.role || '').toUpperCase();
  if (platformRole === 'SUPERADMIN' || platformRole === 'ADMIN') return true;
  if (platformRole !== 'FIRM') return false;
  const firmRole = normalizeFirmUserRole(authUser.firmRole);
  if (firmRole === FirmUserRole.FIRM_ADMIN) return true;
  if (firmRole === FirmUserRole.OMBOR_MUDIRI) {
    return permission.startsWith('inventory.');
  }
  if (firmRole === FirmUserRole.MANAGER) {
    return [
      'finance.settlement.create',
      'expense.view_details',
      'inventory.receipt.edit',
      'inventory.issue.edit',
      'inventory.sale.edit',
      'cash.transfer.cash_to_card',
      'cash.transfer.card_to_cash',
      'cash.transfer.k2k',
      'cash.exchange.vash',
      'payroll.payment.view',
    ].includes(permission);
  }
  if (firmRole === FirmUserRole.KASSIR) {
    return [
      'cash.transfer.cash_to_card',
      'cash.transfer.card_to_cash',
      'cash.transfer.k2k',
      'cash.exchange.vash',
    ].includes(permission);
  }
  return false;
}
