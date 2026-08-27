import type { AdoExtension } from '../extension.js';

export const payrollExtension: AdoExtension = Object.freeze({
  manifest: Object.freeze({
    id: 'payroll', version: '0.1.0', description: 'Deterministic tenant-scoped payroll runs and approval lifecycle.',
    compatibleBase: '>=1.8.0 <2.0.0', capabilities: Object.freeze(['payroll.runs', 'payroll.approvals']),
  }),
  initialize() {},
});
