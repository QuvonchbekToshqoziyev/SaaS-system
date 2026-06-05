import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function stripTrailingSlash(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    strict: args.has('--strict') || process.env.PROD_TESTER_STRICT === '1',
    inviteFlow: args.has('--invite-flow') || process.env.PROD_TESTER_INVITE_FLOW === '1',
    workflow: args.has('--workflow') || process.env.PROD_TESTER_WORKFLOW === '1',
  };
}

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  assertOk(typeof fetch === 'function', 'This script requires Node.js 18+ (global fetch).');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function getEtag(base, pathName) {
  const url = `${base}${pathName}`;

  let res;
  try {
    res = await fetchWithTimeout(url, { method: 'HEAD', redirect: 'follow' });
  } catch {
    res = null;
  }

  if (!res || !res.ok) {
    res = await fetchWithTimeout(url, { method: 'GET', redirect: 'follow' });
  }

  const etag = (res.headers.get('etag') || '').trim();
  return etag || null;
}

async function getHtml(base, pathName) {
  const url = `${base}${pathName}`;
  const res = await fetchWithTimeout(url, { method: 'GET', redirect: 'follow' });
  const text = await res.text();
  return { res, text };
}

async function checkNotNextError(base, pathName) {
  const url = `${base}${pathName}`;
  process.stdout.write(`==> GET ${url}\n`);
  const { res, text } = await getHtml(base, pathName);
  if (!res.ok) throw new Error(`${pathName} returned HTTP ${res.status}`);
  if (text.includes('<html id="__next_error__">')) {
    throw new Error(`${pathName} is a Next error page`);
  }
}

async function checkDeepLinkNotFallback(base, pathName, rootEtag) {
  const etag = await getEtag(base, pathName);
  if (!etag) throw new Error(`${pathName} missing ETag (unexpected)`);
  if (etag === rootEtag) throw new Error(`${pathName} appears to be falling back to / (same ETag)`);
}

async function checkApiReachable(apiBase) {
  const url = `${apiBase}/auth/login`;
  process.stdout.write(`==> POST ${url} (expect 401/400)\n`);

  const { res, json } = await postJson(apiBase, '/auth/login', {
    email: `__prod_tester_invalid__@example.com`,
    password: 'invalid',
  });

  if (![400, 401].includes(res.status)) {
    throw new Error(`Unexpected status from /auth/login with invalid creds: ${res.status} ${JSON.stringify(json)}`);
  }
}

