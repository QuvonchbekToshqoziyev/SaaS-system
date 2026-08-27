import assert from 'node:assert/strict';
import test from 'node:test';
import { createPayrollRun, MemoryPayrollRepository, PayrollError, transitionPayroll } from './payroll-service.js';

test('payroll calculates deterministic net amounts and requires approval before posting', async () => {
  const repository = new MemoryPayrollRepository();
  const run = await createPayrollRun(repository, { tenantKey: 'tenant-a', period: '2026-08', currency: 'uzs', lines: [
    { employeeKey: 'employee-a', gross: '100.1250', deductions: '12.0250' },
    { employeeKey: 'employee-b', gross: '50', deductions: '0' },
  ] });
  assert.equal(run.totalGross, '150.1250');
  assert.equal(run.totalDeductions, '12.0250');
  assert.equal(run.totalNet, '138.1000');
  await assert.rejects(() => transitionPayroll(repository, { tenantKey: 'tenant-a', runId: run.id, status: 'POSTED' }), (error: unknown) => error instanceof PayrollError && error.code === 'INVALID_TRANSITION');
  await transitionPayroll(repository, { tenantKey: 'tenant-a', runId: run.id, status: 'APPROVED' });
  const posted = await transitionPayroll(repository, { tenantKey: 'tenant-a', runId: run.id, status: 'POSTED' });
  assert.equal(posted.status, 'POSTED');
});

test('payroll rejects excessive deductions and cross-tenant access', async () => {
  const repository = new MemoryPayrollRepository();
  await assert.rejects(() => createPayrollRun(repository, { tenantKey: 'tenant-a', period: '2026-08', currency: 'UZS', lines: [{ employeeKey: 'employee-a', gross: '10', deductions: '10.01' }] }), (error: unknown) => error instanceof PayrollError && error.code === 'INVALID_DEDUCTIONS');
  const run = await createPayrollRun(repository, { tenantKey: 'tenant-a', period: '2026-08', currency: 'UZS', lines: [{ employeeKey: 'employee-a', gross: '10', deductions: '1' }] });
  await assert.rejects(() => transitionPayroll(repository, { tenantKey: 'tenant-b', runId: run.id, status: 'APPROVED' }), (error: unknown) => error instanceof PayrollError && error.code === 'NOT_FOUND');
});
