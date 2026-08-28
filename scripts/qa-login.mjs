import { qaLoginCode } from './qa-login-code.mjs';

export function responseCookies(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  const cookies = [];
  for (const value of values) {
    for (const match of value.matchAll(/(?:^|,\s*)(ado_session|ado_trusted_device)=([^;]+)/g)) {
      cookies.push(`${match[1]}=${match[2]}`);
    }
  }
  return Array.from(new Set(cookies)).join('; ');
}

export async function qaLogin(base, email, password, fetcher = fetch) {
  const loginResponse = await fetcher(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  let response = loginResponse;
  let data = await response.json();
  if (response.status === 200 && data.verificationRequired && data.challengeTicket) {
    response = await fetcher(`${base}/api/auth/device/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeTicket: data.challengeTicket, code: qaLoginCode, deviceName: 'Release audit' }),
    });
    data = await response.json();
  }
  const cookie = responseCookies(response);
  if (response.status !== 200 || !cookie.includes('ado_session=') || !data.user) {
    throw new Error(`${email} login failed with ${response.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return { user: data.user, cookie };
}

export function qaAuthHeaders(session, mutation = false) {
  return {
    Cookie: session.cookie,
    ...(mutation ? { 'X-ADO-CSRF': '1' } : {}),
  };
}
