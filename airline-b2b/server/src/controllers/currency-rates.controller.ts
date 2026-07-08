import { Request, Response } from 'express';
import {
  AuthUser,
  ServiceError,
  createCurrencyRateService,
  listCurrencyRatesService,
} from '../services/currency-rates.service';

function getAuthUser(req: Request): AuthUser {
  return ((req as any).user || {}) as AuthUser;
}

function sendError(res: Response, err: unknown, fallback: string) {
  if (err instanceof ServiceError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  return res.status(400).json({ error: err instanceof Error ? err.message : fallback });
}

export const listCurrencyRates = async (req: Request, res: Response) => {
  try {
    const rates = await listCurrencyRatesService({
      date: req.query.date,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      baseCurrency: req.query.baseCurrency,
      targetCurrency: req.query.targetCurrency,
    });
    return res.json(rates);
  } catch (err) {
    return sendError(res, err, 'Failed to list currency rates');
  }
};

export const createCurrencyRate = async (req: Request, res: Response) => {
  try {
    const created = await createCurrencyRateService(getAuthUser(req), req.body || {});
    return res.status(201).json(created);
  } catch (err) {
    return sendError(res, err, 'Failed to create currency rate');
  }
};
