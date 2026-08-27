export type LoginFailureState = {
  count: number;
  lockedUntil: number;
};

export const LOGIN_LOCK_MS = 10 * 60 * 1000;
export const LOGIN_MAX_FAILURES = 5;

const failedLogins = new Map<string, LoginFailureState>();

export function isLoginLocked(key: string, now = Date.now()) {
  const state = failedLogins.get(key);
  if (!state) return false;
  if (state.lockedUntil > now) return true;
  if (state.lockedUntil) failedLogins.delete(key);
  return false;
}

export function recordLoginFailure(key: string, now = Date.now()) {
  const current = failedLogins.get(key) || { count: 0, lockedUntil: 0 };
  const count = current.count + 1;
  failedLogins.set(key, { count, lockedUntil: count >= LOGIN_MAX_FAILURES ? now + LOGIN_LOCK_MS : 0 });
}

export function clearLoginFailure(key: string) {
  failedLogins.delete(key);
}

export function resetLoginProtectionForTest() {
  failedLogins.clear();
}
