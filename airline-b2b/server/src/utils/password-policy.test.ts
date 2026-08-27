import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, passwordMeetsPolicy } from './password-policy';

describe('password policy', () => {
  it('requires twelve or more characters for every new password', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(passwordMeetsPolicy('short-pass')).toBe(false);
    expect(passwordMeetsPolicy('long-secure-pass')).toBe(true);
  });
});
