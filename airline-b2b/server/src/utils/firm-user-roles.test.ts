import { describe, expect, it } from 'vitest';
import { FirmUserRole } from '@prisma/client';
import { isFirmAdminLike, normalizeFirmUserRole } from './firm-user-roles';

describe('firm user roles', () => {
  it('defaults missing roles to manager instead of firm admin', () => {
    expect(normalizeFirmUserRole(undefined)).toBe(FirmUserRole.MANAGER);
  });

  it('does not treat platform admins as firm admins', () => {
    expect(isFirmAdminLike({ role: 'ADMIN', firmRole: 'FIRM_ADMIN' })).toBe(false);
    expect(isFirmAdminLike({ role: 'FIRM', firmRole: 'FIRM_ADMIN' })).toBe(true);
    expect(isFirmAdminLike({ role: 'SUPERADMIN' })).toBe(true);
  });
});
