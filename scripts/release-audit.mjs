#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const withDev = process.argv.includes('--dev');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function fail(message) {
  console.error(`RELEASE AUDIT FAILED: ${message}`);
  process.exit(1);
}

function run(label, command, args, cwd = root) {
  console.log(`\n[release-audit] ${label}`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.status !== 0) fail(`${label} exited with status ${result.status ?? 'unknown'}`);
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

run('API route/client contract', process.execPath, ['scripts/api-surface-audit.mjs']);
run('Recurring regression guards', process.execPath, ['scripts/regression-guard-audit.mjs']);

const server = path.join(root, 'airline-b2b/server');
run('Server runtime dependency audit', 'npm', ['audit', '--omit=dev', '--audit-level=high'], server);
run('Prisma schema validation', 'npx', ['prisma', 'validate'], server);
run('Prisma client generation', 'npx', ['prisma', 'generate'], server);
run('Server tests', 'npm', ['test'], server);
run('Server TypeScript build', 'npm', ['run', 'build'], server);

const client = path.join(root, 'airline-b2b/client');
run('Client runtime dependency audit', 'npm', ['audit', '--omit=dev', '--audit-level=high'], client);
run('Client TypeScript check', 'npx', ['tsc', '--noEmit'], client);
run('Client production build', 'npm', ['run', 'build'], client);

if (withDev) {
  run('Live dev endpoint and role audit', process.execPath, ['scripts/dev-endpoint-audit.mjs']);
  run('Live dev tenant-data isolation audit', process.execPath, ['scripts/dev-data-isolation-audit.mjs']);
  run('Live dev release seed audit', process.execPath, ['scripts/dev-release-seed-audit.mjs']);
  run('Critical UI role-flow smoke', 'npm', ['run', 'test:e2e'], client);
}

console.log(`\n[release-audit] PASS ${version}${withDev ? ' including live dev' : ''}`);
