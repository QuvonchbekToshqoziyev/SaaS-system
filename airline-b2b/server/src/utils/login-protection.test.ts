import { beforeEach, describe, expect, it } from 'vitest';
import { LOGIN_LOCK_MS, LOGIN_MAX_FAILURES, clearLoginFailure, isLoginLocked, recordLoginFailure, resetLoginProtectionForTest } from './login-protection';

describe('login protection', () => {
  beforeEach(() => resetLoginProtectionForTest());

  it('locks after repeated failures and unlocks after the lock window', () => {
    const key = 'admin@example.com|127.0.0.1';
    const now = new Date('2026-08-26T00:00:00.000Z').getTime();
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i += 1) recordLoginFailure(key, now);
    expect(isLoginLocked(key, now)).toBe(false);

    recordLoginFailure(key, now);
    expect(isLoginLocked(key, now + 1)).toBe(true);
    expect(isLoginLocked(key, now + LOGIN_LOCK_MS + 1)).toBe(false);
  });

  it('clears failed attempts after a successful login', () => {
    const key = 'admin@example.com|127.0.0.1';
    recordLoginFailure(key);
    clearLoginFailure(key);
    expect(isLoginLocked(key)).toBe(false);
  });
});
