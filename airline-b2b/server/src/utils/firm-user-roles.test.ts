import { describe, expect, it } from 'vitest';
import { FirmUserRole } from '@prisma/client';
import { hasFirmPermission, isFirmAdminLike, normalizeFirmUserRole } from './firm-user-roles';

describe('firm user roles', () => {
  it('defaults missing roles to manager instead of firm admin', () => {
    expect(normalizeFirmUserRole(undefined)).toBe(FirmUserRole.MANAGER);
  });

  it('does not treat platform admins as firm admins', () => {
    expect(isFirmAdminLike({ role: 'ADMIN', firmRole: 'FIRM_ADMIN' })).toBe(false);
    expect(isFirmAdminLike({ role: 'FIRM', firmRole: 'FIRM_ADMIN' })).toBe(true);
    expect(isFirmAdminLike({ role: 'SUPERADMIN' })).toBe(true);
  });

  it('normalizes the warehouse manager and its legacy label', () => {
    expect(normalizeFirmUserRole('OMBOR_MUDIRI')).toBe(FirmUserRole.OMBOR_MUDIRI);
    expect(normalizeFirmUserRole('OMBORCHI')).toBe(FirmUserRole.OMBOR_MUDIRI);
  });

  it('exposes named inventory and settlement permissions', () => {
    expect(hasFirmPermission({ role: 'FIRM', firmRole: 'FIRM_ADMIN' }, 'inventory.sale.cancel')).toBe(true);
    expect(hasFirmPermission({ role: 'FIRM', firmRole: 'MANAGER' }, 'inventory.sale.cancel')).toBe(false);
    expect(hasFirmPermission({ role: 'FIRM', firmRole: 'MANAGER' }, 'finance.settlement.create')).toBe(true);
    expect(hasFirmPermission({ role: 'FIRM', firmRole: 'KASSIR' }, 'payroll.payment.view')).toBe(false);
  });
});
