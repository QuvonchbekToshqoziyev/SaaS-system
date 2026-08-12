import { describe, expect, it } from 'vitest';
import { isReadOnlyHttpMethod, isSubscriptionExpired, warehouseManagerCanAccessPath } from './auth';

describe('subscription expiry boundary', () => {
  const now = new Date('2026-07-11T12:00:00.000Z');

  it('keeps subscriptions without an end date active', () => {
    expect(isSubscriptionExpired(null, now)).toBe(false);
  });

  it('expires at the configured instant', () => {
    expect(isSubscriptionExpired(new Date('2026-07-11T12:00:00.000Z'), now)).toBe(true);
    expect(isSubscriptionExpired(new Date('2026-07-11T12:00:01.000Z'), now)).toBe(false);
  });
});

describe('read-only account HTTP methods', () => {
  it('allows reads and blocks every mutation method', () => {
    expect(['GET', 'HEAD', 'OPTIONS'].every(isReadOnlyHttpMethod)).toBe(true);
    expect(['POST', 'PATCH', 'PUT', 'DELETE'].some(isReadOnlyHttpMethod)).toBe(false);
  });
});

describe('warehouse manager route boundary', () => {
  it('allows only inventory operations and password changes', () => {
    expect(warehouseManagerCanAccessPath('/inventory/documents/apply')).toBe(true);
    expect(warehouseManagerCanAccessPath('/inventory/reports?from=2026-07-01')).toBe(true);
    expect(warehouseManagerCanAccessPath('/auth/change-password')).toBe(true);
    expect(warehouseManagerCanAccessPath('/employees')).toBe(false);
    expect(warehouseManagerCanAccessPath('/kassa')).toBe(false);
    expect(warehouseManagerCanAccessPath('/transactions')).toBe(false);
  });
});
