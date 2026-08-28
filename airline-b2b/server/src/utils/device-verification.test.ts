import { describe, expect, it } from 'vitest';
import {
  generateLoginVerificationCode,
  generateTrustedDeviceSecret,
  hashLoginVerificationCode,
  hashTrustedDeviceSecret,
  parseTrustedDeviceCookie,
  signDeviceVerificationTicket,
  trustedDeviceCookieValue,
  verifyDeviceVerificationTicket,
  verifyLoginVerificationCode,
} from './device-verification';

describe('device verification utilities', () => {
  const secret = 'test-secret-that-is-long-enough-for-signing';

  it('creates and verifies a six-digit code without storing the code', () => {
    const code = generateLoginVerificationCode();
    const hash = hashLoginVerificationCode('challenge-1', code, secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(hash).not.toContain(code);
    expect(verifyLoginVerificationCode('challenge-1', code, hash, secret)).toBe(true);
    expect(verifyLoginVerificationCode('challenge-1', '000000', hash, secret)).toBe(code === '000000');
    expect(verifyLoginVerificationCode('challenge-2', code, hash, secret)).toBe(false);
  });

  it('signs a short-lived ticket for one challenge and purpose', () => {
    const token = signDeviceVerificationTicket({ challengeId: 'c1', userId: 'u1', sessionVersion: 3 }, secret);
    expect(verifyDeviceVerificationTicket(token, secret)).toMatchObject({
      challengeId: 'c1', userId: 'u1', sessionVersion: 3, purpose: 'device-verification',
    });
  });

  it('uses an opaque trusted-device secret and parses only the expected cookie shape', () => {
    const deviceId = 'd8cc3da8-4a37-4f27-b520-8b4c4fa888e1';
    const deviceSecret = generateTrustedDeviceSecret();
    const value = trustedDeviceCookieValue(deviceId, deviceSecret);
    expect(hashTrustedDeviceSecret(deviceSecret)).not.toContain(deviceSecret);
    expect(parseTrustedDeviceCookie(value)).toEqual({ deviceId, secret: deviceSecret });
    expect(parseTrustedDeviceCookie('invalid')).toBeNull();
  });
});
