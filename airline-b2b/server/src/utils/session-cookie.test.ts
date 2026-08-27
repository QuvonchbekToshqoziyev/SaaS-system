import { describe, expect, it } from 'vitest';
import { readSessionCookie, SESSION_COOKIE_NAME, setSessionCookie } from './session-cookie';

describe('session cookie parser', () => {
  it('reads only the named cookie and rejects malformed encoding', () => {
    expect(readSessionCookie(`theme=dark; ${SESSION_COOKIE_NAME}=signed.jwt.value; language=uz`)).toBe('signed.jwt.value');
    expect(readSessionCookie(`${SESSION_COOKIE_NAME}=%E0%A4%A`)).toBeUndefined();
    expect(readSessionCookie('other=value')).toBeUndefined();
  });

  it('sets a production session as HttpOnly, Secure, and Strict', () => {
    process.env.NODE_ENV = 'production';
    const calls: unknown[][] = [];
    const recordingRes = { cookie: (...args: unknown[]) => { calls.push(args); } } as any;
    setSessionCookie(recordingRes, 'signed-token');
    expect(calls[0]).toEqual([
      SESSION_COOKIE_NAME,
      'signed-token',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict', path: '/' }),
    ]);
  });
});
