import { describe, expect, it } from 'vitest';
import {
  calcClosingCash,
  calcCurrentRatio,
  calcDebtToAssets,
  calcDebtToEquity,
  calcFlightMargin,
  calcFreeCashFlow,
  calcGrossMargin,
  calcGrossProfit,
  calcNetCashFlow,
  calcNetDebt,
  calcNetMargin,
  calcOperatingMargin,
  calcOperatingProfit,
  calcOutstanding,
  calcPerUnit,
  calcQuickRatio,
  calcRoa,
  calcRoe,
  calcSellThrough,
  calcWorkingCapital,
} from './financial-calculations';

describe('financial calculation helpers', () => {
  it('calculates ROA and returns null for zero assets', () => {
    expect(calcRoa(120, 800, 1000)).toBeCloseTo(13.3333, 4);
    expect(calcRoa(120, 0, 0)).toBeNull();
  });

  it('calculates ROE and hides negative equity', () => {
    expect(calcRoe(80, 400, 600)).toBeCloseTo(16, 4);
    expect(calcRoe(80, -100, -50)).toBeNull();
  });

  it('calculates profitability margins', () => {
    const grossProfit = calcGrossProfit(1000, 600);
    const operatingProfit = calcOperatingProfit(grossProfit, 120);
    expect(grossProfit).toBe(400);
    expect(calcGrossMargin(grossProfit, 1000)).toBe(40);
    expect(operatingProfit).toBe(280);
    expect(calcOperatingMargin(operatingProfit, 1000)).toBeCloseTo(28, 4);
    expect(calcNetMargin(220, 1000)).toBe(22);
    expect(calcGrossMargin(1, 0)).toBeNull();
  });

  it('calculates liquidity ratios and working capital', () => {
    expect(calcCurrentRatio(500, 250)).toBe(2);
    expect(calcQuickRatio({ cash: 100, receivables: 150, currentLiabilities: 250 })).toBe(1);
    expect(calcWorkingCapital(500, 250)).toBe(250);
    expect(calcCurrentRatio(500, 0)).toBeNull();
  });

  it('calculates debt ratios and net debt', () => {
    expect(calcDebtToAssets(300, 1200)).toBe(25);
    expect(calcDebtToEquity(300, 600)).toBe(0.5);
    expect(calcNetDebt(700, 250)).toBe(450);
    expect(calcDebtToEquity(300, 0)).toBeNull();
  });

  it('calculates cash flow values', () => {
    const net = calcNetCashFlow(100, -40, 25);
    expect(net).toBe(85);
    expect(calcClosingCash(200, net)).toBe(285);
    expect(calcFreeCashFlow(100, 30)).toBe(70);
  });

  it('calculates receivable and payable outstanding', () => {
    expect(calcOutstanding(1000, 300, 50)).toBe(650);
    expect(calcOutstanding(500, 200)).toBe(300);
  });

  it('calculates flight margin, sell-through, and per-passenger values safely', () => {
    expect(calcFlightMargin(250, 1000)).toBe(25);
    expect(calcSellThrough(8, 10)).toBe(80);
    expect(calcPerUnit(1000, 4)).toBe(250);
    expect(calcFlightMargin(1, 0)).toBeNull();
    expect(calcSellThrough(1, 0)).toBeNull();
    expect(calcPerUnit(1, 0)).toBeNull();
  });
});
