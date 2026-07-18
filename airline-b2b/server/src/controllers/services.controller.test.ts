import { describe, expect, it } from 'vitest';
import { adminServiceVisibilityWhere, canEditFirmService, firmServiceVisibilityWhere, isPurchasedServiceInputValid } from './services.controller';

describe('purchased service input', () => {
  const valid = { name: 'Visa', providerName: 'Provider LLC', quantity: 20, unitPrice: 50, currency: 'USD', paymentStatus: 'DEBT' };

  it('accepts a one-way purchased service', () => expect(isPurchasedServiceInputValid(valid)).toBe(true));
  it('requires a provider and supported payment state', () => {
    expect(isPurchasedServiceInputValid({ ...valid, providerName: '' })).toBe(false);
    expect(isPurchasedServiceInputValid({ ...valid, paymentStatus: 'ASSIGNED' })).toBe(false);
  });
});

describe('service visibility', () => {
  it('limits a firm to its own purchased service inventory', () => {
    expect(firmServiceVisibilityWhere('firm-1')).toEqual({ ownerFirmId: 'firm-1' });
  });

  it('limits a platform admin to explicitly assigned firms', () => {
    expect(adminServiceVisibilityWhere(['firm-1', 'firm-2'])).toEqual({ ownerFirmId: { in: ['firm-1', 'firm-2'] } });
    expect(adminServiceVisibilityWhere([])).toEqual({ ownerFirmId: { in: [] } });
  });
});

describe('service edit and delete access', () => {
  it('allows superadmin and the owning firm admin only', () => {
    expect(canEditFirmService({ role: 'SUPERADMIN' }, 'firm-1')).toBe(true);
    expect(canEditFirmService({ role: 'FIRM', firmRole: 'FIRM_ADMIN', firmId: 'firm-1' }, 'firm-1')).toBe(true);
    expect(canEditFirmService({ role: 'FIRM', firmRole: 'FIRM_ADMIN', firmId: 'firm-2' }, 'firm-1')).toBe(false);
    expect(canEditFirmService({ role: 'FIRM', firmRole: 'MANAGER', firmId: 'firm-1' }, 'firm-1')).toBe(false);
  });
});
