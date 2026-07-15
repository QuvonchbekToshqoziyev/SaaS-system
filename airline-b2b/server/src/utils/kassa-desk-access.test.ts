import { describe, expect, it } from 'vitest';
import { isKassirUser } from './kassa-desk-access';

describe('kassa desk isolation', () => {
  it('applies private desk history only to kassir accounts', () => {
    expect(isKassirUser({ role: 'FIRM', firmRole: 'KASSIR' })).toBe(true);
    expect(isKassirUser({ role: 'FIRM', firmRole: 'FIRM_ADMIN' })).toBe(false);
    expect(isKassirUser({ role: 'SUPERADMIN' })).toBe(false);
  });
});
