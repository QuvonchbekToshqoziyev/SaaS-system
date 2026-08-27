import { describe, expect, it } from 'vitest';
import { buildTotpUri, generateRecoveryCodes, generateTotpSecret, signMfaTicket, verifyMfaTicket, verifyTotp } from './mfa';

describe('MFA utilities', () => {
  it('verifies a six-digit RFC 6238 TOTP code', () => {
    expect(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', 59000)).toBe(true);
  });

  it('creates otpauth URIs and one-time recovery code candidates', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(buildTotpUri('admin@example.com', secret)).toContain('otpauth://totp/');
    expect(new Set(generateRecoveryCodes()).size).toBe(8);
  });

  it('signs short-lived MFA tickets with a dedicated purpose', () => {
    const token = signMfaTicket({ userId: 'u1', sessionVersion: 3 }, 'test-secret');
    expect(verifyMfaTicket(token, 'test-secret')).toMatchObject({ userId: 'u1', sessionVersion: 3, purpose: 'mfa' });
  });
});
