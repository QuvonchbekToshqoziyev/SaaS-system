import crypto from 'node:crypto';

function stripTrailingSlash(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  assertOk(typeof fetch === 'function', 'This script requires Node.js 18+ (global fetch).');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonSafe(res) {
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { text, json };
}

async function postJson(apiBase, pathName, body, { token, headers } = {}) {
  const res = await fetchWithTimeout(`${apiBase}${pathName}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    body: JSON.stringify(body),
  });
  const { json } = await readJsonSafe(res);
  return { res, json };
}

async function getJson(apiBase, pathName, { token, headers } = {}) {
  const res = await fetchWithTimeout(`${apiBase}${pathName}`, {
    method: 'GET',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
  });
  const { json } = await readJsonSafe(res);
  return { res, json };
}

function ymdUtc(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nearlyEqual(a, b, tol = 0.01) {
  return Math.abs(Number(a) - Number(b)) <= tol;
}

async function login(apiBase, email, password) {
  const { res, json } = await postJson(apiBase, '/auth/login', { email, password });
  assertOk(res.ok, `Login failed: ${res.status} ${JSON.stringify({ error: json?.error })}`);
  assertOk(json?.token, 'Login response missing token');
  return { token: json.token, user: json.user };
}

async function ensureFirmSession(apiBase, baseOrigin, adminToken) {
  const firmEmail = process.env.FIRM_EMAIL || process.env.TEST_FIRM_EMAIL || '';
  const firmPassword = process.env.FIRM_PASSWORD || process.env.TEST_FIRM_PASSWORD || '';

  if (firmEmail && firmPassword) {
    process.stdout.write('==> POST /auth/login (firm, persistent)\n');
    const firmLogin = await login(apiBase, firmEmail, firmPassword);
    const firmId = firmLogin.user?.firmId ? String(firmLogin.user.firmId) : '';
    assertOk(firmId, 'Firm login returned missing firmId');
    return { token: firmLogin.token, firmId, email: firmEmail };
  }

  process.stdout.write('==> Creating ephemeral firm user via invite flow\n');

  const runId = new Date().toISOString().replace(/[:.TZ-]/g, '').slice(0, 14);
  const email = `firm.e2e.${runId}.${crypto.randomBytes(2).toString('hex')}@example.com`;
  const password = `Firm#${crypto.randomBytes(6).toString('hex')}`;
  const firmName = process.env.FIRM_NAME || process.env.TEST_FIRM_NAME || `Firm E2E ${runId}`;

  const inviteRes = await postJson(
    apiBase,
    '/invites',
    { email, role: 'FIRM', firmName },
    { token: adminToken, headers: { origin: baseOrigin } },
  );
  assertOk(inviteRes.res.ok, `Create invite failed: ${inviteRes.res.status} ${JSON.stringify(inviteRes.json)}`);

  const inviteId = inviteRes.json?.inviteId;
  const inviteToken = inviteRes.json?.token;
  assertOk(inviteId && inviteToken, `Create invite response missing inviteId/token: ${JSON.stringify(inviteRes.json)}`);

  const acceptRes = await postJson(apiBase, '/invites/accept', { id: inviteId, token: inviteToken, password });
  assertOk(acceptRes.res.ok, `Accept invite failed: ${acceptRes.res.status} ${JSON.stringify(acceptRes.json)}`);

  process.stdout.write('==> POST /auth/login (firm, ephemeral)\n');
  const firmLogin = await login(apiBase, email, password);
  const firmId = firmLogin.user?.firmId ? String(firmLogin.user.firmId) : '';
  assertOk(firmId, 'Firm login returned missing firmId');

  return { token: firmLogin.token, firmId, email };
}

async function main() {
  const rawBase = process.env.PROD_BASE_URL || process.env.BASE_URL || 'https://quvonchbek.me';
  const BASE = stripTrailingSlash(String(rawBase).trim());
  const API = `${BASE}/api`;

  const allowMutations = process.env.PROD_WORKFLOW_MUTATE === '1' || process.env.PROD_TESTER_MUTATING === '1';
  assertOk(
    allowMutations,
    'Refusing to run mutating workflow. Set PROD_WORKFLOW_MUTATE=1 to proceed.',
  );

  const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'admin@airline.com';
  const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'superadmin123';

  process.stdout.write(`BASE=${BASE}\n`);
  process.stdout.write(`API=${API}\n`);
  process.stdout.write('MODE=workflow(mutating)\n\n');

  // 1) Superadmin login
  process.stdout.write('==> POST /auth/login (superadmin)\n');
  const adminSession = await login(API, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
  const adminToken = adminSession.token;

  // 2) Firm session (persistent if provided; else ephemeral invite flow)
  const firmSession = await ensureFirmSession(API, BASE, adminToken);

  // 3) Basic RBAC sanity: firm cannot list users
  process.stdout.write('==> GET /auth/users (firm -> 403)\n');
  const usersAsFirm = await fetchWithTimeout(`${API}/auth/users`, {
    method: 'GET',
    headers: { authorization: `Bearer ${firmSession.token}` },
  });
  assertOk(usersAsFirm.status === 403, `Expected 403 from /auth/users as firm, got ${usersAsFirm.status}`);

  // 4) Create flight (mutating)
  const runId = new Date().toISOString().replace(/[:.TZ-]/g, '').slice(0, 14);
  const flightNumber = `E2E-${runId}-${crypto.randomBytes(2).toString('hex')}`;
  const departure = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const arrival = new Date(Date.now() + 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString();

  process.stdout.write(`==> POST /flights (create ${flightNumber})\n`);
  const flightCreate = await postJson(
    API,
    '/flights',
    {
      flightNumber,
      departure,
      arrival,
      ticketCount: 3,
      ticketPrice: 200,
      currency: 'USD',
    },
    { token: adminToken },
  );
  assertOk(flightCreate.res.status === 201, `Create flight failed: ${flightCreate.res.status} ${JSON.stringify(flightCreate.json)}`);
  const flightId = flightCreate.json?.id ? String(flightCreate.json.id) : '';
  assertOk(flightId, `Create flight response missing id: ${JSON.stringify(flightCreate.json)}`);

  // 5) Allocate 2 tickets to firm (admin)
  process.stdout.write('==> POST /tickets/allocate (batch)\n');
  const allocateRes = await postJson(
    API,
    '/tickets/allocate',
    { flightId, firmId: firmSession.firmId, quantity: 2 },
    { token: adminToken },
  );
  assertOk(allocateRes.res.ok, `Allocate failed: ${allocateRes.res.status} ${JSON.stringify(allocateRes.json)}`);

  // 6) Confirm allocation as firm (creates PAYABLE tx)
  process.stdout.write('==> POST /tickets/confirm (batch)\n');
  const confirmRes = await postJson(
    API,
    '/tickets/confirm',
    { flightId, quantity: 2 },
    { token: firmSession.token },
  );
  assertOk(confirmRes.res.ok, `Confirm failed: ${confirmRes.res.status} ${JSON.stringify(confirmRes.json)}`);

  // 7) Sell 1 ticket as firm (creates SALE tx)
  process.stdout.write('==> POST /tickets/sell (batch)\n');
  const sellRes = await postJson(
    API,
    '/tickets/sell',
    {
      flightId,
      quantity: 1,
      salePrice: 200,
      saleCurrency: 'USD',
      purchaser: {
        name: 'E2E Buyer',
        idNumber: `E2E-${runId}`,
      },
    },
    { token: firmSession.token },
  );
  assertOk(sellRes.res.ok, `Sell failed: ${sellRes.res.status} ${JSON.stringify(sellRes.json)}`);

  // 8) Record payment (creates PAYMENT tx)
  process.stdout.write('==> POST /payments (cash)\n');
  const paymentRes = await postJson(
    API,
    '/payments',
    {
      firmId: firmSession.firmId,
      flightId,
      amount: 200,
      currency: 'USD',
      method: 'cash',
      metadata: {
        date: ymdUtc(new Date()),
        note: 'e2e workflow payment',
      },
    },
    { token: firmSession.token },
  );
  assertOk(paymentRes.res.ok, `Payment failed: ${paymentRes.res.status} ${JSON.stringify(paymentRes.json)}`);

  // 9) Verify flight report totals
  process.stdout.write('==> GET /reports/flight (verify totals)\n');
  const reportRes = await getJson(API, `/reports/flight?flightId=${encodeURIComponent(flightId)}`, { token: adminToken });
  assertOk(reportRes.res.ok, `Report failed: ${reportRes.res.status} ${JSON.stringify(reportRes.json)}`);

  const { debt, revenue, paid, outstanding } = reportRes.json || {};
  assertOk(nearlyEqual(debt, 400), `Expected debt≈400, got ${debt}`);
  assertOk(nearlyEqual(revenue, 200), `Expected revenue≈200, got ${revenue}`);
  assertOk(nearlyEqual(paid, 200), `Expected paid≈200, got ${paid}`);
  assertOk(nearlyEqual(outstanding, 200), `Expected outstanding≈200, got ${outstanding}`);

  // 10) Verify sold tickets cannot be deallocated
  process.stdout.write('==> GET /tickets?flightId=... (find SOLD)\n');
  const ticketsRes = await getJson(API, `/tickets?flightId=${encodeURIComponent(flightId)}`, { token: adminToken });
  assertOk(ticketsRes.res.ok, `Tickets list failed: ${ticketsRes.res.status} ${JSON.stringify(ticketsRes.json)}`);
  const tickets = Array.isArray(ticketsRes.json) ? ticketsRes.json : [];
  const soldTicket = tickets.find((t) => String(t?.status || '').toUpperCase() === 'SOLD');
  assertOk(soldTicket?.id, 'Expected to find at least one SOLD ticket');

  process.stdout.write('==> POST /tickets/deallocate (sold -> 400)\n');
  const deallocateSold = await postJson(API, '/tickets/deallocate', { ticketId: String(soldTicket.id) }, { token: adminToken });
  assertOk(deallocateSold.res.status === 400, `Expected 400 deallocating sold ticket, got ${deallocateSold.res.status}`);

  // 11) Cancel flight
  process.stdout.write('==> DELETE /flights/:id (cancel flight)\n');
  const cancelRes = await fetchWithTimeout(`${API}/flights/${encodeURIComponent(flightId)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assertOk(cancelRes.status === 204, `Cancel failed: ${cancelRes.status}`);

  // 12) Allocations should now be blocked for cancelled flights
  process.stdout.write('==> POST /tickets/allocate (cancelled flight -> 400)\n');
  const allocateAfterCancel = await postJson(
    API,
    '/tickets/allocate',
    { flightId, firmId: firmSession.firmId, quantity: 1 },
    { token: adminToken },
  );
  assertOk(
    allocateAfterCancel.res.status === 400,
    `Expected 400 allocating on cancelled flight, got ${allocateAfterCancel.res.status} ${JSON.stringify(allocateAfterCancel.json)}`,
  );

  process.stdout.write('\nWorkflow passed.\n');
}

main().catch((err) => {
  process.stderr.write(`FAIL ${err?.message || err}\n`);
  process.exit(1);
});
