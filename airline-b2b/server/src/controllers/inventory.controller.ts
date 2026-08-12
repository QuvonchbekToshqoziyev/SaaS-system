import { InventoryDocumentType, InventoryMovementType, Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { prisma } from '../db';
import { canAccessFirm, getRelatedFirmIds, normalizeRole } from '../utils/access';
import { positiveNumber, saleTotals } from '../domains/inventory/inventory-math';
import { FirmPermission, hasFirmPermission } from '../utils/firm-user-roles';

const DEFAULT_CATEGORIES = [
  ['FOOD', 'Oziq-ovqat'], ['DRINK', 'Ichimlik'], ['STATIONERY', 'Kanselyariya'],
  ['APPLIANCE', 'Maishiy texnika'], ['ELECTRONICS', 'Elektronika'],
  ['CONSTRUCTION', 'Qurilish materiallari'], ['MEDICINE', 'Dori vositalari'],
  ['CLOTHING', 'Kiyim-kechak'], ['SPARE_PARTS', 'Ehtiyot qismlar'], ['OTHER', 'Boshqa'],
] as const;
const DEFAULT_UNITS = [
  ['PCS', 'dona'], ['KG', 'kg'], ['GRAM', 'gramm'], ['LITRE', 'litr'], ['ML', 'millilitr'],
  ['BOX', 'quti'], ['PACK', 'pachka'], ['METER', 'metr'], ['SET', 'komplekt'],
] as const;
const DEFAULT_WAREHOUSES = [['MAIN', 'Asosiy ombor'], ['BRANCH', 'Filial ombori'], ['TRANSIT', 'Tranzit ombor']] as const;

type AuthUser = { userId: string; role: string; firmId?: string | null; firmRole?: string | null };
type ApplyLine = {
  productId?: unknown; batchId?: unknown; batchNumber?: unknown; manufactureDate?: unknown; expiryDate?: unknown;
  quantity?: unknown; unitPrice?: unknown; unitCost?: unknown; discountAmount?: unknown;
};

function auth(req: Request) { return (req as any).user as AuthUser; }
function text(value: unknown) { return String(value || '').trim(); }
function decimal(value: number | string | Prisma.Decimal) { return new Prisma.Decimal(value); }
function date(value: unknown, fallback = new Date()) {
  if (!value) return fallback;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error('Sana noto‘g‘ri');
  return parsed;
}
function accountCode(account: { id: string; type: string } | null) {
  if (!account) return null;
  if (['BANK', 'BANK_ACCOUNT'].includes(account.type)) return `BANK:${account.id}`;
  return `${account.type}:${account.id}`;
}
function canManage(user: AuthUser) {
  return hasFirmPermission(user, 'inventory.receipt.edit')
    || hasFirmPermission(user, 'inventory.issue.edit')
    || hasFirmPermission(user, 'inventory.sale.edit')
    || hasFirmPermission(user, 'inventory.adjustment.approve');
}
async function resolveFirm(req: Request, fromBody = false) {
  const user = auth(req);
  const firmId = normalizeRole(user.role) === 'FIRM'
    ? text(user.firmId)
    : text(fromBody ? req.body?.firmId : req.query.firmId);
  if (!firmId || !(await canAccessFirm(user, firmId))) return null;
  return firmId;
}

async function ensureDefaults(firmId: string, userId?: string) {
  await prisma.$transaction([
    prisma.inventoryCategory.createMany({ data: DEFAULT_CATEGORIES.map(([code, name]) => ({ firmId, code, name, isSystemDefault: true, createdByUserId: userId })), skipDuplicates: true }),
    prisma.inventoryUnit.createMany({ data: DEFAULT_UNITS.map(([code, name]) => ({ firmId, code, name, isSystemDefault: true, createdByUserId: userId })), skipDuplicates: true }),
    prisma.warehouse.createMany({ data: DEFAULT_WAREHOUSES.map(([code, name]) => ({ firmId, code, name, responsibleUserId: userId })), skipDuplicates: true }),
  ]);
}

export async function getInventoryBootstrap(req: Request, res: Response) {
  const firmId = await resolveFirm(req);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  await ensureDefaults(firmId, auth(req).userId);
  const relatedFirmIds = await getRelatedFirmIds(auth(req));
  const [categories, units, warehouses, suppliers, customers, accounts, contractorFirms] = await Promise.all([
    prisma.inventoryCategory.findMany({ where: { firmId, deletedAt: null }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] }),
    prisma.inventoryUnit.findMany({ where: { firmId, deletedAt: null }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] }),
    prisma.warehouse.findMany({ where: { firmId, deletedAt: null }, orderBy: { name: 'asc' } }),
    prisma.inventorySupplier.findMany({ where: { firmId, deletedAt: null }, orderBy: { name: 'asc' } }),
    prisma.inventoryCustomer.findMany({ where: { firmId, deletedAt: null }, orderBy: { name: 'asc' } }),
    prisma.financialAccount.findMany({ where: { firmId, status: 'ACTIVE', deletedAt: null }, select: { id: true, name: true, type: true, currency: true }, orderBy: { name: 'asc' } }),
    prisma.firm.findMany({
      where: { id: { not: firmId, ...(relatedFirmIds ? { in: relatedFirmIds } : {}) }, status: { not: 'DELETED' }, deletedAt: null },
      select: { id: true, name: true, phone: true, kind: true }, orderBy: { name: 'asc' },
    }),
  ]);
  return res.json({ firmId, categories, units, warehouses, suppliers, customers, accounts, contractorFirms });
}

export async function listInventoryProducts(req: Request, res: Response) {
  const firmId = await resolveFirm(req);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  const search = text(req.query.search);
  const products = await prisma.product.findMany({
    where: { firmId, status: 'ACTIVE', deletedAt: null, ...(search ? { OR: [{ sku: { contains: search, mode: 'insensitive' } }, { barcode: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }] } : {}) },
    include: { category: true, unit: true, defaultSupplier: true, defaultWarehouse: true },
    orderBy: { name: 'asc' },
  });
  return res.json(products);
}

export async function createInventoryProduct(req: Request, res: Response) {
  const user = auth(req);
  if (!canManage(user)) return res.status(403).json({ error: 'Mahsulot yaratish uchun ruxsat yo‘q' });
  const firmId = await resolveFirm(req, true);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  await ensureDefaults(firmId, user.userId);
  const sku = text(req.body?.sku).toUpperCase();
  const name = text(req.body?.name);
  const categoryId = text(req.body?.categoryId);
  const unitId = text(req.body?.unitId);
  if (!sku || !name || !categoryId || !unitId) return res.status(400).json({ error: 'SKU, nom, kategoriya va birlik majburiy' });
  const [category, unit, supplier, warehouse] = await Promise.all([
    prisma.inventoryCategory.findFirst({ where: { id: categoryId, firmId, isActive: true, deletedAt: null } }),
    prisma.inventoryUnit.findFirst({ where: { id: unitId, firmId, isActive: true, deletedAt: null } }),
    req.body?.defaultSupplierId ? prisma.inventorySupplier.findFirst({ where: { id: text(req.body.defaultSupplierId), firmId, deletedAt: null } }) : null,
    req.body?.defaultWarehouseId ? prisma.warehouse.findFirst({ where: { id: text(req.body.defaultWarehouseId), firmId, deletedAt: null } }) : null,
  ]);
  if (!category || !unit || (req.body?.defaultSupplierId && !supplier) || (req.body?.defaultWarehouseId && !warehouse)) return res.status(403).json({ error: 'Tanlangan ma’lumot boshqa firma doirasida' });
  try {
    const product = await prisma.$transaction(async (tx) => {
      const row = await tx.product.create({ data: {
        firmId, sku, barcode: text(req.body?.barcode) || null, name, description: text(req.body?.description) || null,
        categoryId, unitId, minimumStock: decimal(Number(req.body?.minimumStock || 0)), reorderPoint: decimal(Number(req.body?.reorderPoint || 0)),
        defaultPurchasePrice: req.body?.defaultPurchasePrice === '' || req.body?.defaultPurchasePrice == null ? null : decimal(Number(req.body.defaultPurchasePrice)),
        defaultSalePrice: req.body?.defaultSalePrice === '' || req.body?.defaultSalePrice == null ? null : decimal(Number(req.body.defaultSalePrice)),
        currency: text(req.body?.currency).toUpperCase() || 'UZS', defaultSupplierId: supplier?.id, defaultWarehouseId: warehouse?.id,
        tracksBatch: Boolean(req.body?.tracksBatch), tracksExpiry: Boolean(req.body?.tracksExpiry), createdByUserId: user.userId,
      } });
      await tx.auditLog.create({ data: { actorUserId: user.userId, actorRole: normalizeRole(user.role), action: 'PRODUCT_CREATED', entityType: 'product', entityId: row.id, entityLabel: row.name, summary: `${row.name} mahsuloti yaratildi`, after: row as unknown as Prisma.InputJsonValue, metadata: { actorFirmId: firmId } } });
      return row;
    });
    return res.status(201).json(product);
  } catch (error: any) {
    return res.status(409).json({ error: error?.code === 'P2002' ? 'SKU yoki shtrix-kod takrorlangan' : error?.message || 'Mahsulot yaratilmadi' });
  }
}

