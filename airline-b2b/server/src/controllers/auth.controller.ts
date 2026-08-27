import { Request, Response } from 'express';
import { prisma } from '../db';
import bcrypt from 'bcrypt';
import { FirmUserRole, Prisma, Role } from '@prisma/client';
import { writeAuditLog } from '../utils/audit';
import { normalizeFirmUserRole } from '../utils/firm-user-roles';
import { signSessionToken } from '../utils/session-token';
import { PASSWORD_LENGTH_ERROR, passwordMeetsPolicy } from '../utils/password-policy';
import { clearSessionCookie, setSessionCookie } from '../utils/session-cookie';
import { buildTotpUri, generateRecoveryCodes, generateTotpSecret, signMfaTicket, verifyMfaTicket, verifyTotp } from '../utils/mfa';
import { decryptChatString, encryptChatString } from '../utils/chat-crypto';
import { clearLoginFailure, isLoginLocked, recordLoginFailure } from '../utils/login-protection';
import { resolveAppCapabilities } from '../utils/app-capabilities';

const adminUserSelect = {
  id: true,
  email: true,
  role: true,
  readOnlyAccess: true,
  firmRole: true,
  status: true,
  mfaConfirmedAt: true,
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

async function replaceAdminFirmAccess(userId: string, firmIds: string[]) {
  const uniqueFirmIds = Array.from(new Set(firmIds.map(String).map((id) => id.trim()).filter(Boolean)));
  const firms = uniqueFirmIds.length
    ? await prisma.firm.findMany({ where: { id: { in: uniqueFirmIds } }, select: { id: true } })
    : [];

  if (firms.length !== uniqueFirmIds.length) {
    throw new Error('One or more firms were not found');
  }

  await prisma.userFirmAccess.deleteMany({ where: { userId } });
  if (uniqueFirmIds.length) {
    await prisma.userFirmAccess.createMany({
      data: uniqueFirmIds.map((firmId) => ({ userId, firmId })),
      skipDuplicates: true,
    });
  }
}

function isPlatformAdmin(role: unknown) {
  const normalized = String(role || '').toUpperCase();
  return normalized === Role.SUPERADMIN || normalized === Role.ADMIN;
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
    mfaConfirmedAt: user.mfaConfirmedAt || null,
    capabilities: resolveAppCapabilities(user),
  };
}

function decryptedMfaSecret(value: string | null | undefined) {
  const secret = decryptChatString(value);
  if (!secret || secret === '[encrypted message unavailable]') return null;
  return secret;
}

async function issueSession(res: Response, user: { id: string; sessionVersion: number }, cookieSession: boolean) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || !jwtSecret.trim()) throw new Error('Server misconfigured');
  const token = signSessionToken({ userId: user.id, sessionVersion: user.sessionVersion }, jwtSecret);
  if (cookieSession) setSessionCookie(res, token);
  return cookieSession ? {} : { token };
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

  const cookieSession = req.body?.sessionTransport === 'cookie';
  clearLoginFailure(key);
  if (isPlatformAdmin(user.role) && user.mfaConfirmedAt) {
    await auditAuth(req, 'LOGIN_PASSWORD_OK_MFA_REQUIRED', normalizedEmail, true, { userId: user.id });
    return res.json({ mfaRequired: true, mfaTicket: signMfaTicket({ userId: user.id, sessionVersion: user.sessionVersion }, jwtSecret) });
  }

  const transport = await issueSession(res, user, cookieSession);
  const mfaSetupRequired = isPlatformAdmin(user.role) && !user.mfaConfirmedAt;
  await auditAuth(req, 'LOGIN_SUCCEEDED', normalizedEmail, true, { userId: user.id, mfaSetupRequired });
  res.json({ ...transport, mfaSetupRequired, user: sessionUser(user) });
};

export const getSession = async (req: Request, res: Response) => {
  const user = (req as any).user;
  return res.json({ user });
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
  const updated = await prisma.user.update({ where: { id: userId }, data: { password: hashed, sessionVersion: { increment: 1 } }, select: { id: true, sessionVersion: true } });
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
  const cookieSession = req.body?.sessionTransport === 'cookie';
  if (cookieSession) setSessionCookie(res, token);
  return res.json({ ok: true, ...(cookieSession ? {} : { token }) });
};

