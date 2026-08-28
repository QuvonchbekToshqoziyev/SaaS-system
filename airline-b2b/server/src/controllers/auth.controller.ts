import { Request, Response } from 'express';
import { prisma } from '../db';
import bcrypt from 'bcrypt';
import { FirmUserRole, Prisma, Role } from '@prisma/client';
import { writeAuditLog } from '../utils/audit';
import { normalizeFirmUserRole } from '../utils/firm-user-roles';
import { signSessionToken } from '../utils/session-token';
import { PASSWORD_LENGTH_ERROR, passwordMeetsPolicy } from '../utils/password-policy';
import { clearSessionCookie, setSessionCookie } from '../utils/session-cookie';
import { clearLoginFailure, isLoginLocked, recordLoginFailure } from '../utils/login-protection';
import { resolveAppCapabilities } from '../utils/app-capabilities';
import {
  generateLoginVerificationCode, generateTrustedDeviceSecret, hashLoginVerificationCode,
  hashTrustedDeviceSecret, parseTrustedDeviceCookie, signDeviceVerificationTicket,
  timingSafeEqual, trustedDeviceCookieValue, verifyDeviceVerificationTicket,
  verifyLoginVerificationCode,
} from '../utils/device-verification';
import {
  clearTrustedDeviceCookie, readTrustedDeviceCookie, setTrustedDeviceCookie,
  trustedDeviceMaxAgeMs,
} from '../utils/trusted-device-cookie';
import { isLoginEmailConfigured, sendLoginVerificationEmail, warnLoginDeliveryFailure } from '../services/login-verification.service';
import { isTelegramConfigured, sendTelegramLoginVerificationCode } from '../services/telegram.service';

const adminUserSelect = {
  id: true,
  email: true,
  role: true,
  readOnlyAccess: true,
  firmRole: true,
  status: true,
  fullName: true,
  phone: true,
  firmId: true,
  firm: {
    select: {
      id: true,
      name: true,
      kind: true,
      currency: true,
      subscriptionEndsAt: true,
    },
  },
  firmAccesses: {
    select: {
      firmId: true,
      firm: { select: { id: true, name: true, kind: true, currency: true, subscriptionEndsAt: true } },
    },
    orderBy: { firm: { name: 'asc' } },
  },
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.UserSelect;

const INVALID_CREDENTIALS = 'Invalid credentials';

function normalizeAdminRole(value: unknown): Role {
  const role = String(value || Role.ADMIN).trim().toUpperCase();
  if (role === Role.SUPERADMIN) return Role.SUPERADMIN;
  return Role.ADMIN;
}

function normalizeUserRole(value: unknown, fallback: Role): Role {
  const role = String(value || fallback).trim().toUpperCase();
  if (role === Role.SUPERADMIN) return Role.SUPERADMIN;
  if (role === Role.ADMIN) return Role.ADMIN;
  return Role.FIRM;
}

async function serializeAdminUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: adminUserSelect,
  });
}

async function hasOtherWritableSuperadmin(userId: string) {
  return (await prisma.user.count({
    where: {
      id: { not: userId },
      role: Role.SUPERADMIN,
      readOnlyAccess: false,
      status: 'ACTIVE',
      deletedAt: null,
    },
  })) > 0;
}

async function replaceAdminFirmAccess(tx: Prisma.TransactionClient, userId: string, firmIds: string[]) {
  const uniqueFirmIds = Array.from(new Set(firmIds.map(String).map((id) => id.trim()).filter(Boolean)));
  const firms = uniqueFirmIds.length
    ? await tx.firm.findMany({ where: { id: { in: uniqueFirmIds } }, select: { id: true } })
    : [];

  if (firms.length !== uniqueFirmIds.length) {
    throw new Error('One or more firms were not found');
  }

  await tx.userFirmAccess.deleteMany({ where: { userId } });
  if (uniqueFirmIds.length) {
    await tx.userFirmAccess.createMany({
      data: uniqueFirmIds.map((firmId) => ({ userId, firmId })),
      skipDuplicates: true,
    });
  }
}

function loginKey(req: Request, email: string) {
  return `${email.toLowerCase()}|${req.ip || req.socket.remoteAddress || ''}`;
}

function sessionUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    readOnlyAccess: user.readOnlyAccess,
    firmRole: user.firmRole,
    firmId: user.firmId,
    firmKind: user.firm?.kind || null,
    subscriptionEndsAt: user.firm?.subscriptionEndsAt || null,
    capabilities: resolveAppCapabilities(user),
  };
}

