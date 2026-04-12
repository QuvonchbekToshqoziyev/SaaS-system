import { Request, Response } from 'express';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';

export const getTransactions = async (req: Request, res: Response) => {
  const { dateFrom, dateTo, firmId, flightId, type, currency, page = '1', limit = '10' } = req.query;
  const where: Prisma.TransactionWhereInput = {};

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(String(dateFrom));
    if (dateTo) where.createdAt.lte = new Date(String(dateTo));
  }
  if (firmId) where.firmId = String(firmId);
  if (flightId) where.flightId = String(flightId);
  if (type) where.type = type as any;
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
  const { id } = req.params;
  const tx = await prisma.transaction.findUnique({
    where: { id: String(id) },
    include: { firm: true, flight: true, ticket: true }
  });
  if (!tx) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  res.json(tx);
};
