import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const DEVICE_TICKET_AUDIENCE = 'ado-b2b-device-verification';

export type DeviceVerificationTicketClaims = {
  challengeId: string;
  userId: string;
  sessionVersion: number;
  purpose: 'device-verification';
};

export function generateLoginVerificationCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashLoginVerificationCode(challengeId: string, code: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(`${challengeId}:${code}`).digest('hex');
}

export function verifyLoginVerificationCode(challengeId: string, code: unknown, expectedHash: string, secret: string) {
  const normalized = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  return timingSafeEqual(hashLoginVerificationCode(challengeId, normalized, secret), expectedHash);
}

export function signDeviceVerificationTicket(
  claims: Omit<DeviceVerificationTicketClaims, 'purpose'>,
  secret: string,
) {
  return jwt.sign({ ...claims, purpose: 'device-verification' }, secret, {
    algorithm: 'HS256',
    issuer: 'ado-b2b',
    audience: DEVICE_TICKET_AUDIENCE,
    expiresIn: '10m',
  });
}

export function verifyDeviceVerificationTicket(token: string, secret: string): DeviceVerificationTicketClaims {
  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: 'ado-b2b',
    audience: DEVICE_TICKET_AUDIENCE,
  }) as DeviceVerificationTicketClaims;
  if (decoded.purpose !== 'device-verification') throw new Error('Invalid device verification ticket');
  return decoded;
}

export function generateTrustedDeviceSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashTrustedDeviceSecret(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function trustedDeviceCookieValue(deviceId: string, secret: string) {
  return `${deviceId}.${secret}`;
}

export function parseTrustedDeviceCookie(value: string | undefined) {
  const match = String(value || '').match(/^([0-9a-f-]{36})\.([A-Za-z0-9_-]{40,})$/i);
  return match ? { deviceId: match[1], secret: match[2] } : null;
}

export function timingSafeEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
