import crypto from 'node:crypto';
import { CookieSession, requiredLoginCode } from './cookie-session.mjs';

const BASE = process.env.PROD_BASE_URL || 'https://quvonchbek.me';
const API = `${BASE.replace(/\/$/, '')}/api`;

const SUPERADMIN_EMAIL = process.env.PROD_ADMIN_EMAIL || '';
const SUPERADMIN_PASSWORD = process.env.PROD_ADMIN_PASSWORD || '';

const PERSIST_FIRM_EMAIL = process.env.FIRM_EMAIL || process.env.TEST_FIRM_EMAIL || '';
const PERSIST_FIRM_PASSWORD = process.env.FIRM_PASSWORD || process.env.TEST_FIRM_PASSWORD || '';
const PERSIST_FIRM_NAME = process.env.FIRM_NAME || process.env.TEST_FIRM_NAME || '';
const FORCE_NEW_FIRM_USER = process.env.FORCE_NEW_FIRM_USER === '1' || process.env.PROD_INVITE_FORCE_NEW === '1';

function assertOk(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function postJson(path, body, { session, origin } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(session ? session.headers({ csrf: true }) : {}),
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });
  session?.capture(res);
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { res, json, contentType, text };
}

async function getJson(path, { session, origin } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: 'GET',
    headers: {
      ...(session ? session.headers() : {}),
      ...(origin ? { origin } : {}),
    },
  });
  session?.capture(res);
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { res, json, contentType, text };
}

async function login(email, password, scope) {
  const session = new CookieSession();
  let result = await postJson('/auth/login', { email, password }, { session });
  assertOk(result.res.ok, `Login failed: ${result.res.status} ${JSON.stringify({ error: result.json?.error })}`);
  if (result.json?.verificationRequired) {
    result = await postJson('/auth/device/verify', {
      challengeTicket: result.json.challengeTicket,
      code: requiredLoginCode(scope),
      deviceName: 'ADO production invite audit',
    }, { session });
  }
  assertOk(result.res.ok && result.json?.user, `Device verification failed: ${result.res.status} ${JSON.stringify({ error: result.json?.error })}`);
  assertOk(result.json?.token === undefined, 'Login unexpectedly returned a bearer token');
  return { session, user: result.json.user };
}

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  if ('token' in copy) copy.token = 'REDACTED';
  if ('link' in copy && typeof copy.link === 'string') {
    copy.link = copy.link.replace(/token=[^&]+/g, 'token=REDACTED');
  }
  return copy;
}

async function main() {
  assertOk(SUPERADMIN_EMAIL && SUPERADMIN_PASSWORD, 'Invite flow requires PROD_ADMIN_EMAIL and PROD_ADMIN_PASSWORD.');
  const runId = new Date().toISOString().replace(/[:.TZ-]/g, '').slice(0, 14);
  const persistentMode = Boolean(PERSIST_FIRM_EMAIL) && !FORCE_NEW_FIRM_USER;

  const email = persistentMode
    ? PERSIST_FIRM_EMAIL
    : `firm.${runId}.${crypto.randomBytes(2).toString('hex')}@example.com`;

  const firmName = (persistentMode ? PERSIST_FIRM_NAME : '') || `Firm ${runId}`;

  const password = persistentMode
    ? PERSIST_FIRM_PASSWORD
    : `Firm#${crypto.randomBytes(6).toString('hex')}`;

  if (persistentMode && !password) {
    throw new Error('Persistent mode requires FIRM_PASSWORD (or TEST_FIRM_PASSWORD)');
  }

  console.log(`BASE=${BASE}`);
  console.log(`MODE=${persistentMode ? 'persistent' : 'ephemeral'}${FORCE_NEW_FIRM_USER ? '+force-new' : ''}`);

  // 1) Login as superadmin
  {
    const adminLogin = await login(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, 'ADMIN');
    globalThis.__ADMIN_SESSION = adminLogin.session;
    console.log('OK superadmin login');
  }

  if (persistentMode) {
    // If the user already exists, avoid generating new invites/users (production pollution).
    const { res, json } = await getJson('/auth/users', { session: globalThis.__ADMIN_SESSION });
    assertOk(res.ok, `List users failed: ${res.status} ${JSON.stringify(redact(json))}`);

    const users = Array.isArray(json) ? json : Array.isArray(json?.users) ? json.users : [];
    const existing = users.find((u) => String(u?.email || '').toLowerCase() === String(email).toLowerCase());

    if (existing) {
      const firmLogin = await login(email, password, 'FIRM');
      const role = firmLogin.user?.role;
      console.log(`OK firm login (existing user, role=${role})`);
      console.log('DONE');
      return;
    }
  }

  // 2) Create firm invite (also creates Firm)
  let inviteId;
  let inviteToken;
  {
    const { res, json, contentType, text } = await postJson(
      '/invites',
      { email, role: 'FIRM', firmName },
      { session: globalThis.__ADMIN_SESSION, origin: BASE },
    );
    assertOk(res.ok, `Create invite failed: ${res.status} ${JSON.stringify(json)}`);
    inviteId = json?.inviteId;
    inviteToken = json?.token;

    if ((!inviteId || !inviteToken) && json?.link) {
      try {
        const u = new URL(String(json.link));
        inviteId ||= u.searchParams.get('id');
        inviteToken ||= u.searchParams.get('token');
      } catch {
        // ignore
      }
    }
    if (!inviteId || !inviteToken) {
      const keys = json && typeof json === 'object' ? Object.keys(json) : [];
      console.error('Create invite unexpected payload (redacted):', JSON.stringify(redact(json)));
      console.error('content-type:', contentType);
      console.error('keys:', keys.join(', '));
      console.error('text-preview:', String(text).slice(0, 120).replace(/\s+/g, ' '));
      throw new Error('Create invite response missing inviteId/token');
    }
    console.log('OK create invite');
  }

  // 3) Accept invite (create account)
  {
    const { res, json } = await postJson('/invites/accept', { id: inviteId, token: inviteToken, password });
    assertOk(res.ok, `Accept invite failed: ${res.status} ${JSON.stringify(json)}`);
    console.log('OK accept invite');
  }

  // 4) Login as firm
  {
    const firmLogin = await login(email, password, 'FIRM');
    const role = firmLogin.user?.role;
    console.log(`OK firm login (role=${role})`);
  }

  console.log('DONE');
}

main().catch((err) => {
  console.error('FAIL', err?.message || err);
  process.exit(1);
});
