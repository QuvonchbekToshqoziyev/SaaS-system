import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { assertTransferCurrencyPair, calculateExpectedCashByCurrency, calculateTransferBalance, previousKassaRemainderQuery, resolveCarryForwardBalance, resolveKassaTransactionFlow, resolveOpeningBalance } from './kassa.service';
import { kassaSessionWhere } from '../utils/kassa';

describe('kassa opening balance carry-forward', () => {
  it('prefers actual cash and supports legacy expected cash', () => {
    expect(resolveCarryForwardBalance({ actualClosingBalance: new Prisma.Decimal(9), closingBalance: new Prisma.Decimal(8), expectedCash: new Prisma.Decimal(7) })?.toNumber()).toBe(9);
    expect(resolveCarryForwardBalance({ expectedCash: new Prisma.Decimal(7) })?.toNumber()).toBe(7);
  });

  it('calculates UZS and USD remainders independently', () => {
    expect(calculateExpectedCashByCurrency(
      { openingBalance: new Prisma.Decimal(100_000), openingBalanceUsd: new Prisma.Decimal(50) },
      { UZS: { cashTotal: 25_000 }, USD: { cashTotal: -10 } },
    )).toEqual({ UZS: 125_000, USD: 40 });
  });

  it('calculates transfer balances with source and destination currencies', () => {
    const exchange = [{ sourceAccountId: 'cash-usd', destinationAccountId: 'cash-uzs', originalAmount: 1000, currency: 'USD', destinationAmount: 12_600_000, destinationCurrency: 'UZS' }];
    expect(calculateTransferBalance({ id: 'cash-usd', currency: 'USD', openingBalance: 1500 }, exchange).toNumber()).toBe(500);
    expect(calculateTransferBalance({ id: 'cash-uzs', currency: 'UZS', openingBalance: 0 }, exchange).toNumber()).toBe(12_600_000);
  });

  it('keeps VASH limited to USD and UZS exchange pairs', () => {
    expect(() => assertTransferCurrencyPair('CURRENCY_EXCHANGE', 'USD', 'UZS')).not.toThrow();
    expect(() => assertTransferCurrencyPair('CURRENCY_EXCHANGE', 'UZS', 'USD')).not.toThrow();
    expect(() => assertTransferCurrencyPair('CURRENCY_EXCHANGE', 'USD', 'USD')).toThrow('USD');
    expect(() => assertTransferCurrencyPair('CASH_TO_CARD', 'USD', 'UZS')).toThrow('VASH');
  });

  it('treats a payment from the kassa firm to an airline as cash out', () => {
    expect(resolveKassaTransactionFlow({
      type: 'PAYMENT', firmId: 'agency', payerFirmId: 'agency', receiverFirmId: 'airline', metadata: { cashFlow: 'OUT' },
    })).toBe('OUT');
    expect(resolveKassaTransactionFlow({
      type: 'PAYMENT', firmId: 'agency', payerFirmId: 'customer', receiverFirmId: 'agency',
    })).toBe('IN');
  });

  it('checks the selected desk session instead of the legacy global day', () => {
    expect(kassaSessionWhere(new Date('2026-07-13T12:00:00Z'), 'desk-1')).toEqual({
      businessDate: new Date('2026-07-13T00:00:00Z'),
      cashDeskId: 'desk-1',
    });
  });

  it('uses the latest closed snapshot regardless of skipped calendar days', () => {
    const result = resolveOpeningBalance({ previousClosingBalance: new Prisma.Decimal(5_000_000), canAdjust: false });
    expect(result.openingBalance.toNumber()).toBe(5_000_000);
    expect(result.adjusted).toBe(false);
  });

  it('orders carry-forward by business date and skips closed rows without a remainder', () => {
    const day = new Date('2026-07-17T00:00:00.000Z');
    expect(previousKassaRemainderQuery('firm-1', 'desk-1', day, 'UZS')).toEqual({
      where: {
        firmId: 'firm-1', cashDeskId: 'desk-1', currency: 'UZS', status: 'CLOSED', businessDate: { lt: day },
        OR: [{ actualClosingBalance: { not: null } }, { closingBalance: { not: null } }, { expectedCash: { not: null } }],
      },
      orderBy: [{ businessDate: 'desc' }, { closedAt: 'desc' }],
    });
  });

  it('defaults the first session to zero and permits an authorized initial balance', () => {
    expect(resolveOpeningBalance({ canAdjust: false }).openingBalance.toNumber()).toBe(0);
    expect(resolveOpeningBalance({ requestedBalance: new Prisma.Decimal(2_000_000), canAdjust: true }).openingBalance.toNumber()).toBe(2_000_000);
  });

  it('blocks kassir overrides and requires a reason for later corrections', () => {
    const previous = new Prisma.Decimal(5_000_000);
    expect(() => resolveOpeningBalance({ previousClosingBalance: previous, requestedBalance: new Prisma.Decimal(4_000_000), canAdjust: false })).toThrow('cannot be changed');
    expect(() => resolveOpeningBalance({ previousClosingBalance: previous, requestedBalance: new Prisma.Decimal(4_000_000), canAdjust: true })).toThrow('reason is required');
  });
});
