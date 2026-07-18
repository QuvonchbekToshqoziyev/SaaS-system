#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const releaseTag = version.replace(/\./g, '');
const base = String(process.env.DEV_BASE_URL || 'https://dev.b2b.booking.ado-finance.com').replace(/\/$/, '');
const password = process.env.DEV_QA_PASSWORD || 'QaDev2026!';
const expected = {
  flightNumber: `QA-${releaseTag}-NULL-ALLOC`,
  deskCode: `QA-${releaseTag}-K1`,
  carryDeskCode: `QA-${releaseTag}-CARRY`,
  importDeskCode: `QA-${releaseTag}-IMPORT`,
  serviceName: `QA ${version} Partner-only Service`,
  unassignedServiceName: `QA ${version} Unassigned Service`,
  notificationTitle: `QA ${version} release fixture`,
};

async function login(email) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (response.status !== 200 || !data.token) throw new Error(`${email} login failed with ${response.status}`);
  return data;
}

async function get(token, endpoint) {
  const response = await fetch(`${base}/api${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (response.status !== 200) throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(data).slice(0, 240)}`);
  return data;
}

async function request(token, method, endpoint, body = {}) {
  const response = await fetch(`${base}/api${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { status: response.status, data };
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} is not an array`);
  return value;
}

const [superadminLogin, readOnlyLogin, scopedAdminLogin, sourceAdminLogin, partnerAdminLogin] = await Promise.all([
  login('qa.superadmin@ado.test'),
  login('qa.readonly-superadmin@ado.test'),
  login('qa.admin@ado.test'),
  login('qa.firmadmin@ado.test'),
  login('qa.partneradmin@ado.test'),
]);
const superadminToken = superadminLogin.token;
const readOnlyToken = readOnlyLogin.token;
const scopedAdminToken = scopedAdminLogin.token;
const sourceAdminToken = sourceAdminLogin.token;
const partnerAdminToken = partnerAdminLogin.token;
const [desks, sourceFlights, partnerFlights, superadminServices, scopedAdminServices, sourceServices, notifications, partnerTransactions, sourceTransactions, sourceAgentReport, sourceDashboard, readOnlyAdmins, readOnlyDesks, readOnlyTransactions, readOnlyReports] = await Promise.all([
  get(superadminToken, '/kassa/desks'),
  get(sourceAdminToken, '/flights'),
  get(partnerAdminToken, '/flights'),
  get(superadminToken, '/services'),
  get(scopedAdminToken, '/services'),
  get(sourceAdminToken, '/services'),
  get(superadminToken, '/notifications?limit=100'),
  get(partnerAdminToken, '/transactions?page=1&limit=1000'),
  get(sourceAdminToken, '/transactions?page=1&limit=1000'),
  get(sourceAdminToken, '/reports/agents'),
  get(sourceAdminToken, '/reports/dashboard'),
  get(readOnlyToken, '/auth/admins'),
  get(readOnlyToken, '/kassa/desks'),
  get(readOnlyToken, '/transactions?page=1&limit=5'),
  get(readOnlyToken, '/reports/dashboard'),
]);
const [readOnlyCreate, readOnlyUpdate, readOnlyDelete, readOnlyPasswordChange] = await Promise.all([
  request(readOnlyToken, 'POST', '/auth/admins'),
  request(readOnlyToken, 'PATCH', '/auth/admins/__missing__'),
  request(readOnlyToken, 'DELETE', '/auth/admins/__missing__'),
  request(readOnlyToken, 'POST', '/auth/change-password'),
]);

