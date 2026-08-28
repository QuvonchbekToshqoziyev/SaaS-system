#!/usr/bin/env node

import { qaAuthHeaders, qaLogin } from './qa-login.mjs';

const base = String(process.env.DEV_BASE_URL || 'https://dev.b2b.booking.ado-finance.com').replace(/\/$/, '');
const password = process.env.DEV_QA_PASSWORD || 'QaDev2026!Secure';
const qaUsers = {
  admin: 'qa.admin@ado.test',
  firmadmin: 'qa.firmadmin@ado.test',
  manager: 'qa.manager@ado.test',
  kassir: 'qa.kassir1@ado.test',
};

async function login(email) {
  return qaLogin(base, email, password);
}

async function get(session, endpoint) {
  const response = await fetch(`${base}/api${endpoint}`, { headers: qaAuthHeaders(session) });
  const data = await response.json();
  if (response.status !== 200) throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

function array(value, property) {
  const resolved = property ? value?.[property] : value;
  if (!Array.isArray(resolved)) throw new Error(`Expected array${property ? ` in ${property}` : ''}`);
  return resolved;
}

const checks = [];
function check(actor, surface, rows, predicate, describe) {
  const violations = rows.filter((row) => !predicate(row));
  checks.push({ actor, surface, rows: rows.length, violations: violations.length, ok: violations.length === 0, detail: violations.length ? describe(violations[0]) : '' });
}

for (const [actor, email] of Object.entries(qaUsers)) {
  const session = await login(email);
  const ownFirmId = String(session.user.firmId || '');
  const firmDirectory = array(await get(session, '/firms'));
  const operationalFirmIds = session.user.role === 'FIRM'
    ? new Set([ownFirmId].filter(Boolean))
    : new Set(firmDirectory.map((firm) => String(firm.id)));
  if (!operationalFirmIds.size) throw new Error(`${actor} has no operational firm scope`);

  const [transactions, accounts, employees, notifications, desks, cards, kassaHistory, services] = await Promise.all([
    get(session, '/transactions?page=1&limit=1000'),
    get(session, '/accounts'),
    get(session, '/employees'),
    get(session, '/notifications?limit=100'),
    get(session, '/kassa/desks'),
    get(session, '/kassa/cards'),
    get(session, '/kassa/history?limit=50'),
    get(session, '/services'),
  ]);

  check(actor, 'transactions', array(transactions, 'data'), (row) => [row.firmId, row.payerFirmId, row.receiverFirmId].some((id) => id && operationalFirmIds.has(String(id))), (row) => `outside transaction ${row.id}`);
  check(actor, 'accounts', array(accounts), (row) => operationalFirmIds.has(String(row.firmId)), (row) => `outside account ${row.id}`);
  check(actor, 'employees', array(employees), (row) => !row.firmId || operationalFirmIds.has(String(row.firmId)), (row) => `outside employee ${row.id}`);
  check(actor, 'notifications', array(notifications, 'items'), (row) => String(row.userId || '') === String(session.user.id) || (row.firmId && operationalFirmIds.has(String(row.firmId))), (row) => `outside notification ${row.id}`);
  check(actor, 'kassa-desks', array(desks), (row) => operationalFirmIds.has(String(row.firmId)), (row) => `outside desk ${row.id}`);
  check(actor, 'payment-cards', array(cards), (row) => !row.firmId || operationalFirmIds.has(String(row.firmId)), (row) => `outside card ${row.id}`);
  check(actor, 'kassa-history', array(kassaHistory, 'data'), (row) => operationalFirmIds.has(String(row.firmId)), (row) => `outside kassa day ${row.id}`);
  check(actor, 'services', array(services), (row) => operationalFirmIds.has(String(row.ownerFirmId)), (row) => `outside service ${row.id}`);

  if (session.user.role === 'FIRM') {
    checks.push({
      actor, surface: 'counterparty-directory-separation', rows: firmDirectory.length,
      violations: firmDirectory.some((firm) => String(firm.id) !== ownFirmId) ? 0 : 1,
      ok: firmDirectory.some((firm) => String(firm.id) !== ownFirmId),
      detail: firmDirectory.some((firm) => String(firm.id) !== ownFirmId) ? '' : 'QA seed has no visible related counterparty',
    });
  }
}

const failures = checks.filter((row) => !row.ok);
console.log(JSON.stringify({ base, checks: checks.length, passed: checks.length - failures.length, failed: failures.length, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
