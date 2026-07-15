import { describe, expect, it } from 'vitest';
import { canManageFlight } from './flight-permissions';

describe('flight management permissions', () => {
  it('allows superadmin, scoped admins, and firm managers of the owning firm only', () => {
    expect(canManageFlight('SUPERADMIN', false, false)).toBe(true);
    expect(canManageFlight('ADMIN', true, false)).toBe(true);
    expect(canManageFlight('ADMIN', false, true)).toBe(false);
    expect(canManageFlight('FIRM', true, true)).toBe(true);
    expect(canManageFlight('FIRM', true, false)).toBe(false);
    expect(canManageFlight('FIRM', false, true)).toBe(false);
  });
});
