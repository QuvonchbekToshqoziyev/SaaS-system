import { describe, expect, it } from 'vitest';
import {
  readTrustedDeviceCookie,
  setTrustedDeviceCookie,
  TRUSTED_DEVICE_COOKIE_NAME,
  trustedDeviceMaxAgeMs,
} from './trusted-device-cookie';

describe('trusted-device cookie', () => {
  it('is HttpOnly, Secure, Strict, and bounded to 90 days', () => {
    process.env.NODE_ENV = 'production';
    process.env.TRUSTED_DEVICE_DAYS = '900';
    const calls: unknown[][] = [];
    const res = { cookie: (...args: unknown[]) => calls.push(args) } as any;
    setTrustedDeviceCookie(res, 'device.secret');
    expect(calls[0]).toEqual([
      TRUSTED_DEVICE_COOKIE_NAME,
      'device.secret',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 90 * 24 * 60 * 60 * 1000 }),
    ]);
    expect(trustedDeviceMaxAgeMs()).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it('reads only its named cookie', () => {
    expect(readTrustedDeviceCookie(`ado_session=jwt; ${TRUSTED_DEVICE_COOKIE_NAME}=device.secret`)).toBe('device.secret');
    expect(readTrustedDeviceCookie('ado_session=jwt')).toBeUndefined();
  });
});
