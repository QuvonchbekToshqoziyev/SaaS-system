import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashLoginVerificationCode, signDeviceVerificationTicket } from '../utils/device-verification';

const db = vi.hoisted(() => ({
  challengeFindUnique: vi.fn(),
  challengeUpdateMany: vi.fn(),
  trustedFindMany: vi.fn(),
  trustedCreate: vi.fn(),
  trustedUpdateMany: vi.fn(),
}));

vi.mock('../db', () => ({
  prisma: {
    loginVerificationChallenge: {
      findUnique: db.challengeFindUnique,
      updateMany: db.challengeUpdateMany,
    },
    trustedDevice: {
      findMany: db.trustedFindMany,
      create: db.trustedCreate,
      updateMany: db.trustedUpdateMany,
    },
  },
}));
vi.mock('../utils/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));

import { verifyDeviceLogin } from './auth.controller';

function responseMock() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.cookie = vi.fn(() => res);
  res.clearCookie = vi.fn(() => res);
  return res;
}

describe('unknown-device login verification', () => {
  const jwtSecret = 'test-secret-that-is-long-enough-for-signing';
  const code = '481927';
  const user = {
    id: 'user-1', email: 'user@example.com', fullName: 'User', phone: null,
    role: 'FIRM', readOnlyAccess: false, firmRole: 'MANAGER', firmId: 'firm-1',
    status: 'ACTIVE', deletedAt: null, sessionVersion: 4,
    firm: { kind: 'AGENCY', subscriptionEndsAt: null },
  };
  const challenge = {
    id: 'challenge-1', userId: user.id, attempts: 0, consumedAt: null,
    expiresAt: new Date(Date.now() + 60_000), codeHash: hashLoginVerificationCode('challenge-1', code, jwtSecret),
    user,
  };
  const ticket = signDeviceVerificationTicket({ challengeId: challenge.id, userId: user.id, sessionVersion: 4 }, jwtSecret);

  beforeEach(() => {
    process.env.JWT_SECRET = jwtSecret;
    process.env.NODE_ENV = 'test';
    vi.clearAllMocks();
    db.challengeFindUnique.mockResolvedValue(challenge);
    db.trustedFindMany.mockResolvedValue([]);
    db.trustedCreate.mockResolvedValue({ id: 'device-1' });
  });

  it('limits incorrect codes without issuing cookies', async () => {
    db.challengeUpdateMany.mockResolvedValue({ count: 1 });
    const req = {
      body: { challengeTicket: ticket, code: '000000' }, headers: {}, ip: '127.0.0.1', socket: {},
      get: () => 'Test browser',
    } as any;
    const res = responseMock();
    await verifyDeviceLogin(req, res);
    expect(db.challengeUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { attempts: { increment: 1 } } }));
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('consumes a code once and issues only HttpOnly cookies', async () => {
    db.challengeUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const req = {
      body: { challengeTicket: ticket, code, deviceName: 'Test browser' }, headers: {}, ip: '127.0.0.1', socket: {},
      get: () => 'Test browser',
    } as any;
    const first = responseMock();
    await verifyDeviceLogin(req, first);
    expect(first.status).not.toHaveBeenCalled();
    expect(first.cookie).toHaveBeenCalledTimes(2);
    expect(first.json).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ id: user.id }) }));

    const replay = responseMock();
    await verifyDeviceLogin(req, replay);
    expect(replay.status).toHaveBeenCalledWith(401);
    expect(replay.cookie).not.toHaveBeenCalled();
  });
});
