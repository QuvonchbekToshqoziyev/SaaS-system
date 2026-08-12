import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { prisma } from '../db';
import { canAccessFirm, getAccessibleFirmIds, normalizeRole } from '../utils/access';
import { writeAuditLog } from '../utils/audit';

type AuthUser = { userId?: string; role?: string; firmRole?: string | null; firmId?: string | null };
const auth = (req: Request) => ((req as any).user || {}) as AuthUser;
const canManage = (user: AuthUser, firmId: string) => normalizeRole(user.role) === 'SUPERADMIN' || (normalizeRole(user.role) === 'FIRM' && String(user.firmRole || '').toUpperCase() === 'FIRM_ADMIN' && String(user.firmId || '') === firmId);

export async function listExpenseBudgets(req: Request, res: Response) {
  const user = auth(req);
  const requestedFirmId = String(req.query.firmId || '').trim();
  if (requestedFirmId && !(await canAccessFirm(user, requestedFirmId))) return res.status(403).json({ error: 'Forbidden' });
  const firmIds = requestedFirmId ? [requestedFirmId] : await getAccessibleFirmIds(user);
  return res.json(await prisma.expenseBudget.findMany({ where: { ...(firmIds ? { firmId: { in: firmIds } } : {}), isActive: true }, include: { expenseCategory: true, costCenter: true }, orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }] }));
}

export async function createExpenseBudget(req: Request, res: Response) {
  const user = auth(req);
  const firmId = normalizeRole(user.role) === 'FIRM' ? String(user.firmId || '') : String(req.body?.firmId || '');
  if (!firmId || !(await canAccessFirm(user, firmId)) || !canManage(user, firmId)) return res.status(403).json({ error: 'Only the owning firm admin can manage budgets' });
  const amount = new Prisma.Decimal(String(req.body?.amount || '0'));
  const periodStart = new Date(String(req.body?.periodStart || ''));
  const periodEnd = new Date(String(req.body?.periodEnd || ''));
  const currency = String(req.body?.currency || 'UZS').toUpperCase();
  if (!amount.gt(0) || Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodStart > periodEnd || !/^[A-Z]{3}$/.test(currency)) return res.status(400).json({ error: 'Musbat budjet, valyuta va to‘g‘ri davr talab qilinadi' });
  const categoryId = String(req.body?.expenseCategoryId || '').trim() || null;
  if (categoryId && !(await prisma.expenseCategory.findFirst({ where: { id: categoryId, firmId, deletedAt: null } }))) return res.status(403).json({ error: 'Kategoriya bu firma doirasida emas' });
  const row = await prisma.expenseBudget.create({ data: { firmId, expenseCategoryId: categoryId, periodType: String(req.body?.periodType || 'MONTHLY').toUpperCase(), periodStart, periodEnd, amount, currency, limitAction: String(req.body?.limitAction || 'WARNING').toUpperCase(), createdByUserId: user.userId } });
  await writeAuditLog(req, { action: 'EXPENSE_BUDGET_CREATED', entityType: 'expenseBudget', entityId: row.id, summary: `Xarajat budjeti yaratildi: ${amount} ${currency}`, after: row });
  return res.status(201).json(row);
}

export async function deactivateExpenseBudget(req: Request, res: Response) {
  const user = auth(req);
  const row = await prisma.expenseBudget.findUnique({ where: { id: String(req.params.id) } });
  if (!row || !(await canAccessFirm(user, row.firmId)) || !canManage(user, row.firmId)) return res.status(403).json({ error: 'Forbidden' });
  const updated = await prisma.expenseBudget.update({ where: { id: row.id }, data: { isActive: false } });
  await writeAuditLog(req, { action: 'EXPENSE_BUDGET_DEACTIVATED', entityType: 'expenseBudget', entityId: row.id, summary: 'Xarajat budjeti nofaol qilindi', before: row, after: updated });
  return res.json({ ok: true });
}
