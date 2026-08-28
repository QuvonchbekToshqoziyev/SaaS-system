#!/usr/bin/env node

import { qaLoginCode } from './qa-login-code.mjs';

const base = String(process.env.DEV_BASE_URL || 'https://dev.b2b.booking.ado-finance.com').replace(/\/$/, '');
const password = process.env.DEV_QA_PASSWORD || 'QaDev2026!Secure';
const timeoutMs = Number(process.env.DEV_AUDIT_TIMEOUT_MS || 30_000);
const fakeId = '00000000-0000-4000-8000-000000000000';

const actors = {
  superadmin: { email: 'qa.superadmin@ado.test', role: 'SUPERADMIN' },
  admin: { email: 'qa.admin@ado.test', role: 'ADMIN' },
  firmadmin: { email: 'qa.firmadmin@ado.test', role: 'FIRM' },
  manager: { email: 'qa.manager@ado.test', role: 'FIRM' },
  kassir: { email: 'qa.kassir1@ado.test', role: 'FIRM' },
};

const ALL = ['SUPERADMIN', 'ADMIN', 'FIRM'];
const SA = ['SUPERADMIN'];
const SA_ADMIN = ['SUPERADMIN', 'ADMIN'];
const FIRM = ['FIRM'];
const contracts = [];

function add(prefix, defaultRoles, rows) {
  for (const row of rows) {
    const [method, suffix, options = {}] = row;
    contracts.push({
      method,
      path: `${prefix}${suffix}`.replace(/\/$/, '') || '/',
      authenticated: options.authenticated ?? true,
      roles: options.roles ?? defaultRoles,
      expected: options.expected ?? (method === 'GET' ? [200] : [200, 201, 204, 400, 403, 404, 409, 422]),
      safeAllowedProbe: options.safeAllowedProbe ?? (method === 'GET'),
      businessDeniedActors: options.businessDeniedActors ?? [],
      body: options.body,
    });
  }
}