async function issueSession(res: Response, user: { id: string; sessionVersion: number }) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || !jwtSecret.trim()) throw new Error('Server misconfigured');
  const token = signSessionToken({ userId: user.id, sessionVersion: user.sessionVersion }, jwtSecret);
  setSessionCookie(res, token);
}

async function auditAuth(req: Request, action: string, email: string, ok: boolean, metadata?: unknown) {
  await writeAuditLog(req, {
    action,
    entityType: 'auth',
    entityLabel: email,
    summary: `${action} ${ok ? 'succeeded' : 'failed'} for ${email}`,
    metadata,
  });
}

function requestIp(req: Request) {
  return String(req.ip || req.socket.remoteAddress || '').slice(0, 128) || null;
}

function requestUserAgent(req: Request) {
  return String(req.get('user-agent') || '').slice(0, 500) || null;
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

function qaLoginCode(email: string) {
  const code = String(process.env.DEV_QA_LOGIN_CODE || '').trim();
  return process.env.APP_ENV === 'development' && email.toLowerCase().endsWith('@ado.test') && /^\d{6}$/.test(code) ? code : null;
}

function challengeResponse(challenge: {
  id: string; userId: string; emailDelivered: boolean; telegramDelivered: boolean;
  qaDelivery: boolean; expiresAt: Date;
}, user: { email: string; sessionVersion: number }, jwtSecret: string) {
  return {
    verificationRequired: true,
    challengeTicket: signDeviceVerificationTicket({ challengeId: challenge.id, userId: challenge.userId, sessionVersion: user.sessionVersion }, jwtSecret),
    delivery: {
      email: challenge.emailDelivered || challenge.qaDelivery ? maskEmail(user.email) : null,
      telegram: challenge.telegramDelivered,
    },
    expiresAt: challenge.expiresAt,
  };
}

async function deliverLoginCode(user: {
  email: string; telegramChatId: string | null; telegramNotificationsEnabled: boolean;
}, code: string) {
  if (qaLoginCode(user.email)) return { emailDelivered: false, telegramDelivered: false, qaDelivery: true };
  let emailDelivered = false;
  let telegramDelivered = false;
  if (isLoginEmailConfigured()) {
    try {
      await sendLoginVerificationEmail(user.email, code);
      emailDelivered = true;
    } catch (err) {
      warnLoginDeliveryFailure('email', err);
    }
  }
  if (user.telegramChatId && user.telegramNotificationsEnabled && isTelegramConfigured()) {
    try {
      await sendTelegramLoginVerificationCode(user.telegramChatId, code);
      telegramDelivered = true;
    } catch (err) {
      warnLoginDeliveryFailure('telegram', err);
    }
  }
  if (process.env.LOGIN_EMAIL_REQUIRED === '1' && !emailDelivered) throw new Error('Login email delivery failed');
  if (!emailDelivered && !telegramDelivered) throw new Error('No login verification channel is available');
  return { emailDelivered, telegramDelivered, qaDelivery: false };
}

async function createLoginChallenge(req: Request, user: {
  id: string; email: string; sessionVersion: number; telegramChatId: string | null;
  telegramNotificationsEnabled: boolean;
}) {
  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (!jwtSecret) throw new Error('Server misconfigured');
  const activeChallenges = await prisma.loginVerificationChallenge.findMany({
    where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });
  if (activeChallenges.length >= 5) {
    await prisma.loginVerificationChallenge.updateMany({
      where: { id: { in: activeChallenges.slice(4).map((challenge) => challenge.id) } },
      data: { consumedAt: new Date() },
    });
  }
  const challenge = await prisma.loginVerificationChallenge.create({
    data: {
      userId: user.id, codeHash: '', expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      requestIp: requestIp(req), userAgent: requestUserAgent(req),
    },
  });
  const code = qaLoginCode(user.email) || generateLoginVerificationCode();
  try {
    const delivery = await deliverLoginCode(user, code);
    return prisma.loginVerificationChallenge.update({
      where: { id: challenge.id },
      data: { codeHash: hashLoginVerificationCode(challenge.id, code, jwtSecret), ...delivery },
    });
  } catch (err) {
    await prisma.loginVerificationChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
    throw err;
  }
}

async function useTrustedDevice(req: Request, res: Response, user: { id: string; sessionVersion: number }) {
  const parsed = parseTrustedDeviceCookie(readTrustedDeviceCookie(req.headers.cookie));
  if (!parsed) return false;
  const device = await prisma.trustedDevice.findUnique({ where: { id: parsed.deviceId } });
  const valid = device && device.userId === user.id && !device.revokedAt
    && device.expiresAt > new Date() && device.sessionVersion === user.sessionVersion
    && timingSafeEqual(hashTrustedDeviceSecret(parsed.secret), device.tokenHash);
  if (!valid) {
    clearTrustedDeviceCookie(res);
    return false;
  }
  const nextSecret = generateTrustedDeviceSecret();
  const rotated = await prisma.trustedDevice.updateMany({
    where: { id: device.id, tokenHash: device.tokenHash, revokedAt: null },
    data: { tokenHash: hashTrustedDeviceSecret(nextSecret), lastUsedAt: new Date(), lastIp: requestIp(req), userAgent: requestUserAgent(req) },
  });
  if (!rotated.count) {
    clearTrustedDeviceCookie(res);
    return false;
  }
  setTrustedDeviceCookie(res, trustedDeviceCookieValue(device.id, nextSecret));
  return true;
}

async function trustCurrentDevice(req: Request, res: Response, user: { id: string; sessionVersion: number }) {
  const secret = generateTrustedDeviceSecret();
  const active = await prisma.trustedDevice.findMany({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true }, orderBy: { lastUsedAt: 'desc' },
  });
  if (active.length >= 10) {
    await prisma.trustedDevice.updateMany({ where: { id: { in: active.slice(9).map((device) => device.id) } }, data: { revokedAt: new Date() } });
  }
  const device = await prisma.trustedDevice.create({
    data: {
      userId: user.id, tokenHash: hashTrustedDeviceSecret(secret), sessionVersion: user.sessionVersion,
      name: String(req.body?.deviceName || '').trim().slice(0, 120) || null,
      userAgent: requestUserAgent(req), lastIp: requestIp(req),
      expiresAt: new Date(Date.now() + trustedDeviceMaxAgeMs()),
    },
  });
  setTrustedDeviceCookie(res, trustedDeviceCookieValue(device.id, secret));
}

