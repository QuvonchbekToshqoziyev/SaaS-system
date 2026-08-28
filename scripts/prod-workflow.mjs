import crypto from 'node:crypto';
import { CookieSession, requiredLoginCode } from './cookie-session.mjs';

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

async function postJson(apiBase, pathName, body, { session, headers } = {}) {
  const res = await fetchWithTimeout(`${apiBase}${pathName}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(session ? session.headers({ csrf: true }) : {}),
      ...(headers || {}),
    },
    body: JSON.stringify(body),
  });
  session?.capture(res);
  const { json } = await readJsonSafe(res);
  return { res, json };
}

async function getJson(apiBase, pathName, { session, headers } = {}) {
  const res = await fetchWithTimeout(`${apiBase}${pathName}`, {
    method: 'GET',
    headers: {
      ...(session ? session.headers() : {}),
      ...(headers || {}),
    },
  });
  session?.capture(res);
  const { json } = await readJsonSafe(res);
  return { res, json };
}

function ymdUtc(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function currencyTotal(rows, currency) {
  if (!Array.isArray(rows)) return 0;
  return Number(rows.find((row) => String(row?.currency || '').toUpperCase() === currency)?.total || 0);
}

async function login(apiBase, email, password, scope) {
  const session = new CookieSession();
  let result = await postJson(apiBase, '/auth/login', { email, password }, { session });
  assertOk(result.res.ok, `Login failed: ${result.res.status} ${JSON.stringify({ error: result.json?.error })}`);
  if (result.json?.verificationRequired) {
    result = await postJson(apiBase, '/auth/device/verify', {
      challengeTicket: result.json.challengeTicket,
      code: requiredLoginCode(scope),
      deviceName: 'ADO production workflow audit',
    }, { session });
  }
  assertOk(result.res.ok && result.json?.user, `Device verification failed: ${result.res.status} ${JSON.stringify({ error: result.json?.error })}`);
  assertOk(result.json?.token === undefined, 'Login unexpectedly returned a bearer token');
  return { session, user: result.json.user };
}

async function firmSession(apiBase, { email, password, scope, label }) {
  assertOk(email && password, `${label} requires its email and password environment variables.`);
  process.stdout.write(`==> POST /auth/login (${label})\n`);
  const firmLogin = await login(apiBase, email, password, scope);
  const firmId = firmLogin.user?.firmId ? String(firmLogin.user.firmId) : '';
  assertOk(firmId, `${label} login returned missing firmId`);
  return { session: firmLogin.session, firmId, email };
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

  const SUPERADMIN_EMAIL = process.env.PROD_ADMIN_EMAIL || '';
  const SUPERADMIN_PASSWORD = process.env.PROD_ADMIN_PASSWORD || '';
  assertOk(SUPERADMIN_EMAIL && SUPERADMIN_PASSWORD, 'Workflow requires PROD_ADMIN_EMAIL and PROD_ADMIN_PASSWORD.');
  const sourceEmail = process.env.SOURCE_FIRM_EMAIL || process.env.TEST_SOURCE_FIRM_EMAIL || '';
  const sourcePassword = process.env.SOURCE_FIRM_PASSWORD || process.env.TEST_SOURCE_FIRM_PASSWORD || '';
  const targetEmail = process.env.FIRM_EMAIL || process.env.TEST_FIRM_EMAIL || '';
  const targetPassword = process.env.FIRM_PASSWORD || process.env.TEST_FIRM_PASSWORD || '';

  process.stdout.write(`BASE=${BASE}\n`);
  process.stdout.write(`API=${API}\n`);
  process.stdout.write('MODE=workflow(mutating)\n\n');

  // 1) Superadmin login
  process.stdout.write('==> POST /auth/login (superadmin)\n');
  const adminSession = await login(API, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, 'ADMIN');

  // 2) Existing source and target firm sessions. The workflow never creates production users.
  const sourceFirm = await firmSession(API, {
    email: sourceEmail, password: sourcePassword, scope: 'SOURCE_FIRM', label: 'source firm',
  });
  const targetFirm = await firmSession(API, {
    email: targetEmail, password: targetPassword, scope: 'FIRM', label: 'target firm',
  });
  assertOk(sourceFirm.firmId !== targetFirm.firmId, 'Source and target accounts must belong to different firms.');

  // 3) Basic RBAC sanity: firm cannot list users
  process.stdout.write('==> GET /auth/users (firm -> 403)\n');
  const usersAsFirm = await fetchWithTimeout(`${API}/auth/users`, {
    method: 'GET',
    headers: targetFirm.session.headers(),
  });
  assertOk(usersAsFirm.status === 403, `Expected 403 from /auth/users as firm, got ${usersAsFirm.status}`);

  const configuredAirlineId = process.env.PROD_WORKFLOW_AIRLINE_ID || '';
  const configuredAirlineName = process.env.PROD_WORKFLOW_AIRLINE_NAME || '';
  assertOk(configuredAirlineId || configuredAirlineName, 'Set PROD_WORKFLOW_AIRLINE_ID or PROD_WORKFLOW_AIRLINE_NAME.');
  const airlinesRes = await getJson(API, '/airlines', { session: sourceFirm.session });
  assertOk(airlinesRes.res.ok, `Airline list failed: ${airlinesRes.res.status} ${JSON.stringify(airlinesRes.json)}`);
  const airlines = Array.isArray(airlinesRes.json) ? airlinesRes.json : Array.isArray(airlinesRes.json?.airlines) ? airlinesRes.json.airlines : [];
  const airline = airlines.find((item) => configuredAirlineId
    ? String(item?.id || '') === configuredAirlineId
    : String(item?.name || '') === configuredAirlineName);
  assertOk(airline?.id, 'Configured airline is unavailable to the source firm.');

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
      route: 'TAS-DXB',
      departure,
      arrival,
      airlineId: String(airline.id),
      ticketCount: 3,
      ticketPrice: 200,
      currency: 'USD',
    },
    { session: sourceFirm.session },
  );
  assertOk(flightCreate.res.status === 201, `Create flight failed: ${flightCreate.res.status} ${JSON.stringify(flightCreate.json)}`);
  const flightId = flightCreate.json?.id ? String(flightCreate.json.id) : '';
  assertOk(flightId, `Create flight response missing id: ${JSON.stringify(flightCreate.json)}`);

  // 5) Source firm allocates 2 tickets to the target firm.
  process.stdout.write('==> POST /tickets/allocate (batch)\n');
  const allocateRes = await postJson(
    API,
    '/tickets/allocate',
    {
      flightId,
      firmId: targetFirm.firmId,
      quantity: 2,
      productType: 'ONE_WAY',
      direction: 'OUTBOUND',
      allocationPrice: 200,
      currency: 'USD',
    },
    { session: sourceFirm.session },
  );
  assertOk(allocateRes.res.ok, `Allocate failed: ${allocateRes.res.status} ${JSON.stringify(allocateRes.json)}`);
  const allocationId = allocateRes.json?.allocationId ? String(allocateRes.json.allocationId) : '';
  assertOk(allocationId, `Allocate response missing allocationId: ${JSON.stringify(allocateRes.json)}`);

  // 6) Confirm allocation as firm (creates PAYABLE tx)
  if (String(allocateRes.json?.status || '').toUpperCase() === 'PENDING') {
    process.stdout.write('==> POST /tickets/confirm (allocation)\n');
    const confirmRes = await postJson(
      API,
      '/tickets/confirm',
      { allocationId },
      { session: targetFirm.session },
    );
    assertOk(confirmRes.res.ok, `Confirm failed: ${confirmRes.res.status} ${JSON.stringify(confirmRes.json)}`);
  } else {
    assertOk(String(allocateRes.json?.status || '').toUpperCase() === 'ACCEPTED', `Unexpected allocation status: ${JSON.stringify(allocateRes.json)}`);
  }

  // 7) Sell 1 ticket as firm (creates SALE tx)
  process.stdout.write('==> POST /tickets/sell (batch)\n');
  const sellRes = await postJson(
    API,
    '/tickets/sell',
    {
      flightId,
      quantity: 1,
      productType: 'ONE_WAY',
      direction: 'OUTBOUND',
      salePrice: 200,
      saleCurrency: 'USD',
      exchangeRate: 12100,
      purchaser: {
        name: 'E2E Buyer',
        idNumber: `E2E-${runId}`,
      },
    },
    { session: targetFirm.session },
  );
  assertOk(sellRes.res.ok, `Sell failed: ${sellRes.res.status} ${JSON.stringify(sellRes.json)}`);
  const saleId = sellRes.json?.saleId ? String(sellRes.json.saleId) : '';
  assertOk(saleId, `Sell response missing saleId: ${JSON.stringify(sellRes.json)}`);

  // 8) Record payment (creates PAYMENT tx)
  process.stdout.write('==> POST /payments (bank)\n');
  const paymentRes = await postJson(
    API,
    '/payments',
    {
      firmId: targetFirm.firmId,
      flightId,
      allocationId,
      amount: 200,
      currency: 'USD',
      exchangeRate: 12100,
      method: 'bank',
      metadata: {
        date: ymdUtc(new Date()),
        note: 'e2e workflow payment',
      },
    },
    { session: targetFirm.session },
  );
  assertOk(paymentRes.res.ok, `Payment failed: ${paymentRes.res.status} ${JSON.stringify(paymentRes.json)}`);

  // 9) Verify flight report totals
  process.stdout.write('==> GET /reports/flight (verify totals)\n');
  const reportRes = await getJson(API, `/reports/flight?flightId=${encodeURIComponent(flightId)}`, { session: adminSession.session });
  assertOk(reportRes.res.ok, `Report failed: ${reportRes.res.status} ${JSON.stringify(reportRes.json)}`);

  const allocation = Array.isArray(reportRes.json?.allocations)
    ? reportRes.json.allocations.find((item) => String(item?.id || '') === allocationId)
    : null;
  assertOk(allocation?.status === 'ACCEPTED', `Expected accepted allocation: ${JSON.stringify(reportRes.json)}`);
  assertOk(Number(allocation?.totalAmount) === 400, `Expected allocation total 400, got ${allocation?.totalAmount}`);
  assertOk(currencyTotal(allocation?.paidAmounts, 'USD') === 200, `Expected allocation paid USD 200: ${JSON.stringify(allocation?.paidAmounts)}`);
  assertOk(currencyTotal(allocation?.outstandingDebt, 'USD') === 200, `Expected allocation outstanding USD 200: ${JSON.stringify(allocation?.outstandingDebt)}`);
  const reportTransactions = Array.isArray(reportRes.json?.transactions) ? reportRes.json.transactions : [];
  assertOk(reportTransactions.some((row) => row?.type === 'SALE' && Number(row?.originalAmount) === 200), 'Expected USD 200 sale transaction in report');
  assertOk(reportTransactions.some((row) => row?.type === 'PAYMENT' && Number(row?.originalAmount) === 200), 'Expected USD 200 payment transaction in report');

  // 10) Firm users cannot bypass the platform approval path for sale cancellation.
  process.stdout.write('==> POST /tickets/cancel-sale (firm -> 403)\n');
  const directCancel = await postJson(API, '/tickets/cancel-sale', { saleId, reason: 'E2E direct cancellation denial' }, { session: targetFirm.session });
  assertOk(directCancel.res.status === 403, `Expected 403 for direct firm sale cancellation, got ${directCancel.res.status}`);

  // 11) Cancel flight
  process.stdout.write('==> DELETE /flights/:id (cancel flight)\n');
  const cancelRes = await fetchWithTimeout(`${API}/flights/${encodeURIComponent(flightId)}`, {
    method: 'DELETE',
    headers: adminSession.session.headers({ csrf: true }),
  });
  assertOk(cancelRes.status === 204, `Cancel failed: ${cancelRes.status}`);

  // 12) Allocations should now be blocked for cancelled flights
  process.stdout.write('==> POST /tickets/allocate (cancelled flight -> 400)\n');
  const allocateAfterCancel = await postJson(
    API,
    '/tickets/allocate',
    {
      flightId,
      firmId: targetFirm.firmId,
      quantity: 1,
      productType: 'ONE_WAY',
      direction: 'OUTBOUND',
      allocationPrice: 200,
      currency: 'USD',
    },
    { session: sourceFirm.session },
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
