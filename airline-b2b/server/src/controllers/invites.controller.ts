import { Request, Response } from 'express';
import { prisma } from '../db';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { FirmUserRole, Prisma, Role } from '@prisma/client';
import { canAccessFirm } from '../utils/access';
import { isFirmAdminLike, normalizeFirmUserRole } from '../utils/firm-user-roles';
import { resolveExchangeRateToUzs } from '../services/currency-rates.service';
import { PASSWORD_LENGTH_ERROR, passwordMeetsPolicy } from '../utils/password-policy';

const ALLOWED_ROLES = new Set(Object.values(Role));

function normalizeCurrency(value: unknown): string {
  const currency = String(value || 'UZS').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid currency code');
  return currency;
}

function parseDecimal(value: unknown): Prisma.Decimal | undefined {
  if (value === null || value === undefined || String(value).trim() === '') return undefined;
  const decimal = new Prisma.Decimal(String(value).trim());
  if (!decimal.isFinite()) throw new Error('Amount must be a valid number');
  return decimal.toDecimalPlaces(4);
}

function readPriorBalanceInput(body: any) {
  const amount = parseDecimal(body?.priorBalanceAmount);
  if (!amount) return null;
  const direction = String(body?.priorBalanceDirection || 'DEBT').trim().toUpperCase();
  if (!['DEBT', 'CREDIT'].includes(direction)) throw new Error('Balance direction must be DEBT or CREDIT');
  if (!amount.gt(0)) throw new Error('Prior balance amount must be greater than 0');
  return {
    amount,
    direction,
    currency: normalizeCurrency(body?.priorBalanceCurrency || 'UZS'),
    counterpartyFirmId: typeof body?.priorBalanceCounterpartyFirmId === 'string' ? body.priorBalanceCounterpartyFirmId.trim() : '',
    exchangeRate: body?.priorBalanceExchangeRate,
  };
}

function firstHeaderValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const first = value.split(',')[0]?.trim();
  return first || undefined;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function isLocalHost(host: string): boolean {
  const lower = host.toLowerCase();
  return (
    lower === 'localhost' ||
    lower.startsWith('localhost:') ||
    lower === '127.0.0.1' ||
    lower.startsWith('127.0.0.1:') ||
    lower === '0.0.0.0' ||
    lower.startsWith('0.0.0.0:')
  );
}

function resolvePublicWebOrigin(req: Request): string | undefined {
  const envOrigin = process.env.PUBLIC_WEB_ORIGIN || process.env.APP_ORIGIN;
  if (envOrigin) return stripTrailingSlash(envOrigin.trim());

  const originHeader = firstHeaderValue(req.get('origin'));
  const forwardedHost = firstHeaderValue(req.get('x-forwarded-host'));
  const hostHeader = firstHeaderValue(req.get('host'));
  const host = forwardedHost || hostHeader;

  const forwardedProto = firstHeaderValue(req.get('x-forwarded-proto'));

  // If the API is accessed via a public hostname (prod), prefer that.
  // This avoids generating localhost links when the caller's Origin is localhost.
  if (host && !isLocalHost(host) && host.includes('.')) {
    const proto = forwardedProto || 'https';
    return `${proto}://${host}`;
  }

  // Local/dev fallback: use the request Origin (usually the frontend origin).
  if (originHeader) return stripTrailingSlash(originHeader);

  // Last resort: derive from host + protocol.
  if (host) {
    const proto = forwardedProto || req.protocol || 'http';
    return `${proto}://${host}`;
  }

  return undefined;
}

