import { NextFunction, Request, Response } from 'express';
import { logger, getLogSafePath } from '../logger';
import { errorRegistry } from '../observability/error-registry';
import { toApiErrorBody } from '../errors/app-error';

function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const body = toApiErrorBody(err);
  const statusCode = body.statusCode;

  const user = (req as any).user as
    | { userId?: string; role?: string; firmId?: string | null }
    | undefined;
  const role = normalizeRole(user?.role);
  const path = getLogSafePath(req.originalUrl || req.url || '/');

  const entry = errorRegistry.recordException(err, {
    method: req.method,
    path,
    statusCode,
    userId: user?.userId,
    role: role || undefined,
    firmId: user?.firmId ? String(user.firmId) : undefined,
  });

  (res.locals as any).errorId = entry.id;

  logger.error(
    {
      err,
      errorId: entry.id,
      method: req.method,
      path,
      statusCode,
      userId: user?.userId,
      role: role || undefined,
      firmId: user?.firmId ? String(user.firmId) : undefined,
    },
    'Unhandled error',
  );

  if (res.headersSent) return next(err);
  return res.status(statusCode).json({ ...body, errorId: entry.id });
};
