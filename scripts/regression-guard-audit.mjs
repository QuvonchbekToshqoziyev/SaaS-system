#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const requireText = (file, text, label) => {
  if (!read(file).includes(text)) failures.push(`${label}: ${file}`);
};

const sourceRoot = path.join(root, 'airline-b2b/server/src');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const resolved = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(resolved) : [resolved];
});
const duplicateFlightPredicates = walk(sourceRoot)
  .filter((file) => file.endsWith('.ts') && !file.endsWith('flight-scope.ts') && !file.endsWith('flight-scope.test.ts'))
  .filter((file) => /status:\s*\{\s*notIn:\s*\['DELETED',\s*'CANCELLED'\]/.test(fs.readFileSync(file, 'utf8')))
  .map((file) => path.relative(root, file));
if (duplicateFlightPredicates.length) failures.push(`active flight predicate duplicated in ${duplicateFlightPredicates.join(', ')}`);

for (const file of [
  'airline-b2b/server/src/controllers/flights.controller.ts',
  'airline-b2b/server/src/controllers/reports.controller.ts',
  'airline-b2b/server/src/controllers/services.controller.ts',
  'airline-b2b/server/src/controllers/ticket-legs.controller.ts',
  'airline-b2b/server/src/controllers/tour-packages.controller.ts',
  'airline-b2b/server/src/services/reporting/financial-reporting.service.ts',
]) requireText(file, 'activeFlightWhere', 'shared active-flight guard missing');

const authContext = read('airline-b2b/client/src/contexts/AuthContext.tsx');
if ((authContext.match(/queryClient\.clear\(\)/g) || []).length < 4) failures.push('tenant cache is not cleared on every identity transition');

const kassaService = read('airline-b2b/server/src/services/kassa.service.ts');
const activeDeskGuard = kassaService.slice(kassaService.indexOf('export function activeKassaDeskWhere'), kassaService.indexOf('async function loadKassaDesks'));
if (/subscriptionEndsAt|users\s*:/.test(activeDeskGuard)) failures.push('kassa desk visibility depends on login or subscription eligibility');

requireText('airline-b2b/server/src/controllers/services.controller.test.ts', "toEqual({ ownerFirmId: 'firm-1' })", 'service owner isolation test missing');
requireText('airline-b2b/server/src/controllers/ticket-legs.controller.test.ts', 'toHaveBeenCalledTimes(1)', 'allocation transaction cardinality test missing');
requireText('scripts/dev-data-isolation-audit.mjs', "check(actor, 'services'", 'live service isolation check missing');

const migration = 'prisma/migrations/20260715_unique_allocation_payable/migration.sql';
requireText(`airline-b2b/server/${migration}`, 'CREATE UNIQUE INDEX IF NOT EXISTS', 'allocation DB unique guard missing');
for (const deploy of ['deploy-dev.sh', 'deploy.sh']) {
  requireText(deploy, migration, 'allocation migration missing from deploy');
  requireText(deploy, 'npm run audit:business-invariants', 'business invariant audit missing from deploy');
}

console.log(JSON.stringify({ ok: failures.length === 0, checks: 15, failures }, null, 2));
if (failures.length) process.exitCode = 1;
