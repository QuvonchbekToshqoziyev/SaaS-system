import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app-error';
import { ERROR_CODES } from '../errors/catalog';
import { sendApiError } from '../errors/http';

export const roleMiddleware = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const role = String(user?.role || '').toUpperCase();
    const allowed = roles.map((item) => String(item || '').toUpperCase());
    if (!user || !allowed.includes(role)) {
      return sendApiError(res, new AppError(ERROR_CODES.AUTH_FORBIDDEN, 'Forbidden', { details: { allowed } }));
    }
    next();
  };
};
