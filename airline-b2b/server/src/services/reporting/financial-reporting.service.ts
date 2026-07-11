import { Prisma, TransactionType } from '@prisma/client';
import { prisma } from '../../db';
import { canAccessFirm, getAccessibleFirmIds, normalizeRole, ScopedAuthUser } from '../../utils/access';
import { isPayableDebtType } from '../../utils/transaction-types';
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

type ReportQuery = {
  companyId?: unknown;
  firmId?: unknown;
  branchId?: unknown;
  kassaDeskId?: unknown;
  flightId?: unknown;
  currency?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  year?: unknown;
  month?: unknown;
};

type TxRow = Awaited<ReturnType<typeof loadTransactions>>[number];
type AllocationRow = { companyId: string; documentType: string; documentId: string; allocatedAmount: Prisma.Decimal };

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function parseDate(value: unknown): Date | null {
  const raw = asString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolvePeriod(input: ReportQuery) {
  const now = new Date();
  const year = Number(asString(input.year)) || now.getUTCFullYear();
  const monthRaw = asString(input.month);
  const month = monthRaw ? Number(monthRaw) : null;
  const defaultFrom = month && month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month - 1, 1))
    : new Date(Date.UTC(year, 0, 1));
  const defaultTo = month && month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
    : new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const from = parseDate(input.dateFrom) || defaultFrom;
  const to = parseDate(input.dateTo) || defaultTo;
  return { from: startOfDay(from), to: endOfDay(to) };
}

function previousPeriod(from: Date, to: Date) {
  const duration = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - duration);
  return { from: prevFrom, to: prevTo };
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function lastTwelveMonths(to: Date) {
  const months: Array<{ key: string; from: Date; to: Date; label: string }> = [];
  const cursor = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  for (let i = 11; i >= 0; i -= 1) {
    const start = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    const key = monthKey(start);
    months.push({ key, from: start, to: end, label: key.slice(5) });
  }
  return months;
}

async function resolveScope(authUser: ScopedAuthUser, query: ReportQuery) {
  const role = normalizeRole(authUser.role);
  const requestedFirmId = asString(query.companyId) || asString(query.firmId);
  let firmIds: string[] | undefined;

  if (role === 'FIRM') {
    if (!authUser.firmId) throw new Error('Firm account is missing firmId');
    firmIds = [String(authUser.firmId)];
  } else if (requestedFirmId) {
    if (!(await canAccessFirm(authUser, requestedFirmId))) throw new Error('Forbidden');
    firmIds = [requestedFirmId];
  } else {
    firmIds = await getAccessibleFirmIds(authUser);
  }

  const branchId = asString(query.branchId) || asString(query.kassaDeskId);
  if (branchId) {
    const desk = await prisma.kassaDesk.findUnique({ where: { id: branchId }, select: { id: true, firmId: true } });
    if (!desk) throw new Error('Kassa branch not found');
    if (firmIds && !firmIds.includes(desk.firmId)) throw new Error('Forbidden');
  }

  return {
    role,
    firmIds,
    branchId: branchId || undefined,
    flightId: asString(query.flightId) || undefined,
    currency: asString(query.currency).toUpperCase() || undefined,
  };
}

function buildTxWhere(scope: Awaited<ReturnType<typeof resolveScope>>, period: { from: Date; to: Date }): Prisma.TransactionWhereInput {
  return {
    createdAt: { gte: period.from, lte: period.to },
    ...(scope.firmIds ? { firmId: { in: scope.firmIds } } : {}),
    ...(scope.branchId ? { kassaDeskId: scope.branchId } : {}),
    ...(scope.flightId ? { flightId: scope.flightId } : {}),
    ...(scope.currency ? { currency: scope.currency } : {}),
    OR: [
      { flightId: null },
      { flight: { deletedAt: null, OR: [{ status: null }, { status: { notIn: ['DELETED', 'CANCELLED'] } }] } },
    ],
  };
}

