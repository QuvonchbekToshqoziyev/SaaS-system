import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { prisma } from '../db';
import { canAccessFirm, getAccessibleFirmIds, normalizeRole } from '../utils/access';
import { writeAuditLog } from '../utils/audit';

type AuthUser = { userId?: string; role?: string; firmRole?: string | null; firmId?: string | null };
const auth = (req: Request) => ((req as any).user || {}) as AuthUser;

const CATEGORY_TYPES = new Set([
  'OPERATING_EXPENSE', 'EMPLOYEE_EXPENSE', 'TAX_PAYMENT', 'FINANCE_COST', 'OTHER_EXPENSE',
  'ASSET_ACQUISITION', 'LIABILITY_SETTLEMENT', 'PREPAYMENT', 'OWNER_WITHDRAWAL', 'DIVIDEND', 'INTERNAL_TRANSFER',
]);

function canManage(user: AuthUser, firmId: string) {
  const role = normalizeRole(user.role);
  return role === 'SUPERADMIN' || (role === 'FIRM'
    && String(user.firmRole || '').toUpperCase() === 'FIRM_ADMIN'
    && String(user.firmId || '') === firmId);
}

async function resolveFirmId(req: Request) {
  const user = auth(req);
  return normalizeRole(user.role) === 'FIRM' ? String(user.firmId || '') : String(req.body?.firmId || req.query.firmId || '');
}

