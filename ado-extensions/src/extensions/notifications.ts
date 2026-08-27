import type { AdoExtension } from '../extension.js';

export const notificationsExtension: AdoExtension = Object.freeze({
  manifest: Object.freeze({
    id: 'notifications', version: '0.1.0', description: 'Tenant-scoped, idempotent notification outbox and delivery states.',
    compatibleBase: '>=1.8.0 <2.0.0', capabilities: Object.freeze(['notifications.outbox', 'notifications.delivery']),
  }),
  initialize() {},
});