add('/accounts', ALL, [['GET', ''], ['POST', '', { safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }], ['PATCH', `/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }], ['DELETE', `/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }]]);
add('/expense-categories', ALL, [['GET', ''], ['POST', '', { safeAllowedProbe: true, businessDeniedActors: ['admin', 'manager', 'kassir'] }], ['PATCH', `/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['admin', 'manager', 'kassir'] }], ['DELETE', `/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['admin', 'manager', 'kassir'] }]]);
add('/expense-budgets', ALL, [['GET', ''], ['POST', '', { safeAllowedProbe: true, businessDeniedActors: ['admin', 'manager', 'kassir'] }], ['DELETE', `/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['admin', 'manager', 'kassir'] }]]);
add('/airlines', ALL, [
  ['GET', ''], ['POST', '', { roles: SA, safeAllowedProbe: true }],
  ['GET', '/connections', { roles: SA_ADMIN }], ['POST', '/connections', { roles: SA, safeAllowedProbe: true }],
]);
add('/audit-log', SA, [['GET', '']]);
add('/auth', ALL, [
  ['POST', '/login', { authenticated: false, expected: [401, 429], safeAllowedProbe: true, body: { email: 'invalid@example.com', password: 'invalid' } }],
  ['GET', '/session'],
  ['POST', '/logout', { safeAllowedProbe: true }],
  ['POST', '/change-password', { safeAllowedProbe: true }],
  ['POST', '/device/verify', { authenticated: false, expected: [401], safeAllowedProbe: true, body: { challengeTicket: 'invalid', code: '000000' } }],
  ['POST', '/device/resend', { authenticated: false, expected: [401], safeAllowedProbe: true, body: { challengeTicket: 'invalid' } }],
  ['POST', '/device/forget', { safeAllowedProbe: true }],
  ['GET', '/users', { roles: SA_ADMIN }],
  ['PATCH', `/users/${fakeId}`, { roles: SA, safeAllowedProbe: true }],
  ['DELETE', `/users/${fakeId}`, { roles: SA, safeAllowedProbe: true }],
  ['GET', '/admins', { roles: SA }],
  ['POST', '/admins', { roles: SA, safeAllowedProbe: true }],
  ['PATCH', `/admins/${fakeId}`, { roles: SA, safeAllowedProbe: true }],
  ['DELETE', `/admins/${fakeId}`, { roles: SA, safeAllowedProbe: true }],
  ['PATCH', `/users/${fakeId}/firm-access`, { roles: SA, safeAllowedProbe: true }],
]);
add('/chat', ALL, [
  ['GET', '/conversations'], ['POST', '/conversations', { safeAllowedProbe: true }], ['GET', '/users'],
  ['GET', '/firm-settings', { roles: SA }], ['PUT', '/firm-settings', { roles: SA, safeAllowedProbe: false }],
  ['GET', `/conversations/${fakeId}/messages`, { expected: [200, 403, 404] }],
  ['POST', `/conversations/${fakeId}/messages`, { safeAllowedProbe: true, expected: [400, 403, 404] }],
  ['POST', `/conversations/${fakeId}/read`, { safeAllowedProbe: true, expected: [200, 403, 404] }],
  ['PATCH', `/messages/${fakeId}`, { safeAllowedProbe: true, expected: [400, 403, 404] }],
  ['DELETE', `/messages/${fakeId}`, { safeAllowedProbe: true, expected: [400, 403, 404] }],
]);
add('/currency-rates', ALL, [['GET', ''], ['POST', '', { safeAllowedProbe: true }]]);
add('/employees', ALL, [
  ['GET', ''], ['POST', '', { safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }],
  ['GET', `/${fakeId}/salary-history`, { expected: [403, 404] }],
  ['PATCH', `/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }],
  ['DELETE', `/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }],
]);
add('/firms', ALL, [
  ['GET', ''], ['POST', '', { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['PATCH', `/${fakeId}`, { roles: ['SUPERADMIN', 'FIRM'], safeAllowedProbe: true }], ['DELETE', `/${fakeId}`, { roles: SA, safeAllowedProbe: true }],
  ['GET', `/${fakeId}`, { expected: [403, 404] }],
]);
add('/flights', ALL, [
  ['GET', ''], ['GET', `/${fakeId}`, { expected: [404] }],
  ['POST', '', { roles: FIRM, safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['PUT', `/${fakeId}`, { safeAllowedProbe: true }], ['DELETE', `/${fakeId}`, { safeAllowedProbe: true }],
]);
add('/invites', ALL, [
  ['POST', '', { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['POST', '/accept', { authenticated: false, expected: [400], safeAllowedProbe: true }],
]);
add('/inventory', ALL, [
  ['GET', '/bootstrap?firmId=__ACCESSIBLE_FIRM__'],
  ['GET', '/dashboard?firmId=__ACCESSIBLE_FIRM__'],
  ['GET', '/products?firmId=__ACCESSIBLE_FIRM__'],
  ['POST', '/products', { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['PATCH', `/products/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['DELETE', `/products/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['POST', '/categories', { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['PATCH', `/categories/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['DELETE', `/categories/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['POST', '/units', { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['PATCH', `/units/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['DELETE', `/units/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['GET', '/stock?firmId=__ACCESSIBLE_FIRM__'],
  ['GET', '/reports?firmId=__ACCESSIBLE_FIRM__'],
  ['GET', '/documents?firmId=__ACCESSIBLE_FIRM__'],
  ['POST', '/documents/apply', { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['POST', `/documents/${fakeId}/cancel`, { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['GET', '/reservations?firmId=__ACCESSIBLE_FIRM__'],
  ['POST', '/reservations', { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['POST', `/reservations/${fakeId}/release`, { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['GET', `/${fakeId}`, { expected: [403, 404] }],
  ['POST', `/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
]);
add('/kassa', ALL, [
  ['GET', `?date=${new Date().toISOString().slice(0, 10)}`], ['GET', '/history'], ['GET', '/desks'], ['GET', '/cards'],
  ['POST', '/desks', { safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }],
  ['PATCH', `/desks/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }],
  ['POST', '/cards', { safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }],
  ['PATCH', `/cards/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }],
  ['DELETE', `/cards/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }],
  ['POST', '/open', { safeAllowedProbe: false }], ['POST', '/close', { safeAllowedProbe: false }],
  ['POST', '/reopen', { safeAllowedProbe: false }],
  ['POST', '/transfers', { safeAllowedProbe: true }],
]);
add('/logs', SA, [['GET', '/errors'], ['POST', `/errors/${fakeId}/resolve`, { safeAllowedProbe: true }]]);
add('/notifications', ALL, [
  ['GET', ''], ['POST', '/read-all', { safeAllowedProbe: false }],
  ['POST', `/${fakeId}/read`, { safeAllowedProbe: true, expected: [404] }],
]);
add('/payments', ALL, [['POST', '', { safeAllowedProbe: true }]]);
add('/reports', ALL, [
  ['GET', '/flight', { expected: [200, 400] }], ['POST', '/flight/reconcile', { safeAllowedProbe: true }],
  ['GET', '/firm', { expected: [200, 400] }], ['GET', '/payments'], ['GET', '/transactions'], ['GET', '/interactions', { roles: SA }],
  ['GET', '/monthly'], ['GET', '/calendar'], ['GET', '/dashboard'], ['GET', '/analytics'],
  ['GET', '/agents', { expected: [200, 400] }],
  ['GET', '/financial-health'], ['GET', '/profitability'], ['GET', '/cash-flow'],
  ['GET', '/receivables'], ['GET', '/payables'], ['GET', '/flight-profitability'], ['GET', '/expense-estimate'],
  ['GET', `/expense-estimate/categories/${fakeId}/details`, { expected: [200, 400, 403, 404] }],
  ['GET', '/product-metrics', { roles: SA }], ['POST', '/data-transfer-event', { safeAllowedProbe: false }],
]);
add('/search', ALL, [['GET', '?q=QA']]);
add('/services', ALL, [
  ['GET', ''], ['POST', '', { roles: FIRM, safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['PATCH', `/${fakeId}`, { roles: ['SUPERADMIN', 'FIRM'], safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }],
  ['DELETE', `/${fakeId}`, { roles: ['SUPERADMIN', 'FIRM'], safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }],
  ['POST', `/${fakeId}/assign`, { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['PATCH', `/assignments/${fakeId}/status`, { safeAllowedProbe: true }],
]);
add('/site-content', ALL, [
  ['GET', '/login-page', { authenticated: false, expected: [200] }],
  ['PUT', '/login-page', { roles: SA, safeAllowedProbe: false }],
]);
add('/telegram', ALL, [
  ['GET', '/status'], ['POST', '/link', { safeAllowedProbe: true }],
  ['PATCH', '/preferences', { safeAllowedProbe: false }], ['DELETE', '/connection', { safeAllowedProbe: false }],
]);
add('/tickets', ALL, [
  ['GET', ''], ['GET', '/allocation-targets?sourceFirmId=__ACCESSIBLE_FIRM__', { businessDeniedActors: ['kassir'] }], ['GET', '/allocations'], ['GET', '/allocation-change-requests'],
  ['POST', `/allocations/${fakeId}/change-requests`, { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['POST', `/allocation-change-requests/${fakeId}/approve`, { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['POST', `/allocation-change-requests/${fakeId}/reject`, { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['POST', '', { roles: FIRM, safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['POST', '/allocate', { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['POST', '/confirm', { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['POST', '/reject', { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['POST', '/deallocate', { roles: SA_ADMIN, safeAllowedProbe: true }],
  ['POST', '/sell', { safeAllowedProbe: true }], ['POST', '/cancel-sale', { roles: SA_ADMIN, safeAllowedProbe: true }],
  ['GET', '/cancel-sale-requests'], ['POST', '/cancel-sale-requests', { roles: FIRM, safeAllowedProbe: true }],
  ['POST', '/cancel-sale-requests/approve', { roles: SA_ADMIN, safeAllowedProbe: true }],
]);
add('/tour-packages', ALL, [
  ['GET', '/firms'], ['GET', '/services', { roles: FIRM }], ['GET', '/flights', { roles: FIRM }],
  ['GET', ''], ['POST', '', { roles: FIRM, safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
  ['GET', '/sales'], ['PUT', `/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['admin', 'kassir'] }],
  ['PATCH', `/sales/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['admin', 'kassir'] }],
  ['DELETE', `/sales/${fakeId}`, { safeAllowedProbe: true, businessDeniedActors: ['admin', 'kassir'] }],
  ['POST', `/${fakeId}/cancel`, { safeAllowedProbe: true, businessDeniedActors: ['admin', 'kassir'] }],
  ['POST', `/${fakeId}/sell`, { safeAllowedProbe: true, businessDeniedActors: ['kassir'] }],
]);
add('/transactions', ALL, [
  ['GET', '?page=1&limit=20'],
  ['POST', '', { safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }],
  ['POST', '/cash', { safeAllowedProbe: true }],
  ['POST', '/account', { safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }],
  ['POST', '/finance/preview', { safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }],
  ['POST', '/finance', { safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }],
  ['POST', `/${fakeId}/reversal`, { safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }],
  ['POST', '/import/historical-kassa', { safeAllowedProbe: true }],
  ['PATCH', `/${fakeId}/daily-cash`, { safeAllowedProbe: true }],
  ['DELETE', `/${fakeId}/daily-cash`, { safeAllowedProbe: true }],
  ['DELETE', `/${fakeId}`, { roles: ['SUPERADMIN', 'FIRM'], safeAllowedProbe: true, businessDeniedActors: ['manager', 'kassir'] }],
  ['GET', `/${fakeId}`, { expected: [404] }],
]);

if (process.argv.includes('--list-contracts')) {
  console.log(JSON.stringify(contracts.map(({ method, path }) => ({ method, path }))));
  process.exit(0);
}

const results = [];
const sessions = {};
const actorFirmIds = {};

async function fetchWithTimeout(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${base}/api${path}`, { ...init, redirect: 'manual', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithTransportRetry(path, init = {}) {
  try {
    return await fetchWithTimeout(path, init);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return fetchWithTimeout(path, init);
  }
}

function responseCookie(response, name) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  for (const value of values) {
    const match = value.match(new RegExp(`(?:^|,\\s*)${name}=([^;]+)`));
    if (match) return `${name}=${match[1]}`;
  }
  return '';
}

async function probe(contract, actorName, expected, reason) {
  const session = actorName === 'public' ? '' : sessions[actorName];
  const body = contract.method === 'GET' ? undefined : (contract.body ?? {});
  const path = contract.path.replace('__ACCESSIBLE_FIRM__', actorFirmIds[actorName] || fakeId);
  try {
    const response = await fetchWithTransportRetry(path, {
      method: contract.method,
      headers: {
        ...(session ? { Cookie: session, 'X-ADO-CSRF': '1' } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const ok = expected.includes(response.status);
    results.push({ method: contract.method, path, actor: actorName, reason, expected, status: response.status, ok, detail: ok ? '' : text.slice(0, 300) });
  } catch (error) {
    results.push({ method: contract.method, path, actor: actorName, reason, expected, status: 0, ok: false, detail: String(error) });
  }
}

for (const [actorName, actor] of Object.entries(actors)) {
  try {
    const response = await fetchWithTransportRetry('/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: actor.email, password }),
    });
    let data = await response.json();
    let status = response.status;
    if (status === 200 && data.verificationRequired && data.challengeTicket) {
      const verificationResponse = await fetchWithTransportRetry('/auth/device/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeTicket: data.challengeTicket, code: qaLoginCode }),
      });
      data = await verificationResponse.json();
      status = verificationResponse.status;
      sessions[actorName] = responseCookie(verificationResponse, 'ado_session');
    }
    results.push({ method: 'POST', path: '/auth/login', actor: actorName, reason: 'qa-login', expected: [200], status, ok: status === 200 && Boolean(sessions[actorName]) && Boolean(data.user), detail: data.error || '' });
  } catch (error) {
    results.push({ method: 'POST', path: '/auth/login', actor: actorName, reason: 'qa-login', expected: [200], status: 0, ok: false, detail: String(error) });
  }
}

for (const actorName of Object.keys(actors)) {
  if (!sessions[actorName]) continue;
  try {
    const response = await fetchWithTransportRetry('/firms', { headers: { Cookie: sessions[actorName] } });
    const data = await response.json();
    actorFirmIds[actorName] = Array.isArray(data) ? data[0]?.id : undefined;
  } catch {
    actorFirmIds[actorName] = undefined;
  }
}

const jobs = [];
for (const contract of contracts) {
  if (contract.authenticated) jobs.push(() => probe(contract, 'public', [401], 'authentication'));
  else jobs.push(() => probe(contract, 'public', contract.expected, 'public-contract'));

  if (!contract.authenticated) continue;
  for (const [actorName, actor] of Object.entries(actors)) {
    if (!contract.roles.includes(actor.role)) {
      jobs.push(() => probe(contract, actorName, [403], 'route-rbac'));
    } else if (contract.safeAllowedProbe) {
      const businessDenied = contract.businessDeniedActors.includes(actorName);
      const expected = businessDenied && contract.method === 'GET' ? [403] : contract.expected;
      jobs.push(() => probe(contract, actorName, expected, businessDenied && contract.method === 'GET' ? 'business-rbac' : contract.method === 'GET' ? 'allowed-contract' : 'mutation-safety'));
    }
  }
}

const concurrency = Math.max(1, Number(process.env.DEV_AUDIT_CONCURRENCY || 8));
let cursor = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < jobs.length) {
    const job = jobs[cursor++];
    await job();
  }
}));

const failures = results.filter((row) => !row.ok);
const coverage = {
  endpointContracts: contracts.length,
  totalProbes: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  skippedAllowedMutationProbes: contracts.filter((contract) => contract.authenticated && !contract.safeAllowedProbe).length,
};

console.log(JSON.stringify({ base, coverage, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
