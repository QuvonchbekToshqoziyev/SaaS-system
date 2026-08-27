import assert from 'node:assert/strict';
import test from 'node:test';
import { ExtensionRegistry } from './registry.js';
import type { BaseProjectSnapshot } from './base-project.js';

const base: BaseProjectSnapshot = Object.freeze({
  root: '/sealed-base',
  version: '1.0.0',
  clientVersion: '1.0.0',
  serverVersion: '1.0.0',
  versionConsistent: true,
  routes: Object.freeze([]),
  models: Object.freeze([]),
});

test('one extension failure does not prevent independent extensions', async () => {
  const registry = new ExtensionRegistry();
  registry.register({ manifest: { id: 'fails-on-start', version: '1.0.0', description: 'test', compatibleBase: '>=1.0.0 <2.0.0', capabilities: [] }, initialize() { throw new Error('boom'); } });
  registry.register({ manifest: { id: 'starts-ok', version: '1.0.0', description: 'test', compatibleBase: '>=1.0.0 <2.0.0', capabilities: [] }, initialize() {} });

  const result = await registry.initializeAll(base);
  assert.deepEqual(result, [
    { id: 'fails-on-start', ok: false, error: 'boom' },
    { id: 'starts-ok', ok: true },
  ]);
});

test('incompatible extensions are rejected before initialization', async () => {
  const registry = new ExtensionRegistry();
  let initialized = false;
  registry.register({ manifest: { id: 'future-extension', version: '1.0.0', description: 'test', compatibleBase: '>=2.0.0 <3.0.0', capabilities: [] }, initialize() { initialized = true; } });

  assert.deepEqual(await registry.initializeAll(base), [{
    id: 'future-extension', ok: false, error: 'Incompatible base version 1.0.0; requires >=2.0.0 <3.0.0',
  }]);
  assert.equal(initialized, false);
});
