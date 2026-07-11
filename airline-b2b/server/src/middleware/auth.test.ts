import { describe, expect, it } from 'vitest';
import { isSubscriptionExpired } from './auth';

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
