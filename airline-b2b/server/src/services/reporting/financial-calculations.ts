export function ratioPercent(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

export function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

export function average(opening: number, closing: number): number {
  return (opening + closing) / 2;
}

export function calcRoa(netProfit: number, openingAssets: number, closingAssets: number): number | null {
  return ratioPercent(netProfit, average(openingAssets, closingAssets));
}

export function calcRoe(netProfit: number, openingEquity: number, closingEquity: number): number | null {
  return ratioPercent(netProfit, average(openingEquity, closingEquity));
}

export function calcGrossProfit(netRevenue: number, cogs: number): number {
  return netRevenue - cogs;
}

export function calcOperatingProfit(grossProfit: number, operatingExpenses: number): number {
  return grossProfit - operatingExpenses;
}

export function calcGrossMargin(grossProfit: number, netRevenue: number): number | null {
  return ratioPercent(grossProfit, netRevenue);
}

export function calcOperatingMargin(operatingProfit: number, netRevenue: number): number | null {
  return ratioPercent(operatingProfit, netRevenue);
}

export function calcNetMargin(netProfit: number, netRevenue: number): number | null {
  return ratioPercent(netProfit, netRevenue);
}

export function calcCurrentRatio(currentAssets: number, currentLiabilities: number): number | null {
  return ratio(currentAssets, currentLiabilities);
}

export function calcQuickRatio(input: {
  cash: number;
  cashEquivalents?: number;
  receivables: number;
  shortTermInvestments?: number;
  currentLiabilities: number;
}): number | null {
  return ratio(
    input.cash + (input.cashEquivalents || 0) + input.receivables + (input.shortTermInvestments || 0),
    input.currentLiabilities,
  );
}

export function calcWorkingCapital(currentAssets: number, currentLiabilities: number): number {
  return currentAssets - currentLiabilities;
}

export function calcDebtToAssets(totalLiabilities: number, totalAssets: number): number | null {
  return ratioPercent(totalLiabilities, totalAssets);
}

export function calcDebtToEquity(totalLiabilities: number, totalEquity: number): number | null {
  return ratio(totalLiabilities, totalEquity);
}

export function calcNetDebt(interestBearingDebt: number, cashAndCashEquivalents: number): number {
  return interestBearingDebt - cashAndCashEquivalents;
}

export function calcNetCashFlow(operating: number, investing: number, financing: number): number {
  return operating + investing + financing;
}

export function calcClosingCash(openingCash: number, netCashFlow: number): number {
  return openingCash + netCashFlow;
}

export function calcFreeCashFlow(operatingCashFlow: number, capitalExpenditure: number): number {
  return operatingCashFlow - capitalExpenditure;
}

export function calcOutstanding(obligation: number, allocatedPayments: number, creditNotes = 0): number {
  return obligation - allocatedPayments - creditNotes;
}

export function calcFlightMargin(flightResult: number, flightNetRevenue: number): number | null {
  return ratioPercent(flightResult, flightNetRevenue);
}

export function calcSellThrough(sold: number, purchased: number): number | null {
  return ratioPercent(sold, purchased);
}

export function calcPerUnit(total: number, count: number): number | null {
  return ratio(total, count);
}
