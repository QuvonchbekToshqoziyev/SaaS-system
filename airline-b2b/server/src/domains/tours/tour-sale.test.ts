import { describe, expect, it } from 'vitest';
import { calculateTourSaleFinancials, canApproveFullTourDiscount, validateTourSaleNote } from './tour-sale';

describe('tour sale financials', () => {
  it('uses net revenue after discount and keeps COGS unchanged', () => {
    const result = calculateTourSaleFinancials({ quantity: 1, unitPrice: 950, discountAmount: 100, exchangeRate: 12100, unitCost: 700 });
    expect(result.grossAmount.toNumber()).toBe(950);
    expect(result.netAmount.toNumber()).toBe(850);
    expect(result.netAmountBaseCurrency.toNumber()).toBe(10285000);
    expect(result.grossProfit.toNumber()).toBe(150);
  });

  it('allows a confirmed 100 percent discount calculation', () => {
    const result = calculateTourSaleFinancials({ quantity: 1, unitPrice: 950, discountAmount: 950, exchangeRate: 12100, unitCost: 700 });
    expect(result.netAmount.toNumber()).toBe(0);
    expect(result.fullDiscount).toBe(true);
    expect(result.grossProfit.toNumber()).toBe(-700);
  });

  it('rejects excessive and malformed discounts, while allowing a markup via a negative discount', () => {
    expect(() => calculateTourSaleFinancials({ quantity: 1, unitPrice: 950, discountAmount: 951, exchangeRate: 1, unitCost: 700 })).toThrow('Maksimal chegirma');
    const markup = calculateTourSaleFinancials({ quantity: 1, unitPrice: 950, discountAmount: -50, exchangeRate: 1, unitCost: 700 });
    expect(markup.netAmount.toNumber()).toBe(1000);
    expect(markup.discountPercent.toNumber()).toBeCloseTo(-5.2632, 3);
    expect(() => calculateTourSaleFinancials({ quantity: 1, unitPrice: 950, discountAmount: 'nope', exchangeRate: 1, unitCost: 700 })).toThrow('noto‘g‘ri');
  });

  it('requires a trimmed sale note for every sale', () => {
    expect(validateTourSaleNote('  kelishilgan chegirma  ')).toBe('kelishilgan chegirma');
    expect(() => validateTourSaleNote('  ')).toThrow('majburiy');
    expect(() => validateTourSaleNote('ab')).toThrow('majburiy');
  });

  it('allows a full discount only to an elevated seller role', () => {
    expect(canApproveFullTourDiscount({ role: 'FIRM', firmRole: 'FIRM_ADMIN' })).toBe(true);
    expect(canApproveFullTourDiscount({ role: 'FIRM', firmRole: 'MANAGER' })).toBe(true);
    expect(canApproveFullTourDiscount({ role: 'FIRM', firmRole: 'KASSIR' })).toBe(false);
  });
});
