import { Pool } from 'pg';
import { PgJournalRepository } from '../dist/accounting/pg-journal-repository.js';
import { JournalError, postJournal, reverseJournal } from '../dist/accounting/journal-engine.js';
import { addDocumentVersion, checksumForContent, createDocument, transitionDocument } from '../dist/documents/document-service.js';
import { PgDocumentRepository } from '../dist/documents/pg-document-repository.js';
import { calculateTax } from '../dist/tax/tax-service.js';
import { PgTaxRepository } from '../dist/tax/pg-tax-repository.js';
import { createPayrollRun, transitionPayroll } from '../dist/payroll/payroll-service.js';
import { PgPayrollRepository } from '../dist/payroll/pg-payroll-repository.js';
import { deliverNotification, enqueueNotification } from '../dist/notifications/notification-service.js';
import { PgNotificationRepository } from '../dist/notifications/pg-notification-repository.js';
import { buildProfitAndLoss, buildTrialBalance, trialBalanceCsv } from '../dist/reporting/reporting-service.js';

const connectionString = process.env.ADO_EXT_DATABASE_URL;
if (!connectionString) throw new Error('ADO_EXT_DATABASE_URL is required.');

const pool = new Pool({ connectionString });
try {
  const repository = new PgJournalRepository(pool);
  const input = {
    tenantKey: 'integration-tenant',
    idempotencyKey: 'integration-001',
    entityType: 'COMMERCIAL_ENTITY',
    postingDate: '2026-03-16',
    description: 'integration sale',
    lines: [
      { accountCode: '4000', accountClass: 'A', debit: '25.50', credit: '0', currency: 'UZS' },
      { accountCode: '9000', accountClass: 'T', debit: '0', credit: '25.50', currency: 'UZS' },
    ],
  };
  const first = await postJournal(repository, input);
  const second = await postJournal(repository, input);
  if (first.id !== second.id) throw new Error('Idempotency did not return the persisted journal.');
  const counts = await pool.query(`
    SELECT
      (SELECT count(*)::text FROM ado_extension_journal_entries) AS entries,
      (SELECT count(*)::text FROM ado_extension_journal_lines) AS lines
  `);
  if (counts.rows[0].entries !== '1' || counts.rows[0].lines !== '2') throw new Error('Unexpected persisted row counts.');
  try {
    await postJournal(repository, { ...input, description: 'conflicting retry' });
    throw new Error('Conflicting idempotency retry was accepted.');
  } catch (error) {
    if (!(error instanceof JournalError) || error.code !== 'IDEMPOTENCY_CONFLICT') throw error;
  }
  const reversal = await reverseJournal(repository, {
    tenantKey: input.tenantKey,
    idempotencyKey: 'integration-reversal-001',
    entityType: 'COMMERCIAL_ENTITY',
    postingDate: '2026-03-17',
    description: 'integration reversal',
    originalEntryId: first.id,
  });
  if (reversal.reversalOfId !== first.id) throw new Error('Reversal link was not persisted.');
  const balances = await repository.getAccountBalances(input.tenantKey, '2026-03-17');
  if (balances.some((balance) => balance.net !== '0.0000')) throw new Error('Reversal did not zero account balances.');
  await pool.query(`INSERT INTO ado_extension_accounting_periods (tenant_key, start_date, end_date, is_open) VALUES ($1, $2, $3, false)`, [input.tenantKey, '2026-03-18', '2026-03-31']);
  try {
    await postJournal(repository, { ...input, idempotencyKey: 'closed-period', postingDate: '2026-03-18' });
    throw new Error('Closed accounting period accepted a posting.');
  } catch (error) {
    if (!(error instanceof JournalError) || error.code !== 'PERIOD_CLOSED') throw error;
  }
  const documents = new PgDocumentRepository(pool);
  const document = await createDocument(documents, {
    tenantKey: input.tenantKey, title: 'Integration contract', ownerKey: 'firm-a', createdBy: 'user-a',
    storageKey: 'integration/contract-v1', checksum: checksumForContent(new TextEncoder().encode('document-v1')), sizeBytes: 11, mimeType: 'text/plain',
  });
  const documentWithVersion = await addDocumentVersion(documents, {
    tenantKey: input.tenantKey, documentId: document.id, createdBy: 'user-a', storageKey: 'integration/contract-v2',
    checksum: checksumForContent(new TextEncoder().encode('document-v2')), sizeBytes: 11, mimeType: 'text/plain',
  });
  const approved = await transitionDocument(documents, { tenantKey: input.tenantKey, documentId: document.id, status: 'IN_REVIEW' });
  const finalDocument = await transitionDocument(documents, { tenantKey: input.tenantKey, documentId: document.id, status: 'APPROVED' });
  if (documentWithVersion.currentVersion !== 2 || approved.status !== 'IN_REVIEW' || finalDocument.status !== 'APPROVED') throw new Error('Document workflow was not persisted.');
  const taxes = new PgTaxRepository(pool);
  await taxes.saveRule(input.tenantKey, { code: 'VAT', name: 'Integration VAT', rateBasisPoints: 1200, effectiveFrom: '2026-01-01', sourceRef: 'test://vat' });
  const tax = await calculateTax(taxes, { tenantKey: input.tenantKey, ruleCode: 'VAT', date: '2026-03-17', taxableAmount: '100.1250', currency: 'UZS' });
  if (tax.taxAmount !== '12.0150' || tax.totalAmount !== '112.1400') throw new Error('Tax calculation was not persisted correctly.');
  const payroll = new PgPayrollRepository(pool);
  const run = await createPayrollRun(payroll, { tenantKey: input.tenantKey, period: '2026-08', currency: 'UZS', lines: [{ employeeKey: 'employee-a', gross: '100.1250', deductions: '12.0250' }] });
  const approvedRun = await transitionPayroll(payroll, { tenantKey: input.tenantKey, runId: run.id, status: 'APPROVED' });
  const postedRun = await transitionPayroll(payroll, { tenantKey: input.tenantKey, runId: run.id, status: 'POSTED' });
  if (approvedRun.status !== 'APPROVED' || postedRun.status !== 'POSTED' || postedRun.totalNet !== '88.1000') throw new Error('Payroll workflow was not persisted correctly.');
  const notifications = new PgNotificationRepository(pool);
  const notification = await enqueueNotification(notifications, { tenantKey: input.tenantKey, recipientKey: 'user-a', channel: 'IN_APP', template: 'PAYROLL_POSTED', payload: { runId: postedRun.id }, idempotencyKey: 'payroll-notification-001' });
  const delivered = await deliverNotification(notifications, { tenantKey: input.tenantKey, notificationId: notification.id });
  if (delivered.status !== 'DELIVERED' || delivered.attempts !== 1) throw new Error('Notification delivery was not persisted correctly.');
  const trialBalance = await buildTrialBalance(repository, { tenantKey: input.tenantKey, asOfDate: '2026-03-17' });
  if (trialBalance.totalDebit !== trialBalance.totalCredit || !trialBalanceCsv(trialBalance).startsWith('account_code,currency')) throw new Error('Trial balance report was not generated correctly.');
  const profitAndLoss = await buildProfitAndLoss(repository, { tenantKey: input.tenantKey, asOfDate: '2026-03-17', revenueAccountCodes: ['9000'], expenseAccountCodes: ['4000'], currency: 'UZS' });
  if (profitAndLoss.revenue !== '0.0000' || profitAndLoss.expenses !== '0.0000') throw new Error('Profit and loss report was not generated correctly.');
  console.log(`Postgres integration passed: ${first.id} + reversal ${reversal.id} + document ${finalDocument.id} + tax ${tax.id} + payroll ${postedRun.id} + notification ${delivered.id} + reports`);
} finally {
  await pool.end();
}
