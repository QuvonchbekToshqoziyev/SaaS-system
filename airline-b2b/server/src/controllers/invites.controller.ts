import { Request, Response } from 'express';
import { prisma } from '../db';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import jwt from 'jsonwebtoken';

const ALLOWED_ROLES = new Set(Object.values(Role));

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
  const { email, role, firmId, firmName } = req.body;
  const createdBy = (req as any).user.userId;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const upperRole = typeof role === 'string' ? role.toUpperCase() : '';
  const roleValue: Role = ALLOWED_ROLES.has(upperRole as Role) ? (upperRole as Role) : Role.FIRM;

  let resolvedFirmId: string | undefined = typeof firmId === 'string' ? firmId : undefined;

  if (resolvedFirmId) {
    const firm = await prisma.firm.findUnique({ where: { id: resolvedFirmId } });
    if (!firm) {
      return res.status(400).json({ error: 'Firm not found' });
    }
  }

  if (roleValue === Role.FIRM && !resolvedFirmId) {
    if (!firmName || typeof firmName !== 'string' || !firmName.trim()) {
      return res.status(400).json({ error: 'Firm name is required' });
    }

    const newFirm = await prisma.firm.create({
      data: {
        name: firmName.trim(),
      },
    });
    resolvedFirmId = newFirm.id;
  }
  
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = await bcrypt.hash(rawToken, 10);
  
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48); // 48h limit

  const invite = await prisma.invitation.create({
    data: {
      email: normalizedEmail,
      role: roleValue,
      firmId: resolvedFirmId,
      token: hashedToken,
      expiresAt,
      createdBy,
    }
  });

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

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || !jwtSecret.trim()) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invite id is required' });
  }
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token is required' });
  }
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
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
          role: invite.role,
          firmId: invite.firmId,
        }
      });

      await tx.invitation.update({
        where: { id: invite.id },
        data: { usedAt: new Date() }
      });

      return { id: user.id, email: user.email, role: user.role, firmId: user.firmId };
    });

    const jwtToken = jwt.sign(
      { userId: createdUser.id, role: createdUser.role, firmId: createdUser.firmId },
      jwtSecret,
      { expiresIn: '1d' },
    );

    return res.json({
      success: true,
      message: 'Account created',
      token: jwtToken,
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
