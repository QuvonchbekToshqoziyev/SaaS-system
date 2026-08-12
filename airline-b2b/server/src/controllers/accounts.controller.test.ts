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

  it('replaces a 500 income with a 500 expense as a minus 1000 balance correction', () => {
    const account = { id: 'cash', currency: 'USD', openingBalance: 0 };
    const before = calculateAccountBalance(account, [
      { sourceAccountId: null, destinationAccountId: 'cash', originalAmount: 500, currency: 'USD' },
    ]);
    const after = calculateAccountBalance(account, [
      { sourceAccountId: 'cash', destinationAccountId: null, originalAmount: 500, currency: 'USD' },
    ]);
    expect(before).toBe(500);
    expect(after).toBe(-500);
    expect(after - before).toBe(-1000);
  });

  it('reduces an outgoing amount from 500 to 400 without duplicating the old effect', () => {
    const account = { id: 'cash', currency: 'USD', openingBalance: 1000 };
    const before = calculateAccountBalance(account, [
      { sourceAccountId: 'cash', destinationAccountId: null, originalAmount: 500, currency: 'USD' },
    ]);
    const after = calculateAccountBalance(account, [
      { sourceAccountId: 'cash', destinationAccountId: null, originalAmount: 400, currency: 'USD' },
    ]);
    expect(after - before).toBe(100);
    expect(after).toBe(600);
  });

  it('moves a card income from the old card account to the new one', () => {
    const transactions = [{ sourceAccountId: null, destinationAccountId: 'card-b', originalAmount: 1000, currency: 'USD' }];
    expect(calculateAccountBalance({ id: 'card-a', currency: 'USD', openingBalance: 0 }, transactions)).toBe(0);
    expect(calculateAccountBalance({ id: 'card-b', currency: 'USD', openingBalance: 0 }, transactions)).toBe(1000);
  });

  it('uses the destination amount and currency for currency exchange', () => {
    const exchange = [{ sourceAccountId: 'usd', destinationAccountId: 'uzs', originalAmount: 500, currency: 'USD', destinationAmount: 6_300_000, destinationCurrency: 'UZS' }];
    expect(calculateAccountBalance({ id: 'usd', currency: 'USD', openingBalance: 1000 }, exchange)).toBe(500);
    expect(calculateAccountBalance({ id: 'uzs', currency: 'UZS', openingBalance: 0 }, exchange)).toBe(6_300_000);
  });
});
