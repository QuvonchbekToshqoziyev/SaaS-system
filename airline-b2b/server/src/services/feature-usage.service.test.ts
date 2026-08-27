import { describe, expect, it } from 'vitest';
import { featureFromRequest } from './feature-usage.service';

function request(method: string, baseUrl: string, routePath: string) {
  return { method, baseUrl, route: { path: routePath } } as any;
}

describe('semantic feature usage mapping', () => {
  it('maps business mutations to single-purpose feature keys', () => {
    expect(featureFromRequest(request('POST', '/kassa', '/open'))?.featureKey).toBe('kassa.open');
    expect(featureFromRequest(request('PATCH', '/firms', '/:id'))?.featureKey).toBe('firm.update');
    expect(featureFromRequest(request('POST', '/payments', '/'))?.featureKey).toBe('payment.create');
    expect(featureFromRequest(request('PATCH', '/transactions', '/:id/daily-cash'))?.featureKey).toBe('transaction.daily-cash.update');
    expect(featureFromRequest(request('DELETE', '/kassa', '/cards/:id'))?.featureKey).toBe('kassa.card.delete');
  });

  it('ignores read-only module requests', () => {
    expect(featureFromRequest(request('GET', '/firms', '/'))).toBeNull();
    expect(featureFromRequest(request('GET', '/reports', '/product-metrics'))).toBeNull();
  });
});
