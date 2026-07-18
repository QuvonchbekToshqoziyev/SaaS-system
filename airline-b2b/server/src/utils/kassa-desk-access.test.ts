import { describe, expect, it } from 'vitest';
import { assertKassirBoundDesk, isKassirUser } from './kassa-desk-access';

describe('kassa desk isolation', () => {
  it('applies private desk history only to kassir accounts', () => {
    expect(isKassirUser({ role: 'FIRM', firmRole: 'KASSIR' })).toBe(true);
    expect(isKassirUser({ role: 'FIRM', firmRole: 'FIRM_ADMIN' })).toBe(false);
    expect(isKassirUser({ role: 'SUPERADMIN' })).toBe(false);
  });

  it('rejects unassigned and cross-desk kassir operations', () => {
    expect(() => assertKassirBoundDesk('desk-1', null)).toThrow('not assigned');
    expect(() => assertKassirBoundDesk('desk-1', 'desk-2')).toThrow('only their own kassa');
    expect(() => assertKassirBoundDesk('desk-1', 'desk-1')).not.toThrow();
  });
});
