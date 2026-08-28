import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signSessionToken } from '../utils/session-token';

const db = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('../db', () => ({ prisma: { user: { findUnique: db.findUnique } } }));

import { authMiddleware, isReadOnlyHttpMethod, isSubscriptionExpired, warehouseManagerCanAccessPath } from './auth';

function responseMock() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('authenticated account boundary', () => {
  const secret = 'test-secret-that-is-long-enough-for-signing';

  beforeEach(() => {
    process.env.JWT_SECRET = secret;
    db.findUnique.mockReset();
  });

  it('replaces stale token roles and tenant claims with current database values', async () => {
    const token = signSessionToken({ userId: 'user-1', sessionVersion: 2 }, secret);
    db.findUnique.mockResolvedValue({
      id: 'user-1', role: 'FIRM', readOnlyAccess: false, firmRole: 'MANAGER', firmId: 'firm-current',
      status: 'ACTIVE', deletedAt: null, sessionVersion: 2,
      firm: { kind: 'AGENCY', subscriptionEndsAt: null },
    });
    const req: any = { headers: { authorization: `Bearer ${token}` }, method: 'GET', originalUrl: '/firms' };
    const res = responseMock();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ role: 'FIRM', firmRole: 'MANAGER', firmId: 'firm-current' });
  });

  it('rejects deleted, suspended, and version-revoked sessions', async () => {
    const token = signSessionToken({ userId: 'user-1', sessionVersion: 1 }, secret);
    const req = () => ({ headers: { authorization: `Bearer ${token}` }, method: 'GET', originalUrl: '/firms' } as any);

    for (const actor of [
      { status: 'DELETED', deletedAt: new Date(), sessionVersion: 1 },
      { status: 'SUSPENDED', deletedAt: null, sessionVersion: 1 },
      { status: 'ACTIVE', deletedAt: null, sessionVersion: 2 },
    ]) {
      db.findUnique.mockResolvedValue({
        id: 'user-1', role: 'FIRM', readOnlyAccess: false, firmRole: 'MANAGER', firmId: 'firm-1',
        firm: { kind: 'AGENCY', subscriptionEndsAt: null }, ...actor,
      });
      const res = responseMock();
      const next = vi.fn();
      await authMiddleware(req(), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    }
  });

  it('accepts a cookie session for reads and requires the CSRF header for mutations', async () => {
    const token = signSessionToken({ userId: 'user-1', sessionVersion: 1 }, secret);
    db.findUnique.mockResolvedValue({
      id: 'user-1', email: 'user@example.com', fullName: 'User', phone: null,
      role: 'FIRM', readOnlyAccess: false, firmRole: 'MANAGER', firmId: 'firm-1',
      status: 'ACTIVE', deletedAt: null, sessionVersion: 1,
      firm: { kind: 'AGENCY', subscriptionEndsAt: null },
    });
    const request = (method: string, csrf?: string) => ({
      headers: { cookie: `ado_session=${token}` }, method, originalUrl: '/firms',
      get: (name: string) => name.toLowerCase() === 'x-ado-csrf' ? csrf : undefined,
    } as any);

    const readNext = vi.fn();
    await authMiddleware(request('GET'), responseMock(), readNext);
    expect(readNext).toHaveBeenCalledOnce();

    const blocked = responseMock();
    await authMiddleware(request('POST'), blocked, vi.fn());
    expect(blocked.status).toHaveBeenCalledWith(403);
    expect(db.findUnique).toHaveBeenCalledTimes(1);

    const writeNext = vi.fn();
    await authMiddleware(request('POST', '1'), responseMock(), writeNext);
    expect(writeNext).toHaveBeenCalledOnce();
  });

  it('allows an active admin session because device verification happens before session issuance', async () => {
    const token = signSessionToken({ userId: 'admin-1', sessionVersion: 1 }, secret);
    db.findUnique.mockResolvedValue({
      id: 'admin-1', email: 'admin@example.com', fullName: 'Admin', phone: null,
      role: 'ADMIN', readOnlyAccess: false, firmRole: 'MANAGER', firmId: null,
      status: 'ACTIVE', deletedAt: null, sessionVersion: 1,
      firm: null,
    });
    const request = { headers: { authorization: `Bearer ${token}` }, method: 'GET', originalUrl: '/firms' } as any;

    const allowedNext = vi.fn();
    await authMiddleware(request, responseMock(), allowedNext);
    expect(allowedNext).toHaveBeenCalledOnce();
  });
});

describe('subscription expiry boundary', () => {
  const now = new Date('2026-07-11T12:00:00.000Z');

  it('keeps subscriptions without an end date active', () => {
    expect(isSubscriptionExpired(null, now)).toBe(false);
  });

  it('expires at the configured instant', () => {
    expect(isSubscriptionExpired(new Date('2026-07-11T12:00:00.000Z'), now)).toBe(true);
    expect(isSubscriptionExpired(new Date('2026-07-11T12:00:01.000Z'), now)).toBe(false);
  });
});

describe('read-only account HTTP methods', () => {
  it('allows reads and blocks every mutation method', () => {
    expect(['GET', 'HEAD', 'OPTIONS'].every(isReadOnlyHttpMethod)).toBe(true);
    expect(['POST', 'PATCH', 'PUT', 'DELETE'].some(isReadOnlyHttpMethod)).toBe(false);
  });
});

describe('warehouse manager route boundary', () => {
  it('allows only inventory operations and password changes', () => {
    expect(warehouseManagerCanAccessPath('/inventory/documents/apply')).toBe(true);
    expect(warehouseManagerCanAccessPath('/inventory/reports?from=2026-07-01')).toBe(true);
    expect(warehouseManagerCanAccessPath('/auth/change-password')).toBe(true);
    expect(warehouseManagerCanAccessPath('/employees')).toBe(false);
    expect(warehouseManagerCanAccessPath('/kassa')).toBe(false);
    expect(warehouseManagerCanAccessPath('/transactions')).toBe(false);
  });
});