async function revokeTrustedSecurityState(tx: Prisma.TransactionClient, userId: string) {
  await tx.trustedDevice.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await tx.loginVerificationChallenge.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: new Date() } });
}

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const normalizedEmail = email.trim();
  const key = loginKey(req, normalizedEmail);
  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (isLoginLocked(key)) {
    await auditAuth(req, 'LOGIN_LOCKED', normalizedEmail, false);
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || !jwtSecret.trim()) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: normalizedEmail,
        mode: 'insensitive',
      },
      status: 'ACTIVE',
      deletedAt: null,
    },
    include: { firm: { select: { kind: true, subscriptionEndsAt: true } } },
  });
  if (!user) {
    recordLoginFailure(key);
    await auditAuth(req, 'LOGIN_FAILED', normalizedEmail, false);
    return res.status(401).json({ error: INVALID_CREDENTIALS });
  }

  if (user.role === Role.FIRM && user.firm?.subscriptionEndsAt && user.firm.subscriptionEndsAt <= new Date()) {
    return res.status(403).json({
      code: 'SUBSCRIPTION_EXPIRED',
      error: 'Obuna muddati tugagan. Obunani uzaytirish uchun biz bilan bog\'laning.',
    });
  }
  
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    recordLoginFailure(key);
    await auditAuth(req, 'LOGIN_FAILED', normalizedEmail, false, { userId: user.id });
    return res.status(401).json({ error: INVALID_CREDENTIALS });
  }

  clearLoginFailure(key);
  if (await useTrustedDevice(req, res, user)) {
    await issueSession(res, user);
    await auditAuth(req, 'LOGIN_SUCCEEDED', normalizedEmail, true, { userId: user.id, trustedDevice: true });
    return res.json({ user: sessionUser(user) });
  }

  try {
    const challenge = await createLoginChallenge(req, user);
    clearSessionCookie(res);
    await auditAuth(req, 'LOGIN_DEVICE_VERIFICATION_REQUIRED', normalizedEmail, true, {
      userId: user.id,
      emailDelivered: challenge.emailDelivered,
      telegramDelivered: challenge.telegramDelivered,
    });
    return res.json(challengeResponse(challenge, user, jwtSecret));
  } catch {
    await auditAuth(req, 'LOGIN_VERIFICATION_DELIVERY_FAILED', normalizedEmail, false, { userId: user.id });
    return res.status(503).json({ error: 'Sign-in verification is temporarily unavailable. Contact your administrator.' });
  }
};

