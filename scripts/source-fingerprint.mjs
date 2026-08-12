#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statePath = path.resolve(
  root,
  execFileSync('git', ['-C', root, 'rev-parse', '--git-path', 'ado-release-verification.json'], { encoding: 'utf8' }).trim(),
);

const sourceScopes = {
  backend: ['airline-b2b/server'],
  frontend: ['airline-b2b/client'],
};

function trackedAndUntrackedFiles(scopes) {
  return execFileSync(
    'git',
    ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '--', ...scopes],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean)
    .sort();
}

export function sourceFingerprint(scope) {
  const scopes = sourceScopes[scope];
  if (!scopes) throw new Error(`Unknown source scope: ${scope}`);

  const hash = createHash('sha256');
  for (const relativePath of trackedAndUntrackedFiles(scopes)) {
    const absolutePath = path.join(root, relativePath);
    hash.update(relativePath);
    hash.update('\0');
    hash.update(fs.lstatSync(absolutePath).isSymbolicLink() ? fs.readlinkSync(absolutePath) : fs.readFileSync(absolutePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function dependencyFingerprint(lockPath) {
  const lock = JSON.parse(fs.readFileSync(path.resolve(lockPath), 'utf8'));
  return dependencyFingerprintValue(lock);
}

function dependencyFingerprintValue(lock) {
  lock = structuredClone(lock);
  // A release version bump does not change installed dependencies.
  delete lock.version;
  if (lock.packages?.['']) delete lock.packages[''].version;
  return createHash('sha256').update(JSON.stringify(lock)).digest('hex');
}

function currentSnapshot() {
  return {
    version: fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim(),
    backend: sourceFingerprint('backend'),
    frontend: sourceFingerprint('frontend'),
  };
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return {};
  }
}

function snapshotsMatch(left, right) {
  return Boolean(
    left
    && right
    && left.version === right.version
    && left.backend === right.backend
    && left.frontend === right.frontend,
  );
}

function writeState(state) {
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function recordLocalVerification() {
  const snapshot = currentSnapshot();
  const previous = readState();
  writeState({
    local: { ...snapshot, verifiedAt: new Date().toISOString() },
    dev: snapshotsMatch(previous.dev, snapshot) ? previous.dev : undefined,
  });
}

export function requireLocalVerification() {
  const snapshot = currentSnapshot();
  if (!snapshotsMatch(readState().local, snapshot)) {
    throw new Error('Local release audit is missing or source changed; run node scripts/release-audit.mjs first');
  }
  return snapshot;
}

export function recordDevVerification() {
  const snapshot = requireLocalVerification();
  const state = readState();
  writeState({
    ...state,
    dev: { ...snapshot, verifiedAt: new Date().toISOString() },
  });
}

export function requireDevVerification() {
  const snapshot = requireLocalVerification();
  if (!snapshotsMatch(readState().dev, snapshot)) {
    throw new Error('Live dev audit is missing or source changed; run node scripts/release-audit.mjs --live-only');
  }
  return snapshot;
}

function print(value) {
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value)}\n`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const [command, argument] = process.argv.slice(2);
  try {
    if (command === 'backend' || command === 'frontend') print(sourceFingerprint(command));
    else if (command === 'dependencies' && argument) print(dependencyFingerprint(argument));
    else if (command === 'record-local') { recordLocalVerification(); print('Local release audit recorded'); }
    else if (command === 'verify-local') print(requireLocalVerification());
    else if (command === 'record-dev') { recordDevVerification(); print('Live dev audit recorded'); }
    else if (command === 'verify-dev') print(requireDevVerification());
    else if (command === 'self-test') {
      const first = { version: '1.0.0', packages: { '': { version: '1.0.0' }, 'node_modules/x': { version: '1.0.0' } } };
      const versionOnly = { version: '2.0.0', packages: { '': { version: '2.0.0' }, 'node_modules/x': { version: '1.0.0' } } };
      const dependencyChanged = { version: '2.0.0', packages: { '': { version: '2.0.0' }, 'node_modules/x': { version: '2.0.0' } } };
      if (dependencyFingerprintValue(first) !== dependencyFingerprintValue(versionOnly)) throw new Error('Version-only change invalidated dependency cache');
      if (dependencyFingerprintValue(first) === dependencyFingerprintValue(dependencyChanged)) throw new Error('Dependency change did not invalidate cache');
      if (sourceFingerprint('backend') !== sourceFingerprint('backend')) throw new Error('Source fingerprint is unstable');
      print('source-fingerprint self-test passed');
    }
    else throw new Error('Usage: source-fingerprint.mjs backend|frontend|dependencies <lock>|record-local|verify-local|record-dev|verify-dev|self-test');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
