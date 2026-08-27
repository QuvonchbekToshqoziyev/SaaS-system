import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryJournalRepository, postJournal } from '../accounting/journal-engine.js';
import { buildProfitAndLoss, buildTrialBalance, ReportingError, trialBalanceCsv } from './reporting-service.js';

test('reporting builds tenant-scoped trial balance and CSV', async () => {
  const repository = new MemoryJournalRepository();
  await postJournal(repository, { tenantKey: 'tenant-a', idempotencyKey: 'r-1', entityType: 'COMMERCIAL_ENTITY', postingDate: '2026-03-16', description: 'sale', lines: [
    { accountCode: '4000', accountClass: 'A', debit: '10', credit: '0', currency: 'UZS' },
    { accountCode: '9000', accountClass: 'T', debit: '0', credit: '10', currency: 'UZS' },
  ] });
  const report = await buildTrialBalance(repository, { tenantKey: 'tenant-a', asOfDate: '2026-03-16' });
  assert.equal(report.totalDebit, '10.0000');
  assert.equal(report.totalCredit, '10.0000');
  assert.match(trialBalanceCsv(report), /account_code,currency,debit,credit,net/);
});

test('profit and loss uses caller-supplied account classification', async () => {
  const repository = new MemoryJournalRepository();
  await postJournal(repository, { tenantKey: 'tenant-a', idempotencyKey: 'r-2', entityType: 'COMMERCIAL_ENTITY', postingDate: '2026-03-16', description: 'sale', lines: [
    { accountCode: '4000', accountClass: 'A', debit: '3', credit: '0', currency: 'UZS' },
    { accountCode: '9000', accountClass: 'T', debit: '0', credit: '3', currency: 'UZS' },
  ] });
  const report = await buildProfitAndLoss(repository, { tenantKey: 'tenant-a', asOfDate: '2026-03-16', revenueAccountCodes: ['9000'], expenseAccountCodes: ['4000'], currency: 'UZS' });
  assert.equal(report.revenue, '3.0000');
  assert.equal(report.expenses, '3.0000');
  assert.equal(report.netIncome, '0.0000');
  await assert.rejects(() => buildTrialBalance(repository, { tenantKey: 'tenant-a', asOfDate: 'bad' }), (error: unknown) => error instanceof ReportingError && error.code === 'REPORT_UNSUPPORTED');
});
