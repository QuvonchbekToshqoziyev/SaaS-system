import type { AdoExtension } from '../extension.js';

export const baseInspectorExtension: AdoExtension = Object.freeze({
  manifest: Object.freeze({
    id: 'base-inspector', version: '0.1.0', description: 'Reports the sealed base contract available to extensions.',
    compatibleBase: '>=1.8.0 <2.0.0', capabilities: Object.freeze(['base.snapshot']),
  }),
  initialize() {},
});