const sourceFlight = requireArray(sourceFlights, 'source flights').find((row) => row.flightNumber === expected.flightNumber);
const partnerFlight = requireArray(partnerFlights, 'partner flights').find((row) => row.flightNumber === expected.flightNumber);
const payableRows = requireArray(partnerTransactions?.data, 'partner transactions').filter((row) =>
  row.subjectType === 'TICKET_ALLOCATION'
  && row.flightId === partnerFlight?.id
  && row.type === 'PAYABLE'
  && row.status === 'CONFIRMED'
  && !row.deletedAt
  && !row.reversedTransactionId
);
const carryDesk = requireArray(desks, 'kassa desks').find((row) => row.code === expected.carryDeskCode);
const importDesk = requireArray(desks, 'kassa desks').find((row) => row.code === expected.importDeskCode);
const paymentDesk = requireArray(desks, 'kassa desks').find((row) => row.code === 'QA-K1');
const outgoingAirlinePayment = requireArray(sourceTransactions?.data, 'source transactions').find((row) =>
  row.subjectType === 'QA_AIRLINE_PAYMENT' && row.metadata?.marker === version
);
const partnerAgent = requireArray(sourceAgentReport?.agents, 'agent ledger').find((row) => row.name === 'QA DEV Partner Agency');
const airlineAgent = requireArray(sourceAgentReport?.agents, 'agent ledger').find((row) => row.name === 'QA DEV Airways Firm');
const usd = (rows) => requireArray(rows, 'currency rows').find((row) => row.currency === 'USD')?.total || 0;
const carryDay = carryDesk
  ? await get(sourceAdminToken, `/kassa?date=2026-06-12&kassaDeskId=${encodeURIComponent(carryDesk.id)}`)
  : null;
const paymentDay = paymentDesk
  ? await get(sourceAdminToken, `/kassa?date=${new Date().toISOString().slice(0, 10)}&kassaDeskId=${encodeURIComponent(paymentDesk.id)}`)
  : null;
const historicalImportBody = importDesk ? {
  firmId: importDesk.firmId,
  kassaDeskId: importDesk.id,
  rows: [{ reference: `QA-${version}-HIST-001`, date: '2026-06-25', flow: 'KIRIM', amount: 125000, currency: 'UZS', exchangeRate: 1, note: `QA ${version} historical import` }],
} : null;
const historicalPreviewBefore = historicalImportBody
  ? await request(sourceAdminToken, 'POST', '/transactions/import/historical-kassa', { ...historicalImportBody, dryRun: true })
  : null;
const historicalCommit = historicalImportBody
  ? await request(sourceAdminToken, 'POST', '/transactions/import/historical-kassa', { ...historicalImportBody, dryRun: false })
  : null;
const historicalPreviewAfter = historicalImportBody
  ? await request(sourceAdminToken, 'POST', '/transactions/import/historical-kassa', { ...historicalImportBody, dryRun: true })
  : null;
const historicalRows = historicalImportBody
  ? await get(sourceAdminToken, '/transactions?sourceMode=HISTORICAL_IMPORT&dateFrom=2026-06-25T00%3A00%3A00.000Z&dateTo=2026-06-25T23%3A59%3A59.999Z&page=1&limit=100')
  : null;
