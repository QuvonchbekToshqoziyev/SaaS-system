#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  recordDevVerification,
  recordLocalVerification,
  requireLocalVerification,
} from './source-fingerprint.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const withDev = process.argv.includes('--dev');
const liveOnly = process.argv.includes('--live-only');
const unknownArgs = process.argv.slice(2).filter((arg) => !['--dev', '--live-only'].includes(arg));
if (unknownArgs.length || (withDev && liveOnly)) {
  console.error('Usage: node scripts/release-audit.mjs [--dev | --live-only]');
  process.exit(1);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function fail(message) {
  console.error(`RELEASE AUDIT FAILED: ${message}`);
  process.exit(1);
}

function run(label, command, args, cwd = root, attempts = 1) {
  console.log(`\n[release-audit] ${label}`);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const started = Date.now();
    const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
    const duration = ((Date.now() - started) / 1000).toFixed(1);
    if (result.status === 0) {
      console.log(`[release-audit] ${label} passed in ${duration}s`);
      return;
    }
    if (attempt < attempts) console.warn(`[release-audit] ${label} retry ${attempt + 1}/${attempts}`);
    else fail(`${label} exited with status ${result.status ?? 'unknown'}`);
  }
}

const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`VERSION must be SemVer, received ${JSON.stringify(version)}`);

const versionedFiles = [
  'airline-b2b/server/package.json',
  'airline-b2b/server/package-lock.json',
  'airline-b2b/client/package.json',
  'airline-b2b/client/package-lock.json',
];
for (const relativePath of versionedFiles) {
  const data = readJson(relativePath);
  if (data.version !== version) fail(`${relativePath} is ${data.version}, expected ${version}`);
  if (data.packages?.['']?.version && data.packages[''].version !== version) {
    fail(`${relativePath} root package is ${data.packages[''].version}, expected ${version}`);
  }
}

const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
if (!changelog.includes(`## [${version}]`)) fail(`CHANGELOG.md has no ${version} release entry`);
const productionDeploy = fs.readFileSync(path.join(root, 'deploy.sh'), 'utf8');
if (/prisma\s+db\s+push\s+--accept-data-loss/.test(productionDeploy)) {
  fail('deploy.sh must not accept destructive production schema changes');
}
console.log(`[release-audit] version ${version} is consistent`);

const server = path.join(root, 'airline-b2b/server');
const client = path.join(root, 'airline-b2b/client');

if (!liveOnly) {
  run('API route/client contract', process.execPath, ['scripts/api-surface-audit.mjs']);
  run('Recurring regression guards', process.execPath, ['scripts/regression-guard-audit.mjs']);
  run('Server runtime dependency audit', 'npm', ['audit', '--omit=dev', '--audit-level=high'], server, 3);
  run('Prisma schema validation', 'npx', ['prisma', 'validate'], server);
  run('Prisma client generation', 'npx', ['prisma', 'generate'], server);
  run('Server tests', 'npm', ['test'], server);
  run('Server TypeScript build', 'npm', ['run', 'build'], server);
  run('Client runtime dependency audit', 'npm', ['audit', '--omit=dev', '--audit-level=high'], client, 3);
  run('Client TypeScript check', 'npx', ['tsc', '--noEmit'], client);
  run('Client production build', 'npm', ['run', 'build'], client);
  recordLocalVerification();
  console.log('[release-audit] local verification recorded for this exact source');
} else {
  try {
    requireLocalVerification();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

if (withDev || liveOnly) {
  run('Live dev endpoint and role audit', process.execPath, ['scripts/dev-endpoint-audit.mjs']);
  run('Live dev tenant-data isolation audit', process.execPath, ['scripts/dev-data-isolation-audit.mjs']);
  run('Live dev release seed audit', process.execPath, ['scripts/dev-release-seed-audit.mjs']);
  run('Live dev kassa five-role workflow audit', process.execPath, ['scripts/dev-kassa-workflow-audit.mjs']);
  run('Critical UI role-flow smoke', 'npm', ['run', 'test:e2e'], client);
  recordDevVerification();
  console.log('[release-audit] live dev verification recorded for this exact source');
}

console.log(`\n[release-audit] PASS ${version}${withDev || liveOnly ? ' including live dev' : ''}`);
