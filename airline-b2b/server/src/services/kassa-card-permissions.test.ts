import { describe, expect, it } from 'vitest';
import { canDeletePaymentCard } from './kassa.service';

describe('kassa card delete permissions', () => {
  it('allows the creator, superadmin, and owning firm admin only', () => {
    const card = { firmId: 'firm-a', createdByUserId: 'creator' };
    expect(canDeletePaymentCard({ role: 'ADMIN', userId: 'creator' }, card)).toBe(true);
    expect(canDeletePaymentCard({ role: 'SUPERADMIN', userId: 'other' }, card)).toBe(true);
    expect(canDeletePaymentCard({ role: 'FIRM', firmRole: 'FIRM_ADMIN', firmId: 'firm-a', userId: 'other' }, card)).toBe(true);
    expect(canDeletePaymentCard({ role: 'FIRM', firmRole: 'FIRM_ADMIN', firmId: 'firm-b', userId: 'other' }, card)).toBe(false);
    expect(canDeletePaymentCard({ role: 'ADMIN', userId: 'other' }, card)).toBe(false);
  });
});
