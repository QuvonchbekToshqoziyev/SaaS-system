import { createHash, randomUUID } from 'node:crypto';
import {
  bhms21Standard,
  isBhms21Applicable,
  type BhmsAccountClass,
} from '../extensions/bhms21-accounting.js';

export type JournalLineInput = Readonly<{
  accountCode: string;
  accountClass: BhmsAccountClass;
  debit: string;
  credit: string;
  currency: string;
}>;

export type JournalEntry = Readonly<{
  id: string;
  tenantKey: string;
  idempotencyKey: string;
  fingerprint: string;
  standardRevision: string;
  postingDate: string;
  description: string;
  status: 'POSTED';
  reversalOfId?: string;
  lines: readonly JournalLineInput[];
}>;

export type AccountBalance = Readonly<{
  accountCode: string;
  currency: string;
  debit: string;
  credit: string;
  net: string;
}>;

export interface JournalRepository {
  findByIdempotency(tenantKey: string, idempotencyKey: string): Promise<JournalEntry | null>;
  findById?(tenantKey: string, id: string): Promise<JournalEntry | null>;
  findReversal?(tenantKey: string, originalId: string): Promise<JournalEntry | null>;
  isPostingDateOpen?(tenantKey: string, date: string): Promise<boolean>;
  getAccountBalances?(tenantKey: string, asOfDate: string): Promise<readonly AccountBalance[]>;
  save(entry: JournalEntry): Promise<JournalEntry>;
}

export class JournalError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'JournalError';
  }
}

function parseUnits(value: string): bigint {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) throw new JournalError('INVALID_AMOUNT', 'Amount must be a non-negative decimal with at most four places.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
}

function canonicalAmount(value: string): string {
  const units = parseUnits(value);
  const whole = units / 10000n;
  const fraction = (units % 10000n).toString().padStart(4, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function canonicalLines(lines: readonly JournalLineInput[]): string {
  return JSON.stringify(lines.map((line) => ({
    accountCode: line.accountCode.trim(),
    accountClass: line.accountClass,
    debit: canonicalAmount(line.debit),
    credit: canonicalAmount(line.credit),
    currency: line.currency.trim().toUpperCase(),
  })));
}

function fingerprint(input: { tenantKey: string; idempotencyKey: string; postingDate: string; description: string; reversalOfId?: string; lines: readonly JournalLineInput[] }): string {
  return createHash('sha256').update(JSON.stringify({
    tenantKey: input.tenantKey,
    idempotencyKey: input.idempotencyKey,
    postingDate: input.postingDate,
    description: input.description,
    reversalOfId: input.reversalOfId || null,
    lines: canonicalLines(input.lines),
  })).digest('hex');
}

export async function postJournal(
  repository: JournalRepository,
  input: Readonly<{
    tenantKey: string;
    idempotencyKey: string;
    entityType: 'COMMERCIAL_ENTITY' | 'BUDGET_ORGANIZATION' | 'NON_BANK_CREDIT_ORGANIZATION';
    postingDate: string;
    description: string;
    reversalOfId?: string;
    lines: readonly JournalLineInput[];
  }>,
): Promise<JournalEntry> {
  if (!isBhms21Applicable({ entityType: input.entityType })) throw new JournalError('STANDARD_NOT_APPLICABLE', 'BHMS 21 is not applicable to this entity type.');
  if (!input.tenantKey.trim() || !input.idempotencyKey.trim()) throw new JournalError('IDENTITY_REQUIRED', 'Tenant and idempotency keys are required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.postingDate) || input.postingDate < bhms21Standard.effectiveFrom) throw new JournalError('INVALID_POSTING_DATE', 'Posting date is outside the active standard revision.');
  if (repository.isPostingDateOpen && !(await repository.isPostingDateOpen(input.tenantKey.trim(), input.postingDate))) throw new JournalError('PERIOD_CLOSED', 'The accounting period is closed for posting.');
  if (input.lines.length < 2) throw new JournalError('MINIMUM_LINES', 'A journal requires at least two lines.');

  let debitTotal = 0n;
  let creditTotal = 0n;
  const lines = input.lines.map((line) => {
    if (!line.accountCode.trim() || !/^[A-Z]{3}$/.test(line.currency.trim().toUpperCase())) throw new JournalError('INVALID_LINE', 'Account code and three-letter currency are required.');
    const debit = parseUnits(line.debit);
    const credit = parseUnits(line.credit);
    if ((debit === 0n) === (credit === 0n)) throw new JournalError('INVALID_LINE', 'Each line must contain exactly one positive side.');
    debitTotal += debit;
    creditTotal += credit;
    return Object.freeze({
      accountCode: line.accountCode.trim(),
      accountClass: line.accountClass,
      debit: canonicalAmount(line.debit),
      credit: canonicalAmount(line.credit),
      currency: line.currency.trim().toUpperCase(),
    });
  });
  if (debitTotal !== creditTotal) throw new JournalError('UNBALANCED', 'Total debits must equal total credits.');

  const entryFingerprint = fingerprint({ ...input, lines });
  const existing = await repository.findByIdempotency(input.tenantKey, input.idempotencyKey);
  if (existing) {
    if (existing.fingerprint !== entryFingerprint) throw new JournalError('IDEMPOTENCY_CONFLICT', 'Idempotency key was already used with different journal data.');
    return existing;
  }

  const entry: JournalEntry = Object.freeze({
    id: randomUUID(),
    tenantKey: input.tenantKey.trim(),
    idempotencyKey: input.idempotencyKey.trim(),
    fingerprint: entryFingerprint,
    standardRevision: bhms21Standard.revision,
    postingDate: input.postingDate,
    description: input.description.trim(),
    status: 'POSTED',
    ...(input.reversalOfId ? { reversalOfId: input.reversalOfId } : {}),
    lines: Object.freeze(lines),
  });
  return repository.save(entry);
}

export async function reverseJournal(
  repository: JournalRepository,
  input: Readonly<{
    tenantKey: string;
    idempotencyKey: string;
    entityType: 'COMMERCIAL_ENTITY' | 'BUDGET_ORGANIZATION' | 'NON_BANK_CREDIT_ORGANIZATION';
    postingDate: string;
    description: string;
    originalEntryId: string;
  }>,
): Promise<JournalEntry> {
  if (!repository.findById || !repository.findReversal) throw new JournalError('REVERSAL_UNSUPPORTED', 'Repository does not support reversals.');
  const original = await repository.findById(input.tenantKey.trim(), input.originalEntryId);
  if (!original) throw new JournalError('ENTRY_NOT_FOUND', 'Original journal entry was not found.');
  if (original.status !== 'POSTED') throw new JournalError('ENTRY_NOT_POSTED', 'Only posted entries can be reversed.');
  if (await repository.findReversal(input.tenantKey.trim(), original.id)) throw new JournalError('ALREADY_REVERSED', 'Journal entry already has a reversal.');
  return postJournal(repository, {
    ...input,
    reversalOfId: original.id,
    lines: original.lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit })),
  });
}