export async function updateInventoryProduct(req: Request, res: Response) {
  const user = auth(req);
  if (!canManage(user)) return res.status(403).json({ error: 'Mahsulotni tahrirlash uchun ruxsat yo‘q' });
  const firmId = await resolveFirm(req, true);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  const current = await prisma.product.findFirst({ where: { id: text(req.params.id), firmId, deletedAt: null } });
  if (!current) return res.status(404).json({ error: 'Mahsulot topilmadi' });
  const categoryId = text(req.body?.categoryId) || current.categoryId;
  const unitId = text(req.body?.unitId) || current.unitId;
  const [category, unit] = await Promise.all([
    prisma.inventoryCategory.findFirst({ where: { id: categoryId, firmId, isActive: true, deletedAt: null } }),
    prisma.inventoryUnit.findFirst({ where: { id: unitId, firmId, isActive: true, deletedAt: null } }),
  ]);
  if (!category || !unit) return res.status(403).json({ error: 'Kategoriya yoki birlik boshqa firma doirasida' });
  try {
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({ where: { id: current.id }, data: {
        sku: text(req.body?.sku).toUpperCase() || current.sku, barcode: req.body?.barcode === undefined ? current.barcode : text(req.body.barcode) || null,
        name: text(req.body?.name) || current.name, categoryId, unitId,
        minimumStock: req.body?.minimumStock === undefined ? current.minimumStock : decimal(Number(req.body.minimumStock || 0)),
        defaultPurchasePrice: req.body?.defaultPurchasePrice === undefined ? current.defaultPurchasePrice : req.body.defaultPurchasePrice === '' ? null : decimal(Number(req.body.defaultPurchasePrice)),
        defaultSalePrice: req.body?.defaultSalePrice === undefined ? current.defaultSalePrice : req.body.defaultSalePrice === '' ? null : decimal(Number(req.body.defaultSalePrice)),
        tracksBatch: req.body?.tracksBatch === undefined ? current.tracksBatch : Boolean(req.body.tracksBatch),
        tracksExpiry: req.body?.tracksExpiry === undefined ? current.tracksExpiry : Boolean(req.body.tracksExpiry), updatedByUserId: user.userId,
      } });
      await tx.auditLog.create({ data: { actorUserId: user.userId, actorRole: normalizeRole(user.role), action: 'PRODUCT_UPDATED', entityType: 'product', entityId: updated.id, entityLabel: updated.name, summary: `${updated.name} mahsuloti tahrirlandi`, before: current as unknown as Prisma.InputJsonValue, after: updated as unknown as Prisma.InputJsonValue, metadata: { actorFirmId: firmId } } });
      return updated;
    });
    return res.json(row);
  } catch (error: any) { return res.status(409).json({ error: error?.code === 'P2002' ? 'SKU yoki shtrix-kod takrorlangan' : error?.message || 'Mahsulot tahrirlanmadi' }); }
}

export async function deactivateInventoryProduct(req: Request, res: Response) {
  const user = auth(req);
  if (!canManage(user)) return res.status(403).json({ error: 'Mahsulotni o‘chirish uchun ruxsat yo‘q' });
  const firmId = await resolveFirm(req, true);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  const current = await prisma.product.findFirst({ where: { id: text(req.params.id), firmId, deletedAt: null } });
  if (!current) return res.status(404).json({ error: 'Mahsulot topilmadi' });
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({ where: { id: current.id }, data: { status: 'INACTIVE', updatedByUserId: user.userId } });
    await tx.auditLog.create({ data: { actorUserId: user.userId, actorRole: normalizeRole(user.role), action: 'PRODUCT_DEACTIVATED', entityType: 'product', entityId: updated.id, entityLabel: updated.name, summary: `${updated.name} mahsuloti nofaol qilindi`, before: current as unknown as Prisma.InputJsonValue, after: updated as unknown as Prisma.InputJsonValue, metadata: { actorFirmId: firmId } } });
    return updated;
  });
  return res.json(row);
}

export async function createInventoryCategory(req: Request, res: Response) {
  const user = auth(req);
  if (!canManage(user)) return res.status(403).json({ error: 'Kategoriya yaratish uchun ruxsat yo‘q' });
  const firmId = await resolveFirm(req, true);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  const name = text(req.body?.name), parentId = text(req.body?.parentId) || null;
  if (!name) return res.status(400).json({ error: 'Kategoriya nomi majburiy' });
  if (parentId && !(await prisma.inventoryCategory.findFirst({ where: { id: parentId, firmId, isActive: true, deletedAt: null } }))) return res.status(403).json({ error: 'Yuqori kategoriya boshqa firma doirasida' });
  try {
    const row = await prisma.inventoryCategory.create({ data: { firmId, name, parentId, code: text(req.body?.code).toUpperCase() || `CUSTOM_${Date.now()}`, createdByUserId: user.userId } });
    return res.status(201).json(row);
  } catch (error: any) { return res.status(409).json({ error: error?.code === 'P2002' ? 'Kategoriya kodi takrorlangan' : error?.message || 'Kategoriya yaratilmadi' }); }
}

export async function updateInventoryCategory(req: Request, res: Response) {
  const user = auth(req);
  if (!canManage(user)) return res.status(403).json({ error: 'Kategoriyani tahrirlash uchun ruxsat yo‘q' });
  const firmId = await resolveFirm(req, true);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  const current = await prisma.inventoryCategory.findFirst({ where: { id: text(req.params.id), firmId, deletedAt: null } });
  if (!current) return res.status(404).json({ error: 'Kategoriya topilmadi' });
  const name = text(req.body?.name) || current.name;
  const row = await prisma.inventoryCategory.update({ where: { id: current.id }, data: { name, isActive: req.body?.isActive === undefined ? current.isActive : Boolean(req.body.isActive), updatedByUserId: user.userId } });
  return res.json(row);
}

export async function deactivateInventoryCategory(req: Request, res: Response) {
  const user = auth(req);
  if (!canManage(user)) return res.status(403).json({ error: 'Kategoriyani o‘chirish uchun ruxsat yo‘q' });
  const firmId = await resolveFirm(req, true);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  const current = await prisma.inventoryCategory.findFirst({ where: { id: text(req.params.id), firmId, deletedAt: null } });
  if (!current) return res.status(404).json({ error: 'Kategoriya topilmadi' });
  const activeProducts = await prisma.product.count({ where: { firmId, categoryId: current.id, status: 'ACTIVE', deletedAt: null } });
  if (activeProducts) return res.status(409).json({ error: `Kategoriyada ${activeProducts} ta faol mahsulot bor. Avval ularni boshqa kategoriyaga o‘tkazing.` });
  return res.json(await prisma.inventoryCategory.update({ where: { id: current.id }, data: { isActive: false, deletedAt: new Date(), updatedByUserId: user.userId } }));
}

export async function createInventoryUnit(req: Request, res: Response) {
  const user = auth(req);
  if (!canManage(user)) return res.status(403).json({ error: 'O‘lchov birligi yaratish uchun ruxsat yo‘q' });
  const firmId = await resolveFirm(req, true);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  const name = text(req.body?.name);
  const code = text(req.body?.code || name).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  if (!name || !code) return res.status(400).json({ error: 'Birlik kodi va nomi majburiy' });
  try {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.inventoryUnit.create({ data: { firmId, code, name, createdByUserId: user.userId } });
      await tx.auditLog.create({ data: { actorUserId: user.userId, actorRole: normalizeRole(user.role), action: 'INVENTORY_UNIT_CREATED', entityType: 'inventoryUnit', entityId: created.id, entityLabel: created.name, summary: `${created.name} o‘lchov birligi yaratildi`, after: created as unknown as Prisma.InputJsonValue, metadata: { actorFirmId: firmId } } });
      return created;
    });
    return res.status(201).json(row);
  } catch (error: any) {
    return res.status(409).json({ error: error?.code === 'P2002' ? 'Bu birlik kodi firmada mavjud' : error?.message || 'O‘lchov birligi yaratilmadi' });
  }
}

export async function updateInventoryUnit(req: Request, res: Response) {
  const user = auth(req);
  if (!canManage(user)) return res.status(403).json({ error: 'O‘lchov birligini tahrirlash uchun ruxsat yo‘q' });
  const firmId = await resolveFirm(req, true);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  const current = await prisma.inventoryUnit.findFirst({ where: { id: text(req.params.id), firmId, deletedAt: null } });
  if (!current) return res.status(404).json({ error: 'O‘lchov birligi topilmadi' });
  const name = text(req.body?.name) || current.name;
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.inventoryUnit.update({ where: { id: current.id }, data: { name, isActive: req.body?.isActive === undefined ? current.isActive : Boolean(req.body.isActive) } });
    await tx.auditLog.create({ data: { actorUserId: user.userId, actorRole: normalizeRole(user.role), action: 'INVENTORY_UNIT_UPDATED', entityType: 'inventoryUnit', entityId: updated.id, entityLabel: updated.name, summary: `${updated.name} o‘lchov birligi tahrirlandi`, before: current as unknown as Prisma.InputJsonValue, after: updated as unknown as Prisma.InputJsonValue, metadata: { actorFirmId: firmId } } });
    return updated;
  });
  return res.json(row);
}

export async function deactivateInventoryUnit(req: Request, res: Response) {
  const user = auth(req);
  if (!canManage(user)) return res.status(403).json({ error: 'O‘lchov birligini o‘chirish uchun ruxsat yo‘q' });
  const firmId = await resolveFirm(req, true);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  const current = await prisma.inventoryUnit.findFirst({ where: { id: text(req.params.id), firmId, deletedAt: null } });
  if (!current) return res.status(404).json({ error: 'O‘lchov birligi topilmadi' });
  const activeProducts = await prisma.product.count({ where: { firmId, unitId: current.id, status: 'ACTIVE', deletedAt: null } });
  if (activeProducts) return res.status(409).json({ error: `Bu birlik ${activeProducts} ta faol mahsulotda ishlatilgan` });
  const row = await prisma.$transaction(async (tx) => {
    const deleted = await tx.inventoryUnit.update({ where: { id: current.id }, data: { isActive: false, deletedAt: new Date() } });
    await tx.auditLog.create({ data: { actorUserId: user.userId, actorRole: normalizeRole(user.role), action: 'INVENTORY_UNIT_DEACTIVATED', entityType: 'inventoryUnit', entityId: deleted.id, entityLabel: deleted.name, summary: `${deleted.name} o‘lchov birligi nofaol qilindi`, before: current as unknown as Prisma.InputJsonValue, after: deleted as unknown as Prisma.InputJsonValue, metadata: { actorFirmId: firmId } } });
    return deleted;
  });
  return res.json(row);
}

