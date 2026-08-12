#!/usr/bin/env node

import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requested = process.argv.slice(2);
const changed = requested.length
  ? requested
  : execFileSync('git', ['-C', root, 'status', '--short'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3));

function run(label, command, args, cwd = root) {
  const started = Date.now();
  console.log(`\n[quick-check] ${label}`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`[quick-check] ${label} passed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

const serverFiles = changed.filter((file) => file.startsWith('airline-b2b/server/'));
const clientFiles = changed.filter((file) => file.startsWith('airline-b2b/client/'));
const shellFiles = changed.filter((file) => file.endsWith('.sh'));
const nodeScripts = changed.filter((file) => file.endsWith('.mjs'));

if (serverFiles.some((file) => file.endsWith('schema.prisma'))) {
  run('Prisma schema', 'npx', ['prisma', 'validate'], path.join(root, 'airline-b2b/server'));
  run('Prisma client', 'npx', ['prisma', 'generate'], path.join(root, 'airline-b2b/server'));
}
if (serverFiles.some((file) => file.endsWith('.ts'))) {
  run('Server TypeScript', 'npx', ['tsc', '--noEmit'], path.join(root, 'airline-b2b/server'));
  const related = serverFiles
    .filter((file) => file.endsWith('.ts'))
    .map((file) => file.slice('airline-b2b/server/'.length));
  run('Related server tests', 'npx', ['vitest', 'related', ...related, '--run', '--passWithNoTests'], path.join(root, 'airline-b2b/server'));
}
if (clientFiles.some((file) => /\.(ts|tsx)$/.test(file))) {
  run('Client TypeScript', 'npx', ['tsc', '--noEmit'], path.join(root, 'airline-b2b/client'));
}
if (shellFiles.length) run('Shell syntax', 'bash', ['-n', ...shellFiles]);
for (const file of nodeScripts) run(`Node syntax: ${file}`, 'node', ['--check', file]);

console.log(`\n[quick-check] PASS (${changed.length} changed path${changed.length === 1 ? '' : 's'} considered)`);
