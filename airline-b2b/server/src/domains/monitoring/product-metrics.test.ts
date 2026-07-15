import { describe, expect, it } from 'vitest';
import { rollingRetention } from './product-metrics';

describe('rollingRetention', () => {
  it('counts firms active in both adjacent periods', () => {
    const now = new Date('2026-07-13T12:00:00.000Z');
    const rows = [
      { firmId: 'kept', createdAt: new Date('2026-06-01T12:00:00.000Z') },
      { firmId: 'kept', createdAt: new Date('2026-07-01T12:00:00.000Z') },
      { firmId: 'lost', createdAt: new Date('2026-06-10T12:00:00.000Z') },
      { firmId: 'new', createdAt: new Date('2026-07-05T12:00:00.000Z') },
    ];

    expect(rollingRetention(rows, now, 30)).toEqual({ retained: 1, eligible: 2, rate: 50 });
  });
});
