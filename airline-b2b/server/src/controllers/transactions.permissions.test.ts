import { describe, expect, it } from 'vitest';
import { canDeleteFirmTransaction } from './transactions.controller';

describe('transaction delete permission', () => {
  it('allows superadmin and the owning firm admin only', () => {
    expect(canDeleteFirmTransaction({ role: 'SUPERADMIN' }, 'firm-1')).toBe(true);
    expect(canDeleteFirmTransaction({ role: 'FIRM', firmRole: 'FIRM_ADMIN', firmId: 'firm-1' }, 'firm-1')).toBe(true);
    expect(canDeleteFirmTransaction({ role: 'FIRM', firmRole: 'FIRM_ADMIN', firmId: 'firm-2' }, 'firm-1')).toBe(false);
    expect(canDeleteFirmTransaction({ role: 'ADMIN', firmId: 'firm-1' }, 'firm-1')).toBe(false);
    expect(canDeleteFirmTransaction({ role: 'FIRM', firmRole: 'KASSIR', firmId: 'firm-1' }, 'firm-1')).toBe(false);
  });
});