export async function listExpenseCategories(req: Request, res: Response) {
  const user = auth(req);
  const requestedFirmId = String(req.query.firmId || '').trim();
  if (requestedFirmId && !(await canAccessFirm(user, requestedFirmId))) return res.status(403).json({ error: 'Forbidden' });
  const firmIds = requestedFirmId ? [requestedFirmId] : await getAccessibleFirmIds(user);
  const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
  const rows = await prisma.expenseCategory.findMany({
    where: {
      deletedAt: null,
      ...(!includeInactive ? { isActive: true } : {}),
      ...(firmIds ? { firmId: { in: firmIds } } : {}),
    },
    include: { parent: { select: { id: true, name: true, code: true } } },
    orderBy: [{ firmId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  return res.json(rows);
}

export async function createExpenseCategory(req: Request, res: Response) {
  const user = auth(req);
  const firmId = await resolveFirmId(req);
  if (!firmId || !(await canAccessFirm(user, firmId)) || !canManage(user, firmId)) return res.status(403).json({ error: 'Only the owning firm admin can manage expense categories' });
  const code = String(req.body?.code || '').trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
  const name = String(req.body?.name || '').trim();
  const categoryType = String(req.body?.categoryType || 'OPERATING_EXPENSE').toUpperCase();
  if (!code || !name || !CATEGORY_TYPES.has(categoryType)) return res.status(400).json({ error: 'Valid code, name and category type are required' });
  const parentId = String(req.body?.parentId || '').trim() || null;
  if (parentId) {
    const parent = await prisma.expenseCategory.findFirst({ where: { id: parentId, firmId, deletedAt: null } });
    if (!parent) return res.status(403).json({ error: 'Parent category is not accessible' });
  }
  try {
    const row = await prisma.expenseCategory.create({ data: {
      firmId, parentId, code, name,
      description: String(req.body?.description || '').trim() || null,
      categoryType,
      accountingTreatment: String(req.body?.accountingTreatment || 'EXPENSE').toUpperCase(),
      financialStatementGroup: String(req.body?.financialStatementGroup || 'OPERATING_EXPENSES').toUpperCase(),
      cashFlowGroup: String(req.body?.cashFlowGroup || 'OPERATING').toUpperCase(),
      defaultAccountCode: String(req.body?.defaultAccountCode || '').trim() || null,
      taxDeductible: req.body?.taxDeductible !== false,
      requiresEmployee: req.body?.requiresEmployee === true,
      requiresCounterparty: req.body?.requiresCounterparty === true,
      requiresDocument: req.body?.requiresDocument === true,
      requiresApproval: req.body?.requiresApproval === true,
      budgetEnabled: req.body?.budgetEnabled === true,
      sortOrder: Number.isInteger(req.body?.sortOrder) ? req.body.sortOrder : 0,
      createdByUserId: user.userId,
    } });
    await writeAuditLog(req, { action: 'EXPENSE_CATEGORY_CREATED', entityType: 'expenseCategory', entityId: row.id, entityLabel: row.name, summary: `Xarajat kategoriyasi yaratildi: ${row.name}`, after: row });
    return res.status(201).json(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.status(409).json({ error: 'Bu kategoriya kodi firmada mavjud' });
    throw error;
  }
}

export async function updateExpenseCategory(req: Request, res: Response) {
  const user = auth(req);
  const current = await prisma.expenseCategory.findFirst({ where: { id: String(req.params.id), deletedAt: null } });
  if (!current) return res.status(404).json({ error: 'Kategoriya topilmadi' });
  if (!(await canAccessFirm(user, current.firmId)) || !canManage(user, current.firmId)) return res.status(403).json({ error: 'Forbidden' });
  const requestedCode = String(req.body?.code ?? current.code).trim().toUpperCase();
  if (current.isSystemDefault && requestedCode !== current.code) return res.status(400).json({ error: 'Tizim kategoriyasining kodi o‘zgartirilmaydi' });
  const parentId = Object.prototype.hasOwnProperty.call(req.body || {}, 'parentId') ? String(req.body.parentId || '').trim() || null : current.parentId;
  if (parentId === current.id) return res.status(400).json({ error: 'Kategoriya o‘ziga subkategoriya bo‘la olmaydi' });
  if (parentId) {
    const parent = await prisma.expenseCategory.findFirst({ where: { id: parentId, firmId: current.firmId, deletedAt: null } });
    if (!parent) return res.status(403).json({ error: 'Parent category is not accessible' });
  }
  const categoryType = String(req.body?.categoryType ?? current.categoryType).toUpperCase();
  if (!CATEGORY_TYPES.has(categoryType)) return res.status(400).json({ error: 'Invalid category type' });
  const row = await prisma.expenseCategory.update({ where: { id: current.id }, data: {
    parentId, code: requestedCode, name: String(req.body?.name ?? current.name).trim(),
    description: req.body?.description == null ? current.description : String(req.body.description).trim() || null,
    categoryType,
    accountingTreatment: String(req.body?.accountingTreatment ?? current.accountingTreatment).toUpperCase(),
    financialStatementGroup: String(req.body?.financialStatementGroup ?? current.financialStatementGroup).toUpperCase(),
    cashFlowGroup: String(req.body?.cashFlowGroup ?? current.cashFlowGroup).toUpperCase(),
    defaultAccountCode: req.body?.defaultAccountCode == null ? current.defaultAccountCode : String(req.body.defaultAccountCode).trim() || null,
    taxDeductible: req.body?.taxDeductible ?? current.taxDeductible,
    requiresEmployee: req.body?.requiresEmployee ?? current.requiresEmployee,
    requiresCounterparty: req.body?.requiresCounterparty ?? current.requiresCounterparty,
    requiresDocument: req.body?.requiresDocument ?? current.requiresDocument,
    requiresApproval: req.body?.requiresApproval ?? current.requiresApproval,
    budgetEnabled: req.body?.budgetEnabled ?? current.budgetEnabled,
    sortOrder: Number.isInteger(req.body?.sortOrder) ? req.body.sortOrder : current.sortOrder,
    isActive: req.body?.isActive ?? current.isActive,
    updatedByUserId: user.userId,
  } });
  await writeAuditLog(req, { action: row.isActive ? 'EXPENSE_CATEGORY_UPDATED' : 'EXPENSE_CATEGORY_DEACTIVATED', entityType: 'expenseCategory', entityId: row.id, entityLabel: row.name, summary: `Xarajat kategoriyasi yangilandi: ${row.name}`, before: current, after: row });
  return res.json(row);
}

export async function deleteExpenseCategory(req: Request, res: Response) {
  const user = auth(req);
  const current = await prisma.expenseCategory.findFirst({ where: { id: String(req.params.id), deletedAt: null }, include: { _count: { select: { transactions: true, children: true } } } });
  if (!current) return res.status(404).json({ error: 'Kategoriya topilmadi' });
  if (!(await canAccessFirm(user, current.firmId)) || !canManage(user, current.firmId)) return res.status(403).json({ error: 'Forbidden' });
  const mustDeactivate = current.isSystemDefault || current._count.transactions > 0 || current._count.children > 0;
  const row = await prisma.expenseCategory.update({ where: { id: current.id }, data: mustDeactivate ? { isActive: false, updatedByUserId: user.userId } : { isActive: false, deletedAt: new Date(), updatedByUserId: user.userId } });
  await writeAuditLog(req, { action: 'EXPENSE_CATEGORY_DEACTIVATED', entityType: 'expenseCategory', entityId: row.id, entityLabel: row.name, summary: `Xarajat kategoriyasi nofaol qilindi: ${row.name}`, before: current, after: row });
  return res.json({ ...row, message: mustDeactivate ? 'Ushbu kategoriya tarix yoki tizim sozlamalarida ishlatiladi. U nofaol qilindi.' : undefined });
}