export const getSession = async (req: Request, res: Response) => {
  const user = (req as any).user as { id: string; sessionVersion: number; [key: string]: unknown };
  if (!readTrustedDeviceCookie(req.headers.cookie)) await trustCurrentDevice(req, res, user);
  const { sessionVersion: _sessionVersion, ...publicUser } = user;
  return res.json({ user: publicUser });
};

export const logout = async (_req: Request, res: Response) => {
  clearSessionCookie(res);
  return res.json({ ok: true });
};

export const changePassword = async (req: Request, res: Response) => {
  const authUser = (req as any).user as { userId?: string } | undefined;
  const userId = authUser?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }
  if (!passwordMeetsPolicy(newPassword)) {
    return res.status(400).json({ error: PASSWORD_LENGTH_ERROR });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid current password' });

  const hashed = await bcrypt.hash(newPassword, 10);
  const updated = await prisma.$transaction(async (tx) => {
    const nextUser = await tx.user.update({
      where: { id: userId },
      data: { password: hashed, sessionVersion: { increment: 1 } },
      select: { id: true, sessionVersion: true },
    });
    await revokeTrustedSecurityState(tx, userId);
    return nextUser;
  });
  await writeAuditLog(req, {
    action: 'UPDATE',
    entityType: 'user',
    entityId: userId,
    entityLabel: user.email,
    summary: `Changed password for ${user.email}`,
    metadata: { field: 'password' },
  });
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || !jwtSecret.trim()) return res.status(500).json({ error: 'Server misconfigured' });
  const token = signSessionToken({ userId, sessionVersion: updated.sessionVersion }, jwtSecret);
  setSessionCookie(res, token);
  clearTrustedDeviceCookie(res);
  return res.json({ ok: true });
};

export const verifyDeviceLogin = async (req: Request, res: Response) => {
  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (!jwtSecret) return res.status(500).json({ error: 'Server misconfigured' });
  let ticket;
  try {
    ticket = verifyDeviceVerificationTicket(String(req.body?.challengeTicket || ''), jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired verification session' });
  }
  const challenge = await prisma.loginVerificationChallenge.findUnique({
    where: { id: ticket.challengeId },
    include: { user: { include: { firm: { select: { kind: true, subscriptionEndsAt: true } } } } },
  });
  const user = challenge?.user;
  if (!challenge || !user || challenge.userId !== ticket.userId || challenge.consumedAt
    || challenge.expiresAt <= new Date() || user.status !== 'ACTIVE' || user.deletedAt
    || user.sessionVersion !== ticket.sessionVersion) {
    return res.status(401).json({ error: 'Invalid or expired verification session' });
  }
  if (challenge.attempts >= 5) return res.status(429).json({ error: 'Too many verification attempts. Sign in again.' });
  if (!verifyLoginVerificationCode(challenge.id, req.body?.code, challenge.codeHash, jwtSecret)) {
    await prisma.loginVerificationChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { attempts: { increment: 1 } } });
    await auditAuth(req, 'LOGIN_DEVICE_VERIFICATION_FAILED', user.email, false, { userId: user.id, challengeId: challenge.id });
    return res.status(401).json({ error: 'Invalid verification code' });
  }
  const consumed = await prisma.loginVerificationChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null, attempts: { lt: 5 }, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (!consumed.count) return res.status(401).json({ error: 'Invalid or expired verification session' });
  await trustCurrentDevice(req, res, user);
  await issueSession(res, user);
  await auditAuth(req, 'LOGIN_SUCCEEDED', user.email, true, { userId: user.id, newTrustedDevice: true });
  return res.json({ user: sessionUser(user) });
};

