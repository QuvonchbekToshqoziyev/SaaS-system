import { Request, Response } from 'express';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';

export const getFlightReport = async (req: Request, res: Response) => {
  const { flightId, flight_id } = req.query;
  const id = flightId || flight_id;

  const groupQuery: Prisma.TransactionGroupByArgs = {
    by: ['type'],
    _sum: { baseAmount: true },
  };

  if (id) {
    groupQuery.where = { flightId: String(id) };
  }

  const transactions = await prisma.transaction.groupBy(groupQuery as any);

  let debt = 0, revenue = 0, paid = 0;

  transactions.forEach(t => {
    const val = Number(t._sum?.baseAmount || 0);
    if (t.type === 'PAYABLE') debt += val;
    if (t.type === 'SALE') revenue += val;
    if (t.type === 'PAYMENT') paid += val;
  });

  const profit = revenue - debt;
  const outstanding = debt - paid;

  res.json({ 
    revenue, 
    debt, 
    paid, 
    profit, 
    outstanding, 
    total_allocated: debt, 
    total_sales: revenue, 
    total_payments: paid 
  });
};

export const getMonthlyReport = async (req: Request, res: Response) => {
  const data: any[] = await prisma.$queryRaw`
    SELECT 
      DATE_TRUNC('month', "createdAt") as month, 
      type, 
      SUM("baseAmount") as total
    FROM "Transaction" 
    GROUP BY month, type 
    ORDER BY month DESC;
  `;

  const formatted: Record<string, any> = {};

  data.forEach((row) => {
    const m = new Date(row.month).toISOString().substring(0, 7); // "YYYY-MM"
    if (!formatted[m]) {
      formatted[m] = { month: m, allocations: 0, sales: 0, payments: 0 };
    }
    const val = Number(row.total || 0);
    if (row.type === 'PAYABLE') formatted[m].allocations += val;
    if (row.type === 'SALE') formatted[m].sales += val;
    if (row.type === 'PAYMENT') formatted[m].payments += val;
  });

  res.json(Object.values(formatted));
};