async function loadTransactions(scope: Awaited<ReturnType<typeof resolveScope>>, period: { from: Date; to: Date }) {
  return prisma.transaction.findMany({
    where: buildTxWhere(scope, period),
    include: {
      firm: { select: { id: true, name: true, kind: true } },
      payerFirm: { select: { id: true, name: true, kind: true } },
      receiverFirm: { select: { id: true, name: true, kind: true } },
      flight: { select: { id: true, flightNumber: true, route: true, departure: true, airline: { select: { name: true, firmId: true } } } },
      kassaDesk: { select: { id: true, name: true, code: true, firmId: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

async function loadCashBefore(scope: Awaited<ReturnType<typeof resolveScope>>, from: Date) {
  const where: Prisma.TransactionWhereInput = {
    createdAt: { lt: from },
    ...(scope.firmIds ? { firmId: { in: scope.firmIds } } : {}),
    ...(scope.branchId ? { kassaDeskId: scope.branchId } : {}),
    ...(scope.currency ? { currency: scope.currency } : {}),
    OR: [
      { type: 'PAYMENT' },
      { type: 'ADJUSTMENT', paymentMethod: { not: null } },
    ],
  };
  const rows = await prisma.transaction.findMany({ where, select: { type: true, direction: true, baseAmount: true } });
  return rows.reduce((sum, tx) => sum + cashSignedAmount(tx as Pick<TxRow, 'type' | 'direction' | 'baseAmount'>), 0);
}

async function loadPaymentAllocations(scope: Awaited<ReturnType<typeof resolveScope>>, period: { from: Date; to: Date }) {
  return prisma.paymentAllocation.findMany({
    where: {
      createdAt: { gte: period.from, lte: period.to },
      ...(scope.firmIds ? { companyId: { in: scope.firmIds } } : {}),
    },
    select: { companyId: true, documentType: true, documentId: true, allocatedAmount: true },
  });
}

function amount(tx: Pick<TxRow, 'baseAmount'>) {
  return toNumber(tx.baseAmount);
}

function cashSignedAmount(tx: Pick<TxRow, 'type' | 'direction' | 'baseAmount'>) {
  const value = amount(tx);
  if (tx.type === 'PAYMENT') return value;
  if (tx.direction === 'KASSA_IN') return value;
  if (tx.direction === 'KASSA_OUT') return -value;
  return 0;
}

function summarizeTransactions(transactions: TxRow[]) {
  let revenue = 0;
  let cogs = 0;
  let operatingExpenses = 0;
  let otherIncome = 0;
  let payments = 0;
  let operatingCashFlow = 0;
  let investingCashFlow = 0;
  let financingCashFlow = 0;
  let capitalExpenditure = 0;

  for (const tx of transactions) {
    const value = amount(tx);
    if (tx.type === 'SALE') revenue += value;
    if (isPayableDebtType(tx.type)) cogs += value;
    if (tx.type === 'PAYMENT') {
      payments += value;
      operatingCashFlow += value;
    }
    if (tx.type === 'ADJUSTMENT' && tx.direction === 'KASSA_OUT') {
      operatingExpenses += value;
      operatingCashFlow -= value;
    }
    if (tx.type === 'ADJUSTMENT' && tx.direction === 'KASSA_IN') {
      otherIncome += value;
      operatingCashFlow += value;
    }
    const meta = (tx.metadata || {}) as Record<string, unknown>;
    const cashCategory = String(meta.cashFlowCategory || meta.cash_flow_category || '').toUpperCase();
    if (cashCategory === 'INVESTING') investingCashFlow += cashSignedAmount(tx);
    if (cashCategory === 'FINANCING') financingCashFlow += cashSignedAmount(tx);
    if (cashCategory === 'CAPEX') capitalExpenditure += Math.abs(cashSignedAmount(tx));
  }

  const grossProfit = calcGrossProfit(revenue, cogs);
  const operatingProfit = calcOperatingProfit(grossProfit + otherIncome, operatingExpenses);
  const netProfit = operatingProfit;

  return {
    revenue,
    cogs,
    grossProfit,
    grossMargin: calcGrossMargin(grossProfit, revenue),
    operatingExpenses,
    operatingProfit,
    operatingMargin: calcOperatingMargin(operatingProfit, revenue),
    netProfit,
    netMargin: calcNetMargin(netProfit, revenue),
    payments,
    operatingCashFlow,
    investingCashFlow,
    financingCashFlow,
    capitalExpenditure,
  };
}

function buildAgingRows(transactions: TxRow[], kind: 'receivable' | 'payable', allocations: AllocationRow[] = []) {
  const allocationsByDocument = new Map<string, number>();
  for (const allocation of allocations) {
    const key = `${allocation.companyId}:${allocation.documentId}`;
    allocationsByDocument.set(key, (allocationsByDocument.get(key) || 0) + toNumber(allocation.allocatedAmount));
  }
  const hasAllocations = allocationsByDocument.size > 0;
  const groups = new Map<string, {
    key: string;
    counterpartyName: string | null;
    counterpartyType: string | null;
    flightId: string | null;
    flightNumber: string | null;
    documentDate: Date | null;
    originalAmount: number;
    paidAmount: number;
  }>();

  for (const tx of transactions) {
    const documentId = tx.flightId || tx.subjectId || 'general';
    const groupKey = `${tx.firmId}:${documentId}`;
    const row = groups.get(groupKey) || {
      key: groupKey,
      counterpartyName: tx.firm?.name || null,
      counterpartyType: tx.firm?.kind || null,
      flightId: tx.flightId || null,
      flightNumber: tx.flight?.flightNumber || null,
      documentDate: tx.createdAt,
      originalAmount: 0,
      paidAmount: 0,
    };
    if (tx.createdAt < (row.documentDate || tx.createdAt)) row.documentDate = tx.createdAt;
    if (kind === 'receivable') {
      if (tx.type === 'SALE') row.originalAmount += amount(tx);
      if (!hasAllocations && tx.type === 'PAYMENT') row.paidAmount += amount(tx);
    } else {
      if (isPayableDebtType(tx.type)) row.originalAmount += amount(tx);
      if (!hasAllocations && tx.type === 'PAYMENT') row.paidAmount += amount(tx);
    }
    if (hasAllocations) row.paidAmount = allocationsByDocument.get(groupKey) || 0;
    groups.set(groupKey, row);
  }

  const rows = Array.from(groups.values())
    .map((row) => {
      const outstanding = calcOutstanding(row.originalAmount, row.paidAmount);
      return {
        customer: row.counterpartyName,
        supplier: row.counterpartyName,
        supplierType: row.counterpartyType,
        saleOrInvoice: row.key,
        flightId: row.flightId,
        flightNumber: row.flightNumber,
        saleManager: null,
        documentDate: row.documentDate?.toISOString() || null,
        dueDate: null,
        originalAmount: row.originalAmount,
        invoiceAmount: row.originalAmount,
        paidAmount: row.paidAmount,
        outstandingAmount: outstanding,
        daysOverdue: null,
        agingBucket: 'NOT_DUE',
        status: outstanding > 0 ? 'OPEN' : 'PAID',
      };
    })
    .filter((row) => Math.abs(row.originalAmount) > 0 || Math.abs(row.paidAmount) > 0);

  const total = rows.reduce((sum, row) => sum + Math.max(0, row.outstandingAmount), 0);
  const paid = rows.reduce((sum, row) => sum + Math.max(0, row.paidAmount), 0);
  const obligation = rows.reduce((sum, row) => sum + Math.max(0, row.originalAmount), 0);
  return {
    total,
    overdue: 0,
    dueSoon: 0,
    collectionRate: obligation > 0 ? (paid / obligation) * 100 : null,
    aging: {
      NOT_DUE: total,
      '1_30': 0,
      '31_60': 0,
      '61_90': 0,
      '90_PLUS': 0,
    },
    rows,
  };
}

function buildCashFlow(summary: ReturnType<typeof summarizeTransactions>, openingCash: number) {
  const netCashFlow = calcNetCashFlow(summary.operatingCashFlow, summary.investingCashFlow, summary.financingCashFlow);
  return {
    openingCash,
    operating: summary.operatingCashFlow,
    investing: summary.investingCashFlow,
    financing: summary.financingCashFlow,
    netCashFlow,
    closingCash: calcClosingCash(openingCash, netCashFlow),
    freeCashFlow: calcFreeCashFlow(summary.operatingCashFlow, summary.capitalExpenditure),
    capitalExpenditure: summary.capitalExpenditure,
  };
}

async function buildFlightProfitability(transactions: TxRow[], scope: Awaited<ReturnType<typeof resolveScope>>) {
  const txFlightIds = transactions.map((tx) => tx.flightId).filter((id): id is string => Boolean(id));
  const flightWhere: Prisma.FlightWhereInput = {
    deletedAt: null,
    OR: [{ status: null }, { status: { notIn: ['DELETED', 'CANCELLED'] } }],
    ...(scope.flightId ? { id: scope.flightId } : txFlightIds.length ? { id: { in: Array.from(new Set(txFlightIds)) } } : {}),
  };
  const flights = await prisma.flight.findMany({
    where: flightWhere,
    include: {
      airline: { select: { name: true, firmId: true } },
      tickets: { where: { deletedAt: null }, select: { status: true } },
      tourPackages: { where: { deletedAt: null }, select: { quantity: true, availableQuantity: true, sales: { select: { quantity: true } } } },
    },
  });
  const txByFlight = new Map<string, TxRow[]>();
  for (const tx of transactions) {
    if (!tx.flightId) continue;
    const list = txByFlight.get(tx.flightId) || [];
    list.push(tx);
    txByFlight.set(tx.flightId, list);
  }
  const companyOverhead = transactions
    .filter((tx) => !tx.flightId && tx.type === 'ADJUSTMENT' && tx.direction === 'KASSA_OUT')
    .reduce((sum, tx) => sum + amount(tx), 0);
  const revenueByFlight = flights.map((flight) => ({
    id: flight.id,
    revenue: (txByFlight.get(flight.id) || []).filter((tx) => tx.type === 'SALE').reduce((sum, tx) => sum + amount(tx), 0),
  }));
  const totalRevenue = revenueByFlight.reduce((sum, row) => sum + row.revenue, 0);

  return flights.map((flight) => {
    const rows = txByFlight.get(flight.id) || [];
    const summary = summarizeTransactions(rows);
    const purchasedTickets = flight.tickets.filter((ticket) => ticket.status !== 'DELETED' && ticket.status !== 'CANCELLED').length;
    const soldTickets = flight.tickets.filter((ticket) => ticket.status === 'SOLD').length;
    const purchasedPackages = flight.tourPackages.reduce((sum, p) => sum + p.quantity, 0);
    const soldPackages = flight.tourPackages.reduce((sum, p) => sum + p.sales.reduce((saleSum, sale) => saleSum + sale.quantity, 0), 0);
    const allocatedOverhead = totalRevenue > 0 ? (summary.revenue / totalRevenue) * companyOverhead : 0;
    const directExpenses = summary.operatingExpenses;
    const operatingResult = summary.grossProfit - directExpenses - allocatedOverhead;
    const passengerCount = soldTickets + soldPackages;
    return {
      flightId: flight.id,
      flightCode: flight.flightNumber,
      airline: flight.airline?.name || null,
      route: flight.route,
      departureDate: flight.departure.toISOString(),
      purchasedTickets,
      soldTickets,
      remainingTickets: Math.max(0, purchasedTickets - soldTickets),
      ticketSellThrough: calcSellThrough(soldTickets, purchasedTickets),
      purchasedPackages,
      soldPackages,
      remainingPackages: Math.max(0, purchasedPackages - soldPackages),
      packageSellThrough: calcSellThrough(soldPackages, purchasedPackages),
      revenue: summary.revenue,
      cogs: summary.cogs,
      grossProfit: summary.grossProfit,
      directExpenses,
      allocatedOverhead,
      overheadMethod: 'BY_REVENUE',
      operatingResult,
      margin: calcFlightMargin(operatingResult, summary.revenue),
      receivables: Math.max(0, buildAgingRows(rows, 'receivable').total),
      payables: Math.max(0, buildAgingRows(rows, 'payable').total),
      revenuePerPassenger: calcPerUnit(summary.revenue, passengerCount),
      profitPerPassenger: calcPerUnit(operatingResult, passengerCount),
    };
  }).sort((a, b) => b.operatingResult - a.operatingResult);
}

function buildMonthlySeries(transactions: TxRow[], openingCash: number, to: Date) {
  let runningCash = openingCash;
  return lastTwelveMonths(to).map((month) => {
    const rows = transactions.filter((tx) => tx.createdAt >= month.from && tx.createdAt <= month.to);
    const summary = summarizeTransactions(rows);
    const netCashFlow = calcNetCashFlow(summary.operatingCashFlow, summary.investingCashFlow, summary.financingCashFlow);
    runningCash += netCashFlow;
    return {
      month: month.key,
      label: month.label,
      revenue: summary.revenue,
      cogs: summary.cogs,
      grossProfit: summary.grossProfit,
      grossMargin: summary.grossMargin,
      operatingMargin: summary.operatingMargin,
      netMargin: summary.netMargin,
      netProfit: summary.netProfit,
      operatingCashFlow: summary.operatingCashFlow,
      investingCashFlow: summary.investingCashFlow,
      financingCashFlow: summary.financingCashFlow,
      netCashFlow,
      closingCash: runningCash,
    };
  });
}

export async function buildFinancialAnalyticsReport(authUser: ScopedAuthUser, query: ReportQuery) {
  const scope = await resolveScope(authUser, query);
  const period = resolvePeriod(query);
  const prev = previousPeriod(period.from, period.to);
  const twelveMonthPeriod = { from: lastTwelveMonths(period.to)[0].from, to: period.to };

  const [transactions, previousTransactions, monthlyTransactions, openingCash, allocations] = await Promise.all([
    loadTransactions(scope, period),
    loadTransactions(scope, prev),
    loadTransactions(scope, twelveMonthPeriod),
    loadCashBefore(scope, period.from),
    loadPaymentAllocations(scope, period),
  ]);

  const summary = summarizeTransactions(transactions);
  const previousSummary = summarizeTransactions(previousTransactions);
  const cashFlow = buildCashFlow(summary, openingCash);
  const receivables = buildAgingRows(transactions, 'receivable', allocations);
  const payables = buildAgingRows(transactions, 'payable', allocations);

  const currentAssets = cashFlow.closingCash + receivables.total;
  const currentLiabilities = payables.total;
  const totalAssets = currentAssets;
  const totalLiabilities = currentLiabilities;
  const totalEquity = totalAssets - totalLiabilities;
  const previousAssets = buildCashFlow(previousSummary, await loadCashBefore(scope, prev.from)).closingCash + buildAgingRows(previousTransactions, 'receivable').total;
  const previousLiabilities = buildAgingRows(previousTransactions, 'payable').total;
  const previousEquity = previousAssets - previousLiabilities;
  const tradePayables = payables.total;
  const bankDebt = 0;
  const founderDebt = 0;
  const taxLiabilities = 0;
  const otherLiabilities = 0;
  const interestBearingDebt = bankDebt + founderDebt;
  const monthly = buildMonthlySeries(monthlyTransactions, await loadCashBefore(scope, twelveMonthPeriod.from), period.to);
  const flightProfitability = await buildFlightProfitability(transactions, scope);

  const profitability = {
    revenue: summary.revenue,
    cogs: summary.cogs,
    grossProfit: summary.grossProfit,
    grossMargin: summary.grossMargin,
    operatingExpenses: summary.operatingExpenses,
    operatingProfit: summary.operatingProfit,
    operatingMargin: summary.operatingMargin,
    netProfit: summary.netProfit,
    netMargin: summary.netMargin,
    roa: calcRoa(summary.netProfit, previousAssets, totalAssets),
    roe: calcRoe(summary.netProfit, previousEquity, totalEquity),
    supportingValues: {
      averageAssets: (previousAssets + totalAssets) / 2,
      averageEquity: (previousEquity + totalEquity) / 2,
    },
    previous: {
      revenue: previousSummary.revenue,
      grossProfit: previousSummary.grossProfit,
      operatingProfit: previousSummary.operatingProfit,
      netProfit: previousSummary.netProfit,
    },
  };

  const liquidity = {
    cash: cashFlow.closingCash,
    cashEquivalents: 0,
    receivables: receivables.total,
    shortTermInvestments: 0,
    currentAssets,
    currentLiabilities,
    currentRatio: calcCurrentRatio(currentAssets, currentLiabilities),
    quickRatio: calcQuickRatio({ cash: cashFlow.closingCash, receivables: receivables.total, currentLiabilities }),
    workingCapital: calcWorkingCapital(currentAssets, currentLiabilities),
  };

  const debt = {
    totalLiabilities,
    tradePayables,
    bankDebt,
    founderDebt,
    taxLiabilities,
    otherLiabilities,
    debtToAssets: calcDebtToAssets(totalLiabilities, totalAssets),
    debtToEquity: calcDebtToEquity(totalLiabilities, totalEquity),
    netDebt: calcNetDebt(interestBearingDebt, cashFlow.closingCash),
    debtStructure: [
      { label: 'Trade Payables', value: tradePayables },
      { label: 'Bank Debt', value: bankDebt },
      { label: 'Founder Debt', value: founderDebt },
      { label: 'Tax Liabilities', value: taxLiabilities },
      { label: 'Other Liabilities', value: otherLiabilities },
    ],
  };

  const totals = flightProfitability.reduce((acc, flight) => {
    acc.purchasedTickets += flight.purchasedTickets;
    acc.soldTickets += flight.soldTickets;
    acc.purchasedPackages += flight.purchasedPackages;
    acc.soldPackages += flight.soldPackages;
    acc.revenue += flight.revenue;
    acc.profit += flight.operatingResult;
    return acc;
  }, { purchasedTickets: 0, soldTickets: 0, purchasedPackages: 0, soldPackages: 0, revenue: 0, profit: 0 });
  const passengerCount = totals.soldTickets + totals.soldPackages;

  return {
    period: { from: period.from.toISOString(), to: period.to.toISOString() },
    filters: {
      companyId: scope.firmIds?.length === 1 ? scope.firmIds[0] : null,
      firmIds: scope.firmIds || null,
      branchId: scope.branchId || null,
      flightId: scope.flightId || null,
      currency: scope.currency || null,
    },
    notes: [
      'Ratios use available ledger-derived balance sheet values. Missing threshold configuration returns neutral UI status.',
      'Invoice due dates and payment allocations are not present in the current schema, so receivable/payable aging remains NOT_DUE until those fields are added.',
      'Founder, bank, and tax debt are separated in the response and currently return 0 unless captured as explicit ledger metadata in future schema.',
    ],
    profitability,
    liquidity,
    debt,
    cashFlow,
    receivables,
    payables,
    efficiency: {
      ticketSellThrough: calcSellThrough(totals.soldTickets, totals.purchasedTickets),
      packageSellThrough: calcSellThrough(totals.soldPackages, totals.purchasedPackages),
      averageTicketMargin: null,
      averagePackageMargin: null,
      revenuePerPassenger: calcPerUnit(totals.revenue, passengerCount),
      profitPerPassenger: calcPerUnit(totals.profit, passengerCount),
    },
    monthly,
    flightProfitability,
  };
}

export type FinancialAnalyticsReport = Awaited<ReturnType<typeof buildFinancialAnalyticsReport>>;
