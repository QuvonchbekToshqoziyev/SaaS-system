#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = path.join(root, 'airline-b2b/server/src');
const clientRoot = path.join(root, 'airline-b2b/client/src');
const fakeIdPattern = /00000000-0000-4000-8000-000000000000/g;

function walk(directory, predicate) {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(absolute, predicate));
    else if (predicate(absolute)) found.push(absolute);
  }
  return found;
}

function normalizePath(value) {
  const pathname = String(value || '').split('?')[0]
    .replace(/\$\{[^}]+\}/g, ':*')
    .replace(fakeIdPattern, ':*')
    .replace(/__ACCESSIBLE_FIRM__/g, ':*')
    .replace(/:[A-Za-z][A-Za-z0-9_]*/g, ':*')
    .replace(/\/+$/, '');
  return pathname || '/';
}

function key(method, pathname) {
  return `${String(method).toUpperCase()} ${normalizePath(pathname)}`;
}

const indexSource = fs.readFileSync(path.join(serverRoot, 'index.ts'), 'utf8');
const routeImports = new Map();
for (const match of indexSource.matchAll(/import\s+(\w+)\s+from\s+['"]\.\/routes\/([^'"]+)['"]/g)) {
  routeImports.set(match[1], match[2]);
}

const mountedRoutes = new Set();
for (const match of indexSource.matchAll(/app\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)\s*\)/g)) {
  const [, prefix, variable] = match;
  const routeFile = routeImports.get(variable);
  if (!routeFile) continue;
  const source = fs.readFileSync(path.join(serverRoot, 'routes', `${routeFile}.ts`), 'utf8');
  for (const route of source.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"]([^'"]*)['"]/gi)) {
    mountedRoutes.add(key(route[1], `${prefix}${route[2] === '/' ? '' : route[2]}`));
  }
}

const contractResult = spawnSync(process.execPath, [path.join(root, 'scripts/dev-endpoint-audit.mjs'), '--list-contracts'], { encoding: 'utf8' });
if (contractResult.status !== 0) {
  console.error(contractResult.stderr || 'Could not load endpoint contracts');
  process.exit(1);
}
const contractRoutes = new Set(JSON.parse(contractResult.stdout).map((route) => key(route.method, route.path)));

const missingContracts = [...mountedRoutes].filter((route) => !contractRoutes.has(route)).sort();
const staleContracts = [...contractRoutes].filter((route) => !mountedRoutes.has(route)).sort();

const clientCalls = new Set();
let dynamicClientCalls = 0;
for (const file of walk(clientRoot, (absolute) => /\.(ts|tsx)$/.test(absolute))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/api\.(get|post|put|patch|delete)\(\s*([`'"])([\s\S]*?)\2/g)) {
    const [, method, , endpoint] = match;
    if (!endpoint.startsWith('/')) {
      dynamicClientCalls += 1;
      continue;
    }
    clientCalls.add(key(method, endpoint));
  }
}

function matchesRoute(call, route) {
  const [callMethod, callPath] = call.split(' ');
  const [routeMethod, routePath] = route.split(' ');
  if (callMethod !== routeMethod) return false;
  const callParts = callPath.split('/').filter(Boolean);
  const routeParts = routePath.split('/').filter(Boolean);
  return callParts.length === routeParts.length && routeParts.every((part, index) => part === ':*' || callParts[index] === ':*' || part === callParts[index]);
}

const unmatchedClientCalls = [...clientCalls]
  .filter((call) => ![...mountedRoutes].some((route) => matchesRoute(call, route)))
  .sort();

const report = {
  mountedEndpoints: mountedRoutes.size,
  endpointContracts: contractRoutes.size,
  staticClientCalls: clientCalls.size,
  dynamicClientCallsSkipped: dynamicClientCalls,
  missingContracts,
  staleContracts,
  unmatchedClientCalls,
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = missingContracts.length || staleContracts.length || unmatchedClientCalls.length ? 1 : 0;
