import { describe, expect, it } from 'vitest';
import { requireCorrectionReason } from './correction';

describe('financial correction policy', () => {
  it('requires and normalizes a reason for every correction', () => {
    expect(() => requireCorrectionReason('  ')).toThrow('Correction reason must be at least 5 characters');
    expect(() => requireCorrectionReason('abcd')).toThrow('Correction reason must be at least 5 characters');
    expect(requireCorrectionReason('  Summa noto‘g‘ri kiritildi  ')).toBe('Summa noto‘g‘ri kiritildi');
    expect(requireCorrectionReason('x'.repeat(600))).toHaveLength(500);
  });
});