export const setupMfa = async (req: Request, res: Response) => {
  const authUser = (req as any).user as { userId?: string; role?: string } | undefined;
  if (!authUser?.userId || !isPlatformAdmin(authUser.role)) return res.status(403).json({ error: 'Admin account required' });

  const user = await prisma.user.findUnique({ where: { id: authUser.userId }, select: { id: true, email: true, role: true } });
  if (!user || !isPlatformAdmin(user.role)) return res.status(404).json({ error: 'Admin account not found' });

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecret: encryptChatString(secret), mfaConfirmedAt: null, mfaRecoveryCodeHashes: [], mfaRecoveryCodeLastUsedAt: null },
  });
  await writeAuditLog(req, { action: 'MFA_SETUP_STARTED', entityType: 'user', entityId: user.id, entityLabel: user.email, summary: `MFA setup started for ${user.email}` });
  return res.json({ secret, otpauthUri: buildTotpUri(user.email, secret) });
};

export const confirmMfa = async (req: Request, res: Response) => {
  const authUser = (req as any).user as { userId?: string; role?: string } | undefined;
  if (!authUser?.userId || !isPlatformAdmin(authUser.role)) return res.status(403).json({ error: 'Admin account required' });

  const user = await prisma.user.findUnique({
    where: { id: authUser.userId },
    include: { firm: { select: { kind: true, subscriptionEndsAt: true } } },
  });
  const secret = decryptedMfaSecret(user?.mfaSecret);
  if (!user || !secret) return res.status(400).json({ error: 'MFA setup is not active' });
  if (!verifyTotp(secret, req.body?.code)) {
    await auditAuth(req, 'MFA_CONFIRM_FAILED', user.email, false, { userId: user.id });
    return res.status(401).json({ error: 'Invalid MFA code' });
  }

  const recoveryCodes = generateRecoveryCodes();
  const hashes = await Promise.all(recoveryCodes.map((code) => bcrypt.hash(code, 10)));
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { mfaConfirmedAt: new Date(), mfaRecoveryCodeHashes: hashes, sessionVersion: { increment: 1 } },
    include: { firm: { select: { kind: true, subscriptionEndsAt: true } } },
  });
  const cookieSession = req.body?.sessionTransport !== 'token';
  const transport = await issueSession(res, updated, cookieSession);
  await writeAuditLog(req, { action: 'MFA_ENABLED', entityType: 'user', entityId: user.id, entityLabel: user.email, summary: `MFA enabled for ${user.email}` });
  return res.json({ ...transport, user: sessionUser(updated), recoveryCodes });
};

export const verifyMfaLogin = async (req: Request, res: Response) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || !jwtSecret.trim()) return res.status(500).json({ error: 'Server misconfigured' });
  try {
    const ticket = verifyMfaTicket(String(req.body?.mfaTicket || ''), jwtSecret);
    const user = await prisma.user.findUnique({
      where: { id: ticket.userId },
      include: { firm: { select: { kind: true, subscriptionEndsAt: true } } },
    });
    const secret = decryptedMfaSecret(user?.mfaSecret);
    if (!user || user.status !== 'ACTIVE' || user.deletedAt || user.sessionVersion !== ticket.sessionVersion || !user.mfaConfirmedAt || !secret) throw new Error('Invalid MFA session');
    if (!verifyTotp(secret, req.body?.code)) {
      await auditAuth(req, 'MFA_LOGIN_FAILED', user.email, false, { userId: user.id });
      return res.status(401).json({ error: 'Invalid MFA code' });
    }
    const cookieSession = req.body?.sessionTransport === 'cookie';
    const transport = await issueSession(res, user, cookieSession);
    await auditAuth(req, 'MFA_LOGIN_SUCCEEDED', user.email, true, { userId: user.id });
    return res.json({ ...transport, user: sessionUser(user) });
  } catch {
    return res.status(401).json({ error: 'Invalid MFA session' });
  }
};

