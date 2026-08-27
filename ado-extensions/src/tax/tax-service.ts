import { createHash, randomUUID } from 'node:crypto';

export type TaxRule = Readonly<{
  code: string;
  name: string;
  rateBasisPoints: number;
  effectiveFrom: string;
  effectiveTo?: string;
  sourceRef: string;
}>;

export type TaxCalculation = Readonly<{
  id: string;
  tenantKey: string;
  ruleCode: string;
  taxableAmount: string;
  taxAmount: string;
  totalAmount: string;
  currency: string;
  calculatedAt: string;
  inputFingerprint: string;
}>;

export interface TaxRepository {
  findRule(tenantKey: string, code: string, date: string): Promise<TaxRule | null>;
  saveRule(tenantKey: string, rule: TaxRule): Promise<TaxRule>;
  saveCalculation(calculation: TaxCalculation): Promise<TaxCalculation>;
}

export class TaxError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'TaxError'; }
}

function units(value: string): bigint {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) throw new TaxError('INVALID_AMOUNT', 'Amount must be a non-negative decimal with at most four places.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
}

function amount(value: bigint): string {
  if (value < 0n) throw new TaxError('INVALID_AMOUNT', 'Amount cannot be negative.');
  const whole = value / 10000n;
  const fraction = (value % 10000n).toString().padStart(4, '0');
  return `${whole}.${fraction}`;
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TaxError('INVALID_INPUT', `${field} is required.`);
  return normalized;
}

function validDate(value: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(value); }

export async function calculateTax(
  repository: TaxRepository,
  input: Readonly<{ tenantKey: string; ruleCode: string; date: string; taxableAmount: string; currency: string; inputReference?: string }>,
): Promise<TaxCalculation> {
  const tenantKey = required(input.tenantKey, 'Tenant');
  const ruleCode = required(input.ruleCode, 'Rule code');
  const date = required(input.date, 'Date');
  const currency = required(input.currency, 'Currency').toUpperCase();
  if (!validDate(date) || !/^[A-Z]{3}$/.test(currency)) throw new TaxError('INVALID_INPUT', 'Date and three-letter currency are required.');
  const taxable = units(input.taxableAmount);
  const rule = await repository.findRule(tenantKey, ruleCode, date);
  if (!rule) throw new TaxError('RULE_NOT_FOUND', 'No effective tax rule was found.');
  const tax = (taxable * BigInt(rule.rateBasisPoints) + 5000n) / 10000n;
  const taxableAmount = amount(taxable);
  const taxAmount = amount(tax);
  const totalAmount = amount(taxable + tax);
  const inputFingerprint = createHash('sha256').update(JSON.stringify({ tenantKey, ruleCode, date, taxableAmount, currency, inputReference: input.inputReference || null })).digest('hex');
  return repository.saveCalculation(Object.freeze({ id: randomUUID(), tenantKey, ruleCode, taxableAmount, taxAmount, totalAmount, currency, calculatedAt: new Date().toISOString(), inputFingerprint }));
}

export class MemoryTaxRepository implements TaxRepository {
  private readonly rules = new Map<string, TaxRule>();
  readonly calculations: TaxCalculation[] = [];

  async findRule(tenantKey: string, code: string, date: string): Promise<TaxRule | null> {
    const rule = this.rules.get(`${tenantKey}:${code}`);
    return rule && rule.effectiveFrom <= date && (!rule.effectiveTo || date <= rule.effectiveTo) ? rule : null;
  }

  async saveRule(tenantKey: string, rule: TaxRule): Promise<TaxRule> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rule.effectiveFrom) || (rule.effectiveTo && rule.effectiveTo < rule.effectiveFrom)) throw new TaxError('INVALID_RULE', 'Tax rule effective dates are invalid.');
    if (!Number.isInteger(rule.rateBasisPoints) || rule.rateBasisPoints < 0 || rule.rateBasisPoints > 100000) throw new TaxError('INVALID_RULE', 'Tax rate must be an integer from 0 to 100000 basis points.');
    if (!rule.sourceRef.trim()) throw new TaxError('INVALID_RULE', 'Tax rule source reference is required.');
    this.rules.set(`${tenantKey}:${rule.code}`, Object.freeze({ ...rule }));
    return rule;
  }

  async saveCalculation(calculation: TaxCalculation): Promise<TaxCalculation> { this.calculations.push(calculation); return calculation; }
}