export const resendDeviceLoginCode = async (req: Request, res: Response) => {
  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (!jwtSecret) return res.status(500).json({ error: 'Server misconfigured' });
  let ticket;
  try {
    ticket = verifyDeviceVerificationTicket(String(req.body?.challengeTicket || ''), jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired verification session' });
  }
  const challenge = await prisma.loginVerificationChallenge.findUnique({ where: { id: ticket.challengeId }, include: { user: true } });
  const user = challenge?.user;
  if (!challenge || !user || challenge.consumedAt || challenge.expiresAt <= new Date()
    || user.status !== 'ACTIVE' || user.deletedAt || user.sessionVersion !== ticket.sessionVersion) {
    return res.status(401).json({ error: 'Invalid or expired verification session' });
  }
  const retryAfterSeconds = Math.max(0, 60 - Math.floor((Date.now() - challenge.sentAt.getTime()) / 1000));
  if (retryAfterSeconds > 0) return res.status(429).json({ error: 'Wait before requesting another code', retryAfterSeconds });
  try {
    const nextChallenge = await createLoginChallenge(req, user);
    await prisma.loginVerificationChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
    await auditAuth(req, 'LOGIN_DEVICE_VERIFICATION_RESENT', user.email, true, { userId: user.id });
    return res.json(challengeResponse(nextChallenge, user, jwtSecret));
  } catch {
    await auditAuth(req, 'LOGIN_VERIFICATION_DELIVERY_FAILED', user.email, false, { userId: user.id });
    return res.status(503).json({ error: 'Sign-in verification is temporarily unavailable. Contact your administrator.' });
  }
};

export const forgetTrustedDevice = async (req: Request, res: Response) => {
  const authUser = (req as any).user as { userId?: string } | undefined;
  if (!authUser?.userId) return res.status(401).json({ error: 'Unauthorized' });
  const parsed = parseTrustedDeviceCookie(readTrustedDeviceCookie(req.headers.cookie));
  if (parsed) {
    await prisma.trustedDevice.updateMany({ where: { id: parsed.deviceId, userId: authUser.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  clearTrustedDeviceCookie(res);
  await writeAuditLog(req, {
    action: 'TRUSTED_DEVICE_FORGOTTEN', entityType: 'user', entityId: authUser.userId,
    summary: 'Removed trust from the current device',
  });
  return res.json({ ok: true });
};

export const listUsers = async (req: Request, res: Response) => {
  const authUser = ((req as any).user || {}) as { role?: string; userId?: string };
  const role = String(authUser.role || '').toUpperCase();
  const users = await prisma.user.findMany({
    where: {
      status: { not: 'DELETED' },
      deletedAt: null,
      ...(role === 'SUPERADMIN' ? {} : { id: authUser.userId }),
    },
    select: {
      id: true,
      email: true,
      role: true,
      readOnlyAccess: true,
      firmRole: true,
      status: true,
      fullName: true,
      phone: true,
      firmId: true,
      firm: {
        select: {
          id: true,
          name: true,
          currency: true,
          subscriptionEndsAt: true,
        },
      },
      firmAccesses: {
        select: {
          firmId: true,
          firm: { select: { id: true, name: true, currency: true, subscriptionEndsAt: true } },
        },
        orderBy: { firm: { name: 'asc' } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json(users);
};

export const listAdmins = async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    where: { role: { in: [Role.ADMIN, Role.SUPERADMIN] }, status: { not: 'DELETED' }, deletedAt: null },
    select: adminUserSelect,
    orderBy: [{ role: 'desc' }, { createdAt: 'desc' }],
  });

  return res.json(users);
};

export const createAdmin = async (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const role = normalizeAdminRole(req.body?.role);
  const readOnlyAccess = role === Role.SUPERADMIN && req.body?.readOnlyAccess === true;
  const firmIds: string[] = Array.isArray(req.body?.firmIds) ? req.body.firmIds : [];

  if (!email) return res.status(400).json({ error: 'Email is required' });
  if (!passwordMeetsPolicy(password)) return res.status(400).json({ error: PASSWORD_LENGTH_ERROR });

  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
  if (existing) return res.status(400).json({ error: 'Account already exists for this email' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          fullName: fullName || undefined,
          phone: phone || undefined,
          role,
          readOnlyAccess,
        },
        select: { id: true },
      });

      if (role === Role.ADMIN && firmIds.length) {
        const uniqueFirmIds = Array.from(new Set(firmIds.map(String).map((id) => id.trim()).filter(Boolean)));
        const firms = uniqueFirmIds.length
          ? await tx.firm.findMany({ where: { id: { in: uniqueFirmIds } }, select: { id: true } })
          : [];
        if (firms.length !== uniqueFirmIds.length) throw new Error('One or more firms were not found');
        await tx.userFirmAccess.createMany({
          data: uniqueFirmIds.map((firmId) => ({ userId: created.id, firmId })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    const createdUser = await serializeAdminUser(user.id);
    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'user',
      entityId: user.id,
      entityLabel: createdUser?.email || email,
      summary: `Created admin ${createdUser?.email || email}`,
      after: createdUser,
    });
    return res.status(201).json(createdUser);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to create admin' });
  }
};

export const updateAdmin = async (req: Request, res: Response) => {
  const authUser = ((req as any).user || {}) as { userId?: string };
  const userId = String(req.params.id || '');
  if (!userId) return res.status(400).json({ error: 'User id is required' });

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: adminUserSelect });
  if (!existing) return res.status(404).json({ error: 'Admin not found' });
  if (existing.role === Role.FIRM) return res.status(400).json({ error: 'Only admin accounts can be edited here' });

  const nextRole = req.body?.role === undefined ? existing.role : normalizeAdminRole(req.body.role);
  const nextReadOnlyAccess = nextRole === Role.SUPERADMIN
    && (req.body?.readOnlyAccess === undefined ? existing.readOnlyAccess : req.body.readOnlyAccess === true);
  if (authUser.userId === userId && nextRole !== Role.SUPERADMIN) {
    return res.status(400).json({ error: 'You cannot remove your own superadmin role' });
  }
  if (existing.role === Role.SUPERADMIN && !existing.readOnlyAccess
    && (nextRole !== Role.SUPERADMIN || nextReadOnlyAccess)
    && !(await hasOtherWritableSuperadmin(userId))) {
    return res.status(400).json({ error: 'At least one writable superadmin is required' });
  }

  try {
    const data: Prisma.UserUpdateInput = { role: nextRole, readOnlyAccess: nextReadOnlyAccess };
    const nextEmail = typeof req.body?.email === 'string' && req.body.email.trim() ? req.body.email.trim().toLowerCase() : existing.email;
    const securityChanged = nextRole !== existing.role || nextReadOnlyAccess !== existing.readOnlyAccess
      || nextEmail !== existing.email.toLowerCase() || (typeof req.body?.password === 'string' && Boolean(req.body.password))
      || Array.isArray(req.body?.firmIds);
    if (nextEmail !== existing.email.toLowerCase()) data.email = nextEmail;
    if (typeof req.body?.fullName === 'string') data.fullName = req.body.fullName.trim() || null;
    if (typeof req.body?.phone === 'string') data.phone = req.body.phone.trim() || null;
    if (typeof req.body?.password === 'string' && req.body.password) {
      if (!passwordMeetsPolicy(req.body.password)) return res.status(400).json({ error: PASSWORD_LENGTH_ERROR });
      data.password = await bcrypt.hash(req.body.password, 10);
    }
    if (securityChanged) data.sessionVersion = { increment: 1 };

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data });
      if (securityChanged) await revokeTrustedSecurityState(tx, userId);
      if (Array.isArray(req.body?.firmIds)) {
        const firmIds: string[] = nextRole === Role.ADMIN ? req.body.firmIds.map(String) : [];
        const uniqueFirmIds = Array.from(new Set(firmIds.map((id) => id.trim()).filter(Boolean)));
        const firms = uniqueFirmIds.length
          ? await tx.firm.findMany({ where: { id: { in: uniqueFirmIds } }, select: { id: true } })
          : [];
        if (firms.length !== uniqueFirmIds.length) throw new Error('One or more firms were not found');
        await tx.userFirmAccess.deleteMany({ where: { userId } });
        if (uniqueFirmIds.length) {
          await tx.userFirmAccess.createMany({
            data: uniqueFirmIds.map((firmId) => ({ userId, firmId })),
            skipDuplicates: true,
          });
        }
      } else if (nextRole === Role.SUPERADMIN) {
        await tx.userFirmAccess.deleteMany({ where: { userId } });
      }
    });

    const updated = await serializeAdminUser(userId);
    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'user',
      entityId: userId,
      entityLabel: updated?.email || userId,
      summary: `Updated admin ${updated?.email || userId}`,
      before: existing,
      after: updated,
    });
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to update admin' });
  }
};

