import { randomUUID } from 'node:crypto';

export type PayrollStatus = 'DRAFT' | 'CALCULATED' | 'APPROVED' | 'POSTED';
export type PayrollLine = Readonly<{ employeeKey: string; gross: string; deductions: string; net: string; currency: string }>;
export type PayrollRun = Readonly<{
  id: string;
  tenantKey: string;
  period: string;
  status: PayrollStatus;
  currency: string;
  lines: readonly PayrollLine[];
  totalGross: string;
  totalDeductions: string;
  totalNet: string;
  createdAt: string;
  updatedAt: string;
}>;

export interface PayrollRepository {
  find(tenantKey: string, runId: string): Promise<PayrollRun | null>;
  create(run: PayrollRun): Promise<PayrollRun>;
  setStatus(tenantKey: string, runId: string, status: PayrollStatus, updatedAt: string): Promise<PayrollRun>;
}

export class PayrollError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'PayrollError'; }
}

function units(value: string): bigint {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) throw new PayrollError('INVALID_AMOUNT', 'Payroll amounts must be non-negative decimals with at most four places.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
}

function amount(value: bigint): string {
  const whole = value / 10000n;
  const fraction = (value % 10000n).toString().padStart(4, '0');
  return `${whole}.${fraction}`;
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new PayrollError('INVALID_INPUT', `${field} is required.`);
  return normalized;
}

const transitions: Readonly<Record<PayrollStatus, readonly PayrollStatus[]>> = Object.freeze({ DRAFT: ['CALCULATED'], CALCULATED: ['APPROVED'], APPROVED: ['POSTED'], POSTED: [] });

export async function createPayrollRun(
  repository: PayrollRepository,
  input: Readonly<{ tenantKey: string; period: string; currency: string; lines: readonly { employeeKey: string; gross: string; deductions: string }[] }>,
): Promise<PayrollRun> {
  const tenantKey = required(input.tenantKey, 'Tenant');
  const period = required(input.period, 'Period');
  const currency = required(input.currency, 'Currency').toUpperCase();
  if (!/^\d{4}-\d{2}$/.test(period) || !/^[A-Z]{3}$/.test(currency)) throw new PayrollError('INVALID_INPUT', 'Period and three-letter currency are required.');
  if (!input.lines.length) throw new PayrollError('EMPTY_RUN', 'Payroll run requires at least one employee.');
  let grossTotal = 0n;
  let deductionTotal = 0n;
  const lines = input.lines.map((inputLine) => {
    const employeeKey = required(inputLine.employeeKey, 'Employee');
    const gross = units(inputLine.gross);
    const deductions = units(inputLine.deductions);
    if (deductions > gross) throw new PayrollError('INVALID_DEDUCTIONS', 'Deductions cannot exceed gross pay.');
    grossTotal += gross;
    deductionTotal += deductions;
    return Object.freeze({ employeeKey, gross: amount(gross), deductions: amount(deductions), net: amount(gross - deductions), currency });
  });
  const timestamp = new Date().toISOString();
  return repository.create(Object.freeze({ id: randomUUID(), tenantKey, period, status: 'CALCULATED', currency, lines: Object.freeze(lines), totalGross: amount(grossTotal), totalDeductions: amount(deductionTotal), totalNet: amount(grossTotal - deductionTotal), createdAt: timestamp, updatedAt: timestamp }));
}

export async function transitionPayroll(
  repository: PayrollRepository,
  input: Readonly<{ tenantKey: string; runId: string; status: PayrollStatus }>,
): Promise<PayrollRun> {
  const tenantKey = required(input.tenantKey, 'Tenant');
  const run = await repository.find(tenantKey, required(input.runId, 'Run ID'));
  if (!run) throw new PayrollError('NOT_FOUND', 'Payroll run was not found.');
  if (!transitions[run.status].includes(input.status)) throw new PayrollError('INVALID_TRANSITION', `${run.status} cannot transition to ${input.status}.`);
  return repository.setStatus(tenantKey, run.id, input.status, new Date().toISOString());
}

export class MemoryPayrollRepository implements PayrollRepository {
  private readonly runs = new Map<string, PayrollRun>();
  async find(tenantKey: string, runId: string): Promise<PayrollRun | null> {
    const run = this.runs.get(runId);
    return run?.tenantKey === tenantKey ? run : null;
  }
  async create(run: PayrollRun): Promise<PayrollRun> { this.runs.set(run.id, run); return run; }
  async setStatus(tenantKey: string, runId: string, status: PayrollStatus, updatedAt: string): Promise<PayrollRun> {
    const run = await this.find(tenantKey, runId);
    if (!run) throw new PayrollError('NOT_FOUND', 'Payroll run was not found.');
    const updated = Object.freeze({ ...run, status, updatedAt });
    this.runs.set(runId, updated);
    return updated;
  }
}
