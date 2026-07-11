import { Request, Response } from 'express';
import {
  closeKassaService,
  createKassaDeskService,
  createPaymentCardService,
  deletePaymentCardService,
  getKassaDayService,
  getKassaHistoryService,
  listKassaDesksService,
  listPaymentCardsService,
  openKassaService,
  reopenKassaService,
  updatePaymentCardService,
  type AuthUser,
} from '../services/kassa.service';
import { writeAuditLog } from '../utils/audit';
import { mapKnownError } from '../errors/app-error';
import { sendApiError } from '../errors/http';

function getAuthUser(req: Request): AuthUser {
  return ((req as any).user || {}) as AuthUser;
}

function sendError(res: Response, err: unknown) {
  return sendApiError(res, mapKnownError(err));
}

export const getKassaDay = async (req: Request, res: Response) => {
  try {
    const rawDate = req.query.date ?? req.body?.businessDate ?? req.body?.date;
    const result = await getKassaDayService(getAuthUser(req), rawDate, {
      kassaDeskId: req.query.kassaDeskId ?? req.body?.kassaDeskId,
    });
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
    await writeAuditLog(req, {
      action: 'OPEN',
      entityType: 'kassaDay',
      entityId: result.kassa.id,
      entityLabel: result.kassa.businessDate,
      summary: `Opened kassa for ${result.kassa.businessDate}`,
      after: result.kassa,
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
    await writeAuditLog(req, {
      action: 'CLOSE',
      entityType: 'kassaDay',
      entityId: result.kassa.id,
      entityLabel: result.kassa.businessDate,
      summary: `Closed kassa for ${result.kassa.businessDate}`,
      after: result.kassa,
    });
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

export const reopenKassa = async (req: Request, res: Response) => {
  try {
    const result = await reopenKassaService(getAuthUser(req), {
      businessDate: req.body?.businessDate,
      notes: req.body?.notes,
    });
    await writeAuditLog(req, {
      action: 'REOPEN',
      entityType: 'kassaDay',
      entityId: result.kassa.id,
      entityLabel: result.kassa.businessDate,
      summary: `Reopened kassa for ${result.kassa.businessDate}`,
      after: result.kassa,
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

export const listPaymentCards = async (req: Request, res: Response) => {
  try {
    const result = await listPaymentCardsService(getAuthUser(req));
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

export const listKassaDesks = async (req: Request, res: Response) => {
  try {
    const result = await listKassaDesksService(getAuthUser(req));
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

export const createKassaDesk = async (req: Request, res: Response) => {
  try {
    const result = await createKassaDeskService(getAuthUser(req), {
      firmId: req.body?.firmId,
      name: req.body?.name,
      code: req.body?.code,
      status: req.body?.status,
    });
    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'kassaDesk',
      entityId: result.id,
      entityLabel: result.name,
      summary: `Created kassa desk ${result.name}`,
      after: result,
    });
    return res.status(201).json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

export const createPaymentCard = async (req: Request, res: Response) => {
  try {
    const result = await createPaymentCardService(getAuthUser(req), {
      ownerName: req.body?.ownerName,
      cardNumber: req.body?.cardNumber,
      currency: req.body?.currency,
      firmId: req.body?.firmId,
      openingBalance: req.body?.openingBalance,
    });
    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'paymentCard',
      entityId: result.id,
      entityLabel: result.ownerName,
      summary: `Created payment card ${result.ownerName}`,
      after: result,
    });
    return res.status(201).json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

export const updatePaymentCard = async (req: Request, res: Response) => {
  try {
    const result = await updatePaymentCardService(getAuthUser(req), String(req.params.id || ''), {
      ownerName: req.body?.ownerName,
      cardNumber: req.body?.cardNumber,
      currency: req.body?.currency,
      firmId: req.body?.firmId,
      openingBalance: req.body?.openingBalance,
      status: req.body?.status,
    });
    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'paymentCard',
      entityId: result.id,
      entityLabel: result.ownerName,
      summary: `Updated payment card ${result.ownerName}`,
      after: result,
    });
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

export const deletePaymentCard = async (req: Request, res: Response) => {
  try {
    const result = await deletePaymentCardService(getAuthUser(req), String(req.params.id || ''), {
      reason: req.body?.reason,
    });
    await writeAuditLog(req, {
      action: 'DELETE',
      entityType: 'paymentCard',
      entityId: result.id,
      entityLabel: result.ownerName,
      summary: `Deleted payment card ${result.ownerName}`,
      before: result,
    });
    return res.json({ success: true, card: result });
  } catch (err) {
    return sendError(res, err);
  }
};
