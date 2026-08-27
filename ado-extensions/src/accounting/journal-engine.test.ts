import assert from 'node:assert/strict';
import test from 'node:test';
import { JournalError, MemoryJournalRepository, postJournal, reverseJournal } from './journal-engine.js';

const balanced = {
  tenantKey: 'tenant-a',
  idempotencyKey: 'sale-001',
  entityType: 'COMMERCIAL_ENTITY' as const,
  postingDate: '2026-03-16',
  description: 'MVP sale',
  lines: [
    { accountCode: '4000', accountClass: 'A' as const, debit: '100.0000', credit: '0', currency: 'UZS' },
    { accountCode: '9000', accountClass: 'T' as const, debit: '0', credit: '100', currency: 'UZS' },
  ],
};

test('journal engine requires balanced double entry', async () => {
  const repository = new MemoryJournalRepository();
  const entry = await postJournal(repository, balanced);
  assert.equal(entry.status, 'POSTED');
  assert.equal(entry.lines.length, 2);
  await assert.rejects(
    () => postJournal(repository, { ...balanced, idempotencyKey: 'unbalanced', lines: [...balanced.lines, { accountCode: '9400', accountClass: 'T' as const, debit: '1', credit: '0', currency: 'UZS' }] }),
    (error: unknown) => error instanceof JournalError && error.code === 'UNBALANCED',
  );
});

test('journal engine is idempotent and detects conflicting retries', async () => {
  const repository = new MemoryJournalRepository();
  const first = await postJournal(repository, balanced);
  const second = await postJournal(repository, balanced);
  assert.equal(second.id, first.id);
  await assert.rejects(
    () => postJournal(repository, { ...balanced, description: 'changed retry' }),
    (error: unknown) => error instanceof JournalError && error.code === 'IDEMPOTENCY_CONFLICT',
  );
});

test('journal engine rejects excluded entity types', async () => {
  await assert.rejects(
    () => postJournal(new MemoryJournalRepository(), { ...balanced, entityType: 'BUDGET_ORGANIZATION' }),
    (error: unknown) => error instanceof JournalError && error.code === 'STANDARD_NOT_APPLICABLE',
  );
});

test('journal engine creates one balanced reversal and blocks duplicates', async () => {
  const repository = new MemoryJournalRepository();
  const original = await postJournal(repository, balanced);
  const reversal = await reverseJournal(repository, {
    tenantKey: 'tenant-a', idempotencyKey: 'reverse-001', entityType: 'COMMERCIAL_ENTITY',
    postingDate: '2026-03-17', description: 'reverse sale', originalEntryId: original.id,
  });
  assert.equal(reversal.reversalOfId, original.id);
  assert.equal(reversal.lines[0].debit, '0');
  assert.equal(reversal.lines[0].credit, '100');
  await assert.rejects(
    () => reverseJournal(repository, {
      tenantKey: 'tenant-a', idempotencyKey: 'reverse-002', entityType: 'COMMERCIAL_ENTITY',
      postingDate: '2026-03-17', description: 'duplicate reverse', originalEntryId: original.id,
    }),
    (error: unknown) => error instanceof JournalError && error.code === 'ALREADY_REVERSED',
  );
});

test('closed accounting periods reject new postings', async () => {
  const repository = new MemoryJournalRepository();
  repository.isPostingDateOpen = async () => false;
  await assert.rejects(
    () => postJournal(repository, balanced),
    (error: unknown) => error instanceof JournalError && error.code === 'PERIOD_CLOSED',
  );
});
