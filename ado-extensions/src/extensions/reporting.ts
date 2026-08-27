import type { AdoExtension } from '../extension.js';

export const reportingExtension: AdoExtension = Object.freeze({
  manifest: Object.freeze({
    id: 'reporting', version: '0.1.0', description: 'Read-only tenant-scoped financial reports and CSV exports.',
    compatibleBase: '>=1.8.0 <2.0.0', capabilities: Object.freeze(['reporting.trial-balance', 'reporting.csv']),
  }),
  initialize() {},
});
