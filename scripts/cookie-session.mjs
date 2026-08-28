export class CookieSession {
  constructor() {
    this.cookies = new Map();
  }

  capture(response) {
    const values = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : splitSetCookieHeader(response.headers.get('set-cookie'));

    for (const value of values) {
      const pair = value.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const cookieValue = pair.slice(separator + 1).trim();
      if (cookieValue) this.cookies.set(name, cookieValue);
      else this.cookies.delete(name);
    }
  }

  headers({ csrf = false } = {}) {
    const headers = {};
    if (this.cookies.size) {
      headers.cookie = [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
    }
    if (csrf) headers['x-ado-csrf'] = '1';
    return headers;
  }
}

function splitSetCookieHeader(value) {
  if (!value) return [];
  return value.split(/,(?=[^;,]+=)/g).map((part) => part.trim()).filter(Boolean);
}

export function requiredLoginCode(scope = '') {
  const scopedName = scope ? `PROD_${scope}_LOGIN_VERIFICATION_CODE` : '';
  const value = (scopedName ? process.env[scopedName] : '')
    || process.env.PROD_LOGIN_VERIFICATION_CODE
    || process.env.DEV_QA_LOGIN_CODE
    || '';
  if (!/^\d{6}$/.test(value)) {
    const hint = scopedName ? `${scopedName} or PROD_LOGIN_VERIFICATION_CODE` : 'PROD_LOGIN_VERIFICATION_CODE';
    throw new Error(`Device verification required. Set ${hint} to the current 6-digit code.`);
  }
  return value;
}
