import type { AdoExtension } from '../extension.js';

export const taxExtension: AdoExtension = Object.freeze({
  manifest: Object.freeze({
    id: 'tax', version: '0.1.0', description: 'Effective-dated, source-traceable tax rules and calculations.',
    compatibleBase: '>=1.8.0 <2.0.0', capabilities: Object.freeze(['tax.rules', 'tax.calculations']),
  }),
  initialize() {},
});