const checks = [
  { name: 'superadmin sees active desk owned by expired no-login firm', ok: requireArray(desks, 'kassa desks').some((row) => row.code === expected.deskCode) },
  { name: 'source firm sees null-status release flight', ok: Boolean(sourceFlight && sourceFlight.status === null) },
  { name: 'allocated partner firm sees release flight', ok: Boolean(partnerFlight) },
  { name: 'ticket allocation does not create a financial transaction', ok: payableRows.length === 0 },
  { name: 'agent ledger uses allocation, old balance and named payment', ok: partnerAgent?.ticketPurchases?.some((row) => row.flightNumber === expected.flightNumber && row.quantity === 2 && row.totalAmount === 840) && usd(partnerAgent.oldBalance) >= 200 && usd(partnerAgent.totalPaid) >= 300 },
  { name: 'receivable list names the current debtor firm', ok: requireArray(sourceAgentReport?.receivables, 'receivable firms').some((row) => row.firmName === 'QA DEV Partner Agency' && row.currency === 'USD' && row.currentDebt > 0) && usd(partnerAgent.currentBalance) === usd(partnerAgent.receivable) - usd(partnerAgent.payable) },
  { name: 'airline flight purchase and kassa out payment reduce payable debt', ok: airlineAgent?.flightPurchases?.some((row) => row.flightNumber === expected.flightNumber && row.quantity === 2 && row.totalAmount === 600) && usd(airlineAgent.totalPurchases) >= 600 && usd(airlineAgent.totalPaidByUs) >= 250 && airlineAgent?.paymentsMade?.some((row) => row.flightNumber === expected.flightNumber && row.amount === 250) },
  { name: 'airline PAYMENT is stored and totaled as kassa out', ok: outgoingAirlinePayment?.type === 'PAYMENT' && outgoingAirlinePayment?.payerFirm?.name === 'QA DEV Tashkent Tours' && outgoingAirlinePayment?.receiverFirm?.name === 'QA DEV Airways Firm' && outgoingAirlinePayment?.metadata?.cashFlow === 'OUT' && Number(paymentDay?.totals?.byCurrency?.USD?.cashOutTotal || 0) >= 250 },
  { name: 'payable list names the airline we owe', ok: requireArray(sourceAgentReport?.payables, 'payable firms').some((row) => row.firmName === 'QA DEV Airways Firm' && row.currency === 'USD' && row.currentDebt > 0) },
  { name: 'dashboard returns five upcoming flights and both named debt tables', ok: requireArray(sourceDashboard?.upcomingFlights, 'dashboard upcoming flights').length <= 5 && requireArray(sourceDashboard?.debts?.receivables, 'dashboard receivables').some((row) => row.firmName === 'QA DEV Partner Agency') && requireArray(sourceDashboard?.debts?.payables, 'dashboard payables').some((row) => row.firmName === 'QA DEV Airways Firm') },
  { name: 'superadmin sees partner-owned service', ok: requireArray(superadminServices, 'superadmin services').some((row) => row.name === expected.serviceName) },
  { name: 'assigned platform admin sees assigned services only', ok: requireArray(scopedAdminServices, 'scoped admin services').some((row) => row.name === expected.serviceName) && !requireArray(scopedAdminServices, 'scoped admin services').some((row) => row.name === expected.unassignedServiceName) },
  { name: 'source firm cannot see partner-owned service', ok: !requireArray(sourceServices, 'source services').some((row) => row.name === expected.serviceName) },
  { name: 'release fixture marker exists', ok: requireArray(notifications?.items, 'notifications').some((row) => row.title === expected.notificationTitle) },
  { name: 'carry-forward skips latest closed day without UZS remainder', ok: carryDay?.openingSuggestion?.openingBalances?.UZS === '4000000' && carryDay?.openingSuggestion?.previousBusinessDates?.UZS === '2026-06-10' },
  { name: 'carry-forward skips latest closed day without USD remainder', ok: carryDay?.openingSuggestion?.openingBalances?.USD === '125' && carryDay?.openingSuggestion?.previousBusinessDates?.USD === '2026-06-10' },
  { name: 'historical kassa import preview accepts the release row', ok: historicalPreviewBefore?.status === 200 && historicalPreviewBefore.data?.ok === true },
  { name: 'historical kassa import commit is idempotent', ok: historicalCommit?.status === 201 && [0, 1].includes(historicalCommit.data?.createdCount) && historicalPreviewAfter?.status === 200 && historicalPreviewAfter.data?.skippedCount === 1 && historicalPreviewAfter.data?.readyCount === 0 },
  { name: 'historical kassa import preserves the business date and source', ok: requireArray(historicalRows?.data, 'historical import transactions').some((row) => row.sourceMode === 'HISTORICAL_IMPORT' && row.metadata?.date === '2026-06-25' && row.metadata?.importReference === `QA-${version}-HIST-001`) },
  { name: 'read-only superadmin login exposes enforced account mode', ok: readOnlyLogin.user?.role === 'SUPERADMIN' && readOnlyLogin.user?.readOnlyAccess === true },
  { name: 'read-only superadmin retains full read visibility', ok: requireArray(readOnlyAdmins, 'read-only admins').some((row) => row.email === 'qa.readonly-superadmin@ado.test' && row.readOnlyAccess === true) && requireArray(readOnlyDesks, 'read-only kassa desks').length > 0 && Boolean(readOnlyTransactions?.data) && Boolean(readOnlyReports) },
  { name: 'read-only superadmin cannot create', ok: readOnlyCreate.status === 403 && readOnlyCreate.data?.code === 'READ_ONLY_ACCOUNT' },
  { name: 'read-only superadmin cannot update', ok: readOnlyUpdate.status === 403 && readOnlyUpdate.data?.code === 'READ_ONLY_ACCOUNT' && readOnlyPasswordChange.status === 403 && readOnlyPasswordChange.data?.code === 'READ_ONLY_ACCOUNT' },
  { name: 'read-only superadmin cannot delete', ok: readOnlyDelete.status === 403 && readOnlyDelete.data?.code === 'READ_ONLY_ACCOUNT' },
];
const failures = checks.filter((check) => !check.ok);

console.log(JSON.stringify({
  base,
  version,
  expected,
  checks: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((failure) => failure.name),
}, null, 2));
process.exitCode = failures.length ? 1 : 0;
