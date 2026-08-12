import { FirmUserRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { loginRoleForEmployee, shouldProvisionKassaForEmployee } from './employees.service';

describe('employee login role mapping', () => {
  it('creates a kassir login for a kassir employee', () => {
    expect(loginRoleForEmployee('KASSIR')).toBe(FirmUserRole.KASSIR);
    expect(shouldProvisionKassaForEmployee('KASSIR', true)).toBe(true);
  });

  it('uses manager login rights for non-kassir employees', () => {
    expect(loginRoleForEmployee('MANAGER')).toBe(FirmUserRole.MANAGER);
    expect(shouldProvisionKassaForEmployee('MANAGER', true)).toBe(false);
    expect(shouldProvisionKassaForEmployee('KASSIR', false)).toBe(false);
  });

  it('creates warehouse-only access for an ombor mudiri employee', () => {
    expect(loginRoleForEmployee('OMBOR_MUDIRI')).toBe(FirmUserRole.OMBOR_MUDIRI);
    expect(loginRoleForEmployee('OMBORCHI')).toBe(FirmUserRole.OMBOR_MUDIRI);
  });
});
