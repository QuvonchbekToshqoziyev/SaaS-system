import { ERROR_CATALOG, ERROR_CODES, type ErrorCode } from './catalog';

export type ApiErrorBody = {
  error: string;
  code: ErrorCode;
  statusCode: number;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'fatal';
  details?: unknown;
  errorId?: string;
  retryable?: boolean;
};

export class AppError extends Error {
  code: ErrorCode;
  statusCode: number;
  severity: ApiErrorBody['severity'];
  details?: unknown;
  retryable?: boolean;
  expose: boolean;

  constructor(code: ErrorCode, message?: string, options: { statusCode?: number; details?: unknown; retryable?: boolean; expose?: boolean } = {}) {
    const catalog = ERROR_CATALOG[code] || ERROR_CATALOG.INTERNAL_ERROR;
    super(message || catalog.message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = options.statusCode || catalog.statusCode;
    this.severity = catalog.severity;
    this.details = options.details;
    this.retryable = options.retryable ?? catalog.retryable;
    this.expose = options.expose ?? this.statusCode < 500;
  }
}

export function appError(code: ErrorCode, message?: string, details?: unknown) {
  return new AppError(code, message, { details });
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function inferErrorCode(err: unknown): ErrorCode {
  if (isAppError(err)) return err.code;
  const message = err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();
  if (message.includes('token') || message.includes('unauthorized')) return ERROR_CODES.AUTH_TOKEN_INVALID;
  if (message.includes('invalid credentials')) return ERROR_CODES.AUTH_PASSWORD_INVALID;
  if (message.includes('not found')) return ERROR_CODES.NOT_FOUND;
  if (message.includes('forbidden') || message.includes('permission') || message.includes('access')) return ERROR_CODES.AUTH_FORBIDDEN;
  if (message.includes('required') || message.includes('invalid') || message.includes('missing')) return ERROR_CODES.VALIDATION_FAILED;
  if (message.includes('already') || message.includes('cannot')) return ERROR_CODES.CONFLICT;
  return ERROR_CODES.INTERNAL_ERROR;
}

export function mapPrismaError(err: unknown): AppError | null {
  const anyErr = err as any;
  const prismaCode = typeof anyErr?.code === 'string' && /^P\d{4}$/.test(anyErr.code) ? anyErr.code : '';
  if (prismaCode === 'P2002') {
    return new AppError(ERROR_CODES.CONFLICT, 'Bu ma’lumot allaqachon mavjud.', { statusCode: 409, expose: true });
  }
  if (prismaCode === 'P2003' || prismaCode === 'P2014') {
    return new AppError(ERROR_CODES.CONFLICT, 'Bu amal bog‘langan ma’lumotlar sababli bajarilmadi.', { statusCode: 409, expose: true });
  }
  if (prismaCode === 'P2025') {
    return new AppError(ERROR_CODES.NOT_FOUND, 'Ma’lumot topilmadi yoki avval o‘zgartirilgan.', { statusCode: 404, expose: true });
  }
  if (['P2000', 'P2005', 'P2006', 'P2011', 'P2012', 'P2013', 'P2019', 'P2023'].includes(prismaCode)) {
    return new AppError(ERROR_CODES.VALIDATION_FAILED, 'Kiritilgan ma’lumot formati noto‘g‘ri.', { statusCode: 400, expose: true });
  }
  if (prismaCode || String(anyErr?.name || '').startsWith('PrismaClient')) {
    return new AppError(ERROR_CODES.DATABASE_ERROR, undefined, { expose: false });
  }
  return null;
}

export function mapKnownError(err: unknown, fallbackCode: ErrorCode = ERROR_CODES.INTERNAL_ERROR): AppError {
  if (isAppError(err)) return err;
  const prismaError = mapPrismaError(err);
  if (prismaError) return prismaError;

  const anyErr = err as any;
  const message = err instanceof Error ? err.message : String(err || ERROR_CATALOG[fallbackCode].message);
  const lower = message.toLowerCase();
  const statusCode = typeof anyErr?.statusCode === 'number'
    ? anyErr.statusCode
    : typeof anyErr?.status === 'number'
      ? anyErr.status
      : undefined;

  let code: ErrorCode = fallbackCode;
  if (lower.includes('firm account is missing firmid')) code = ERROR_CODES.FIRM_ACCOUNT_MISSING;
  else if (lower.includes('firm not found')) code = ERROR_CODES.FIRM_NOT_FOUND;
  else if (lower.includes('flight not found')) code = ERROR_CODES.FLIGHT_NOT_FOUND;
  else if (lower.includes('cancelled flight') || lower.includes('flight is cancelled')) code = ERROR_CODES.FLIGHT_CANCELLED;
  else if (lower.includes('ticket not found')) code = ERROR_CODES.TICKET_NOT_FOUND;
  else if (lower.includes('not enough') && lower.includes('ticket')) code = ERROR_CODES.TICKET_INVENTORY_SHORTAGE;
  else if (lower.includes('ticket') && (lower.includes('not available') || lower.includes('not pending') || lower.includes('not sold') || lower.includes('already allocated') || lower.includes('not allocated'))) code = ERROR_CODES.TICKET_INVALID_STATE;
  else if (lower.includes('kassa desk') && lower.includes('not found')) code = ERROR_CODES.KASSA_DESK_NOT_FOUND;
  else if (lower.includes('kassa desk') && lower.includes('required')) code = ERROR_CODES.KASSA_DESK_REQUIRED;
  else if (lower.includes('kassa is not open') || lower.includes('no kassa session exists')) code = ERROR_CODES.KASSA_NOT_OPEN;
  else if (lower.includes('kassa is already open')) code = ERROR_CODES.KASSA_ALREADY_OPEN;
  else if (lower.includes('kassa is already closed')) code = ERROR_CODES.KASSA_ALREADY_CLOSED;
  else if (lower.includes('only superadmin') || lower.includes('kassa') && lower.includes('forbidden')) code = ERROR_CODES.KASSA_PERMISSION_DENIED;
  else if (lower.includes('payment card not found')) code = ERROR_CODES.PAYMENT_CARD_NOT_FOUND;
  else if (lower.includes('payment card is not active')) code = ERROR_CODES.PAYMENT_CARD_INACTIVE;
  else if (lower.includes('payment') && (lower.includes('invalid') || lower.includes('required'))) code = ERROR_CODES.PAYMENT_INVALID;
  else if (lower.includes('report') && (lower.includes('forbidden') || lower.includes('not accessible'))) code = ERROR_CODES.REPORT_SCOPE_INVALID;
  else if (lower.includes('forbidden') || lower.includes('permission') || lower.includes('access')) code = ERROR_CODES.AUTH_FORBIDDEN;
  else if (lower.includes('not found')) code = ERROR_CODES.NOT_FOUND;
  else if (lower.includes('required') || lower.includes('invalid') || lower.includes('missing')) code = ERROR_CODES.VALIDATION_FAILED;
  else if (lower.includes('already') || lower.includes('cannot') || lower.includes('conflict')) code = ERROR_CODES.CONFLICT;

  return new AppError(code, message, { statusCode, expose: (statusCode || ERROR_CATALOG[code].statusCode) < 500 });
}

export function toApiErrorBody(err: unknown, errorId?: string): ApiErrorBody {
  const resolvedError = mapPrismaError(err) || err;
  const code = inferErrorCode(resolvedError);
  const catalog = ERROR_CATALOG[code];
  const app = isAppError(resolvedError) ? resolvedError : null;
  const statusCode = app?.statusCode || (typeof (resolvedError as any)?.statusCode === 'number' ? (resolvedError as any).statusCode : catalog.statusCode);
  const expose = app?.expose ?? statusCode < 500;
  const message = expose && resolvedError instanceof Error ? resolvedError.message : catalog.message;
  return {
    error: message,
    code,
    statusCode,
    message,
    severity: app?.severity || catalog.severity,
    details: expose ? app?.details : undefined,
    errorId,
    retryable: app?.retryable ?? catalog.retryable,
  };
}