export async function listInventoryPartners(req: Request, res: Response) {
  const firmId = await resolveFirm(req);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  const kind = text(req.params.kind).toLowerCase();
  if (kind === 'suppliers') return res.json(await prisma.inventorySupplier.findMany({ where: { firmId, deletedAt: null }, orderBy: { name: 'asc' } }));
  if (kind === 'customers') return res.json(await prisma.inventoryCustomer.findMany({ where: { firmId, deletedAt: null }, orderBy: { name: 'asc' } }));
  return res.status(404).json({ error: 'Ro‘yxat topilmadi' });
}

export async function createInventoryPartner(req: Request, res: Response) {
  const user = auth(req);
  if (!canManage(user)) return res.status(403).json({ error: 'Ruxsat yo‘q' });
  const firmId = await resolveFirm(req, true);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  const name = text(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Nom majburiy' });
  const common = { firmId, name, phone: text(req.body?.phone) || null, email: text(req.body?.email) || null, address: text(req.body?.address) || null, notes: text(req.body?.notes) || null };
  const kind = text(req.params.kind).toLowerCase();
  if (kind === 'suppliers') return res.status(201).json(await prisma.inventorySupplier.create({ data: { ...common, taxId: text(req.body?.taxId) || null, contactPerson: text(req.body?.contactPerson) || null, paymentTerms: text(req.body?.paymentTerms) || null, defaultCurrency: text(req.body?.defaultCurrency).toUpperCase() || 'UZS' } }));
  if (kind === 'customers') return res.status(201).json(await prisma.inventoryCustomer.create({ data: { ...common, type: text(req.body?.type) || 'BUSINESS', responsiblePerson: text(req.body?.responsiblePerson) || null, paymentTerms: text(req.body?.paymentTerms) || null } }));
  return res.status(404).json({ error: 'Ro‘yxat topilmadi' });
}

async function postJournal(tx: Prisma.TransactionClient, input: {
  firmId: string; userId: string; movementId: string; type: 'SALE' | 'PAYABLE' | 'ADJUSTMENT'; date: Date;
  originalAmount: Prisma.Decimal; currency: string; rate: Prisma.Decimal; baseAmount: Prisma.Decimal;
  description: string; sourceAccountId?: string; debitAccount: string; creditAccount: string; cogs?: Prisma.Decimal;
  cogsReversal?: boolean;
}) {
  const transaction = await tx.transaction.create({ data: {
    firmId: input.firmId, createdByUserId: input.userId, type: input.type, direction: input.sourceAccountId ? (input.type === 'SALE' ? 'ACCOUNT_IN' : 'ACCOUNT_OUT') : 'NON_CASH',
    subjectType: 'INVENTORY_MOVEMENT', subjectId: input.movementId, originalAmount: input.originalAmount, currency: input.currency,
    exchangeRate: input.rate, baseAmount: input.baseAmount, sourceAccountId: input.type === 'SALE' ? undefined : input.sourceAccountId,
    destinationAccountId: input.type === 'SALE' ? input.sourceAccountId : undefined, sourceMode: 'INVENTORY', status: 'APPLIED',
    approvalStatus: 'APPROVED', accountingTreatment: input.type === 'PAYABLE' ? 'BALANCE_SHEET' : input.type === 'SALE' ? 'REVENUE_AND_COGS' : 'EXPENSE',
    postingDate: input.date, documentDate: input.date, reportingPeriod: input.date.toISOString().slice(0, 7), metadata: { inventoryMovementId: input.movementId } as Prisma.InputJsonValue,
  } });
  const journal = await tx.journalEntry.create({ data: { firmId: input.firmId, transactionId: transaction.id, postingDate: input.date, description: input.description, postedByUserId: input.userId } });
  const entries = [{ transactionId: transaction.id, journalEntryId: journal.id, debitAccount: input.debitAccount, creditAccount: input.creditAccount, amount: input.baseAmount, currency: 'UZS', exchangeRateSnapshot: input.rate }];
  if (input.cogs?.gt(0)) entries.push({ transactionId: transaction.id, journalEntryId: journal.id, debitAccount: input.cogsReversal ? 'INVENTORY' : 'COST_OF_GOODS_SOLD', creditAccount: input.cogsReversal ? 'COST_OF_GOODS_SOLD' : 'INVENTORY', amount: input.cogs, currency: 'UZS', exchangeRateSnapshot: decimal(1) });
  await tx.ledgerEntry.createMany({ data: entries });
  await tx.inventoryMovement.update({ where: { id: input.movementId }, data: { transactionId: transaction.id } });
}

function movementFor(type: InventoryDocumentType): InventoryMovementType {
  const map: Partial<Record<InventoryDocumentType, InventoryMovementType>> = {
    PURCHASE: 'PURCHASE_IN', SALE: 'SALE_OUT', INTERNAL_USE: 'INTERNAL_USE_OUT', TRANSFER: 'TRANSFER_OUT',
    WRITE_OFF: 'WRITE_OFF_OUT', SUPPLIER_RETURN: 'SUPPLIER_RETURN_OUT', CUSTOMER_RETURN: 'CUSTOMER_RETURN_IN',
    INVENTORY_SURPLUS: 'INVENTORY_SURPLUS_IN', INVENTORY_SHORTAGE: 'INVENTORY_SHORTAGE_OUT', PRODUCTION_RECEIPT: 'PRODUCTION_IN',
    FREE_RECEIPT: 'FREE_RECEIPT_IN', EMPLOYEE_ISSUE: 'EMPLOYEE_ISSUE_OUT', FREE_ISSUE: 'FREE_ISSUE_OUT', OTHER_RECEIPT: 'OTHER_IN', OTHER_ISSUE: 'OTHER_OUT',
  };
  const result = map[type];
  if (!result) throw new Error('Bu ombor operatsiyasi hali qo‘llab-quvvatlanmaydi');
  return result;
}
const INCOMING_TYPES = new Set<InventoryDocumentType>(['PURCHASE', 'CUSTOMER_RETURN', 'INVENTORY_SURPLUS', 'PRODUCTION_RECEIPT', 'FREE_RECEIPT', 'OTHER_RECEIPT']);
const OUTGOING_TYPES = new Set<InventoryDocumentType>(['SALE', 'INTERNAL_USE', 'TRANSFER', 'WRITE_OFF', 'SUPPLIER_RETURN', 'EMPLOYEE_ISSUE', 'FREE_ISSUE', 'INVENTORY_SHORTAGE', 'OTHER_ISSUE']);
function inventoryPermissionFor(type: InventoryDocumentType, action: 'edit' | 'cancel'): FirmPermission {
  if (type === 'SALE') return `inventory.sale.${action}`;
  if (INCOMING_TYPES.has(type) || ['INTERNAL_RECEIPT', 'FOUNDER_CONTRIBUTION'].includes(type)) return `inventory.receipt.${action}`;
  return `inventory.issue.${action}`;
}
const REVERSAL_MOVEMENTS: Record<InventoryMovementType, InventoryMovementType> = {
  PURCHASE_IN: 'SUPPLIER_RETURN_OUT',
  SALE_OUT: 'CUSTOMER_RETURN_IN',
  CUSTOMER_RETURN_IN: 'SALE_OUT',
  SUPPLIER_RETURN_OUT: 'PURCHASE_IN',
  INTERNAL_USE_OUT: 'OTHER_IN',
  TRANSFER_OUT: 'TRANSFER_IN',
  TRANSFER_IN: 'TRANSFER_OUT',
  WRITE_OFF_OUT: 'OTHER_IN',
  INVENTORY_SURPLUS_IN: 'INVENTORY_SHORTAGE_OUT',
  INVENTORY_SHORTAGE_OUT: 'INVENTORY_SURPLUS_IN',
  PRODUCTION_IN: 'OTHER_OUT',
  FREE_RECEIPT_IN: 'FREE_ISSUE_OUT',
  EMPLOYEE_ISSUE_OUT: 'OTHER_IN',
  FREE_ISSUE_OUT: 'FREE_RECEIPT_IN',
  OTHER_IN: 'OTHER_OUT',
  OTHER_OUT: 'OTHER_IN',
};
const REVERSAL_DOCUMENT_TYPES: Record<InventoryDocumentType, InventoryDocumentType> = {
  PURCHASE: 'SUPPLIER_RETURN',
  INTERNAL_RECEIPT: 'OTHER_ISSUE',
  FOUNDER_CONTRIBUTION: 'OTHER_ISSUE',
  INVENTORY_SURPLUS: 'INVENTORY_SHORTAGE',
  PRODUCTION_RECEIPT: 'OTHER_ISSUE',
  CUSTOMER_RETURN: 'SALE',
  FREE_RECEIPT: 'FREE_ISSUE',
  OTHER_RECEIPT: 'OTHER_ISSUE',
  SALE: 'CUSTOMER_RETURN',
  INTERNAL_USE: 'OTHER_RECEIPT',
  TRANSFER: 'TRANSFER',
  WRITE_OFF: 'OTHER_RECEIPT',
  SUPPLIER_RETURN: 'PURCHASE',
  EMPLOYEE_ISSUE: 'OTHER_RECEIPT',
  FREE_ISSUE: 'FREE_RECEIPT',
  INVENTORY_SHORTAGE: 'INVENTORY_SURPLUS',
  OTHER_ISSUE: 'OTHER_RECEIPT',
};

export function reverseInventoryMovementType(type: InventoryMovementType): InventoryMovementType {
  return REVERSAL_MOVEMENTS[type];
}

export function reversalInventoryDocumentType(type: InventoryDocumentType): InventoryDocumentType {
  return REVERSAL_DOCUMENT_TYPES[type];
}

function isIncomingMovement(type: InventoryMovementType) {
  return type.endsWith('_IN');
}

async function reverseInventoryTransaction(tx: Prisma.TransactionClient, input: {
  transaction: Prisma.TransactionGetPayload<{ include: { ledgerEntries: true; journalEntry: true } }>;
  movementId: string;
  user: AuthUser;
  reason: string;
  date: Date;
}) {
  const current = input.transaction;
  if (current.status !== 'APPLIED' || current.reversedTransactionId || !current.journalEntry || !current.ledgerEntries.length) return null;
  const reversal = await tx.transaction.create({ data: {
    firmId: current.firmId,
    createdByUserId: input.user.userId,
    type: 'ADJUSTMENT',
    operationType: current.operationType,
    economicPurpose: current.economicPurpose,
    direction: 'REVERSAL',
    subjectType: 'INVENTORY_MOVEMENT',
    subjectId: input.movementId,
    originalAmount: current.destinationAmount || current.originalAmount,
    currency: current.destinationCurrency || current.currency,
    exchangeRate: current.exchangeRate,
    baseAmount: current.baseAmount,
    destinationAmount: current.sourceAccountId ? current.originalAmount : null,
    destinationCurrency: current.sourceAccountId ? current.currency : null,
    sourceAccountId: current.destinationAccountId,
    destinationAccountId: current.sourceAccountId,
    sourceMode: 'REVERSAL',
    status: 'APPLIED',
    approvalStatus: 'APPROVED',
    accountingTreatment: 'REVERSAL',
    postingDate: input.date,
    paymentDate: input.date,
    documentDate: input.date,
    reportingPeriod: input.date.toISOString().slice(0, 7),
    reversedTransactionId: current.id,
    metadata: { reversalReason: input.reason, reversedTransactionId: current.id, inventoryMovementId: input.movementId } as Prisma.InputJsonValue,
  } });
  const journal = await tx.journalEntry.create({ data: { firmId: current.firmId, transactionId: reversal.id, status: 'POSTED', postingDate: input.date, description: `Ombor reversal: ${input.reason}`, reversalOfId: current.journalEntry.id, postedByUserId: input.user.userId } });
  await tx.ledgerEntry.createMany({ data: current.ledgerEntries.map((line) => ({ transactionId: reversal.id, journalEntryId: journal.id, debitAccount: line.creditAccount, creditAccount: line.debitAccount, amount: line.amount, currency: line.currency, exchangeRateSnapshot: line.exchangeRateSnapshot })) });
  await tx.transaction.update({ where: { id: current.id }, data: { status: 'REVERSED', reversedTransactionId: reversal.id, updatedByUserId: input.user.userId, deletionReason: input.reason } });
  await tx.inventoryMovement.update({ where: { id: input.movementId }, data: { transactionId: reversal.id } });
  return reversal.id;
}

export async function applyInventoryDocument(req: Request, res: Response) {
  const user = auth(req);
  if (!canManage(user)) return res.status(403).json({ error: 'Ombor harakati uchun ruxsat yo‘q' });
  const firmId = await resolveFirm(req, true);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  const type = text(req.body?.type).toUpperCase() as InventoryDocumentType;
  if (![...INCOMING_TYPES, ...OUTGOING_TYPES].includes(type)) return res.status(400).json({ error: 'Operatsiya turi noto‘g‘ri' });
  const lines = Array.isArray(req.body?.lines) ? req.body.lines as ApplyLine[] : [];
  if (!lines.length || lines.length > 100) return res.status(400).json({ error: '1–100 ta mahsulot qatori kiriting' });
  const warehouseId = text(req.body?.warehouseId);
  const destinationWarehouseId = text(req.body?.destinationWarehouseId) || null;
  const documentNumber = text(req.body?.documentNumber);
  if (!warehouseId || !documentNumber || (type === 'TRANSFER' && !destinationWarehouseId)) return res.status(400).json({ error: 'Hujjat raqami va ombor majburiy' });
  const movementDate = date(req.body?.documentDate);
  const currency = text(req.body?.currency).toUpperCase() || 'UZS';
  const rateNumber = currency === 'UZS' ? 1 : positiveNumber(req.body?.exchangeRate, 'Kurs');
  const rate = decimal(rateNumber);
  const paymentStatus = text(req.body?.paymentStatus).toUpperCase() || 'CREDIT';
  const accountId = text(req.body?.paymentSourceAccountId);
  const supplierFirmId = text(req.body?.supplierFirmId);
  const relatedFirmIds = supplierFirmId ? await getRelatedFirmIds(user) : [];
  const supplierFirm = supplierFirmId && (!relatedFirmIds || relatedFirmIds.includes(supplierFirmId))
    ? await prisma.firm.findFirst({ where: { id: supplierFirmId, status: { not: 'DELETED' }, deletedAt: null }, select: { name: true, phone: true } })
    : null;
  if (supplierFirmId && !supplierFirm) return res.status(403).json({ error: 'Tanlangan pudratchi firma doirasida ko‘rinmaydi' });
  const firmSupplier = supplierFirm ? await prisma.inventorySupplier.findFirst({ where: { firmId, name: supplierFirm.name, deletedAt: null } })
    || await prisma.inventorySupplier.create({ data: { firmId, name: supplierFirm.name, phone: supplierFirm.phone } }) : null;
  const [warehouse, destination, supplier, customer, account] = await Promise.all([
    prisma.warehouse.findFirst({ where: { id: warehouseId, firmId, status: 'ACTIVE', deletedAt: null } }),
    destinationWarehouseId ? prisma.warehouse.findFirst({ where: { id: destinationWarehouseId, firmId, status: 'ACTIVE', deletedAt: null } }) : null,
    firmSupplier || (req.body?.supplierId ? prisma.inventorySupplier.findFirst({ where: { id: text(req.body.supplierId), firmId, deletedAt: null } }) : null),
    req.body?.customerId ? prisma.inventoryCustomer.findFirst({ where: { id: text(req.body.customerId), firmId, deletedAt: null } }) : null,
    accountId ? prisma.financialAccount.findFirst({ where: { id: accountId, firmId, status: 'ACTIVE', deletedAt: null } }) : null,
  ]);
  if (!warehouse || (destinationWarehouseId && !destination) || ((req.body?.supplierId || supplierFirmId) && !supplier) || (req.body?.customerId && !customer) || (accountId && !account)) return res.status(403).json({ error: 'Tanlangan obyekt boshqa firma doirasida' });
  if (['PURCHASE', 'SALE', 'CUSTOMER_RETURN'].includes(type) && paymentStatus === 'PAID' && !account) return res.status(400).json({ error: 'To‘langan operatsiya uchun Kassa, karta yoki bank hisobi tanlang' });
  if (['WRITE_OFF', 'INVENTORY_SHORTAGE'].includes(type) && !text(req.body?.notes)) return res.status(400).json({ error: 'Brak, write-off yoki kamomad sababi majburiy' });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.inventoryDocument.create({ data: {
        firmId, type, status: 'APPLIED', documentNumber, documentDate: movementDate, warehouseId, destinationWarehouseId,
        supplierId: supplier?.id, customerId: customer?.id, paymentStatus, paymentSourceAccountId: account?.id,
        currency, exchangeRateSnapshot: rate, contractNumber: text(req.body?.contractNumber) || null, invoiceNumber: text(req.body?.invoiceNumber) || null,
        flightId: text(req.body?.flightId) || null, tourPackageId: text(req.body?.tourPackageId) || null, costCenterId: text(req.body?.costCenterId) || null,
        employeeId: text(req.body?.employeeId) || null, notes: text(req.body?.notes) || null, createdByUserId: user.userId, approvedByUserId: user.userId, appliedAt: new Date(),
      } });
      let gross = decimal(0), discountTotal = decimal(0), net = decimal(0);
      for (const raw of lines) {
        const productId = text(raw.productId);
        const quantity = decimal(positiveNumber(raw.quantity, 'Miqdor'));
        const unitPrice = decimal(Number(raw.unitPrice || 0));
        const discount = decimal(Number(raw.discountAmount || 0));
        if (unitPrice.lt(0) || discount.lt(0)) throw new Error('Narx va chegirma manfiy bo‘lmasligi kerak');
        await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} AND "firmId" = ${firmId} FOR UPDATE`;
        const product = await tx.product.findFirst({ where: { id: productId, firmId, status: 'ACTIVE', deletedAt: null } });
        if (!product) throw new Error('Mahsulot topilmadi yoki boshqa firmaga tegishli');

        if (INCOMING_TYPES.has(type)) {
          if (product.tracksBatch && !text(raw.batchNumber)) throw new Error(`${product.name}: partiya raqami majburiy`);
          if (product.tracksExpiry && !raw.expiryDate) throw new Error(`${product.name}: yaroqlilik sanasi majburiy`);
          const batchNumber = text(raw.batchNumber) || `DEFAULT-${product.id}`;
          const existingBatches = await tx.inventoryBatch.findMany({ where: { firmId, warehouseId, productId, status: 'ACTIVE' } });
          const oldPhysical = existingBatches.reduce((sum, batch) => sum.add(batch.receivedQuantity.sub(batch.issuedQuantity)), decimal(0));
          const oldValue = existingBatches.reduce((sum, batch) => sum.add(batch.receivedQuantity.sub(batch.issuedQuantity).mul(batch.unitCost)), decimal(0));
          const currentAverage = oldPhysical.gt(0) ? oldValue.div(oldPhysical) : decimal(0);
          const baseUnitCost = type === 'CUSTOMER_RETURN'
            ? decimal(raw.unitCost == null || raw.unitCost === '' ? currentAverage : positiveNumber(raw.unitCost, 'Qaytarilgan tannarx'))
            : unitPrice.mul(rate).toDecimalPlaces(4);
          const newPhysical = oldPhysical.add(quantity);
          const newAverage = oldValue.add(quantity.mul(baseUnitCost)).div(newPhysical).toDecimalPlaces(4);
          await tx.inventoryBatch.updateMany({ where: { firmId, warehouseId, productId, status: 'ACTIVE' }, data: { unitCost: newAverage, currency: 'UZS', exchangeRateSnapshot: decimal(1) } });
          const batch = await tx.inventoryBatch.upsert({
            where: { warehouseId_productId_batchNumber: { warehouseId, productId, batchNumber } },
            create: { firmId, warehouseId, productId, batchNumber, manufactureDate: raw.manufactureDate ? date(raw.manufactureDate) : null, expiryDate: raw.expiryDate ? date(raw.expiryDate) : null, receivedQuantity: quantity, unitCost: newAverage, currency: 'UZS', exchangeRateSnapshot: decimal(1), supplierId: supplier?.id, sourceDocumentId: document.id },
            update: { receivedQuantity: { increment: quantity }, unitCost: newAverage, manufactureDate: raw.manufactureDate ? date(raw.manufactureDate) : undefined, expiryDate: raw.expiryDate ? date(raw.expiryDate) : undefined, supplierId: supplier?.id || undefined },
          });
          const lineTotal = quantity.mul(unitPrice), baseLineTotal = lineTotal.mul(rate);
          const line = await tx.inventoryDocumentLine.create({ data: { documentId: document.id, productId, batchId: batch.id, batchNumber, manufactureDate: batch.manufactureDate, expiryDate: batch.expiryDate, quantity, unitPrice, unitCostSnapshot: baseUnitCost, lineTotal, baseLineTotal, discountAmount: discount } });
          const movement = await tx.inventoryMovement.create({ data: { firmId, warehouseId, productId, batchId: batch.id, documentId: document.id, documentLineId: line.id, movementType: movementFor(type), quantity, unitCostSnapshot: baseUnitCost, totalCostSnapshot: baseLineTotal, currency: 'UZS', exchangeRateSnapshot: decimal(1), sourceType: 'INVENTORY_DOCUMENT', sourceReferenceId: document.id, documentNumber, movementDate, createdByUserId: user.userId, approvedByUserId: user.userId } });
          if (type === 'PURCHASE') {
            const credit = paymentStatus === 'PAID' ? accountCode(account) : paymentStatus === 'ADVANCE' ? 'SUPPLIER_ADVANCE' : 'ACCOUNTS_PAYABLE';
            await postJournal(tx, { firmId, userId: user.userId, movementId: movement.id, type: paymentStatus === 'CREDIT' ? 'PAYABLE' : 'ADJUSTMENT', date: movementDate, originalAmount: lineTotal, currency, rate, baseAmount: baseLineTotal, description: `Ombor xaridi ${documentNumber}`, sourceAccountId: account?.id, debitAccount: 'INVENTORY', creditAccount: credit || 'ACCOUNTS_PAYABLE' });
          } else if (type === 'CUSTOMER_RETURN') {
            const credit = paymentStatus === 'PAID' ? accountCode(account) : 'ACCOUNTS_RECEIVABLE';
            await postJournal(tx, { firmId, userId: user.userId, movementId: movement.id, type: 'ADJUSTMENT', date: movementDate, originalAmount: lineTotal, currency, rate, baseAmount: baseLineTotal, description: `Mijoz qaytarishi ${documentNumber}`, sourceAccountId: account?.id, debitAccount: 'SALES_RETURN', creditAccount: credit || 'ACCOUNTS_RECEIVABLE', cogs: quantity.mul(baseUnitCost), cogsReversal: true });
          } else if (type === 'INVENTORY_SURPLUS') {
            await postJournal(tx, { firmId, userId: user.userId, movementId: movement.id, type: 'ADJUSTMENT', date: movementDate, originalAmount: baseLineTotal, currency: 'UZS', rate: decimal(1), baseAmount: baseLineTotal, description: `Inventarizatsiya ortiqchasi ${documentNumber}`, debitAccount: 'INVENTORY', creditAccount: 'INVENTORY_SURPLUS_GAIN' });
          }
          gross = gross.add(lineTotal); net = net.add(lineTotal);
          continue;
        }

        const requestedBatchId = text(raw.batchId);
        const batches = await tx.inventoryBatch.findMany({ where: { firmId, warehouseId, productId, status: 'ACTIVE', ...(requestedBatchId ? { id: requestedBatchId } : {}) }, orderBy: { createdAt: 'asc' } });
        const sorted = [...batches].sort((a, b) => (a.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER) || a.createdAt.getTime() - b.createdAt.getTime());
        const candidates = type === 'WRITE_OFF' ? sorted : sorted.filter((batch) => !batch.expiryDate || batch.expiryDate >= new Date());
        const available = candidates.reduce((sum, batch) => sum.add(batch.receivedQuantity.sub(batch.issuedQuantity).sub(batch.reservedQuantity)), decimal(0));
        if (available.lt(quantity)) throw new Error(`${product.name}: erkin qoldiq yetarli emas (${available})`);
        const physical = sorted.reduce((sum, batch) => sum.add(batch.receivedQuantity.sub(batch.issuedQuantity)), decimal(0));
        const inventoryValue = sorted.reduce((sum, batch) => sum.add(batch.receivedQuantity.sub(batch.issuedQuantity).mul(batch.unitCost)), decimal(0));
        const averageCost = physical.gt(0) ? inventoryValue.div(physical).toDecimalPlaces(4) : decimal(0);
        const totals = saleTotals(quantity.toNumber(), unitPrice.toNumber(), discount.toNumber(), averageCost.toNumber());
        let remaining = quantity;
        for (const batch of candidates) {
          if (remaining.lte(0)) break;
          const free = batch.receivedQuantity.sub(batch.issuedQuantity).sub(batch.reservedQuantity);
          if (free.lte(0)) continue;
          const take = Prisma.Decimal.min(free, remaining);
          const share = take.div(quantity);
          const allocatedPrice = unitPrice, allocatedDiscount = discount.mul(share).toDecimalPlaces(4);
          const lineTotal = take.mul(allocatedPrice), netLine = lineTotal.sub(allocatedDiscount), cogs = take.mul(averageCost).toDecimalPlaces(4);
          await tx.inventoryBatch.update({ where: { id: batch.id }, data: { issuedQuantity: { increment: take } } });
          const line = await tx.inventoryDocumentLine.create({ data: { documentId: document.id, productId, batchId: batch.id, batchNumber: batch.batchNumber, manufactureDate: batch.manufactureDate, expiryDate: batch.expiryDate, quantity: take, unitPrice: allocatedPrice, unitCostSnapshot: averageCost, lineTotal, baseLineTotal: type === 'SALE' ? netLine.mul(rate) : cogs, discountAmount: allocatedDiscount } });
          const movement = await tx.inventoryMovement.create({ data: { firmId, warehouseId, destinationWarehouseId, productId, batchId: batch.id, documentId: document.id, documentLineId: line.id, movementType: movementFor(type), quantity: take, unitCostSnapshot: averageCost, totalCostSnapshot: cogs, currency: 'UZS', exchangeRateSnapshot: decimal(1), sourceType: 'INVENTORY_DOCUMENT', sourceReferenceId: document.id, documentNumber, movementDate, createdByUserId: user.userId, approvedByUserId: user.userId } });
          if (type === 'SALE') {
            const debit = paymentStatus === 'PAID' ? accountCode(account) : 'ACCOUNTS_RECEIVABLE';
            await postJournal(tx, { firmId, userId: user.userId, movementId: movement.id, type: 'SALE', date: movementDate, originalAmount: netLine, currency, rate, baseAmount: netLine.mul(rate), description: `Ombor sotuvi ${documentNumber}`, sourceAccountId: account?.id, debitAccount: debit || 'ACCOUNTS_RECEIVABLE', creditAccount: 'SALES_REVENUE', cogs });
          } else if (type === 'SUPPLIER_RETURN') {
            const debit = paymentStatus === 'CREDIT' ? 'ACCOUNTS_PAYABLE' : 'SUPPLIER_RECEIVABLE';
            await postJournal(tx, { firmId, userId: user.userId, movementId: movement.id, type: 'ADJUSTMENT', date: movementDate, originalAmount: cogs, currency: 'UZS', rate: decimal(1), baseAmount: cogs, description: `Yetkazib beruvchiga qaytarish ${documentNumber}`, debitAccount: debit, creditAccount: 'INVENTORY' });
          } else if (type !== 'TRANSFER') {
            const debitAccount = type === 'INTERNAL_USE' ? text(req.body?.expenseAccountCode) || 'INTERNAL_USE_EXPENSE' : type === 'INVENTORY_SHORTAGE' ? 'INVENTORY_SHORTAGE_EXPENSE' : 'INVENTORY_WRITE_OFF_EXPENSE';
            await postJournal(tx, { firmId, userId: user.userId, movementId: movement.id, type: 'ADJUSTMENT', date: movementDate, originalAmount: cogs, currency: 'UZS', rate: decimal(1), baseAmount: cogs, description: `Ombor chiqimi ${documentNumber}`, debitAccount, creditAccount: 'INVENTORY' });
          }
          if (type === 'TRANSFER' && destination) {
            const targetBatch = await tx.inventoryBatch.upsert({ where: { warehouseId_productId_batchNumber: { warehouseId: destination.id, productId, batchNumber: batch.batchNumber } }, create: { firmId, warehouseId: destination.id, productId, batchNumber: batch.batchNumber, manufactureDate: batch.manufactureDate, expiryDate: batch.expiryDate, receivedQuantity: take, unitCost: batch.unitCost, currency: batch.currency, exchangeRateSnapshot: batch.exchangeRateSnapshot, supplierId: batch.supplierId, sourceDocumentId: document.id }, update: { receivedQuantity: { increment: take } } });
            await tx.inventoryMovement.create({ data: { firmId, warehouseId: destination.id, destinationWarehouseId: warehouseId, productId, batchId: targetBatch.id, documentId: document.id, documentLineId: line.id, movementType: 'TRANSFER_IN', quantity: take, unitCostSnapshot: averageCost, totalCostSnapshot: cogs, currency: 'UZS', exchangeRateSnapshot: decimal(1), sourceType: 'INVENTORY_DOCUMENT', sourceReferenceId: document.id, documentNumber, movementDate, createdByUserId: user.userId, approvedByUserId: user.userId } });
          }
          gross = gross.add(lineTotal); discountTotal = discountTotal.add(allocatedDiscount); net = net.add(type === 'SALE' ? netLine : cogs);
          remaining = remaining.sub(take);
        }
        if (type === 'SALE' && !decimal(totals.cogs).eq(quantity.mul(averageCost))) throw new Error('Tannarx hisobida nomuvofiqlik');
      }
      const updated = await tx.inventoryDocument.update({ where: { id: document.id }, data: { grossAmount: gross, discountAmount: discountTotal, netAmount: net } });
      await tx.auditLog.create({ data: { actorUserId: user.userId, actorRole: normalizeRole(user.role), action: type === 'SALE' ? 'INVENTORY_SOLD' : INCOMING_TYPES.has(type) ? 'INVENTORY_RECEIVED' : type === 'TRANSFER' ? 'INVENTORY_TRANSFERRED' : type === 'WRITE_OFF' ? 'INVENTORY_WRITTEN_OFF' : 'INVENTORY_ISSUED', entityType: 'inventory_document', entityId: document.id, entityLabel: documentNumber, summary: `${type} ombor hujjati qo‘llandi`, after: updated as unknown as Prisma.InputJsonValue, metadata: { actorFirmId: firmId, warehouseId, destinationWarehouseId, amount: net.toString(), currency } } });
      return tx.inventoryDocument.findUnique({ where: { id: document.id }, include: { lines: { include: { product: true, batch: true } }, movements: { include: { transaction: { include: { journalEntry: true, ledgerEntries: true } } } } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(409).json({ error: error?.code === 'P2002' ? 'Hujjat raqami takrorlangan' : error?.message || 'Ombor operatsiyasi saqlanmadi' });
  }
}

export async function listInventoryDocuments(req: Request, res: Response) {
  const firmId = await resolveFirm(req);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  const type = text(req.query.type).toUpperCase();
  return res.json(await prisma.inventoryDocument.findMany({ where: { firmId, deletedAt: null, ...(type ? { type: type as InventoryDocumentType } : {}) }, include: { warehouse: true, destinationWarehouse: true, supplier: true, customer: true, lines: { include: { product: true, batch: true } } }, orderBy: { documentDate: 'desc' }, take: 200 }));
}

export async function cancelInventoryDocument(req: Request, res: Response) {
  const user = auth(req);
  if (!canManage(user)) return res.status(403).json({ error: 'Ombor hujjatini bekor qilish uchun ruxsat yo‘q' });
  const firmId = await resolveFirm(req, true);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  const documentId = text(req.params.id);
  const reason = text(req.body?.reason);
  if (!reason) return res.status(400).json({ error: 'Bekor qilish sababi majburiy' });

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "InventoryDocument" WHERE id = ${documentId} AND "firmId" = ${firmId} FOR UPDATE`;
      const current = await tx.inventoryDocument.findFirst({
        where: { id: documentId, firmId, deletedAt: null },
        include: {
          lines: true,
          movements: {
            where: { deletedAt: null },
            include: { transaction: { include: { ledgerEntries: true, journalEntry: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!current) throw new Error('Ombor hujjati topilmadi');
      if (!hasFirmPermission(user, inventoryPermissionFor(current.type, 'cancel'))) throw new Error('Bu turdagi ombor hujjatini bekor qilish uchun ruxsat yo‘q');
      if (current.status !== 'APPLIED') throw new Error('Faqat qo‘llangan ombor hujjati bekor qilinadi');
      if (current.reversedDocumentId || current.movements.some((movement) => movement.status === 'REVERSED' || movement.reversedMovementId)) throw new Error('Ombor hujjati allaqachon bekor qilingan');
      if (!current.movements.length) throw new Error('Bekor qilinadigan ombor harakati topilmadi');

      const reversedDocument = await tx.inventoryDocument.create({ data: {
        firmId,
        type: reversalInventoryDocumentType(current.type),
        status: 'APPLIED',
        documentNumber: `REV-${current.documentNumber}-${Date.now()}`,
        documentDate: new Date(),
        warehouseId: current.warehouseId,
        destinationWarehouseId: current.destinationWarehouseId,
        supplierId: current.supplierId,
        customerId: current.customerId,
        paymentStatus: current.paymentStatus,
        paymentSourceAccountId: current.paymentSourceAccountId,
        currency: current.currency,
        exchangeRateSnapshot: current.exchangeRateSnapshot,
        grossAmount: current.grossAmount,
        discountAmount: current.discountAmount,
        netAmount: current.netAmount,
        vatAmount: current.vatAmount,
        contractNumber: current.contractNumber,
        invoiceNumber: current.invoiceNumber,
        flightId: current.flightId,
        tourPackageId: current.tourPackageId,
        costCenterId: current.costCenterId,
        employeeId: current.employeeId,
        notes: `Bekor qilindi: ${reason}`,
        createdByUserId: user.userId,
        approvedByUserId: user.userId,
        appliedAt: new Date(),
        reversedDocumentId: current.id,
      } });

      const reversedMovementIds: string[] = [];
      for (const movement of current.movements) {
        if (!movement.batchId) throw new Error('Partiyasiz ombor harakatini avtomatik bekor qilib bo‘lmaydi');
        await tx.$queryRaw`SELECT id FROM "InventoryBatch" WHERE id = ${movement.batchId} FOR UPDATE`;
        const batch = await tx.inventoryBatch.findFirst({ where: { id: movement.batchId, firmId } });
        if (!batch) throw new Error('Partiya topilmadi');

        if (isIncomingMovement(movement.movementType)) {
          const newReceived = batch.receivedQuantity.sub(movement.quantity);
          if (newReceived.lt(0) || newReceived.lt(batch.issuedQuantity.add(batch.reservedQuantity))) {
            throw new Error('Bu kirimdan mahsulot sotilgan yoki rezerv qilingan. Avval tegishli chiqim/rezervni bekor qiling yoki tuzatish hujjati kiriting');
          }
          await tx.inventoryBatch.update({ where: { id: batch.id }, data: { receivedQuantity: { decrement: movement.quantity } } });
        } else {
          if (batch.issuedQuantity.lt(movement.quantity)) throw new Error('Chiqim bekor qilinsa qoldiq manfiy bo‘ladi');
          await tx.inventoryBatch.update({ where: { id: batch.id }, data: { issuedQuantity: { decrement: movement.quantity } } });
        }

        const line = await tx.inventoryDocumentLine.create({ data: {
          documentId: reversedDocument.id,
          productId: movement.productId,
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          manufactureDate: batch.manufactureDate,
          expiryDate: batch.expiryDate,
          quantity: movement.quantity,
          unitPrice: movement.unitCostSnapshot,
          unitCostSnapshot: movement.unitCostSnapshot,
          lineTotal: movement.totalCostSnapshot,
          baseLineTotal: movement.totalCostSnapshot,
          discountAmount: decimal(0),
        } });
        const reversedMovement = await tx.inventoryMovement.create({ data: {
          firmId,
          warehouseId: movement.warehouseId,
          destinationWarehouseId: movement.destinationWarehouseId,
          productId: movement.productId,
          batchId: batch.id,
          documentId: reversedDocument.id,
          documentLineId: line.id,
          movementType: reverseInventoryMovementType(movement.movementType),
          quantity: movement.quantity,
          unitCostSnapshot: movement.unitCostSnapshot,
          totalCostSnapshot: movement.totalCostSnapshot,
          currency: movement.currency,
          exchangeRateSnapshot: movement.exchangeRateSnapshot,
          sourceType: 'INVENTORY_REVERSAL',
          sourceReferenceId: current.id,
          documentNumber: reversedDocument.documentNumber,
          movementDate: new Date(),
          status: 'APPLIED',
          createdByUserId: user.userId,
          approvedByUserId: user.userId,
          reversedMovementId: movement.id,
        } });
        if (movement.transaction) await reverseInventoryTransaction(tx, { transaction: movement.transaction, movementId: reversedMovement.id, user, reason, date: new Date() });
        await tx.inventoryMovement.update({ where: { id: movement.id }, data: { status: 'REVERSED', reversedMovementId: reversedMovement.id } });
        reversedMovementIds.push(reversedMovement.id);
      }

      const cancelled = await tx.inventoryDocument.update({ where: { id: current.id }, data: { status: 'CANCELLED', reversedDocumentId: reversedDocument.id, notes: current.notes ? `${current.notes}\nBekor qilish sababi: ${reason}` : `Bekor qilish sababi: ${reason}` } });
      await tx.auditLog.create({ data: { actorUserId: user.userId, actorRole: normalizeRole(user.role), action: 'INVENTORY_DOCUMENT_CANCELLED', entityType: 'inventory_document', entityId: current.id, entityLabel: current.documentNumber, summary: `${current.documentNumber} ombor hujjati bekor qilindi: ${reason}`, before: current as unknown as Prisma.InputJsonValue, after: cancelled as unknown as Prisma.InputJsonValue, metadata: { actorFirmId: firmId, reversalDocumentId: reversedDocument.id, reversedMovementIds, reason } } });
      return tx.inventoryDocument.findUnique({ where: { id: current.id }, include: { warehouse: true, destinationWarehouse: true, supplier: true, customer: true, lines: { include: { product: true, batch: true } }, movements: { include: { transaction: { include: { journalEntry: true, ledgerEntries: true } } } } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(409).json({ error: error?.message || 'Ombor hujjati bekor qilinmadi' });
  }
}

export async function getInventoryStock(req: Request, res: Response) {
  const firmId = await resolveFirm(req);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  const warehouseId = text(req.query.warehouseId);
  const [products, batches] = await Promise.all([
    prisma.product.findMany({ where: { firmId, deletedAt: null }, include: { category: true, unit: true }, orderBy: { name: 'asc' } }),
    prisma.inventoryBatch.findMany({ where: { firmId, ...(warehouseId ? { warehouseId } : {}) }, include: { warehouse: true } }),
  ]);
  const rows = products.map((product) => {
    const own = batches.filter((batch) => batch.productId === product.id);
    const physical = own.reduce((sum, batch) => sum.add(batch.receivedQuantity.sub(batch.issuedQuantity)), decimal(0));
    const reserved = own.reduce((sum, batch) => sum.add(batch.reservedQuantity), decimal(0));
    const value = own.reduce((sum, batch) => sum.add(batch.receivedQuantity.sub(batch.issuedQuantity).mul(batch.unitCost)), decimal(0));
    const averageUnitCost = physical.gt(0) ? value.div(physical) : decimal(0);
    const nearestExpiry = own.filter((batch) => batch.receivedQuantity.gt(batch.issuedQuantity) && batch.expiryDate).sort((a, b) => a.expiryDate!.getTime() - b.expiryDate!.getTime())[0]?.expiryDate || null;
    return { product, physicalStock: physical, reservedQuantity: reserved, availableStock: physical.sub(reserved), averageUnitCost, inventoryValue: value, minimumStock: product.minimumStock, status: physical.lte(0) ? 'TUGAGAN' : physical.lte(product.minimumStock) ? 'KAM_QOLGAN' : 'YETARLI', nearestExpiry };
  });
  return res.json(rows);
}

export async function getInventoryDashboard(req: Request, res: Response) {
  const firmId = await resolveFirm(req);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const expiringSoonDate = new Date(Date.now() + 30 * 86_400_000);
  const [productRows, batches, documents, ledger, movements] = await Promise.all([
    prisma.product.findMany({ where: { firmId, status: 'ACTIVE', deletedAt: null }, include: { category: true, unit: true }, orderBy: { name: 'asc' } }),
    prisma.inventoryBatch.findMany({ where: { firmId }, include: { warehouse: true } }),
    prisma.inventoryDocument.findMany({ where: { firmId, status: 'APPLIED', deletedAt: null, documentDate: { gte: monthStart } }, select: { type: true, netAmount: true, exchangeRateSnapshot: true } }),
    prisma.ledgerEntry.findMany({ where: { transaction: { firmId, sourceMode: 'INVENTORY', status: 'APPLIED', deletedAt: null, postingDate: { gte: monthStart } } }, select: { debitAccount: true, creditAccount: true, amount: true } }),
    prisma.inventoryMovement.findMany({ where: { firmId, status: 'APPLIED', deletedAt: null }, select: { productId: true, movementType: true, quantity: true, totalCostSnapshot: true, movementDate: true } }),
  ]);
  const outgoingTypes = new Set(['SALE_OUT', 'INTERNAL_USE_OUT', 'TRANSFER_OUT', 'WRITE_OFF_OUT', 'SUPPLIER_RETURN_OUT', 'EMPLOYEE_ISSUE_OUT', 'FREE_ISSUE_OUT', 'INVENTORY_SHORTAGE_OUT', 'OTHER_OUT']);
  const salesMovements = movements.filter((row) => row.movementType === 'SALE_OUT');
  const outgoingMovements = movements.filter((row) => outgoingTypes.has(row.movementType));
  const productStatuses = productRows.map((product) => {
    const own = batches.filter((batch) => batch.productId === product.id);
    const productOutgoing = outgoingMovements.filter((row) => row.productId === product.id);
    const physical = own.reduce((sum, batch) => sum.add(batch.receivedQuantity.sub(batch.issuedQuantity)), decimal(0));
    const reserved = own.reduce((sum, batch) => sum.add(batch.reservedQuantity), decimal(0));
    const value = own.reduce((sum, batch) => sum.add(batch.receivedQuantity.sub(batch.issuedQuantity).mul(batch.unitCost)), decimal(0));
    const averageUnitCost = physical.gt(0) ? value.div(physical).toDecimalPlaces(4) : decimal(0);
    const activeBatches = own.filter((batch) => batch.receivedQuantity.gt(batch.issuedQuantity));
    const nearestExpiry = activeBatches.filter((batch) => batch.expiryDate).sort((a, b) => a.expiryDate!.getTime() - b.expiryDate!.getTime())[0]?.expiryDate || null;
    const lastReceipt = [...own].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt || null;
    const lastIssue = [...productOutgoing].sort((a, b) => b.movementDate.getTime() - a.movementDate.getTime())[0]?.movementDate || null;
    const status = physical.lte(0) ? 'TUGAGAN' : physical.lte(product.minimumStock) ? 'KAM_QOLGAN' : 'YETARLI';
    return {
      product,
      warehouse: activeBatches[0]?.warehouse || null,
      physicalStock: physical,
      reservedQuantity: reserved,
      availableStock: physical.sub(reserved),
      averageUnitCost,
      inventoryValue: value,
      lastPurchasePrice: own.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.unitCost || decimal(0),
      salePrice: product.defaultSalePrice || decimal(0),
      minimumStock: product.minimumStock,
      status,
      nearestExpiry,
      lastReceipt,
      lastIssue,
    };
  });
  const physicalStock = batches.reduce((sum, batch) => sum.add(batch.receivedQuantity.sub(batch.issuedQuantity)), decimal(0));
  const reservedStock = batches.reduce((sum, batch) => sum.add(batch.reservedQuantity), decimal(0));
  const inventoryValue = batches.reduce((sum, batch) => sum.add(batch.receivedQuantity.sub(batch.issuedQuantity).mul(batch.unitCost)), decimal(0));
  const ledgerTotal = (account: string, side: 'debitAccount' | 'creditAccount') => ledger.filter((entry) => entry[side] === account).reduce((sum, entry) => sum.add(entry.amount), decimal(0));
  const revenue = ledgerTotal('SALES_REVENUE', 'creditAccount'), cogs = ledgerTotal('COST_OF_GOODS_SOLD', 'debitAccount');
  const salesByProduct = new Map<string, Prisma.Decimal>();
  for (const row of salesMovements) salesByProduct.set(row.productId, (salesByProduct.get(row.productId) || decimal(0)).add(row.quantity));
  const topSoldProduct = [...productStatuses].sort((a, b) => Number(salesByProduct.get(b.product.id) || 0) - Number(salesByProduct.get(a.product.id) || 0))[0] || null;
  const slowMovingProduct = [...productStatuses].filter((row) => row.physicalStock.gt(0)).sort((a, b) => Number(salesByProduct.get(a.product.id) || 0) - Number(salesByProduct.get(b.product.id) || 0))[0] || null;
  const deadStockCutoff = new Date(Date.now() - 90 * 86_400_000);
  const deadStockValue = productStatuses
    .filter((row) => row.physicalStock.gt(0) && (!row.lastIssue || row.lastIssue < deadStockCutoff))
    .reduce((sum, row) => sum.add(row.inventoryValue), decimal(0));
  const inventoryTurnover = inventoryValue.gt(0) ? cogs.div(inventoryValue).toDecimalPlaces(4) : decimal(0);
  return res.json({
    products: productRows.length,
    physicalStock,
    availableStock: physicalStock.sub(reservedStock),
    inventoryValue,
    monthPurchases: documents.filter((row) => row.type === 'PURCHASE').reduce((sum, row) => sum.add(row.netAmount.mul(row.exchangeRateSnapshot)), decimal(0)),
    monthSales: documents.filter((row) => row.type === 'SALE').reduce((sum, row) => sum.add(row.netAmount.mul(row.exchangeRateSnapshot)), decimal(0)),
    revenue,
    cogs,
    grossProfit: revenue.sub(cogs),
    expiredBatches: batches.filter((batch) => batch.expiryDate && batch.expiryDate < new Date() && batch.receivedQuantity.gt(batch.issuedQuantity)).length,
    kpis: {
      totalSku: productRows.length,
      inStockSku: productStatuses.filter((row) => row.physicalStock.gt(0)).length,
      zeroStockSku: productStatuses.filter((row) => row.physicalStock.lte(0)).length,
      lowStockSku: productStatuses.filter((row) => row.status === 'KAM_QOLGAN').length,
      reservedStock,
      expiringSoonBatches: batches.filter((batch) => batch.expiryDate && batch.expiryDate >= new Date() && batch.expiryDate <= expiringSoonDate && batch.receivedQuantity.gt(batch.issuedQuantity)).length,
      expiredBatches: batches.filter((batch) => batch.expiryDate && batch.expiryDate < new Date() && batch.receivedQuantity.gt(batch.issuedQuantity)).length,
      topInventoryProduct: [...productStatuses].sort((a, b) => Number(b.inventoryValue) - Number(a.inventoryValue))[0] || null,
      topSoldProduct,
      slowMovingProduct,
      inventoryTurnover,
      deadStockValue,
    },
    productStatuses,
  });
}

export async function getInventoryReport(req: Request, res: Response) {
  const firmId = await resolveFirm(req);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  let from: Date | undefined, to: Date | undefined;
  try {
    from = req.query.from ? date(req.query.from) : undefined;
    to = req.query.to ? date(req.query.to) : undefined;
    if (to) to = new Date(to.getTime() + 86_400_000 - 1);
  } catch (error: any) { return res.status(400).json({ error: error.message }); }
  const movementDate = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
  const movements = await prisma.inventoryMovement.findMany({
    where: { firmId, status: 'APPLIED', deletedAt: null, ...(movementDate ? { movementDate } : {}) },
    include: { product: { include: { unit: true, category: true } }, warehouse: true, document: { include: { supplier: true, customer: true } }, transaction: { include: { ledgerEntries: true } } },
    orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }], take: 500,
  });
  const userIds = [...new Set(movements.map((row) => row.createdByUserId).filter(Boolean))] as string[];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } }) : [];
  const userNames = new Map(users.map((row) => [row.id, row.fullName || row.email]));
  const rows = movements.map((row) => ({
    id: row.id, movementDate: row.movementDate, documentNumber: row.documentNumber, movementType: row.movementType,
    product: row.product, warehouse: row.warehouse, quantity: row.quantity, unitCost: row.unitCostSnapshot,
    totalCost: row.totalCostSnapshot, counterparty: row.document?.supplier?.name || row.document?.customer?.name || null,
    enteredBy: row.createdByUserId ? userNames.get(row.createdByUserId) || '—' : '—',
    financialEntries: row.transaction?.ledgerEntries.map((entry) => ({ debitAccount: entry.debitAccount, creditAccount: entry.creditAccount, amount: entry.amount })) || [],
  }));
  const incomingTypes = new Set(['PURCHASE_IN', 'CUSTOMER_RETURN_IN', 'INVENTORY_SURPLUS_IN', 'PRODUCTION_IN', 'FREE_RECEIPT_IN', 'OTHER_IN', 'TRANSFER_IN']);
  const outgoingTypes = new Set(['SALE_OUT', 'INTERNAL_USE_OUT', 'TRANSFER_OUT', 'WRITE_OFF_OUT', 'SUPPLIER_RETURN_OUT', 'EMPLOYEE_ISSUE_OUT', 'FREE_ISSUE_OUT', 'INVENTORY_SHORTAGE_OUT', 'OTHER_OUT']);
  const sum = (values: Prisma.Decimal[]) => values.reduce((total, value) => total.add(value), decimal(0));
  const ledger = movements.flatMap((row) => row.transaction?.ledgerEntries || []);
  const ledgerTotal = (account: string, side: 'debitAccount' | 'creditAccount') => sum(ledger.filter((entry) => entry[side] === account).map((entry) => entry.amount));
  return res.json({
    rows,
    summary: {
      incomingQuantity: sum(movements.filter((row) => incomingTypes.has(row.movementType)).map((row) => row.quantity)),
      outgoingQuantity: sum(movements.filter((row) => outgoingTypes.has(row.movementType)).map((row) => row.quantity)),
      inventoryIncrease: ledgerTotal('INVENTORY', 'debitAccount'), inventoryDecrease: ledgerTotal('INVENTORY', 'creditAccount'),
      revenue: ledgerTotal('SALES_REVENUE', 'creditAccount'), cogs: ledgerTotal('COST_OF_GOODS_SOLD', 'debitAccount'),
      grossProfit: ledgerTotal('SALES_REVENUE', 'creditAccount').sub(ledgerTotal('COST_OF_GOODS_SOLD', 'debitAccount')),
    },
  });
}

export async function listInventoryReservations(req: Request, res: Response) {
  const firmId = await resolveFirm(req);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  return res.json(await prisma.inventoryReservation.findMany({
    where: { firmId }, include: { product: true, warehouse: true, batch: true }, orderBy: { createdAt: 'desc' }, take: 200,
  }));
}

export async function createInventoryReservation(req: Request, res: Response) {
  const user = auth(req);
  if (!canManage(user)) return res.status(403).json({ error: 'Rezerv yaratish uchun ruxsat yo‘q' });
  const firmId = await resolveFirm(req, true);
  if (!firmId) return res.status(403).json({ error: 'Forbidden' });
  const warehouseId = text(req.body?.warehouseId), productId = text(req.body?.productId);
  const sourceType = text(req.body?.sourceType).toUpperCase(), sourceReferenceId = text(req.body?.sourceReferenceId);
  if (!warehouseId || !productId || !sourceType || !sourceReferenceId || req.body?.quantity == null) return res.status(400).json({ error: 'Ombor, mahsulot, miqdor va rezerv manbasi majburiy' });
  let requested: Prisma.Decimal;
  try {
    requested = decimal(positiveNumber(req.body.quantity, 'Miqdor'));
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Miqdor noto‘g‘ri' });
  }
  try {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} AND "firmId" = ${firmId} FOR UPDATE`;
      const product = await tx.product.findFirst({ where: { id: productId, firmId, status: 'ACTIVE', deletedAt: null } });
      const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, firmId, status: 'ACTIVE', deletedAt: null } });
      if (!product || !warehouse) throw new Error('Mahsulot yoki ombor boshqa firma doirasida');
      const batches = await tx.inventoryBatch.findMany({ where: { firmId, warehouseId, productId, status: 'ACTIVE', ...(req.body?.batchId ? { id: text(req.body.batchId) } : {}) }, orderBy: { createdAt: 'asc' } });
      const candidates = batches.filter((batch) => !batch.expiryDate || batch.expiryDate >= new Date()).sort((a, b) => (a.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER));
      const available = candidates.reduce((sum, batch) => sum.add(batch.receivedQuantity.sub(batch.issuedQuantity).sub(batch.reservedQuantity)), decimal(0));
      if (available.lt(requested)) throw new Error(`Erkin qoldiq yetarli emas (${available})`);
      let remaining = requested;
      const created = [];
      for (const batch of candidates) {
        if (remaining.lte(0)) break;
        const free = batch.receivedQuantity.sub(batch.issuedQuantity).sub(batch.reservedQuantity);
        if (free.lte(0)) continue;
        const quantity = Prisma.Decimal.min(free, remaining);
        await tx.inventoryBatch.update({ where: { id: batch.id }, data: { reservedQuantity: { increment: quantity } } });
        created.push(await tx.inventoryReservation.create({ data: { firmId, warehouseId, productId, batchId: batch.id, sourceType, sourceReferenceId, quantity, expiresAt: req.body?.expiresAt ? date(req.body.expiresAt) : null, createdByUserId: user.userId } }));
        remaining = remaining.sub(quantity);
      }
      await tx.auditLog.create({ data: { actorUserId: user.userId, actorRole: normalizeRole(user.role), action: 'INVENTORY_RESERVED', entityType: 'inventory_reservation', entityId: created[0]?.id, summary: `${product.name}: ${requested} rezerv qilindi`, metadata: { actorFirmId: firmId, warehouseId, productId, sourceType, sourceReferenceId, quantity: requested.toString(), reservationIds: created.map((row) => row.id) } } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return res.status(201).json(rows);
  } catch (error: any) { return res.status(409).json({ error: error?.message || 'Rezerv yaratilmadi' }); }
}

export async function releaseInventoryReservation(req: Request, res: Response) {
  const user = auth(req);
  if (!canManage(user)) return res.status(403).json({ error: 'Rezervni bo‘shatish uchun ruxsat yo‘q' });
  const reason = text(req.body?.reason);
  if (!reason) return res.status(400).json({ error: 'Bo‘shatish sababi majburiy' });
  const current = await prisma.inventoryReservation.findUnique({ where: { id: text(req.params.id) } });
  if (!current || !(await canAccessFirm(user, current.firmId))) return res.status(403).json({ error: 'Forbidden' });
  try {
    const released = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "InventoryReservation" WHERE id = ${current.id} FOR UPDATE`;
      const locked = await tx.inventoryReservation.findUnique({ where: { id: current.id } });
      if (!locked || !['RESERVED', 'PARTIALLY_CONSUMED'].includes(locked.status)) throw new Error('Rezerv allaqachon yopilgan');
      const remaining = locked.quantity.sub(locked.consumedQuantity);
      if (locked.batchId && remaining.gt(0)) await tx.inventoryBatch.update({ where: { id: locked.batchId }, data: { reservedQuantity: { decrement: remaining } } });
      const row = await tx.inventoryReservation.update({ where: { id: locked.id }, data: { status: 'RELEASED', releasedByUserId: user.userId, releaseReason: reason } });
      await tx.auditLog.create({ data: { actorUserId: user.userId, actorRole: normalizeRole(user.role), action: 'INVENTORY_RESERVATION_RELEASED', entityType: 'inventory_reservation', entityId: row.id, summary: `Rezerv bo‘shatildi: ${reason}`, metadata: { actorFirmId: row.firmId, warehouseId: row.warehouseId, productId: row.productId, batchId: row.batchId, quantity: remaining.toString(), reason } } });
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return res.json(released);
  } catch (error: any) { return res.status(409).json({ error: error?.message || 'Rezerv bo‘shatilmadi' }); }
}
