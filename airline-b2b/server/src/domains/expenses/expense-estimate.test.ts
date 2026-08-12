import { describe, expect, it } from 'vitest';
import { expenseVariance } from './expense-estimate';

describe('expense estimate', () => {
  it('calculates variance and usage without dividing by zero', () => {
    expect(expenseVariance(120, 100)).toEqual({ variance: 20, budgetUsagePercent: 120 });
    expect(expenseVariance(120, 0)).toEqual({ variance: 120, budgetUsagePercent: null });
  });
});
