import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app-error';
import { ERROR_CODES } from '../errors/catalog';
import { sendApiError } from '../errors/http';
import { prisma } from '../db';
import { verifySessionToken } from '../utils/session-token';
import { readSessionCookie } from '../utils/session-cookie';
import { resolveAppCapabilities } from '../utils/app-capabilities';

export function isSubscriptionExpired(end: Date | null, now = new Date()) {
  return end !== null && end <= now;
}

export function isReadOnlyHttpMethod(method: unknown) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(String(method || '').toUpperCase());
}

export function warehouseManagerCanAccessPath(path: unknown) {
  const value = String(path || '').split('?')[0];
  return value === '/inventory' || value.startsWith('/inventory/') || value === '/auth/change-password';
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const cookieToken = readSessionCookie(req.headers.cookie);
  let token = cookieToken;
  if (authHeader) {
    const [scheme, bearerToken] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !bearerToken) return sendApiError(res, new AppError(ERROR_CODES.AUTH_TOKEN_INVALID));
    token = bearerToken;
  }
  if (!token) return sendApiError(res, new AppError(ERROR_CODES.AUTH_TOKEN_MISSING));
  if (!authHeader && !isReadOnlyHttpMethod(req.method) && req.get('x-ado-csrf') !== '1') {
    return res.status(403).json({ code: 'CSRF_CHECK_FAILED', error: 'CSRF check failed' });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || !jwtSecret.trim()) {
    return sendApiError(res, new AppError(ERROR_CODES.CONFIG_MISSING, 'JWT_SECRET is missing'));
  }
  try {
    const decoded = verifySessionToken(token, jwtSecret);
    if (!decoded.userId) throw new Error('Missing userId');

    const actor = await prisma.user.findUnique({
      where: { id: String(decoded.userId) },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        readOnlyAccess: true,
        firmRole: true,
        firmId: true,
        status: true,
        deletedAt: true,
        sessionVersion: true,
        firm: { select: { kind: true, subscriptionEndsAt: true } },
      },
    });
    if (!actor || actor.status !== 'ACTIVE' || actor.deletedAt) throw new Error('Inactive user');
    if (Number(decoded.sessionVersion || 0) !== actor.sessionVersion) throw new Error('Revoked session');

    const canonicalUser = {
      userId: actor.id,
      id: actor.id,
      email: actor.email,
      fullName: actor.fullName,
      phone: actor.phone,
      role: actor.role,
      readOnlyAccess: actor.readOnlyAccess,
      firmRole: actor.firmRole,
      firmId: actor.firmId,
      firmKind: actor.firm?.kind || null,
      subscriptionEndsAt: actor.firm?.subscriptionEndsAt || null,
      sessionVersion: actor.sessionVersion,
      capabilities: resolveAppCapabilities(actor),
    };

    if (String(actor.role).toUpperCase() === 'FIRM' && String(actor.firmRole).toUpperCase() === 'OMBOR_MUDIRI' && !warehouseManagerCanAccessPath(req.originalUrl)) {
      return res.status(403).json({ error: 'Ombor mudiri faqat Ombor nazorati va operatsiyalariga kira oladi' });
    }
    if (String(actor.role).toUpperCase() === 'FIRM' && actor.firmId) {
      if (isSubscriptionExpired(actor.firm?.subscriptionEndsAt ?? null)) {
        return res.status(401).json({
          code: 'SUBSCRIPTION_EXPIRED',
          error: 'Obuna muddati tugagan. Obunani uzaytirish uchun biz bilan bog\'laning.',
        });
      }
    }
    if (!isReadOnlyHttpMethod(req.method) && actor.readOnlyAccess) {
      return res.status(403).json({
        code: 'READ_ONLY_ACCOUNT',
        error: 'Bu akkaunt faqat ma’lumotlarni ko‘rish uchun. O‘zgartirish amallari taqiqlangan.',
      });
    }
    (req as any).user = canonicalUser;
    next();
  } catch (err) {
    sendApiError(res, new AppError(ERROR_CODES.AUTH_TOKEN_INVALID));
  }
};
