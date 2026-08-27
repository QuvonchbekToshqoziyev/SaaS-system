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

const hardTransactionDeletes = walk(sourceRoot)
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
  .filter((file) => /transaction\.delete(?:Many)?\s*\(/.test(fs.readFileSync(file, 'utf8')))
  .map((file) => path.relative(root, file));
if (hardTransactionDeletes.length) failures.push(`financial transaction hard-delete found in ${hardTransactionDeletes.join(', ')}`);

const reservedReturningAliases = walk(sourceRoot)
  .filter((file) => file.endsWith('.ts'))
  .filter((file) => /JOIN\s+"TicketLeg"\s+returning\b/i.test(fs.readFileSync(file, 'utf8')))
  .map((file) => path.relative(root, file));
if (reservedReturningAliases.length) failures.push(`reserved SQL alias returning found in ${reservedReturningAliases.join(', ')}`);

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
requireText('airline-b2b/server/src/controllers/services.controller.test.ts', "ownerFirmId: { in: ['firm-1', 'firm-2'] }", 'assigned admin service isolation test missing');
requireText('airline-b2b/server/src/controllers/ticket-legs.controller.ts', 'requiresAirlineConnectionForAllocation(source.isAirlineOwner)', 'allocation connection policy is not scoped to airline-owned inventory');
requireText('airline-b2b/server/src/utils/transaction-visibility.ts', "status: { not: 'DELETED' }", 'deleted transaction status visibility guard missing');
requireText('airline-b2b/server/src/utils/transaction-visibility.test.ts', 'TICKET_ALLOCATION_ADJUSTMENT', 'inventory transaction visibility test missing');
requireText('airline-b2b/server/src/utils/transaction-visibility.test.ts', 'soft-deletes a transaction without removing its row', 'transaction soft-delete test missing');
requireText('scripts/dev-data-isolation-audit.mjs', "check(actor, 'services'", 'live service isolation check missing');
requireText('scripts/dev-data-isolation-audit.mjs', "check(actor, 'kassa-history'", 'live kassa history isolation check missing');
requireText('airline-b2b/server/src/services/kassa.service.ts', "orderBy: [{ businessDate: 'desc' }, { closedAt: 'desc' }]", 'kassa carry-forward business-date ordering missing');
requireText('airline-b2b/server/src/services/kassa.service.ts', 'actualClosingBalance: { not: null }', 'kassa carry-forward usable remainder guard missing');
requireText('airline-b2b/server/src/services/kassa.service.ts', "if (kassaDeskId === '__unassigned_kassir__') return [];", 'unassigned kassir card isolation missing');
requireText('airline-b2b/server/src/controllers/kassa.controller.ts', 'getKassaHistoryService(getAuthUser(req)', 'kassa history auth scope missing');
requireText('scripts/release-audit.mjs', "['scripts/dev-kassa-workflow-audit.mjs']", 'five-role kassa workflow audit missing from release gate');
requireText('scripts/release-audit.mjs', "process.argv.includes('--live-only')", 'live-only release audit fast path missing');
requireText('scripts/release-audit.mjs', 'requireLocalVerification()', 'live-only audit is not bound to the locally audited source');
requireText('deploy.sh', 'verified_dev_matches_source', 'production cannot reuse an exact audited dev deployment');
requireText('deploy.sh', 'verify-dev', 'production dev verification attestation missing');
for (const deploy of ['deploy-dev.sh', 'deploy.sh']) {
  requireText(deploy, 'Dependencies unchanged - npm ci skipped', 'dependency install cache missing');
  requireText(deploy, 'timeout 180s npm ci', 'remote dependency install timeout missing');
}

for (const file of [
  'airline-b2b/server/src/controllers/tickets.controller.ts',
  'airline-b2b/server/src/controllers/ticket-legs.controller.ts',
  'airline-b2b/server/src/domains/tickets/ticket-leg-inventory.ts',
]) {
  const source = read(file);
  if (/type:\s*'PAYABLE'[\s\S]{0,900}subjectType:\s*'TICKET_ALLOCATION/.test(source)
    || /subjectType:\s*'TICKET_ALLOCATION[\s\S]{0,900}type:\s*'PAYABLE'/.test(source)) {
    failures.push(`ticket allocation writes a financial transaction: ${file}`);
  }
}
if (/transaction\.create/.test(read('airline-b2b/server/src/controllers/services.controller.ts'))) {
  failures.push('service inventory creation writes a financial transaction');
}

const migration = 'prisma/migrations/20260717_remove_inventory_transactions/migration.sql';
requireText(`airline-b2b/server/${migration}`, 'UPDATE "Transaction"', 'inventory transaction cleanup migration missing');
for (const deploy of ['deploy-dev.sh', 'deploy.sh']) {
  requireText(deploy, migration, 'allocation migration missing from deploy');
  requireText(deploy, 'npm run audit:business-invariants', 'business invariant audit missing from deploy');
  requireText(deploy, 'npm run backfill:expense-categories', 'expense category backfill missing from deploy');
}
requireText('airline-b2b/server/package.json', '"backfill:expense-categories": "npx ts-node prisma/backfill-expense-categories.ts"', 'expense category backfill command missing');
requireText('airline-b2b/client/src/app/(dashboard)/kassa/page.tsx', '&& Boolean(cashTransactionFirmId)', 'kassa category selector can mix categories from multiple firms');
requireText('airline-b2b/client/src/app/(dashboard)/settings/page.tsx', "'Hozirgi xarajat turlari'", 'settings current expense category list missing');

const version = read('VERSION').trim();
const devSeed = read('airline-b2b/server/prisma/seed-dev-qa.ts');
if (!devSeed.includes(`const RELEASE_FIXTURE_VERSION = '${version}'`)) failures.push(`dev release fixture version does not match VERSION ${version}`);
requireText('airline-b2b/server/package.json', '"seed:dev-qa": "npx ts-node prisma/seed-dev-qa.ts"', 'dev seed package command missing');
requireText('airline-b2b/server/prisma/seed-dev-qa.ts', "process.env.ALLOW_DEV_QA_SEED !== '1'", 'dev seed opt-in safety guard missing');
requireText('airline-b2b/server/prisma/seed-dev-qa.ts', "databaseUrl.includes('airline_b2b_dev')", 'dev database safety guard missing');
requireText('deploy-dev.sh', 'ALLOW_DEV_QA_SEED=1 npm run seed:dev-qa', 'release seed missing from dev deploy');
if (/ALLOW_DEV_QA_SEED|npm run seed:dev-qa/.test(read('deploy.sh'))) failures.push('production deploy directly runs dev QA seed');
requireText('scripts/release-audit.mjs', "['scripts/dev-release-seed-audit.mjs']", 'live release seed audit missing from release gate');
requireText('airline-b2b/server/prisma/schema.prisma', 'readOnlyAccess                  Boolean                   @default(false)', 'read-only account schema flag missing');
requireText('airline-b2b/server/src/middleware/auth.ts', "code: 'READ_ONLY_ACCOUNT'", 'read-only mutation guard missing');
requireText('airline-b2b/server/src/middleware/auth.test.ts', "['POST', 'PATCH', 'PUT', 'DELETE'].some(isReadOnlyHttpMethod)", 'read-only method regression test missing');
requireText('scripts/dev-release-seed-audit.mjs', "login('qa.readonly-superadmin@ado.test')", 'live read-only superadmin audit missing');
requireText('airline-b2b/server/prisma/migrations/20260717_add_read_only_superadmin/migration.sql', 'ADD COLUMN IF NOT EXISTS "readOnlyAccess"', 'read-only account migration missing');
requireText('scripts/dev-kassa-workflow-audit.mjs', 'deleted cash row is still visible in kassa', 'live kassa transaction delete audit missing');
requireText('airline-b2b/server/src/index.ts', "process.env.HOST || '127.0.0.1'", 'backend is not bound to loopback by default');
requireText('airline-b2b/server/src/middleware/auth.ts', "actor.status !== 'ACTIVE'", 'inactive account session rejection missing');
requireText('airline-b2b/server/src/middleware/auth.ts', 'sessionVersion', 'session revocation version check missing');
requireText('airline-b2b/server/src/middleware/auth.test.ts', 'replaces stale token roles and tenant claims', 'canonical database authorization test missing');
requireText('airline-b2b/server/prisma/schema.prisma', '@relation("EmployeeLogin"', 'employee login lifecycle relation missing');
requireText('airline-b2b/server/src/controllers/transactions.controller.ts', 'Math.min(500, Math.max(1', 'transaction pagination limit is unbounded');
requireText('nginx.conf.b2b.ado-finance.com', 'limit_req zone=ado_prod_login', 'production login throttling missing');
requireText('airline-b2b/server/src/utils/session-cookie.ts', "httpOnly: true", 'browser session cookie is not HttpOnly');
requireText('airline-b2b/server/src/middleware/auth.ts', "req.get('x-ado-csrf') !== '1'", 'cookie authentication CSRF guard missing');
if (/localStorage\.setItem\(['"]token['"]/.test(authContext)) failures.push('browser authentication token is persisted in localStorage');
requireText('nginx.conf.b2b.ado-finance.com', 'add_header Strict-Transport-Security', 'static HSTS header missing');

for (const file of [
  'airline-b2b/client/src/app/invite/page.tsx',
  'airline-b2b/client/src/app/(dashboard)/admins/page.tsx',
  'airline-b2b/client/src/app/(dashboard)/airlines/page.tsx',
  'airline-b2b/client/src/app/(dashboard)/chat/page.tsx',
  'airline-b2b/client/src/app/(dashboard)/employees/page.tsx',
  'airline-b2b/client/src/app/(dashboard)/firms/page.tsx',
  'airline-b2b/client/src/app/(dashboard)/flights/page.tsx',
  'airline-b2b/client/src/app/(dashboard)/kassa/page.tsx',
  'airline-b2b/client/src/app/(dashboard)/services/page.tsx',
  'airline-b2b/client/src/app/(dashboard)/settings/page.tsx',
  'airline-b2b/client/src/app/(dashboard)/tours/page.tsx',
  'airline-b2b/client/src/app/(dashboard)/transactions/page.tsx',
  'airline-b2b/client/src/features/kassa/HistoricalKassaImport.tsx',
]) requireText(file, 'ActionButtons', 'cancel-confirm action controls missing');
requireText('airline-b2b/client/src/components/ui/ActionButtons.tsx', 'form?.checkValidity()', 'native form validity is not enforced before confirmation');
requireText('airline-b2b/client/src/app/globals.css', '--control-height: 2.75rem', 'shared desktop control height token missing');
requireText('airline-b2b/client/src/app/globals.css', 'minmax(min(100%, 220px), 1fr)', 'responsive form field sizing guard missing');
requireText('airline-b2b/client/src/app/globals.css', '.operation-form {', 'operation form surface missing');
requireText('airline-b2b/client/src/app/globals.css', '.form-grid.form-grid > :where(label, .form-field, .form-field--compact', 'mobile form fields can collapse into narrow grid cells');
for (const file of [
  'airline-b2b/client/src/app/(dashboard)/services/page.tsx',
  'airline-b2b/client/src/app/(dashboard)/tours/page.tsx',
  'airline-b2b/client/src/app/(dashboard)/transactions/page.tsx',
]) requireText(file, 'operation-form', 'responsive operation form layout missing');
requireText('airline-b2b/client/src/app/(dashboard)/services/page.tsx', 'Notes and service details', 'service long-text field missing');
requireText('airline-b2b/client/src/app/(dashboard)/tours/page.tsx', 'Notes and tour details', 'tour long-text field missing');
requireText('airline-b2b/client/src/app/(dashboard)/transactions/page.tsx', 'Reference and payment note', 'transaction long-text field missing');
const toursPage = read('airline-b2b/client/src/app/(dashboard)/tours/page.tsx');
if (toursPage.includes('form-grid form-subsection min-w-[38rem]')) failures.push('tour sale form is still embedded inside a narrow table cell');
requireText('airline-b2b/client/src/app/(dashboard)/tours/page.tsx', 'aria-modal="true"', 'tour sale dialog missing');
requireText('airline-b2b/client/src/app/(dashboard)/tours/page.tsx', 'setSellingId(null)', 'tour sale cancel/close state reset missing');
requireText('airline-b2b/server/src/controllers/transactions.controller.ts', 'canViewRelatedFirm(authUser, counterpartyFirmId)', 'kassa cash movement rejects firms shown in its counterparty selector');
requireText('airline-b2b/client/src/app/globals.css', '@media (prefers-reduced-motion: reduce)', 'reduced-motion UI guard missing');
requireText('airline-b2b/client/src/components/layout/DashboardLayout.tsx', 'className="app-shell', 'semantic dashboard shell missing');
requireText('airline-b2b/client/src/components/layout/DashboardLayout.tsx', 'id="main-content"', 'keyboard skip target missing');
requireText('airline-b2b/client/src/components/ui/CollapsibleCard.tsx', 'className={`section-card', 'semantic section card primitive missing');
requireText('airline-b2b/client/src/app/(dashboard)/flights/detail/page.tsx', 'disabled={allocateBusy || !allocationDraftValid}', 'ticket allocation confirmation validity guard missing');
requireText('airline-b2b/client/src/app/(dashboard)/flights/detail/page.tsx', 'disabled={sellBusy || !singleSaleDraftValid}', 'single-ticket sale confirmation validity guard missing');
requireText('airline-b2b/client/src/app/(dashboard)/flights/detail/page.tsx', 'disabled={sellBatchBusy || !batchSaleDraftValid}', 'batch ticket sale confirmation validity guard missing');

console.log(JSON.stringify({ ok: failures.length === 0, checks: 94, failures }, null, 2));
if (failures.length) process.exitCode = 1;
