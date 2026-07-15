import { describe, expect, it } from 'vitest';
import { AppError, mapKnownError, toApiErrorBody } from './app-error';
import { ERROR_CODES } from './catalog';

describe('AppError serialization', () => {
  it('serializes known flow errors with code and details', () => {
    const body = toApiErrorBody(new AppError(ERROR_CODES.KASSA_ALREADY_CLOSED, 'Kassa already closed', { details: { date: '2026-07-09' } }), 'err_1');
    expect(body).toMatchObject({
      code: ERROR_CODES.KASSA_ALREADY_CLOSED,
      statusCode: 409,
      message: 'Kassa already closed',
      errorId: 'err_1',
      details: { date: '2026-07-09' },
    });
  });

  it('hides unexpected internal error messages', () => {
    const body = toApiErrorBody(new Error('database password leaked'), 'err_2');
    expect(body.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(body.message).toBe('Internal server error');
    expect(body.errorId).toBe('err_2');
  });

  it('maps legacy service messages into catalog codes', () => {
    const body = toApiErrorBody(mapKnownError(Object.assign(new Error('Kassa is already open for this date'), { statusCode: 400 })));
    expect(body).toMatchObject({
      code: ERROR_CODES.KASSA_ALREADY_OPEN,
      statusCode: 400,
      message: 'Kassa is already open for this date',
    });
  });

  it('maps an absent selected kassa session to a user-facing conflict', () => {
    const body = toApiErrorBody(mapKnownError(Object.assign(new Error('No kassa session exists for the selected desk and date'), { statusCode: 409 })));
    expect(body).toMatchObject({ code: ERROR_CODES.KASSA_NOT_OPEN, statusCode: 409, severity: 'warning' });
  });

  it('maps report fallback errors to the requested fallback code', () => {
    const body = toApiErrorBody(mapKnownError(new Error('SQL aggregate failed'), ERROR_CODES.REPORT_BUILD_FAILED));
    expect(body).toMatchObject({
      code: ERROR_CODES.REPORT_BUILD_FAILED,
      statusCode: 500,
      message: 'Failed to build report',
    });
  });

  it('turns Prisma unique conflicts into a safe user-facing response', () => {
    const prismaError = Object.assign(new Error('Invalid prisma.financialAccount.upsert() invocation'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { target: ['paymentCardId', 'currency'] },
    });
    const body = toApiErrorBody(prismaError);
    expect(body).toMatchObject({
      code: ERROR_CODES.CONFLICT,
      statusCode: 409,
      message: 'Bu ma’lumot allaqachon mavjud.',
    });
    expect(body.message).not.toContain('prisma');
  });

  it('never exposes Prisma validation or schema errors', () => {
    const body = toApiErrorBody(Object.assign(new Error('Invalid `prisma.payment.create()` invocation'), {
      name: 'PrismaClientValidationError',
    }));
    expect(body).toMatchObject({ code: ERROR_CODES.DATABASE_ERROR, statusCode: 500, message: 'Database operation failed' });
  });
});
