import { Request, Response } from 'express';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';
import { isPayableDebtType, payableAndPaymentTypeFilter } from '../utils/transaction-types';

type AuthUser = {
  userId?: string;
  role?: string;
  firmId?: string | null;
};

function getAuthUser(req: Request): AuthUser {
  return ((req as any).user || {}) as AuthUser;
}

function sumToNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getFirmBalances(firmIds?: string[]) {
  const groups = await prisma.transaction.groupBy({
    by: ['firmId', 'type'],
    where: {
      type: payableAndPaymentTypeFilter,
      ...(firmIds?.length ? { firmId: { in: firmIds } } : {}),
    },
    _sum: { baseAmount: true },
  });

  const byFirm = new Map<string, { debt: number; paid: number }>();
  for (const row of groups) {
    const current = byFirm.get(row.firmId) || { debt: 0, paid: 0 };
    const value = sumToNumber(row._sum?.baseAmount);
    if (isPayableDebtType(row.type)) current.debt += value;
    if (row.type === 'PAYMENT') current.paid += value;
    byFirm.set(row.firmId, current);
  }

  return byFirm;
}

function withBalance<T extends { id: string }>(firm: T, balances: Map<string, { debt: number; paid: number }>) {
  const totals = balances.get(firm.id) || { debt: 0, paid: 0 };
  const balance = totals.paid - totals.debt;
  return {
    ...firm,
    debt: totals.debt,
    paid: totals.paid,
    balance,
    outstanding: Math.max(-balance, 0),
    credit: Math.max(balance, 0),
  };
}

function parseCreditLimit(value: unknown): Prisma.Decimal | undefined {
  if (value === null || value === undefined || String(value).trim() === '') return undefined;
  const decimal = new Prisma.Decimal(String(value).trim());
  if (!decimal.isFinite() || decimal.lt(0)) {
    throw new Error('creditLimit must be zero or greater');
  }
  return decimal.toDecimalPlaces(4);
}

export const listFirms = async (req: Request, res: Response) => {
  const firms = await prisma.firm.findMany({
    select: {
      id: true,
      name: true,
      creditLimit: true,
      currency: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { name: 'asc' },
  });

  const balances = await getFirmBalances(firms.map((firm) => firm.id));
  const rows = firms
    .map((firm) => withBalance(firm, balances))
    .sort((a, b) => {
      const debtDiff = b.outstanding - a.outstanding;
      if (debtDiff !== 0) return debtDiff;
      return a.name.localeCompare(b.name);
    });

  return res.json(rows);
};

export const getFirmById = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const id = String(req.params.id || '');

  if (!id) return res.status(400).json({ error: 'Firm id is required' });

  if (String(authUser.role || '').toUpperCase() === 'FIRM') {
    if (!authUser.firmId || String(authUser.firmId) !== id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  const firm = await prisma.firm.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      creditLimit: true,
      currency: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      users: {
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!firm) return res.status(404).json({ error: 'Firm not found' });

  const balances = await getFirmBalances([firm.id]);
  return res.json(withBalance(firm, balances));
};

export const updateFirm = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = String(authUser.role || '').toUpperCase();
  if (!['SUPERADMIN', 'ADMIN'].includes(role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const id = String(req.params.id || '');
  if (!id) return res.status(400).json({ error: 'Firm id is required' });

  try {
    const data: Prisma.FirmUpdateInput = {};
    if (typeof req.body?.name === 'string' && req.body.name.trim()) {
      data.name = req.body.name.trim();
    }
    if (req.body?.creditLimit !== undefined) {
      data.creditLimit = parseCreditLimit(req.body.creditLimit);
    }
    if (typeof req.body?.currency === 'string' && req.body.currency.trim()) {
      data.currency = req.body.currency.trim().toUpperCase();
    }
    if (typeof req.body?.status === 'string' && ['ACTIVE', 'SUSPENDED'].includes(req.body.status.toUpperCase())) {
      data.status = req.body.status.toUpperCase() as any;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const firm = await prisma.firm.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        creditLimit: true,
        currency: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const balances = await getFirmBalances([firm.id]);
    return res.json(withBalance(firm, balances));
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Firm not found' });
    return res.status(400).json({ error: err?.message || 'Failed to update firm' });
  }
};