async function postJson(apiBase, pathName, body, { token } = {}) {
  const res = await fetchWithTimeout(`${apiBase}${pathName}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { res, json };
}

async function getJson(apiBase, pathName, { token } = {}) {
  const res = await fetchWithTimeout(`${apiBase}${pathName}`, {
    method: 'GET',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { res, json };
}

async function strictAuthChecks(apiBase) {
  const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'admin@airline.com';
  const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'superadmin123';

  process.stdout.write('==> POST /auth/login (superadmin)\n');
  const login = await postJson(apiBase, '/auth/login', { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD });
  if (!login.res.ok || !login.json?.token) {
    throw new Error(`Superadmin login failed: ${login.res.status} ${JSON.stringify(login.json)}`);
  }

  const token = login.json.token;

  process.stdout.write('==> GET /auth/users (admin-only)\n');
  const usersRes = await fetchWithTimeout(`${apiBase}/auth/users`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  });

  const text = await usersRes.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }

  if (!usersRes.ok) {
    throw new Error(`/auth/users failed: ${usersRes.status} ${JSON.stringify(json)}`);
  }

  process.stdout.write('==> POST /auth/change-password (invalid body -> 400)\n');
  const changePwMissing = await postJson(apiBase, '/auth/change-password', {}, { token });
  if (changePwMissing.res.status !== 400) {
    throw new Error(`/auth/change-password expected 400: ${changePwMissing.res.status} ${JSON.stringify(changePwMissing.json)}`);
  }

  process.stdout.write('==> POST /auth/change-password (wrong current password -> 401)\n');
  const changePwWrong = await postJson(
    apiBase,
    '/auth/change-password',
    {
      currentPassword: `${SUPERADMIN_PASSWORD}__wrong__`,
      newPassword: 'NewPassword#123',
    },
    { token },
  );
  if (changePwWrong.res.status !== 401) {
    throw new Error(`/auth/change-password expected 401: ${changePwWrong.res.status} ${JSON.stringify(changePwWrong.json)}`);
  }

  // Additional strict checks for newer features (read-only).
  const now = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  process.stdout.write(`==> GET /reports/calendar?month=${monthKey}\n`);
  const calendarRes = await getJson(apiBase, `/reports/calendar?month=${encodeURIComponent(monthKey)}`, { token });
  if (!calendarRes.res.ok) {
    throw new Error(`/reports/calendar failed: ${calendarRes.res.status} ${JSON.stringify(calendarRes.json)}`);
  }
  if (calendarRes.json?.month !== monthKey) {
    throw new Error(`/reports/calendar unexpected month: ${JSON.stringify(calendarRes.json)}`);
  }
  if (!Array.isArray(calendarRes.json?.flights) || !Array.isArray(calendarRes.json?.transactions) || !Array.isArray(calendarRes.json?.currencyRates)) {
    throw new Error(`/reports/calendar unexpected shape: ${JSON.stringify(calendarRes.json)}`);
  }

  process.stdout.write('==> GET /reports/dashboard\n');
  const dashboardRes = await getJson(apiBase, '/reports/dashboard', { token });
  if (!dashboardRes.res.ok) {
    throw new Error(`/reports/dashboard failed: ${dashboardRes.res.status} ${JSON.stringify(dashboardRes.json)}`);
  }
  if (typeof dashboardRes.json?.role !== 'string') {
    throw new Error(`/reports/dashboard unexpected shape: ${JSON.stringify(dashboardRes.json)}`);
  }

  process.stdout.write('==> GET /reports/transactions\n');
  const txReportRes = await getJson(apiBase, '/reports/transactions', { token });
  if (!txReportRes.res.ok) {
    throw new Error(`/reports/transactions failed: ${txReportRes.res.status} ${JSON.stringify(txReportRes.json)}`);
  }
  if (typeof txReportRes.json?.totals?.count !== 'number' || typeof txReportRes.json?.totals?.totalBaseAmount !== 'number') {
    throw new Error(`/reports/transactions unexpected shape: ${JSON.stringify(txReportRes.json)}`);
  }

  process.stdout.write('==> GET /reports/payments\n');
  const paymentsReportRes = await getJson(apiBase, '/reports/payments', { token });
  if (!paymentsReportRes.res.ok) {
    throw new Error(`/reports/payments failed: ${paymentsReportRes.res.status} ${JSON.stringify(paymentsReportRes.json)}`);
  }
  if (typeof paymentsReportRes.json?.totals?.count !== 'number' || typeof paymentsReportRes.json?.totals?.totalBaseAmount !== 'number') {
    throw new Error(`/reports/payments unexpected shape: ${JSON.stringify(paymentsReportRes.json)}`);
  }

  process.stdout.write('==> GET /reports/interactions (superadmin-only)\n');
  const interactionsRes = await getJson(apiBase, '/reports/interactions', { token });
  if (!interactionsRes.res.ok) {
    throw new Error(`/reports/interactions failed: ${interactionsRes.res.status} ${JSON.stringify(interactionsRes.json)}`);
  }
  if (
    typeof interactionsRes.json?.totals !== 'object' ||
    !Array.isArray(interactionsRes.json?.pairs)
  ) {
    throw new Error(`/reports/interactions unexpected shape: ${JSON.stringify(interactionsRes.json)}`);
  }

  process.stdout.write('==> GET /reports/monthly\n');
  const monthlyRes = await getJson(apiBase, '/reports/monthly', { token });
  if (!monthlyRes.res.ok) {
    throw new Error(`/reports/monthly failed: ${monthlyRes.res.status} ${JSON.stringify(monthlyRes.json)}`);
  }
  if (!Array.isArray(monthlyRes.json)) {
    throw new Error(`/reports/monthly unexpected shape: ${JSON.stringify(monthlyRes.json)}`);
  }

  process.stdout.write('==> GET /flights (for /reports/flight sanity)\n');
  const flightsRes = await getJson(apiBase, '/flights', { token });
  if (!flightsRes.res.ok) {
    throw new Error(`/flights failed: ${flightsRes.res.status} ${JSON.stringify(flightsRes.json)}`);
  }
  const flights = Array.isArray(flightsRes.json) ? flightsRes.json : [];
  const sampleFlightId = flights.length > 0 ? String(flights[0]?.id || '') : '';

  if (sampleFlightId) {
    process.stdout.write(`==> GET /flights/${sampleFlightId}\n`);
    const flightByIdRes = await getJson(apiBase, `/flights/${encodeURIComponent(sampleFlightId)}`, { token });
    if (!flightByIdRes.res.ok) {
      throw new Error(`/flights/:id failed: ${flightByIdRes.res.status} ${JSON.stringify(flightByIdRes.json)}`);
    }
    if (String(flightByIdRes.json?.id || '') !== sampleFlightId) {
      throw new Error(`/flights/:id unexpected payload: ${JSON.stringify(flightByIdRes.json)}`);
    }
  }

  process.stdout.write(`==> GET /reports/flight${sampleFlightId ? `?flightId=${sampleFlightId}` : ''}\n`);
  const flightReportPath = sampleFlightId
    ? `/reports/flight?flightId=${encodeURIComponent(sampleFlightId)}`
    : '/reports/flight';
  const flightReportRes = await getJson(apiBase, flightReportPath, { token });
  if (!flightReportRes.res.ok) {
    throw new Error(`/reports/flight failed: ${flightReportRes.res.status} ${JSON.stringify(flightReportRes.json)}`);
  }
  if (typeof flightReportRes.json?.debt !== 'number' || typeof flightReportRes.json?.revenue !== 'number') {
    throw new Error(`/reports/flight unexpected shape: ${JSON.stringify(flightReportRes.json)}`);
  }

  process.stdout.write('==> GET /firms (admin-only)\n');
  const firmsRes = await getJson(apiBase, '/firms', { token });
  if (!firmsRes.res.ok) {
    throw new Error(`/firms failed: ${firmsRes.res.status} ${JSON.stringify(firmsRes.json)}`);
  }
  const firms = Array.isArray(firmsRes.json) ? firmsRes.json : [];
  const sampleFirmId = firms.length > 0 ? String(firms[0]?.id || '') : '';

  if (sampleFirmId) {
    process.stdout.write(`==> GET /firms/${sampleFirmId}\n`);
    const firmByIdRes = await getJson(apiBase, `/firms/${encodeURIComponent(sampleFirmId)}`, { token });
    if (!firmByIdRes.res.ok) {
      throw new Error(`/firms/:id failed: ${firmByIdRes.res.status} ${JSON.stringify(firmByIdRes.json)}`);
    }
    if (String(firmByIdRes.json?.id || '') !== sampleFirmId) {
      throw new Error(`/firms/:id unexpected payload: ${JSON.stringify(firmByIdRes.json)}`);
    }
  }

  if (sampleFirmId) {
    process.stdout.write(`==> GET /reports/firm?firmId=${sampleFirmId}\n`);
    const firmReportRes = await getJson(apiBase, `/reports/firm?firmId=${encodeURIComponent(sampleFirmId)}`, { token });
    if (!firmReportRes.res.ok) {
      throw new Error(`/reports/firm failed: ${firmReportRes.res.status} ${JSON.stringify(firmReportRes.json)}`);
    }
    if (firmReportRes.json?.firm?.id !== sampleFirmId) {
      throw new Error(`/reports/firm unexpected firm: ${JSON.stringify(firmReportRes.json)}`);
    }
  }

  process.stdout.write('==> GET /currency-rates (auth)\n');
  const ratesRes = await getJson(apiBase, '/currency-rates', { token });
  if (!ratesRes.res.ok) {
    throw new Error(`/currency-rates failed: ${ratesRes.res.status} ${JSON.stringify(ratesRes.json)}`);
  }

  process.stdout.write('==> POST /currency-rates (invalid body -> 400)\n');
  const rateInvalid = await postJson(apiBase, '/currency-rates', { baseCurrency: 'USD' }, { token });
  if (rateInvalid.res.status !== 400) {
    throw new Error(`/currency-rates expected 400: ${rateInvalid.res.status} ${JSON.stringify(rateInvalid.json)}`);
  }

  process.stdout.write('==> GET /tickets (auth)\n');
  const ticketsRes = await getJson(apiBase, '/tickets', { token });
  if (!ticketsRes.res.ok) {
    throw new Error(`/tickets failed: ${ticketsRes.res.status} ${JSON.stringify(ticketsRes.json)}`);
  }
  if (!Array.isArray(ticketsRes.json)) {
    throw new Error(`/tickets unexpected shape: ${JSON.stringify(ticketsRes.json)}`);
  }

  process.stdout.write('==> POST /tickets (invalid body -> 400)\n');
  const createTicketsInvalid = await postJson(apiBase, '/tickets', {}, { token });
  if (createTicketsInvalid.res.status !== 400) {
    throw new Error(`/tickets create expected 400: ${createTicketsInvalid.res.status} ${JSON.stringify(createTicketsInvalid.json)}`);
  }

  process.stdout.write('==> POST /tickets/allocate (invalid body -> 400)\n');
  const allocateInvalid = await postJson(apiBase, '/tickets/allocate', {}, { token });
  if (allocateInvalid.res.status !== 400) {
    throw new Error(`/tickets/allocate expected 400: ${allocateInvalid.res.status} ${JSON.stringify(allocateInvalid.json)}`);
  }

  process.stdout.write('==> POST /tickets/confirm (superadmin -> 403)\n');
  const confirmForbidden = await postJson(apiBase, '/tickets/confirm', {}, { token });
  if (confirmForbidden.res.status !== 403) {
    throw new Error(`/tickets/confirm expected 403: ${confirmForbidden.res.status} ${JSON.stringify(confirmForbidden.json)}`);
  }

  process.stdout.write('==> POST /tickets/deallocate (invalid body -> 400)\n');
  const deallocateInvalid = await postJson(apiBase, '/tickets/deallocate', {}, { token });
  if (deallocateInvalid.res.status !== 400) {
    throw new Error(`/tickets/deallocate expected 400: ${deallocateInvalid.res.status} ${JSON.stringify(deallocateInvalid.json)}`);
  }

  process.stdout.write('==> POST /tickets/sell (invalid body -> 400)\n');
  const sellInvalid = await postJson(apiBase, '/tickets/sell', {}, { token });
  if (sellInvalid.res.status !== 400) {
    throw new Error(`/tickets/sell expected 400: ${sellInvalid.res.status} ${JSON.stringify(sellInvalid.json)}`);
  }

  process.stdout.write('==> POST /payments (invalid body -> 400)\n');
  const paymentInvalid = await postJson(apiBase, '/payments', {}, { token });
  if (paymentInvalid.res.status !== 400) {
    throw new Error(`/payments expected 400: ${paymentInvalid.res.status} ${JSON.stringify(paymentInvalid.json)}`);
  }

  process.stdout.write('==> GET /transactions (auth)\n');
  const transactionsRes = await getJson(apiBase, '/transactions?page=1&limit=5', { token });
  if (!transactionsRes.res.ok) {
    throw new Error(`/transactions failed: ${transactionsRes.res.status} ${JSON.stringify(transactionsRes.json)}`);
  }
  if (!Array.isArray(transactionsRes.json?.data) || typeof transactionsRes.json?.meta?.total !== 'number') {
    throw new Error(`/transactions unexpected shape: ${JSON.stringify(transactionsRes.json)}`);
  }

  const sampleTransactionId = transactionsRes.json.data?.[0]?.id ? String(transactionsRes.json.data[0].id) : '';
  if (sampleTransactionId) {
    process.stdout.write(`==> GET /transactions/${sampleTransactionId}\n`);
    const transactionByIdRes = await getJson(apiBase, `/transactions/${encodeURIComponent(sampleTransactionId)}`, { token });
    if (!transactionByIdRes.res.ok) {
      throw new Error(`/transactions/:id failed: ${transactionByIdRes.res.status} ${JSON.stringify(transactionByIdRes.json)}`);
    }
    if (String(transactionByIdRes.json?.id || '') !== sampleTransactionId) {
      throw new Error(`/transactions/:id unexpected payload: ${JSON.stringify(transactionByIdRes.json)}`);
    }
  }

  process.stdout.write('==> POST /invites (invalid body -> 400)\n');
  const inviteInvalid = await postJson(apiBase, '/invites', {}, { token });
  if (inviteInvalid.res.status !== 400) {
    throw new Error(`/invites expected 400: ${inviteInvalid.res.status} ${JSON.stringify(inviteInvalid.json)}`);
  }

  process.stdout.write('==> POST /invites/accept (invalid body -> 400)\n');
  const acceptInvalid = await postJson(apiBase, '/invites/accept', {}, {});
  if (acceptInvalid.res.status !== 400) {
    throw new Error(`/invites/accept expected 400: ${acceptInvalid.res.status} ${JSON.stringify(acceptInvalid.json)}`);
  }

  process.stdout.write('==> GET /logs/errors (superadmin-only)\n');
  const logsRes = await getJson(apiBase, '/logs/errors?status=all', { token });
  if (!logsRes.res.ok) {
    throw new Error(`/logs/errors failed: ${logsRes.res.status} ${JSON.stringify(logsRes.json)}`);
  }
  if (typeof logsRes.json?.counts !== 'object' || !Array.isArray(logsRes.json?.errors)) {
    throw new Error(`/logs/errors unexpected shape: ${JSON.stringify(logsRes.json)}`);
  }

  process.stdout.write('==> POST /logs/errors/:id/resolve (missing id -> 404)\n');
  const resolveRes = await postJson(apiBase, '/logs/errors/__missing__/resolve', { note: 'test' }, { token });
  if (resolveRes.res.status !== 404) {
    throw new Error(`/logs/errors/:id/resolve expected 404: ${resolveRes.res.status} ${JSON.stringify(resolveRes.json)}`);
  }

  process.stdout.write('==> DELETE /flights/:id (missing flight -> 404)\n');
  const deleteMissingRes = await fetchWithTimeout(`${apiBase}/flights/__missing__`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
  if (deleteMissingRes.status !== 404) {
    const text = await deleteMissingRes.text();
    throw new Error(`/flights/:id delete expected 404: ${deleteMissingRes.status} ${text}`);
  }
}

async function runInviteFlow(repoRoot, env) {
  const script = path.join(repoRoot, 'scripts', 'prod-invite-flow.mjs');

  process.stdout.write('==> Running invite flow script\n');

  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('error', reject);
    child.on('close', (c) => resolve(c ?? 1));
  });

  if (code !== 0) {
    throw new Error(`Invite flow script failed (exit ${code})`);
  }
}

async function runWorkflow(repoRoot, env) {
  const script = path.join(repoRoot, 'scripts', 'prod-workflow.mjs');

  process.stdout.write('==> Running workflow script\n');

  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('error', reject);
    child.on('close', (c) => resolve(c ?? 1));
  });

  if (code !== 0) {
    throw new Error(`Workflow script failed (exit ${code})`);
  }
}

async function main() {
  const { strict, inviteFlow, workflow } = parseArgs(process.argv);

  const rawBase = process.env.PROD_BASE_URL || process.env.BASE_URL || 'https://quvonchbek.me';
  const BASE = stripTrailingSlash(rawBase.trim());
  const API = `${BASE}/api`;

  process.stdout.write(`BASE=${BASE}\n`);
  process.stdout.write(`API=${API}\n`);
  process.stdout.write(
    `MODE=${strict ? 'strict' : 'smoke'}${inviteFlow ? '+invite-flow' : ''}${workflow ? '+workflow' : ''}\n\n`,
  );

  const failures = [];

  // Website smoke
  try {
    const rootEtag = await getEtag(BASE, '/');
    if (!rootEtag) throw new Error('could not read root ETag');

    await checkNotNextError(BASE, '/login/');
    await checkNotNextError(BASE, '/admin/');

    await checkDeepLinkNotFallback(BASE, '/firms/', rootEtag);
    await checkDeepLinkNotFallback(BASE, '/firm/', rootEtag);
    await checkDeepLinkNotFallback(BASE, '/settings/', rootEtag);
    await checkDeepLinkNotFallback(BASE, '/flights/', rootEtag);
    await checkDeepLinkNotFallback(BASE, '/flights/detail/', rootEtag);
    await checkDeepLinkNotFallback(BASE, '/transactions/', rootEtag);
    await checkDeepLinkNotFallback(BASE, '/transactions/detail/', rootEtag);
    await checkDeepLinkNotFallback(BASE, '/reports/', rootEtag);
    await checkDeepLinkNotFallback(BASE, '/invite/', rootEtag);
    await checkDeepLinkNotFallback(BASE, '/invite/accept/', rootEtag);

    process.stdout.write('OK website smoke\n');
  } catch (err) {
    failures.push(`Website smoke failed: ${err?.message || err}`);
  }

  // Always check API is reachable
  try {
    await checkApiReachable(API);
    process.stdout.write('OK API reachable\n');
  } catch (err) {
    failures.push(`API reachable check failed: ${err?.message || err}`);
  }

  // Optional strict checks
  if (strict) {
    try {
      await strictAuthChecks(API);
      process.stdout.write('OK strict auth checks\n');
    } catch (err) {
      failures.push(`Strict auth checks failed: ${err?.message || err}`);
    }
  }

  // Optional invite flow
  if (inviteFlow) {
    try {
      const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
      const env = { ...process.env, PROD_BASE_URL: BASE };
      await runInviteFlow(repoRoot, env);
      process.stdout.write('OK invite flow\n');
    } catch (err) {
      failures.push(`Invite flow failed: ${err?.message || err}`);
    }
  }

  // Optional workflow
  if (workflow) {
    try {
      const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
      const env = { ...process.env, PROD_BASE_URL: BASE };
      await runWorkflow(repoRoot, env);
      process.stdout.write('OK workflow\n');
    } catch (err) {
      failures.push(`Workflow failed: ${err?.message || err}`);
    }
  }

  process.stdout.write('\n');
  if (failures.length) {
    for (const f of failures) process.stderr.write(`FAIL ${f}\n`);
    process.stderr.write(`\nProduction tests FAILED (${failures.length}).\n`);
    process.exit(1);
  }

  process.stdout.write('Production tests passed.\n');
}

main().catch((err) => {
  process.stderr.write(`FAIL ${err?.message || err}\n`);
  process.exit(1);
});
