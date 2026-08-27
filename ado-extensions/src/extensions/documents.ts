import type { AdoExtension } from '../extension.js';

export const documentsExtension: AdoExtension = Object.freeze({
  manifest: Object.freeze({
    id: 'documents', version: '0.1.0', description: 'Tenant-isolated document versions and approval workflow.',
    compatibleBase: '>=1.8.0 <2.0.0', capabilities: Object.freeze(['documents.versions', 'documents.approvals']),
  }),
  initialize() {},
});
