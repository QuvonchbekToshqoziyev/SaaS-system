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
  serviceName: `QA ${version} Partner-only Service`,
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
  return data.token;
}

async function get(token, endpoint) {
  const response = await fetch(`${base}/api${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (response.status !== 200) throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(data).slice(0, 240)}`);
  return data;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} is not an array`);
  return value;
}

const [superadminToken, sourceAdminToken, partnerAdminToken] = await Promise.all([
  login('qa.superadmin@ado.test'),
  login('qa.firmadmin@ado.test'),
  login('qa.partneradmin@ado.test'),
]);
const [desks, sourceFlights, partnerFlights, superadminServices, sourceServices, notifications, partnerTransactions] = await Promise.all([
  get(superadminToken, '/kassa/desks'),
  get(sourceAdminToken, '/flights'),
  get(partnerAdminToken, '/flights'),
  get(superadminToken, '/services'),
  get(sourceAdminToken, '/services'),
  get(superadminToken, '/notifications?limit=100'),
  get(partnerAdminToken, '/transactions?page=1&limit=1000'),
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
const checks = [
  { name: 'superadmin sees active desk owned by expired no-login firm', ok: requireArray(desks, 'kassa desks').some((row) => row.code === expected.deskCode) },
  { name: 'source firm sees null-status release flight', ok: Boolean(sourceFlight && sourceFlight.status === null) },
  { name: 'allocated partner firm sees release flight', ok: Boolean(partnerFlight) },
  { name: 'one allocation has one payable with correct USD total', ok: payableRows.length === 1 && Number(payableRows[0].originalAmount) === 840 && payableRows[0].currency === 'USD' },
  { name: 'superadmin sees partner-owned service', ok: requireArray(superadminServices, 'superadmin services').some((row) => row.name === expected.serviceName) },
  { name: 'source firm cannot see partner-owned service', ok: !requireArray(sourceServices, 'source services').some((row) => row.name === expected.serviceName) },
  { name: 'release fixture marker exists', ok: requireArray(notifications?.items, 'notifications').some((row) => row.title === expected.notificationTitle) },
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
