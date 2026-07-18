import { describe, expect, it } from 'vitest';
import { isReadOnlyHttpMethod, isSubscriptionExpired } from './auth';

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