export const recoverMfaLogin = async (req: Request, res: Response) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || !jwtSecret.trim()) return res.status(500).json({ error: 'Server misconfigured' });
  try {
    const ticket = verifyMfaTicket(String(req.body?.mfaTicket || ''), jwtSecret);
    const user = await prisma.user.findUnique({
      where: { id: ticket.userId },
      include: { firm: { select: { kind: true, subscriptionEndsAt: true } } },
    });
    if (!user || user.status !== 'ACTIVE' || user.deletedAt || user.sessionVersion !== ticket.sessionVersion || !user.mfaConfirmedAt) throw new Error('Invalid MFA session');
    const code = String(req.body?.recoveryCode || '').trim().toUpperCase();
    let usedIndex = -1;
    for (let i = 0; i < user.mfaRecoveryCodeHashes.length; i += 1) {
      if (await bcrypt.compare(code, user.mfaRecoveryCodeHashes[i])) {
        usedIndex = i;
        break;
      }
    }
    if (usedIndex < 0) {
      await auditAuth(req, 'MFA_RECOVERY_FAILED', user.email, false, { userId: user.id });
      return res.status(401).json({ error: 'Invalid recovery code' });
    }
    const nextHashes = user.mfaRecoveryCodeHashes.filter((_, index) => index !== usedIndex);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { mfaRecoveryCodeHashes: nextHashes, mfaRecoveryCodeLastUsedAt: new Date() },
      include: { firm: { select: { kind: true, subscriptionEndsAt: true } } },
    });
    const cookieSession = req.body?.sessionTransport === 'cookie';
    const transport = await issueSession(res, updated, cookieSession);
    await auditAuth(req, 'MFA_RECOVERY_SUCCEEDED', user.email, true, { userId: user.id });
    return res.json({ ...transport, user: sessionUser(updated) });
  } catch {
    return res.status(401).json({ error: 'Invalid MFA session' });
  }
};

export const disableMfa = async (req: Request, res: Response) => {
  const authUser = (req as any).user as { userId?: string; role?: string } | undefined;
  if (!authUser?.userId) return res.status(401).json({ error: 'Unauthorized' });
  const targetUserId = String(req.body?.userId || authUser.userId);
  const isSelf = targetUserId === authUser.userId;
  if (!isSelf && String(authUser.role).toUpperCase() !== Role.SUPERADMIN) return res.status(403).json({ error: 'Superadmin required' });

  const user = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!user || !isPlatformAdmin(user.role)) return res.status(404).json({ error: 'Admin account not found' });
  if (isSelf) {
    const validPassword = typeof req.body?.password === 'string' && await bcrypt.compare(req.body.password, user.password);
    const secret = decryptedMfaSecret(user.mfaSecret);
    const validCode = secret && verifyTotp(secret, req.body?.code);
    if (!validPassword || !validCode) return res.status(401).json({ error: 'Password and MFA code are required' });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecret: null, mfaConfirmedAt: null, mfaRecoveryCodeHashes: [], mfaRecoveryCodeLastUsedAt: null, sessionVersion: { increment: 1 } },
  });
  await writeAuditLog(req, { action: 'MFA_DISABLED', entityType: 'user', entityId: user.id, entityLabel: user.email, summary: `MFA disabled for ${user.email}` });
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
    if (typeof req.body?.email === 'string' && req.body.email.trim()) data.email = req.body.email.trim().toLowerCase();
    if (typeof req.body?.fullName === 'string') data.fullName = req.body.fullName.trim() || null;
    if (typeof req.body?.phone === 'string') data.phone = req.body.phone.trim() || null;
    if (typeof req.body?.password === 'string' && req.body.password) {
      if (!passwordMeetsPolicy(req.body.password)) return res.status(400).json({ error: PASSWORD_LENGTH_ERROR });
      data.password = await bcrypt.hash(req.body.password, 10);
      data.sessionVersion = { increment: 1 };
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data });
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
      return tx.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          deletedByUserId: actorUserId,
          deleteReason: typeof req.body?.reason === 'string' ? req.body.reason.trim() || null : null,
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
    if (typeof req.body?.email === 'string' && req.body.email.trim()) data.email = req.body.email.trim().toLowerCase();
    if (typeof req.body?.fullName === 'string') data.fullName = req.body.fullName.trim() || null;
    if (typeof req.body?.phone === 'string') data.phone = req.body.phone.trim() || null;
    if (nextRole === Role.FIRM) {
      data.firmRole = normalizeFirmUserRole(req.body?.firmRole ?? existing.firmRole);
    }
    if (typeof req.body?.password === 'string' && req.body.password) {
      if (!passwordMeetsPolicy(req.body.password)) return res.status(400).json({ error: PASSWORD_LENGTH_ERROR });
      data.password = await bcrypt.hash(req.body.password, 10);
      data.sessionVersion = { increment: 1 };
    }

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
      return tx.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          deletedByUserId: actorUserId,
          deleteReason: typeof req.body?.reason === 'string' ? req.body.reason.trim() || null : null,
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
    await replaceAdminFirmAccess(userId, firmIds);
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
