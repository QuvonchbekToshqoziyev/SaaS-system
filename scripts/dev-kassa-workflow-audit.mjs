#!/usr/bin/env node

import { qaAuthHeaders, qaLogin } from './qa-login.mjs';

const base = String(process.env.DEV_BASE_URL || 'https://dev.b2b.booking.ado-finance.com').replace(/\/$/, '');
const password = process.env.DEV_QA_PASSWORD || 'QaDev2026!Secure';
const actors = [
  ['superadmin', 'qa.superadmin@ado.test', '2026-06-20'],
  ['admin', 'qa.admin@ado.test', '2026-06-21'],
  ['firmadmin', 'qa.firmadmin@ado.test', '2026-06-22'],
  ['manager', 'qa.manager@ado.test', '2026-06-23'],
  ['kassir', 'qa.kassir1@ado.test', '2026-06-24'],
];

async function request(session, endpoint, options = {}) {
  const response = await fetch(`${base}/api${endpoint}`, {
    ...options,
    headers: { ...(session ? qaAuthHeaders(session, options.method && options.method !== 'GET') : {}), 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

async function login(email) {
  return qaLogin(base, email, password);
}

function requireStatus(result, status, label) {
  if (result.status !== status) throw new Error(`${label} returned ${result.status}: ${JSON.stringify(result.data).slice(0, 240)}`);
  return result.data;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} is not an array`);
  return value;
}

const sessions = new Map();
for (const [name, email] of actors) sessions.set(name, await login(email));

const firmAdmin = sessions.get('firmadmin');
const firmAdminDesks = requireArray(requireStatus(await request(firmAdmin, '/kassa/desks'), 200, 'firmadmin desks'), 'firmadmin desks');
const firmAdminFirms = requireArray(requireStatus(await request(firmAdmin, '/firms'), 200, 'firmadmin counterparties'), 'firmadmin counterparties');
const mainDesk = firmAdminDesks.find((desk) => desk.code === 'QA-K1');
const otherDesk = firmAdminDesks.find((desk) => desk.code === 'QA-K2');
const relatedCounterparty = firmAdminFirms.find((firm) => firm.id !== firmAdmin.user.firmId);
if (!mainDesk || !otherDesk || !relatedCounterparty) throw new Error('QA desks and a related counterparty are required');

const checks = [];
for (const [name, , businessDate] of actors) {
  const session = sessions.get(name);
  const desks = requireArray(requireStatus(await request(session, '/kassa/desks'), 200, `${name} desks`), `${name} desks`);
  if (!desks.some((desk) => desk.id === mainDesk.id)) throw new Error(`${name} cannot see required QA-K1 desk`);

  let day = requireStatus(
    await request(session, `/kassa?date=${businessDate}&kassaDeskId=${encodeURIComponent(mainDesk.id)}`),
    200,
    `${name} kassa panel`,
  );
  if (day.permissions?.canOperateKassa !== true) throw new Error(`${name} kassa panel reports canOperateKassa=false`);

  if (day.status === 'NOT_OPEN') {
    requireStatus(await request(session, '/kassa/open', {
      method: 'POST', body: JSON.stringify({ businessDate, kassaDeskId: mainDesk.id }),
    }), 201, `${name} open past kassa day`);
  } else if (day.status === 'CLOSED') {
    requireStatus(await request(session, '/kassa/reopen', {
      method: 'POST', body: JSON.stringify({ businessDate, kassaDeskId: mainDesk.id, notes: 'QA role workflow audit' }),
    }), 200, `${name} reopen past kassa day`);
  }

  requireStatus(await request(session, '/kassa/close', {
    method: 'POST', body: JSON.stringify({ businessDate, kassaDeskId: mainDesk.id, notes: 'QA role workflow audit' }),
  }), 200, `${name} close past kassa day`);
  requireStatus(await request(session, '/kassa/reopen', {
    method: 'POST', body: JSON.stringify({ businessDate, kassaDeskId: mainDesk.id, notes: 'QA role workflow audit' }),
  }), 200, `${name} reopen closed past kassa day`);
  requireStatus(await request(session, '/kassa/close', {
    method: 'POST', body: JSON.stringify({ businessDate, kassaDeskId: mainDesk.id, notes: 'QA role workflow audit complete' }),
  }), 200, `${name} re-close past kassa day`);

  const history = requireStatus(await request(session, '/kassa/history?limit=50'), 200, `${name} kassa history`);
  const historyRows = requireArray(history.data, `${name} kassa history`);
  if (session.user.role === 'FIRM' && historyRows.some((row) => row.firmId !== session.user.firmId)) {
    throw new Error(`${name} kassa history contains another firm's row`);
  }
  if (name === 'kassir' && historyRows.some((row) => row.cashDeskId !== mainDesk.id)) {
    throw new Error('kassir kassa history contains another desk');
  }
  checks.push(`${name}: panel, open, close, reopen, history`);
}

const kassir = sessions.get('kassir');
requireStatus(await request(kassir, '/kassa/open', {
  method: 'POST', body: JSON.stringify({ businessDate: '2026-06-25', kassaDeskId: otherDesk.id }),
}), 403, 'kassir wrong-desk guard');
checks.push('kassir: wrong desk intentionally denied with 403');

const deleteBusinessDate = '2026-06-26';
let deleteDay = requireStatus(
  await request(firmAdmin, `/kassa?date=${deleteBusinessDate}&kassaDeskId=${encodeURIComponent(mainDesk.id)}`),
  200,
  'delete workflow kassa panel',
);
if (deleteDay.status === 'NOT_OPEN') {
  requireStatus(await request(firmAdmin, '/kassa/open', {
    method: 'POST', body: JSON.stringify({ businessDate: deleteBusinessDate, kassaDeskId: mainDesk.id }),
  }), 201, 'open delete workflow kassa day');
} else if (deleteDay.status === 'CLOSED') {
  requireStatus(await request(firmAdmin, '/kassa/reopen', {
    method: 'POST', body: JSON.stringify({ businessDate: deleteBusinessDate, kassaDeskId: mainDesk.id, notes: 'QA delete workflow audit' }),
  }), 200, 'reopen delete workflow kassa day');
}

const createdCash = requireStatus(await request(firmAdmin, '/transactions/cash', {
  method: 'POST',
  body: JSON.stringify({
    flow: 'IN', method: 'cash', businessDate: deleteBusinessDate, firmId: firmAdmin.user.firmId,
    counterpartyFirmId: relatedCounterparty.id, kassaDeskId: mainDesk.id,
    amount: 1708, currency: 'UZS', note: 'QA kassa counterparty and delete workflow audit',
  }),
}), 201, 'create cash row with related counterparty');
if (createdCash.metadata?.counterpartyFirmId !== relatedCounterparty.id) {
  throw new Error('created cash row did not preserve the selected counterparty');
}
deleteDay = requireStatus(
  await request(firmAdmin, `/kassa?date=${deleteBusinessDate}&kassaDeskId=${encodeURIComponent(mainDesk.id)}`),
  200,
  'kassa panel before delete',
);
if (!requireArray(deleteDay.transactions, 'transactions before delete').some((row) => row.id === createdCash.id)) {
  throw new Error('created cash row is missing before delete');
}
requireStatus(await request(firmAdmin, `/transactions/${createdCash.id}/daily-cash`, {
  method: 'DELETE', body: JSON.stringify({ reason: 'QA kassa delete workflow cleanup' }),
}), 200, 'delete cash row');
deleteDay = requireStatus(
  await request(firmAdmin, `/kassa?date=${deleteBusinessDate}&kassaDeskId=${encodeURIComponent(mainDesk.id)}`),
  200,
  'kassa panel after delete',
);
if (requireArray(deleteDay.transactions, 'transactions after delete').some((row) => row.id === createdCash.id)) {
  throw new Error('deleted cash row is still visible in kassa');
}
requireStatus(await request(firmAdmin, '/kassa/close', {
  method: 'POST', body: JSON.stringify({ businessDate: deleteBusinessDate, kassaDeskId: mainDesk.id, notes: 'QA delete workflow audit complete' }),
}), 200, 'close delete workflow kassa day');
checks.push('firmadmin: related counterparty cash row is created and disappears immediately after delete');

console.log(JSON.stringify({ base, actors: actors.length, checks: checks.length, passed: checks.length, details: checks }, null, 2));