export const createInvite = async (req: Request, res: Response) => {
  const { email, role, firmId, firmName, fullName, phone, subscriptionDays, password: initialPassword } = req.body;
  const authUser = ((req as any).user || {}) as { userId?: string; role?: string; firmId?: string | null; firmRole?: string | null };
  const createdBy = authUser.userId;
  const actorRole = String(authUser.role || '').toUpperCase();
  if (!createdBy) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Email is required' });
  }
  const initialPasswordValue = typeof initialPassword === 'string' ? initialPassword : '';
  if (initialPasswordValue && !passwordMeetsPolicy(initialPasswordValue)) {
    return res.status(400).json({ error: PASSWORD_LENGTH_ERROR });
  }

  const upperRole = typeof role === 'string' ? role.toUpperCase() : '';
  const roleValue: Role = ALLOWED_ROLES.has(upperRole as Role) ? (upperRole as Role) : Role.FIRM;
  let firmRole = roleValue === Role.FIRM ? normalizeFirmUserRole(req.body?.firmRole) : FirmUserRole.MANAGER;
  const normalizedFullName = typeof fullName === 'string' ? fullName.trim() : '';
  const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';
  const durationDays = Number(subscriptionDays || 0);
  const subscriptionEndsAt = Number.isFinite(durationDays) && durationDays > 0
    ? new Date(Date.now() + Math.floor(durationDays) * 24 * 60 * 60 * 1000)
    : undefined;

  let resolvedFirmId: string | undefined = typeof firmId === 'string' ? firmId : undefined;
  const priorBalance = readPriorBalanceInput(req.body);

  if (actorRole === 'FIRM') {
    if (!isFirmAdminLike(authUser)) {
      return res.status(403).json({ error: 'Only firm admins can create firm staff accounts' });
    }
    if (roleValue !== Role.FIRM) {
      return res.status(403).json({ error: 'Firm admins can only create firm staff accounts' });
    }
    if (!authUser.firmId) {
      return res.status(400).json({ error: 'Firm account is missing firmId' });
    }
    resolvedFirmId = String(authUser.firmId);
  }

  if (roleValue === Role.FIRM && firmRole === FirmUserRole.FIRM_ADMIN && actorRole !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Only superadmin can assign the firm admin role' });
  }

  if (actorRole !== 'SUPERADMIN' && roleValue !== Role.FIRM) {
    return res.status(403).json({ error: 'Only superadmin can invite admins' });
  }
  if (actorRole !== 'SUPERADMIN' && !resolvedFirmId) {
    return res.status(403).json({ error: 'Only superadmin can create new firms' });
  }

  if (resolvedFirmId) {
    const firm = await prisma.firm.findUnique({ where: { id: resolvedFirmId } });
    if (!firm) {
      return res.status(400).json({ error: 'Firm not found' });
    }
    if (!(await canAccessFirm(authUser, resolvedFirmId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  if (roleValue === Role.FIRM && !resolvedFirmId) {
    if (!firmName || typeof firmName !== 'string' || !firmName.trim()) {
      return res.status(400).json({ error: 'Firm name is required' });
    }

    const newFirm = await prisma.firm.create({
      data: {
        name: firmName.trim(),
        contactFullName: normalizedFullName || undefined,
        phone: normalizedPhone || undefined,
        subscriptionEndsAt,
        createdByUserId: createdBy,
        createdByRole: actorRole,
      },
    });
    resolvedFirmId = newFirm.id;
    firmRole = FirmUserRole.FIRM_ADMIN;
    if (priorBalance) {
      const counterparty = priorBalance.counterpartyFirmId
        ? await prisma.firm.findUnique({ where: { id: priorBalance.counterpartyFirmId }, select: { id: true, name: true } })
        : null;
      if (priorBalance.counterpartyFirmId && !counterparty) {
        return res.status(404).json({ error: 'Counterparty firm not found' });
      }
      if (priorBalance.direction === 'CREDIT' && !counterparty) {
        return res.status(400).json({ error: 'Counterparty firm is required when recording firm credit' });
      }
      if (counterparty?.id === newFirm.id) {
        return res.status(400).json({ error: 'Counterparty firm must be different' });
      }
      const exchangeRate = await resolveExchangeRateToUzs(authUser, {
        currency: priorBalance.currency,
        date: new Date(),
        overrideRate: priorBalance.exchangeRate,
      });
      const targetOwes = priorBalance.direction === 'DEBT';
      await prisma.transaction.create({
        data: {
          firmId: newFirm.id,
          payerFirmId: targetOwes ? newFirm.id : counterparty?.id,
          receiverFirmId: targetOwes ? counterparty?.id : newFirm.id,
          createdByUserId: createdBy,
          type: 'PAYABLE',
          direction: 'OPENING_BALANCE',
          subjectType: 'FIRM_OPENING_BALANCE',
          subjectId: newFirm.id,
          originalAmount: priorBalance.amount,
          currency: priorBalance.currency,
          exchangeRate: exchangeRate.toDecimalPlaces(6),
          baseAmount: priorBalance.amount.mul(exchangeRate).toDecimalPlaces(4),
          metadata: {
            targetFirmName: newFirm.name,
            counterpartyFirmId: counterparty?.id,
            counterpartyLabel: counterparty?.name,
            source: 'manual_prior_balance',
          },
        },
      });
    }
  } else if (resolvedFirmId && roleValue === Role.FIRM) {
    if (firmRole === FirmUserRole.FIRM_ADMIN) {
      const [existingFirmAdmin, pendingFirmAdminInvite] = await Promise.all([
        prisma.user.findFirst({
          where: { firmId: resolvedFirmId, role: Role.FIRM, firmRole: FirmUserRole.FIRM_ADMIN, status: { not: 'DELETED' }, deletedAt: null },
          select: { id: true },
        }),
        prisma.invitation.findFirst({
          where: { firmId: resolvedFirmId, role: Role.FIRM, firmRole: FirmUserRole.FIRM_ADMIN, usedAt: null, deletedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true },
        }),
      ]);
      if (existingFirmAdmin || pendingFirmAdminInvite) return res.status(409).json({ error: 'This firm already has a firm admin' });
    }
    await prisma.firm.update({
      where: { id: resolvedFirmId },
      data: {
        ...(normalizedFullName ? { contactFullName: normalizedFullName } : {}),
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        ...(subscriptionEndsAt ? { subscriptionEndsAt } : {}),
      },
    });
  }
  
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = await bcrypt.hash(rawToken, 10);
  
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48); // 48h limit

  const invite = await prisma.invitation.create({
    data: {
      email: normalizedEmail,
      fullName: normalizedFullName || undefined,
      phone: normalizedPhone || undefined,
      role: roleValue,
      firmRole,
      firmId: resolvedFirmId,
      token: hashedToken,
      expiresAt,
      subscriptionEndsAt,
      createdBy,
    }
  });

  if (initialPasswordValue && roleValue === Role.FIRM) {
    const hashedPassword = await bcrypt.hash(initialPasswordValue, 10);
    await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      });
      if (existingUser) {
        throw new Error('Account already exists for this email');
      }
      await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          fullName: normalizedFullName || undefined,
          phone: normalizedPhone || undefined,
          role: roleValue,
          firmRole,
          firmId: resolvedFirmId,
        },
      });
      await tx.invitation.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      });
    });
    return res.json({
      inviteId: invite.id,
      firmId: invite.firmId,
      expiresAt: invite.expiresAt,
      accountCreated: true,
    });
  }

  const origin = resolvePublicWebOrigin(req);
  const link = origin ? `${origin}/invite/accept?token=${rawToken}&id=${invite.id}` : undefined;

  res.json({
    inviteId: invite.id,
    token: rawToken,
    firmId: invite.firmId,
    expiresAt: invite.expiresAt,
    link,
  });
};

