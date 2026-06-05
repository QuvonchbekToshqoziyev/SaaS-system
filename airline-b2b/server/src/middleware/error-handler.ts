import { NextFunction, Request, Response } from 'express';
import { logger, getLogSafePath } from '../logger';
import { errorRegistry } from '../observability/error-registry';

function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const statusCode =
    typeof (err as any)?.statusCode === 'number'
      ? (err as any).statusCode
      : typeof (err as any)?.status === 'number'
        ? (err as any).status
        : 500;

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
  return res.status(statusCode).json({ error: 'Internal server error', errorId: entry.id });
};
