import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { prisma } from '../db';
import { canAccessFirm, getAccessibleFirmIds, normalizeRole } from '../utils/access';
import { visibleTransactionWhere } from '../utils/transaction-visibility';
import { expenseVariance } from '../domains/expenses/expense-estimate';

type AuthUser = { role?: string; firmId?: string | null; userId?: string };

function period(query: Request['query']) {
  const now = new Date();
  const year = Number(query.year) || now.getUTCFullYear();
  const month = Number(query.month) || now.getUTCMonth() + 1;
  const from = query.dateFrom ? new Date(String(query.dateFrom)) : new Date(Date.UTC(year, month - 1, 1));
  const to = query.dateTo ? new Date(`${String(query.dateTo).slice(0, 10)}T23:59:59.999Z`) : new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new Error('Hisobot davri noto‘g‘ri');
  return { from, to };
}

export async function getExpenseEstimateReport(req: Request, res: Response) {
  try {
    const user = ((req as any).user || {}) as AuthUser;
    const requestedFirmId = String(req.query.companyId || req.query.firmId || '').trim();
    if (requestedFirmId && !(await canAccessFirm(user, requestedFirmId))) return res.status(403).json({ error: 'Forbidden' });
    const firmIds = normalizeRole(user.role) === 'FIRM' ? [String(user.firmId || '')] : requestedFirmId ? [requestedFirmId] : await getAccessibleFirmIds(user);
    const range = period(req.query);
    const dateWhere: Prisma.TransactionWhereInput = { OR: [{ expenseDate: { gte: range.from, lte: range.to } }, { expenseDate: null, paymentDate: { gte: range.from, lte: range.to } }] };
    const scopeWhere: Prisma.TransactionWhereInput = firmIds ? { firmId: { in: firmIds } } : {};
    const [rows, unclassifiedRows, budgets] = await Promise.all([
      prisma.transaction.findMany({
        where: visibleTransactionWhere({ ...scopeWhere, ...dateWhere, accountingTreatment: 'EXPENSE', status: { in: ['CONFIRMED', 'APPLIED', 'POSTED', 'PAID'] } }),
        include: { expenseCategory: { select: { id: true, code: true, name: true, parentId: true, parent: { select: { id: true, name: true } } } }, ledgerEntries: true, kassaDesk: { select: { id: true, name: true } }, flight: { select: { id: true, flightNumber: true } }, sourceAccount: { select: { id: true, name: true, type: true } } },
        orderBy: { expenseDate: 'desc' },
      }),
      prisma.transaction.findMany({
        where: visibleTransactionWhere({ ...scopeWhere, createdAt: { gte: range.from, lte: range.to }, type: 'ADJUSTMENT', direction: { in: ['KASSA_OUT', 'ACCOUNT_OUT'] }, accountingTreatment: null, status: { in: ['CONFIRMED', 'APPLIED'] } }),
        select: { baseAmount: true, originalAmount: true, currency: true },
      }),
      prisma.expenseBudget.findMany({ where: { ...(firmIds ? { firmId: { in: firmIds } } : {}), isActive: true, periodStart: { lte: range.to }, periodEnd: { gte: range.from } }, include: { expenseCategory: { select: { id: true, code: true, name: true } } } }),
    ]);

    const byCategory = new Map<string, { categoryId: string | null; code: string; name: string; amount: number; count: number; budget: number }>();
    const byCurrency = new Map<string, number>();
    const byDirection = new Map<string, number>();
    let actualExpense = 0;
    for (const row of rows) {
      const baseAmount = row.ledgerEntries.reduce((sum, entry) => sum + Number(entry.amount), 0) || Number(row.baseAmount);
      actualExpense += baseAmount;
      const key = row.expenseCategoryId || 'UNCLASSIFIED';
      const current = byCategory.get(key) || { categoryId: row.expenseCategoryId, code: row.expenseCategory?.code || 'UNCLASSIFIED', name: row.expenseCategory?.name || 'Tasniflanmagan', amount: 0, count: 0, budget: 0 };
      current.amount += baseAmount; current.count += 1; byCategory.set(key, current);
      byCurrency.set(row.currency, (byCurrency.get(row.currency) || 0) + Number(row.originalAmount));
      const direction = row.expenseDirection || 'COMPANY_EXPENSE';
      byDirection.set(direction, (byDirection.get(direction) || 0) + baseAmount);
    }
    for (const budget of budgets) {
      const key = budget.expenseCategoryId || 'UNCLASSIFIED';
      const current = byCategory.get(key) || { categoryId: budget.expenseCategoryId, code: budget.expenseCategory?.code || 'GENERAL', name: budget.expenseCategory?.name || 'Umumiy budjet', amount: 0, count: 0, budget: 0 };
      current.budget += Number(budget.amount); byCategory.set(key, current);
    }
    const budgetAmount = budgets.reduce((sum, row) => sum + Number(row.amount), 0);
    const dayCount = Math.max(1, Math.ceil((range.to.getTime() - range.from.getTime() + 1) / 86_400_000));
    const categories = [...byCategory.values()].map((row) => ({ ...row, ...expenseVariance(row.amount, row.budget) })).sort((a, b) => b.amount - a.amount);
    const totalVariance = expenseVariance(actualExpense, budgetAmount);
    return res.json({
      period: { from: range.from.toISOString(), to: range.to.toISOString() },
      kpis: { budgetAmount, actualExpense, ...totalVariance, transactionCount: rows.length, averageDailyExpense: actualExpense / dayCount, largestCategory: categories[0] || null, largestTransaction: rows.reduce((max, row) => Number(row.baseAmount) > Number(max?.baseAmount || 0) ? row : max, null as typeof rows[number] | null), unclassifiedOutflow: unclassifiedRows.reduce((sum, row) => sum + Number(row.baseAmount), 0) },
      categories,
      byCurrency: [...byCurrency].map(([currency, amount]) => ({ currency, amount })),
      byDirection: [...byDirection].map(([direction, amount]) => ({ direction, amount })),
      rows,
      note: 'Faqat accountingTreatment=EXPENSE yozuvlari xarajatga kiritildi; eski tasniflanmagan chiqimlar alohida ko‘rsatildi.',
    });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Xarajatlar smetasini tuzib bo‘lmadi' });
  }
}

