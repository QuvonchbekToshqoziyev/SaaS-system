import type { AdoExtension } from '../extension.js';
import { bhms21OfficialAccounts } from './bhms21-chart.js';

export type BhmsAccountClass = 'A' | 'P' | 'KA' | 'KP' | 'T' | 'BT';
export type BhmsAccount = Readonly<{
  code: string;
  name: string;
  accountClass: BhmsAccountClass;
  parentCode?: string;
  activeFrom: string;
  activeTo?: string;
}>;

export type Bhms21Standard = Readonly<{
  standardName: 'BHMS 21';
  registrationNumber: '3593';
  sourceUrl: string;
  amendmentUrls: readonly string[];
  revision: string;
  effectiveFrom: string;
  effectiveTo?: string;
  verifiedAt: string;
  applicability: 'COMMERCIAL_ENTITIES_EXCLUDING_BUDGET_AND_NON_BANK_CREDIT';
}>;

export type BhmsApplicabilityInput = Readonly<{
  entityType: 'COMMERCIAL_ENTITY' | 'BUDGET_ORGANIZATION' | 'NON_BANK_CREDIT_ORGANIZATION';
}>;

export const bhms21Standard: Bhms21Standard = Object.freeze({
  standardName: 'BHMS 21',
  registrationNumber: '3593',
  sourceUrl: 'https://lex.uz/uz/docs/-7282737',
  amendmentUrls: Object.freeze([
    'https://lex.uz/uz/docs/-7741462',
    'https://lex.uz/uz/docs/8084155',
  ]),
  revision: '3593-2',
  effectiveFrom: '2026-03-16',
  verifiedAt: '2026-08-23',
  applicability: 'COMMERCIAL_ENTITIES_EXCLUDING_BUDGET_AND_NON_BANK_CREDIT',
});

export const bhms21FoundationAccounts = bhms21OfficialAccounts;

export function isBhms21Applicable(input: BhmsApplicabilityInput): boolean {
  return input.entityType === 'COMMERCIAL_ENTITY';
}

export function isBhmsAccountActive(account: BhmsAccount, date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
    && account.activeFrom <= date
    && (!account.activeTo || date <= account.activeTo);
}

export function normalBalance(accountClass: BhmsAccountClass): 'DEBIT' | 'CREDIT' {
  return accountClass === 'A' || accountClass === 'KP' ? 'DEBIT' : 'CREDIT';
}

function isPositiveDecimal(value: string): boolean {
  if (!/^\d+(\.\d+)?$/.test(value)) return false;
  const [whole, fraction = ''] = value.split('.');
  return whole.replace(/^0+/, '') !== '' || fraction.replace(/0/g, '') !== '';
}

export function validateBhmsPosting(input: { debit: BhmsAccount; credit: BhmsAccount; date: string; amount: string }) {
  if (!isBhmsAccountActive(input.debit, input.date) || !isBhmsAccountActive(input.credit, input.date)) {
    return { ok: false as const, code: 'ACCOUNT_NOT_ACTIVE', message: 'Posting date is outside an account effective period.' };
  }
  if (input.debit.code === input.credit.code) {
    return { ok: false as const, code: 'SAME_ACCOUNT', message: 'Debit and credit accounts must differ.' };
  }
  if (!isPositiveDecimal(input.amount)) {
    return { ok: false as const, code: 'INVALID_AMOUNT', message: 'Posting amount must be a positive decimal string.' };
  }
  return {
    ok: true as const,
    debitNormalBalance: normalBalance(input.debit.accountClass),
    creditNormalBalance: normalBalance(input.credit.accountClass),
  };
}

export const bhms21AccountingExtension: AdoExtension = Object.freeze({
  manifest: Object.freeze({
    id: 'bhms21-accounting', version: '0.1.0', description: 'Versioned BHMS 21 metadata and deterministic posting validation.',
    compatibleBase: '>=1.8.0 <2.0.0', capabilities: Object.freeze(['accounting.journal', 'accounting.bhms21']),
  }),
  initialize() {},
});
