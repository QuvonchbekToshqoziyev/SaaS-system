import { describe, expect, it } from 'vitest';
import { batchRemaining, movingWeightedAverage, saleTotals } from './inventory-math';

describe('inventory math', () => {
  it('uses moving weighted average without recognizing a purchase expense', () => {
    expect(movingWeightedAverage(10, 100_000, 10, 120_000)).toBe(110_000);
  });

  it('keeps revenue and COGS separate', () => {
    expect(saleTotals(5, 150_000, 0, 100_000)).toEqual({
      grossRevenue: 750_000,
      netRevenue: 750_000,
      cogs: 500_000,
      grossProfit: 250_000,
    });
  });

  it('derives stock from receipts and issues', () => {
    expect(batchRemaining(10, 4)).toBe(6);
  });
});
