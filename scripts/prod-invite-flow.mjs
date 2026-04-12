import crypto from 'node:crypto';

const BASE = process.env.PROD_BASE_URL || 'https://quvonchbek.me';
const API = `${BASE.replace(/\/$/, '')}/api`;

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'admin@airline.com';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'superadmin123';

const PERSIST_FIRM_EMAIL = process.env.FIRM_EMAIL || process.env.TEST_FIRM_EMAIL || '';
const PERSIST_FIRM_PASSWORD = process.env.FIRM_PASSWORD || process.env.TEST_FIRM_PASSWORD || '';
const PERSIST_FIRM_NAME = process.env.FIRM_NAME || process.env.TEST_FIRM_NAME || '';
const FORCE_NEW_FIRM_USER = process.env.FORCE_NEW_FIRM_USER === '1' || process.env.PROD_INVITE_FORCE_NEW === '1';

function assertOk(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function postJson(path, body, { token, origin } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });
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

async function getJson(path, { token, origin } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: 'GET',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(origin ? { origin } : {}),
    },
  });
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
    const { res, json } = await postJson('/auth/login', { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD });
    assertOk(res.ok, `Superadmin login failed: ${res.status} ${JSON.stringify(json)}`);
    assertOk(json?.token, 'Superadmin login response missing token');
    globalThis.__ADMIN_TOKEN = json.token;
    console.log('OK superadmin login');
  }

  if (persistentMode) {
    // If the user already exists, avoid generating new invites/users (production pollution).
    const { res, json } = await getJson('/auth/users', { token: globalThis.__ADMIN_TOKEN });
    assertOk(res.ok, `List users failed: ${res.status} ${JSON.stringify(redact(json))}`);

    const users = Array.isArray(json) ? json : Array.isArray(json?.users) ? json.users : [];
    const existing = users.find((u) => String(u?.email || '').toLowerCase() === String(email).toLowerCase());

    if (existing) {
      const firmLogin = await postJson('/auth/login', { email, password });
      assertOk(
        firmLogin.res.ok,
        `Firm user exists but login failed (${firmLogin.res.status}). Check FIRM_PASSWORD or set FORCE_NEW_FIRM_USER=1.`,
      );
      const role = firmLogin.json?.user?.role;
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
      { token: globalThis.__ADMIN_TOKEN, origin: BASE },
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
    const { res, json } = await postJson('/auth/login', { email, password });
    assertOk(res.ok, `Firm login failed: ${res.status} ${JSON.stringify(json)}`);
    const role = json?.user?.role;
    console.log(`OK firm login (role=${role})`);
  }

  console.log('DONE');
}

main().catch((err) => {
  console.error('FAIL', err?.message || err);
  process.exit(1);
});
