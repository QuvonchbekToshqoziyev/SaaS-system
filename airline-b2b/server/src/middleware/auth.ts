import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../errors/app-error';
import { ERROR_CODES } from '../errors/catalog';
import { sendApiError } from '../errors/http';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return sendApiError(res, new AppError(ERROR_CODES.AUTH_TOKEN_MISSING));
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return sendApiError(res, new AppError(ERROR_CODES.AUTH_TOKEN_INVALID));

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || !jwtSecret.trim()) {
    return sendApiError(res, new AppError(ERROR_CODES.CONFIG_MISSING, 'JWT_SECRET is missing'));
  }
  try {
    const decoded = jwt.verify(token, jwtSecret);
    (req as any).user = decoded;
    next();
  } catch (err) {
    sendApiError(res, new AppError(ERROR_CODES.AUTH_TOKEN_INVALID));
  }
};
