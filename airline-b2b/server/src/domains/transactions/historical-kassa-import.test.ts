import { describe, expect, it } from 'vitest';
import { historicalKassaIdempotencyKey, normalizeHistoricalKassaImportRows } from './historical-kassa-import';

describe('historical kassa import rows', () => {
  it('normalizes Uzbek flow names and defaults the UZS rate', () => {
    const result = normalizeHistoricalKassaImportRows([
      { rowNumber: 4, reference: ' eski-001 ', date: '2026-06-01', flow: 'kirim', amount: '125000.50', currency: 'uzs', note: 'Eski kirim' },
      { rowNumber: 5, reference: 'eski-002', date: '2026-06-02', flow: 'CHIQIM', amount: 25, currency: 'USD', exchangeRate: 12850 },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      expect.objectContaining({ rowNumber: 4, reference: 'eski-001', referenceKey: 'ESKI-001', flow: 'IN', currency: 'UZS', exchangeRate: '1' }),
      expect.objectContaining({ rowNumber: 5, referenceKey: 'ESKI-002', flow: 'OUT', currency: 'USD', exchangeRate: '12850' }),
    ]);
    expect(historicalKassaIdempotencyKey('firm-1', 'desk-1', result.rows[0].referenceKey)).toBe('historical-kassa:firm-1:desk-1:ESKI-001');
  });

  it('rejects duplicate IDs and invalid financial values before writing', () => {
    const result = normalizeHistoricalKassaImportRows([
      { reference: 'old-1', date: '2026-02-30', flow: 'OTHER', amount: 0, currency: 'EUR' },
      { reference: 'OLD-1', date: '2026-06-02', flow: 'IN', amount: 10, currency: 'USD' },
    ]);

    expect(result.rows).toEqual([]);
    expect(result.errors.map((error) => error.field)).toEqual(expect.arrayContaining(['date', 'flow', 'amount', 'currency', 'reference', 'exchangeRate']));
  });
});
