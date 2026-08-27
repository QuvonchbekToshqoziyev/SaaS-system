import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bhms21FoundationAccounts,
  isBhms21Applicable,
  normalBalance,
  validateBhmsPosting,
} from './bhms21-accounting.js';

const asset = bhms21FoundationAccounts.find((account) => account.accountClass === 'A')!;
const liability = bhms21FoundationAccounts.find((account) => account.accountClass === 'P')!;

test('BHMS applicability excludes non-commercial entities', () => {
  assert.equal(isBhms21Applicable({ entityType: 'COMMERCIAL_ENTITY' }), true);
  assert.equal(isBhms21Applicable({ entityType: 'BUDGET_ORGANIZATION' }), false);
  assert.equal(isBhms21Applicable({ entityType: 'NON_BANK_CREDIT_ORGANIZATION' }), false);
});

test('normal balance treats contra-assets as credit-normal', () => {
  assert.equal(normalBalance('A'), 'DEBIT');
  assert.equal(normalBalance('KA'), 'CREDIT');
  assert.equal(normalBalance('KP'), 'DEBIT');
  assert.equal(normalBalance('P'), 'CREDIT');
});

test('official chart contains the complete named account artifact', () => {
  assert.ok(bhms21FoundationAccounts.length >= 300);
  assert.equal(bhms21FoundationAccounts.find((account) => account.code === '8600')?.accountClass, 'KP');
  assert.ok(new Set(bhms21FoundationAccounts.map((account) => account.code)).size === bhms21FoundationAccounts.length);
});

test('posting validation is decimal-safe and rejects zero', () => {
  assert.equal(validateBhmsPosting({ debit: asset, credit: liability, date: '2026-03-16', amount: '999999999999999999999999.1234' }).ok, true);
  assert.equal(validateBhmsPosting({ debit: asset, credit: liability, date: '2026-03-16', amount: '0.0000' }).code, 'INVALID_AMOUNT');
  assert.equal(validateBhmsPosting({ debit: asset, credit: liability, date: '2026-03-16', amount: '1e3' }).code, 'INVALID_AMOUNT');
});

test('posting validation enforces effective date and distinct accounts', () => {
  assert.equal(validateBhmsPosting({ debit: asset, credit: liability, date: '2025-12-31', amount: '1' }).code, 'ACCOUNT_NOT_ACTIVE');
  assert.equal(validateBhmsPosting({ debit: asset, credit: asset, date: '2026-03-16', amount: '1' }).code, 'SAME_ACCOUNT');
});