export async function getExpenseCategoryDetail(req: Request, res: Response) {
  try {
    const user = ((req as any).user || {}) as AuthUser;
    const requestedFirmId = String(req.query.companyId || req.query.firmId || '').trim();
    if (requestedFirmId && !(await canAccessFirm(user, requestedFirmId))) return res.status(403).json({ error: 'Forbidden' });
    const firmIds = normalizeRole(user.role) === 'FIRM' ? [String(user.firmId || '')] : requestedFirmId ? [requestedFirmId] : await getAccessibleFirmIds(user);
    const range = period(req.query);
    const categoryId = String(req.params.categoryId || req.query.categoryId || '').trim();
    const isUnclassified = categoryId === 'UNCLASSIFIED';
    const dateWhere: Prisma.TransactionWhereInput = { OR: [{ expenseDate: { gte: range.from, lte: range.to } }, { expenseDate: null, paymentDate: { gte: range.from, lte: range.to } }] };
    const where: Prisma.TransactionWhereInput = visibleTransactionWhere({
      ...(firmIds ? { firmId: { in: firmIds } } : {}),
      ...dateWhere,
      accountingTreatment: 'EXPENSE',
      status: { in: ['CONFIRMED', 'APPLIED', 'POSTED', 'PAID'] },
      ...(isUnclassified ? { expenseCategoryId: null } : categoryId ? { expenseCategoryId: categoryId } : {}),
      ...(req.query.kassaDeskId || req.query.branchId ? { kassaDeskId: String(req.query.kassaDeskId || req.query.branchId) } : {}),
      ...(req.query.paymentCardId || req.query.cardId ? { paymentCardId: String(req.query.paymentCardId || req.query.cardId) } : {}),
      ...(req.query.sourceAccountId || req.query.bankAccountId ? { sourceAccountId: String(req.query.sourceAccountId || req.query.bankAccountId) } : {}),
      ...(req.query.currency ? { currency: String(req.query.currency).toUpperCase() } : {}),
      ...(req.query.counterparty ? { counterpartyNameSnapshot: { contains: String(req.query.counterparty), mode: 'insensitive' } } : {}),
      ...(req.query.employeeId ? { employeeId: String(req.query.employeeId) } : {}),
      ...(req.query.flightId ? { flightId: String(req.query.flightId) } : {}),
      ...(req.query.tourPackageId ? { tourPackageSale: { packageId: String(req.query.tourPackageId) } } : {}),
      ...(req.query.status ? { status: String(req.query.status).toUpperCase() } : {}),
      ...(req.query.createdByUserId ? { createdByUserId: String(req.query.createdByUserId) } : {}),
    });
    const rows = await prisma.transaction.findMany({
      where,
      include: {
        firm: { select: { id: true, name: true } },
        expenseCategory: { select: { id: true, code: true, name: true, parentId: true, parent: { select: { id: true, name: true } } } },
        ledgerEntries: true,
        kassaDesk: { select: { id: true, name: true, code: true } },
        paymentCard: { select: { id: true, cardName: true, maskedNumber: true } },
        sourceAccount: { select: { id: true, name: true, type: true, currency: true } },
        destinationAccount: { select: { id: true, name: true, type: true, currency: true } },
        flight: { select: { id: true, flightNumber: true, route: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, email: true, fullName: true } },
      },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(Math.max(Number(req.query.limit) || 200, 1), 500),
    });
    const details = rows.map((row) => {
      const uzsEquivalent = row.ledgerEntries.reduce((sum, entry) => sum + Number(entry.amount), 0) || Number(row.baseAmount);
      return {
        id: row.id,
        date: (row.expenseDate || row.paymentDate || row.createdAt).toISOString().slice(0, 10),
        time: row.createdAt.toISOString(),
        firm: row.firm,
        expenseCategory: row.expenseCategory,
        subcategory: row.expenseCategory?.parent || null,
        expenseDirection: row.expenseDirection,
        amount: Number(row.originalAmount),
        originalCurrency: row.currency,
        uzsEquivalent,
        exchangeRateSnapshot: Number(row.exchangeRate || 0),
        kassaDesk: row.kassaDesk,
        paymentCard: row.paymentCard,
        sourceAccount: row.sourceAccount,
        destinationAccount: row.destinationAccount,
        paymentMethod: row.paymentMethod,
        counterparty: row.counterpartyNameSnapshot,
        employeeId: row.employeeId,
        flight: row.flight,
        costCenter: row.costCenter,
        note: (row.metadata as any)?.note || null,
        documentNumber: row.documentNumber,
        createdBy: row.createdBy,
        approvedBy: null,
        status: row.status,
        audit: { transactionId: row.id, sourceMode: row.sourceMode, operationType: row.operationType },
        actions: { details: true, edit: row.status === 'CONFIRMED', reversal: ['CONFIRMED', 'APPLIED', 'POSTED'].includes(row.status), audit: true },
      };
    });
    return res.json({
      period: { from: range.from.toISOString(), to: range.to.toISOString() },
      categoryId: categoryId || null,
      total: details.reduce((sum, row) => sum + row.uzsEquivalent, 0),
      count: details.length,
      rows: details,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Xarajat tafsilotlarini yuklab bo‘lmadi' });
  }
}
