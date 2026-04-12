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

async function strictAuthChecks(apiBase) {
  const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'admin@airline.com';
  const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'superadmin123';

  process.stdout.write('==> POST /auth/login (superadmin)\n');
  const login = await postJson(apiBase, '/auth/login', { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD });
  if (!login.res.ok || !login.json?.token) {
    throw new Error(`Superadmin login failed: ${login.res.status} ${JSON.stringify(login.json)}`);
  }

  process.stdout.write('==> GET /auth/users (admin-only)\n');
  const usersRes = await fetchWithTimeout(`${apiBase}/auth/users`, {
    method: 'GET',
    headers: { authorization: `Bearer ${login.json.token}` },
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

async function main() {
  const { strict, inviteFlow } = parseArgs(process.argv);

  const rawBase = process.env.PROD_BASE_URL || process.env.BASE_URL || 'https://quvonchbek.me';
  const BASE = stripTrailingSlash(rawBase.trim());
  const API = `${BASE}/api`;

  process.stdout.write(`BASE=${BASE}\n`);
  process.stdout.write(`API=${API}\n`);
  process.stdout.write(`MODE=${strict ? 'strict' : 'smoke'}${inviteFlow ? '+invite-flow' : ''}\n\n`);

  const failures = [];

  // Website smoke
  try {
    const rootEtag = await getEtag(BASE, '/');
    if (!rootEtag) throw new Error('could not read root ETag');

    await checkNotNextError(BASE, '/login/');
    await checkNotNextError(BASE, '/admin/');

    await checkDeepLinkNotFallback(BASE, '/firms/', rootEtag);
    await checkDeepLinkNotFallback(BASE, '/settings/', rootEtag);
    await checkDeepLinkNotFallback(BASE, '/invite/', rootEtag);

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
