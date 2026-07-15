import { describe, expect, it } from 'vitest';
import { calculateAccountBalance } from './accounts.controller';

describe('financial account balance', () => {
  it('adds incoming and subtracts outgoing money without mixing currencies', () => {
    const balance = calculateAccountBalance({ id: 'bank', currency: 'UZS', openingBalance: 100 }, [
      { sourceAccountId: null, destinationAccountId: 'bank', originalAmount: 50, currency: 'UZS' },
      { sourceAccountId: 'bank', destinationAccountId: null, originalAmount: 20, currency: 'UZS' },
      { sourceAccountId: null, destinationAccountId: 'bank', originalAmount: 999, currency: 'USD' },
    ]);
    expect(balance).toBe(130);
  });

  it('recognizes legacy kassa-linked activity', () => {
    expect(calculateAccountBalance({ id: 'cash', currency: 'UZS', openingBalance: 0, kassaDeskId: 'desk-1' }, [
      { sourceAccountId: null, destinationAccountId: null, originalAmount: 200, currency: 'UZS', kassaDeskId: 'desk-1', type: 'SALE', direction: null },
      { sourceAccountId: null, destinationAccountId: null, originalAmount: 40, currency: 'UZS', kassaDeskId: 'desk-1', type: 'ADJUSTMENT', direction: 'KASSA_OUT' },
    ])).toBe(160);
  });
});
