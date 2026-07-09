import { Response } from 'express';
import { toApiErrorBody } from './app-error';

export function sendApiError(res: Response, err: unknown, errorId?: string) {
  const body = toApiErrorBody(err, errorId);
  return res.status(body.statusCode).json(body);
}
