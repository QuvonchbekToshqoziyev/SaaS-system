import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTax, MemoryTaxRepository, TaxError } from './tax-service.js';

test('tax calculations use effective rules and decimal-safe arithmetic', async () => {
  const repository = new MemoryTaxRepository();
  await repository.saveRule('tenant-a', { code: 'VAT', name: 'Configured VAT', rateBasisPoints: 1200, effectiveFrom: '2026-01-01', sourceRef: 'policy://vat-2026' });
  const result = await calculateTax(repository, { tenantKey: 'tenant-a', ruleCode: 'VAT', date: '2026-03-01', taxableAmount: '100.1250', currency: 'uzs' });
  assert.equal(result.taxAmount, '12.0150');
  assert.equal(result.totalAmount, '112.1400');
  assert.equal(result.currency, 'UZS');
});

test('tax calculations reject missing effective rules and invalid rates', async () => {
  const repository = new MemoryTaxRepository();
  await assert.rejects(() => repository.saveRule('tenant-a', { code: 'BAD', name: 'Bad', rateBasisPoints: 100001, effectiveFrom: '2026-01-01', sourceRef: 'policy://bad' }), (error: unknown) => error instanceof TaxError && error.code === 'INVALID_RULE');
  await assert.rejects(() => calculateTax(repository, { tenantKey: 'tenant-a', ruleCode: 'VAT', date: '2026-03-01', taxableAmount: '1', currency: 'UZS' }), (error: unknown) => error instanceof TaxError && error.code === 'RULE_NOT_FOUND');
});
