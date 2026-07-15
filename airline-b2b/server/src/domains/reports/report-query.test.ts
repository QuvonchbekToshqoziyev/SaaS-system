import { describe, expect, it } from 'vitest';
import { buildCreatedAtFilter, dateKeyUtc, normalizePaymentMethod, parseDateParam, parseMonthParam, resolveReportFirmIds, sumToNumber } from './report-query';

describe('report query policy', () => {
  it('normalizes dates, months, numbers and payment methods', () => {
    expect(parseDateParam('bad')).toBeUndefined();
    expect(sumToNumber('12.5')).toBe(12.5);
    expect(sumToNumber('bad')).toBe(0);
    expect(normalizePaymentMethod(' CARD ')).toBe('card');
    expect(parseMonthParam('2026-02')?.end.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(parseMonthParam('2026-13')).toBeUndefined();
    expect(dateKeyUtc(new Date('2026-07-13T20:00:00Z'))).toBe('2026-07-13');
    expect(buildCreatedAtFilter(new Date('2026-01-01'))).toHaveProperty('gte');
  });

  it('keeps firm and admin reports inside their assigned firm scope', () => {
    expect(resolveReportFirmIds('FIRM', 'own-firm', ['other-firm'])).toEqual(['own-firm']);
    expect(resolveReportFirmIds('ADMIN', null, ['firm-a'], 'firm-b')).toEqual([]);
    expect(resolveReportFirmIds('ADMIN', null, ['firm-a'], 'firm-a')).toEqual(['firm-a']);
    expect(resolveReportFirmIds('SUPERADMIN', null, [])).toBeUndefined();
  });
});
