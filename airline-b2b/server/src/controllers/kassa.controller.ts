import { Request, Response } from 'express';
import {
  closeKassaService,
  getKassaDayService,
  getKassaHistoryService,
  openKassaService,
  ServiceError,
  type AuthUser,
} from '../services/kassa.service';

function getAuthUser(req: Request): AuthUser {
  return ((req as any).user || {}) as AuthUser;
}

function sendError(res: Response, err: unknown) {
  if (err instanceof ServiceError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  const message = err instanceof Error ? err.message : 'Unexpected error';
  return res.status(400).json({ error: message });
}

export const getKassaDay = async (req: Request, res: Response) => {
  try {
    const rawDate = req.query.date ?? req.body?.businessDate ?? req.body?.date;
    const result = await getKassaDayService(getAuthUser(req), rawDate);
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

export const openKassa = async (req: Request, res: Response) => {
  try {
    const result = await openKassaService(getAuthUser(req), {
      businessDate: req.body?.businessDate,
      openingBalance: req.body?.openingBalance,
    });
    return res.status(201).json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

export const closeKassa = async (req: Request, res: Response) => {
  try {
    const result = await closeKassaService(getAuthUser(req), {
      businessDate: req.body?.businessDate,
      closingBalance: req.body?.closingBalance,
      notes: req.body?.notes,
    });
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

export const getKassaHistory = async (req: Request, res: Response) => {
  try {
    const result = await getKassaHistoryService({
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
};
