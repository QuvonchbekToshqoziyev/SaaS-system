import type { AccountBalance, JournalRepository } from '../accounting/journal-engine.js';

export type TrialBalanceReport = Readonly<{
  tenantKey: string;
  asOfDate: string;
  rows: readonly AccountBalance[];
  totalDebit: string;
  totalCredit: string;
}>;

export type ProfitAndLossReport = Readonly<{
  tenantKey: string;
  asOfDate: string;
  revenue: string;
  expenses: string;
  netIncome: string;
  currency: string;
}>;

export class ReportingError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'ReportingError'; }
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ReportingError('INVALID_INPUT', `${field} is required.`);
  return normalized;
}

function validDate(value: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(value); }

function add(values: readonly string[]): string {
  let whole = 0n;
  for (const value of values) {
    if (!/^\d+(\.\d{1,4})?$/.test(value)) throw new ReportingError('INVALID_BALANCE', 'Repository returned an invalid decimal balance.');
    const [integer, fraction = ''] = value.split('.');
    whole += BigInt(integer) * 10000n + BigInt(fraction.padEnd(4, '0'));
  }
  return `${whole / 10000n}.${(whole % 10000n).toString().padStart(4, '0')}`;
}

function subtract(left: string, right: string): string {
  const parse = (value: string) => { const [integer, fraction = ''] = value.split('.'); return BigInt(integer) * 10000n + BigInt(fraction.padEnd(4, '0')); };
  const value = parse(left) - parse(right);
  return `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 10000n}.${((value < 0n ? -value : value) % 10000n).toString().padStart(4, '0')}`;
}

function signedUnits(value: string): bigint {
  const negative = value.startsWith('-');
  const normalized = negative ? value.slice(1) : value;
  if (!/^\d+(\.\d{1,4})?$/.test(normalized)) throw new ReportingError('INVALID_BALANCE', 'Repository returned an invalid decimal balance.');
  const [integer, fraction = ''] = normalized.split('.');
  const result = BigInt(integer) * 10000n + BigInt(fraction.padEnd(4, '0'));
  return negative ? -result : result;
}

function signedAmount(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  const result = `${absolute / 10000n}.${(absolute % 10000n).toString().padStart(4, '0')}`;
  return value < 0n ? `-${result}` : result;
}

export async function buildTrialBalance(repository: JournalRepository, input: Readonly<{ tenantKey: string; asOfDate: string }>): Promise<TrialBalanceReport> {
  const tenantKey = required(input.tenantKey, 'Tenant');
  const asOfDate = required(input.asOfDate, 'As-of date');
  if (!validDate(asOfDate) || !repository.getAccountBalances) throw new ReportingError('REPORT_UNSUPPORTED', 'A balance-capable repository and valid as-of date are required.');
  const rows = await repository.getAccountBalances(tenantKey, asOfDate);
  return Object.freeze({ tenantKey, asOfDate, rows: Object.freeze([...rows]), totalDebit: add(rows.map((row) => row.debit)), totalCredit: add(rows.map((row) => row.credit)) });
}

export async function buildProfitAndLoss(
  repository: JournalRepository,
  input: Readonly<{ tenantKey: string; asOfDate: string; revenueAccountCodes: readonly string[]; expenseAccountCodes: readonly string[]; currency: string }>,
): Promise<ProfitAndLossReport> {
  const report = await buildTrialBalance(repository, input);
  const currency = required(input.currency, 'Currency').toUpperCase();
  const selected = report.rows.filter((row) => row.currency === currency);
  const revenue = signedAmount(-selected.filter((row) => input.revenueAccountCodes.includes(row.accountCode)).reduce((sum, row) => sum + (signedUnits(row.net) < 0n ? signedUnits(row.net) : 0n), 0n));
  const expenses = signedAmount(selected.filter((row) => input.expenseAccountCodes.includes(row.accountCode)).reduce((sum, row) => sum + (signedUnits(row.net) > 0n ? signedUnits(row.net) : 0n), 0n));
  return Object.freeze({ tenantKey: report.tenantKey, asOfDate: report.asOfDate, revenue, expenses, netIncome: subtract(revenue, expenses), currency });
}

function csv(value: string): string { return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value; }

export function trialBalanceCsv(report: TrialBalanceReport): string {
  const lines = ['account_code,currency,debit,credit,net', ...report.rows.map((row) => [row.accountCode, row.currency, row.debit, row.credit, row.net].map(csv).join(','))];
  return `${lines.join('\n')}\n`;
}