export class MemoryJournalRepository implements JournalRepository {
  private readonly entries = new Map<string, JournalEntry>();

  async findByIdempotency(tenantKey: string, idempotencyKey: string): Promise<JournalEntry | null> {
    return this.entries.get(`${tenantKey}:${idempotencyKey}`) || null;
  }

  async findById(tenantKey: string, id: string): Promise<JournalEntry | null> {
    return [...this.entries.values()].find((entry) => entry.tenantKey === tenantKey && entry.id === id) || null;
  }

  async findReversal(tenantKey: string, originalId: string): Promise<JournalEntry | null> {
    return [...this.entries.values()].find((entry) => entry.tenantKey === tenantKey && entry.reversalOfId === originalId) || null;
  }

  async isPostingDateOpen(): Promise<boolean> { return true; }

  async getAccountBalances(tenantKey: string, asOfDate: string): Promise<readonly AccountBalance[]> {
    const totals = new Map<string, { currency: string; debit: bigint; credit: bigint }>();
    for (const entry of this.entries.values()) {
      if (entry.tenantKey !== tenantKey || entry.postingDate > asOfDate) continue;
      for (const line of entry.lines) {
        const key = `${line.accountCode}:${line.currency}`;
        const current = totals.get(key) || { currency: line.currency, debit: 0n, credit: 0n };
        current.debit += parseUnits(line.debit);
        current.credit += parseUnits(line.credit);
        totals.set(key, current);
      }
    }
    const format = (value: bigint) => {
      const absolute = value < 0n ? -value : value;
      const result = canonicalAmount(`${absolute / 10000n}.${(absolute % 10000n).toString().padStart(4, '0')}`);
      return value < 0n ? `-${result}` : result;
    };
    return Object.freeze([...totals.entries()].sort().map(([key, value]) => {
      const [accountCode] = key.split(':');
      return Object.freeze({ accountCode, currency: value.currency, debit: format(value.debit), credit: format(value.credit), net: format(value.debit - value.credit) });
    }));
  }

  async save(entry: JournalEntry): Promise<JournalEntry> {
    const key = `${entry.tenantKey}:${entry.idempotencyKey}`;
    const existing = this.entries.get(key);
    if (existing) {
      if (existing.fingerprint !== entry.fingerprint) throw new JournalError('IDEMPOTENCY_CONFLICT', 'Concurrent idempotency conflict.');
      return existing;
    }
    this.entries.set(key, entry);
    return entry;
  }
}
