import { Request, Response } from 'express';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';

type AuthUser = {
  userId?: string;
  role?: string;
  firmId?: string | null;
};

function getAuthUser(req: Request): AuthUser {
  return ((req as any).user || {}) as AuthUser;
}

function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

export const getTransactions = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);

  const { dateFrom, dateTo, firmId, flightId, type, currency, page = '1', limit = '10' } = req.query;
  const where: Prisma.TransactionWhereInput = {};

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(String(dateFrom));
    if (dateTo) where.createdAt.lte = new Date(String(dateTo));
  }
  if (role === 'FIRM') {
    const ownFirmId = authUser.firmId ? String(authUser.firmId) : '';
    if (!ownFirmId) {
      return res.status(400).json({ error: 'Firm account is missing firmId' });
    }
    where.firmId = ownFirmId;
  } else if (firmId) {
    where.firmId = String(firmId);
  }
  if (flightId) where.flightId = String(flightId);
  if (type) where.type = String(type).toUpperCase() as any;
  if (currency) where.currency = String(currency);

  const pageNum = Math.max(1, parseInt(String(page)) || 1);
  const limitNum = Math.max(1, parseInt(String(limit)) || 10);
  const skip = (pageNum - 1) * limitNum;

  const [total, data] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: { firm: true, flight: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum
    })
  ]);
  
  res.json({
    data,
    meta: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    }
  });
};

export const getTransactionById = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);

  const { id } = req.params;
  const tx = await prisma.transaction.findUnique({
    where: { id: String(id) },
    include: { firm: true, flight: true, ticket: true }
  });
  if (!tx) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  if (role === 'FIRM') {
    const ownFirmId = authUser.firmId ? String(authUser.firmId) : '';
    if (!ownFirmId || tx.firmId !== ownFirmId) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
  }
  res.json(tx);
};