export const deleteAdmin = async (req: Request, res: Response) => {
  const authUser = ((req as any).user || {}) as { userId?: string };
  const userId = String(req.params.id || '');
  const actorUserId = authUser.userId ? String(authUser.userId) : '';
  if (!userId) return res.status(400).json({ error: 'User id is required' });
  if (!actorUserId) return res.status(401).json({ error: 'Unauthorized' });
  if (actorUserId === userId) return res.status(400).json({ error: 'You cannot delete your own account' });

  try {
    const existing = await prisma.user.findUnique({ where: { id: userId }, select: adminUserSelect });
    if (!existing || existing.status === 'DELETED' || existing.deletedAt) return res.status(404).json({ error: 'Admin not found' });
    if (existing.role === Role.FIRM) return res.status(400).json({ error: 'Only admin accounts can be deleted here' });

    if (existing.role === Role.SUPERADMIN && !existing.readOnlyAccess && !(await hasOtherWritableSuperadmin(userId))) {
      return res.status(400).json({ error: 'At least one writable superadmin is required' });
    }

    const deleted = await prisma.$transaction(async (tx) => {
      await tx.userFirmAccess.deleteMany({ where: { userId } });
      await revokeTrustedSecurityState(tx, userId);
      return tx.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          deletedByUserId: actorUserId,
          deleteReason: typeof req.body?.reason === 'string' ? req.body.reason.trim() || null : null,
          sessionVersion: { increment: 1 },
        },
        select: adminUserSelect,
      });
    });
    await writeAuditLog(req, {
      action: 'SOFT_DELETE',
      entityType: 'user',
      entityId: userId,
      entityLabel: existing.email,
      summary: `Soft deleted admin ${existing.email}`,
      before: existing,
      after: deleted,
    });
    return res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Admin not found' });
    return res.status(400).json({ error: err?.message || 'Failed to delete admin' });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  const authUser = ((req as any).user || {}) as { userId?: string };
  const userId = String(req.params.id || '');
  if (!userId) return res.status(400).json({ error: 'User id is required' });

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: adminUserSelect });
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const nextRole = req.body?.role === undefined ? existing.role : normalizeUserRole(req.body.role, existing.role);
  const nextReadOnlyAccess = nextRole === Role.SUPERADMIN
    && (req.body?.readOnlyAccess === undefined ? existing.readOnlyAccess : req.body.readOnlyAccess === true);
  if (authUser.userId === userId && nextRole !== Role.SUPERADMIN) {
    return res.status(400).json({ error: 'You cannot remove your own superadmin role' });
  }

  if (existing.role === Role.SUPERADMIN && !existing.readOnlyAccess
    && (nextRole !== Role.SUPERADMIN || nextReadOnlyAccess)
    && !(await hasOtherWritableSuperadmin(userId))) {
    return res.status(400).json({ error: 'At least one writable superadmin is required' });
  }

  try {
    const data: Prisma.UserUpdateInput = { role: nextRole, readOnlyAccess: nextReadOnlyAccess };
    const nextEmail = typeof req.body?.email === 'string' && req.body.email.trim() ? req.body.email.trim().toLowerCase() : existing.email;
    const securityChanged = nextRole !== existing.role || nextReadOnlyAccess !== existing.readOnlyAccess
      || nextEmail !== existing.email.toLowerCase() || (typeof req.body?.password === 'string' && Boolean(req.body.password))
      || req.body?.firmId !== undefined || req.body?.firmRole !== undefined || Array.isArray(req.body?.firmIds);
    if (nextEmail !== existing.email.toLowerCase()) data.email = nextEmail;
    if (typeof req.body?.fullName === 'string') data.fullName = req.body.fullName.trim() || null;
    if (typeof req.body?.phone === 'string') data.phone = req.body.phone.trim() || null;
    if (nextRole === Role.FIRM) {
      data.firmRole = normalizeFirmUserRole(req.body?.firmRole ?? existing.firmRole);
    }
    if (typeof req.body?.password === 'string' && req.body.password) {
      if (!passwordMeetsPolicy(req.body.password)) return res.status(400).json({ error: PASSWORD_LENGTH_ERROR });
      data.password = await bcrypt.hash(req.body.password, 10);
    }
    if (securityChanged) data.sessionVersion = { increment: 1 };

    if (req.body?.firmId !== undefined) {
      const firmId = typeof req.body.firmId === 'string' && req.body.firmId.trim() ? req.body.firmId.trim() : null;
      if (firmId) {
        const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { id: true } });
        if (!firm) return res.status(404).json({ error: 'Firm not found' });
      }
      data.firm = firmId ? { connect: { id: firmId } } : { disconnect: true };
    }

    const nextFirmId = req.body?.firmId !== undefined
      ? (typeof req.body.firmId === 'string' && req.body.firmId.trim() ? req.body.firmId.trim() : null)
      : existing.firmId;
    const nextFirmRole = nextRole === Role.FIRM ? normalizeFirmUserRole(req.body?.firmRole ?? existing.firmRole) : null;
    if (nextRole === Role.FIRM && nextFirmRole === FirmUserRole.FIRM_ADMIN && nextFirmId) {
      const existingFirmAdmin = await prisma.user.findFirst({
        where: {
          id: { not: userId },
          firmId: nextFirmId,
          role: Role.FIRM,
          firmRole: FirmUserRole.FIRM_ADMIN,
          status: { not: 'DELETED' },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (existingFirmAdmin) return res.status(409).json({ error: 'This firm already has a firm admin' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data });
      if (securityChanged) await revokeTrustedSecurityState(tx, userId);

      if (Array.isArray(req.body?.firmIds)) {
        const firmIds: string[] = nextRole === Role.ADMIN ? req.body.firmIds.map(String) : [];
        const uniqueFirmIds: string[] = Array.from(new Set(firmIds.map((id: string) => id.trim()).filter(Boolean)));
        const firms = uniqueFirmIds.length
          ? await tx.firm.findMany({ where: { id: { in: uniqueFirmIds } }, select: { id: true } })
          : [];
        if (firms.length !== uniqueFirmIds.length) throw new Error('One or more firms were not found');
        await tx.userFirmAccess.deleteMany({ where: { userId } });
        if (uniqueFirmIds.length) {
          await tx.userFirmAccess.createMany({
            data: uniqueFirmIds.map((firmId) => ({ userId, firmId })),
            skipDuplicates: true,
          });
        }
      } else if (nextRole !== Role.ADMIN) {
        await tx.userFirmAccess.deleteMany({ where: { userId } });
      }
    });

    const updated = await prisma.user.findUnique({
      where: { id: userId },
      select: adminUserSelect,
    });
    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'user',
      entityId: userId,
      entityLabel: updated?.email || userId,
      summary: `Updated user ${updated?.email || userId}`,
      before: existing,
      after: updated,
    });
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to update user' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  const authUser = ((req as any).user || {}) as { userId?: string };
  const userId = String(req.params.id || '');
  const actorUserId = authUser.userId ? String(authUser.userId) : '';

  if (!userId) return res.status(400).json({ error: 'User id is required' });
  if (!actorUserId) return res.status(401).json({ error: 'Unauthorized' });
  if (actorUserId === userId) return res.status(400).json({ error: 'You cannot delete your own account' });

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: adminUserSelect });
  if (!existing) return res.status(404).json({ error: 'User not found' });

  if (existing.role === Role.SUPERADMIN && !existing.readOnlyAccess && !(await hasOtherWritableSuperadmin(userId))) {
    return res.status(400).json({ error: 'At least one writable superadmin is required' });
  }

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      await tx.userFirmAccess.deleteMany({ where: { userId } });
      await revokeTrustedSecurityState(tx, userId);
      return tx.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          deletedByUserId: actorUserId,
          deleteReason: typeof req.body?.reason === 'string' ? req.body.reason.trim() || null : null,
          sessionVersion: { increment: 1 },
        },
        select: adminUserSelect,
      });
    });
    await writeAuditLog(req, {
      action: 'SOFT_DELETE',
      entityType: 'user',
      entityId: userId,
      entityLabel: existing.email,
      summary: `Soft deleted user ${existing.email}`,
      before: existing,
      after: deleted,
    });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to delete user' });
  }
};

