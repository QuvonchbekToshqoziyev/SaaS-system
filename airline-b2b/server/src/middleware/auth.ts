import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../errors/app-error';
import { ERROR_CODES } from '../errors/catalog';
import { sendApiError } from '../errors/http';
import { prisma } from '../db';

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
  if (!authHeader) return sendApiError(res, new AppError(ERROR_CODES.AUTH_TOKEN_MISSING));
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return sendApiError(res, new AppError(ERROR_CODES.AUTH_TOKEN_INVALID));

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || !jwtSecret.trim()) {
    return sendApiError(res, new AppError(ERROR_CODES.CONFIG_MISSING, 'JWT_SECRET is missing'));
  }
  try {
    const decoded = jwt.verify(token, jwtSecret) as { userId?: unknown; role?: unknown; firmRole?: unknown; firmId?: unknown; readOnlyAccess?: boolean };
    if (String(decoded.role || '').toUpperCase() === 'FIRM' && String(decoded.firmRole || '').toUpperCase() === 'OMBOR_MUDIRI' && !warehouseManagerCanAccessPath(req.originalUrl)) {
      return res.status(403).json({ error: 'Ombor mudiri faqat Ombor nazorati va operatsiyalariga kira oladi' });
    }
    if (String(decoded.role || '').toUpperCase() === 'FIRM' && decoded.firmId) {
      const firm = await prisma.firm.findUnique({
        where: { id: String(decoded.firmId) },
        select: { subscriptionEndsAt: true },
      });
      if (isSubscriptionExpired(firm?.subscriptionEndsAt ?? null)) {
        return res.status(401).json({
          code: 'SUBSCRIPTION_EXPIRED',
          error: 'Obuna muddati tugagan. Obunani uzaytirish uchun biz bilan bog\'laning.',
        });
      }
    }
    if (!isReadOnlyHttpMethod(req.method) && decoded.userId) {
      const actor = await prisma.user.findUnique({
        where: { id: String(decoded.userId) },
        select: { readOnlyAccess: true },
      });
      if (actor?.readOnlyAccess) {
        return res.status(403).json({
          code: 'READ_ONLY_ACCOUNT',
          error: 'Bu akkaunt faqat ma’lumotlarni ko‘rish uchun. O‘zgartirish amallari taqiqlangan.',
        });
      }
    }
    (req as any).user = decoded;
    next();
  } catch (err) {
    sendApiError(res, new AppError(ERROR_CODES.AUTH_TOKEN_INVALID));
  }
};
