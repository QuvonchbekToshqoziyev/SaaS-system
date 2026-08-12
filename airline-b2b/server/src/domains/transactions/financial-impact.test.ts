import { describe, expect, it } from 'vitest';
import { maximumSettlementAmount, resolveFinancialImpact } from './financial-impact';

describe('financial operation impact', () => {
  it('does not recognize revenue or cash for debt settlements', () => {
    expect(resolveFinancialImpact({ operationType: 'THREE_PARTY_SETTLEMENT' })).toEqual(expect.objectContaining({ debitAccount: 'ACCOUNTS_PAYABLE', creditAccount: 'ACCOUNTS_RECEIVABLE', cashFlowGroup: 'NON_CASH', pnlEffect: 'NONE' }));
    expect(resolveFinancialImpact({ operationType: 'SERVICE_OFFSET' })).toEqual(expect.objectContaining({ debitAccount: 'ACCOUNTS_PAYABLE', creditAccount: 'ACCOUNTS_RECEIVABLE', cashFlowGroup: 'NON_CASH', pnlEffect: 'NONE' }));
    expect(resolveFinancialImpact({ operationType: 'TICKET_OFFSET' })).toEqual(expect.objectContaining({ pnlEffect: 'NONE' }));
    expect(resolveFinancialImpact({ operationType: 'TOUR_OFFSET' })).toEqual(expect.objectContaining({ pnlEffect: 'NONE' }));
  });

  it('does not recognize an expense twice for a payable payment', () => {
    expect(resolveFinancialImpact({ operationType: 'BANK_EXPENSE', economicPurpose: 'PAYABLE_PAYMENT' })).toEqual(expect.objectContaining({ debitAccount: 'ACCOUNTS_PAYABLE', pnlEffect: 'NONE' }));
  });

  it('keeps advances outside revenue and expense', () => {
    expect(resolveFinancialImpact({ operationType: 'ADVANCE_RECEIVED' }).pnlEffect).toBe('NONE');
    expect(resolveFinancialImpact({ operationType: 'ADVANCE_PAID' }).pnlEffect).toBe('NONE');
  });

  it('limits a three-party settlement to the smaller debt', () => {
    expect(maximumSettlementAmount(8_000, 10_000)).toBe(8_000);
  });

  it('settles same-party receivable and payable without changing cash, revenue, or purchase', () => {
    const receivable = 20_000;
    const payable = 50_000;
    const offset = maximumSettlementAmount(receivable, payable);
    const impact = resolveFinancialImpact({ operationType: 'MUTUAL_OFFSET' });
    expect(offset).toBe(20_000);
    expect({ receivable: receivable - offset, payable: payable - offset }).toEqual({ receivable: 0, payable: 30_000 });
    expect(impact).toEqual(expect.objectContaining({ debitAccount: 'ACCOUNTS_PAYABLE', creditAccount: 'ACCOUNTS_RECEIVABLE', cashFlowGroup: 'NON_CASH', pnlEffect: 'NONE' }));
  });

  it('supports partial settlement without netting away both debt sides', () => {
    const receivable = 20_000;
    const payable = 50_000;
    const offset = 10_000;
    expect(offset).toBeLessThanOrEqual(maximumSettlementAmount(receivable, payable));
    expect({ receivable: receivable - offset, payable: payable - offset }).toEqual({ receivable: 10_000, payable: 40_000 });
    expect(resolveFinancialImpact({ operationType: 'TOUR_OFFSET' })).toEqual(expect.objectContaining({ cashFlowGroup: 'NON_CASH', pnlEffect: 'NONE' }));
  });
});
