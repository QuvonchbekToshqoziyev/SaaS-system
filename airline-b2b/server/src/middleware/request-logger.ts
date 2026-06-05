import { NextFunction, Request, Response } from 'express';
import { logger, getLogSafePath } from '../logger';
import { errorRegistry } from '../observability/error-registry';

function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

function shouldLogActions(): boolean {
  // "Testing only" action logs: enabled in non-prod by default, and in prod only when explicitly opted-in.
  return process.env.LOG_ACTIONS === '1' || process.env.NODE_ENV !== 'production';
}

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const statusCode = res.statusCode;

    const user = (req as any).user as
      | { userId?: string; role?: string; firmId?: string | null }
      | undefined;
    const role = normalizeRole(user?.role);
    const isActor = role === 'ADMIN' || role === 'SUPERADMIN' || role === 'FIRM';
    const actionLogEnabled = shouldLogActions();
    const shouldLogAction = actionLogEnabled && isActor;
    const isWarnOrError = statusCode >= 400;

    if (!shouldLogAction && !isWarnOrError) return;

    const method = req.method;
    const path = getLogSafePath(req.originalUrl || req.url || '/');

    const payload = {
      method,
      path,
      statusCode,
      durationMs: Math.round(durationMs),
      userId: user?.userId,
      role: role || undefined,
      firmId: user?.firmId ? String(user.firmId) : undefined,
      errorId: (res.locals as any)?.errorId as string | undefined,
    };

    if (statusCode >= 500) {
      if (!payload.errorId) {
        const entry = errorRegistry.recordHttpError({
          method,
          path,
          statusCode,
          userId: payload.userId,
          role: payload.role,
          firmId: payload.firmId,
        });
        (res.locals as any).errorId = entry.id;
        payload.errorId = entry.id;
      }
      logger.error(payload, 'Request error');
      return;
    }

    if (statusCode >= 400) {
      logger.warn(payload, 'Request warning');
      return;
    }

    logger.info(payload, 'Action');
  });

  next();
};
