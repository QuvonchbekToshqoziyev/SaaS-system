import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export const MFA_ISSUER = 'ADO B2B';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const MFA_TICKET_AUDIENCE = 'ado-b2b-mfa';

export type MfaTicketClaims = {
  userId: string;
  sessionVersion: number;
  purpose: 'mfa';
};

export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function buildTotpUri(email: string, secret: string) {
  const label = encodeURIComponent(`${MFA_ISSUER}:${email}`);
  const params = new URLSearchParams({ secret, issuer: MFA_ISSUER, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function verifyTotp(secret: string, code: unknown, now = Date.now()) {
  const normalized = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const counter = Math.floor(now / 30000);
  return [-1, 0, 1].some((offset) => timingSafeEqual(totp(secret, counter + offset), normalized));
}

export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => crypto.randomBytes(5).toString('hex').toUpperCase());
}

export function signMfaTicket(claims: Omit<MfaTicketClaims, 'purpose'>, secret: string) {
  return jwt.sign({ ...claims, purpose: 'mfa' }, secret, {
    algorithm: 'HS256',
    issuer: 'ado-b2b',
    audience: MFA_TICKET_AUDIENCE,
    expiresIn: '5m',
  });
}

export function verifyMfaTicket(token: string, secret: string): MfaTicketClaims {
  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: 'ado-b2b',
    audience: MFA_TICKET_AUDIENCE,
  }) as MfaTicketClaims;
  if (decoded.purpose !== 'mfa') throw new Error('Invalid MFA ticket');
  return decoded;
}

function totp(secret: string, counter: number) {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

function timingSafeEqual(expected: string, actual: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function base32Encode(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(secret: string) {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of secret.replace(/=+$/g, '').toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid TOTP secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
