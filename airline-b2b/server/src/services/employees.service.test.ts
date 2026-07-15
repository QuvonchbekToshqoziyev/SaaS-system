import { FirmUserRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { loginRoleForEmployee } from './employees.service';

describe('employee login role mapping', () => {
  it('creates a kassir login for a kassir employee', () => {
    expect(loginRoleForEmployee('KASSIR')).toBe(FirmUserRole.KASSIR);
  });

  it('uses manager login rights for non-kassir employees', () => {
    expect(loginRoleForEmployee('MANAGER')).toBe(FirmUserRole.MANAGER);
  });
});
