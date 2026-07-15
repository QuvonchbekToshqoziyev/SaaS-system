import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { calculateExpectedCashByCurrency, resolveCarryForwardBalance, resolveOpeningBalance } from './kassa.service';
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