export const acceptInvite = async (req: Request, res: Response) => {
  const { id, token, password } = req.body;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invite id is required' });
  }
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token is required' });
  }
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required' });
  }
  if (!passwordMeetsPolicy(password)) {
    return res.status(400).json({ error: PASSWORD_LENGTH_ERROR });
  }

  const invite = await prisma.invitation.findUnique({ where: { id } });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.usedAt) return res.status(400).json({ error: 'Invite already used' });
  if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Invite expired' });

  const valid = await bcrypt.compare(token, invite.token);
  if (!valid) return res.status(400).json({ error: 'Invalid token' });

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const normalizedUserEmail = invite.email.trim().toLowerCase();
    const createdUser = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findFirst({
        where: {
          email: {
            equals: normalizedUserEmail,
            mode: 'insensitive',
          },
        },
      });
      if (existingUser) {
        throw new Error('Account already exists for this email');
      }

      const user = await tx.user.create({
        data: {
          email: normalizedUserEmail,
          password: hashedPassword,
          fullName: invite.fullName,
          phone: invite.phone,
          role: invite.role,
          firmRole: invite.firmRole,
          firmId: invite.firmId,
        }
      });

      if (invite.firmId && invite.subscriptionEndsAt) {
        await tx.firm.update({
          where: { id: invite.firmId },
          data: { subscriptionEndsAt: invite.subscriptionEndsAt },
        });
      }

      await tx.invitation.update({
        where: { id: invite.id },
        data: { usedAt: new Date() }
      });

      const firm = user.firmId
        ? await tx.firm.findUnique({ where: { id: user.firmId }, select: { kind: true } })
        : null;

      return { id: user.id, email: user.email, fullName: user.fullName, phone: user.phone, role: user.role, firmRole: user.firmRole, firmId: user.firmId, firmKind: firm?.kind || null };
    });

    return res.json({
      success: true,
      message: 'Account created',
      user: createdUser,
    });
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : 'Failed to accept invitation';
    if (message === 'Account already exists for this email') {
      return res.status(400).json({ error: message });
    }
    return res.status(500).json({ error: 'Failed to accept invitation' });
  }
};