export const setUserFirmAccess = async (req: Request, res: Response) => {
  const userId = String(req.params.id || '');
  const firmIds: string[] = Array.isArray(req.body?.firmIds) ? req.body.firmIds.map(String) : [];

  if (!userId) return res.status(400).json({ error: 'User id is required' });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true, deletedAt: true } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.status === 'DELETED' || user.deletedAt) return res.status(400).json({ error: 'Deleted users cannot receive firm access' });
  if (user.role !== 'ADMIN') return res.status(400).json({ error: 'Access can only be assigned to admins' });

  try {
    const before = await prisma.user.findUnique({ where: { id: userId }, select: adminUserSelect });
    await prisma.$transaction(async (tx) => {
      await replaceAdminFirmAccess(tx, userId, firmIds);
      await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
      await revokeTrustedSecurityState(tx, userId);
    });
    const updated = await prisma.user.findUnique({
      where: { id: userId },
      select: adminUserSelect,
    });
    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'userFirmAccess',
      entityId: userId,
      entityLabel: updated?.email || userId,
      summary: `Updated firm access for ${updated?.email || userId}`,
      before,
      after: updated,
      metadata: { firmIds },
    });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to update access' });
  }

  const updated = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      readOnlyAccess: true,
      firmRole: true,
      status: true,
      fullName: true,
      phone: true,
      firmId: true,
      firmAccesses: {
        select: {
          firmId: true,
          firm: { select: { id: true, name: true, currency: true, subscriptionEndsAt: true } },
        },
        orderBy: { firm: { name: 'asc' } },
      },
    },
  });

  return res.json(updated);
};
