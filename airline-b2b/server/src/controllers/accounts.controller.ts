import { FinancialAccountType, Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { prisma } from '../db';
import { canAccessFirm, getAccessibleFirmIds, normalizeRole } from '../utils/access';
import { writeAuditLog } from '../utils/audit';
import { ensureFinancialAccount } from '../utils/financial-accounts';
import { visibleTransactionWhere } from '../utils/transaction-visibility';

const auth = (req: Request) => ((req as any).user || {}) as { userId?: string; role?: string; firmRole?: string; firmId?: string };

export function calculateAccountBalance(account: { id: string; currency: string; openingBalance: unknown; kassaDeskId?: string | null; paymentCardId?: string | null }, transactions: Array<{ sourceAccountId: string | null; destinationAccountId: string | null; originalAmount: unknown; destinationAmount?: unknown; currency: string; destinationCurrency?: string | null; kassaDeskId?: string | null; paymentCardId?: string | null; type?: string; direction?: string | null }>) {
  let balance = Number(account.openingBalance);
  for (const tx of transactions) {
    if (tx.destinationAccountId === account.id && (tx.destinationCurrency || tx.currency) === account.currency) balance += Number(tx.destinationAmount ?? tx.originalAmount);
    if (tx.sourceAccountId === account.id && tx.currency === account.currency) balance -= Number(tx.originalAmount);
    if (tx.currency !== account.currency) continue;
    if (!tx.sourceAccountId && !tx.destinationAccountId && ((account.kassaDeskId && tx.kassaDeskId === account.kassaDeskId) || (account.paymentCardId && tx.paymentCardId === account.paymentCardId))) {
      if (tx.direction === 'KASSA_OUT') balance -= Number(tx.originalAmount);
      else if (tx.direction === 'KASSA_IN' || tx.type === 'PAYMENT' || tx.type === 'SALE') balance += Number(tx.originalAmount);
    }
  }
  return balance;
}

export async function listAccounts(req: Request, res: Response) {
  const user = auth(req);
  const firmIds = await getAccessibleFirmIds(user);
  const requestedFirmId = String(req.query.firmId || '').trim();
  if (requestedFirmId && !(await canAccessFirm(user, requestedFirmId))) return res.status(403).json({ error: 'Forbidden' });
  const scopedFirmIds = requestedFirmId ? [requestedFirmId] : firmIds;
  if (scopedFirmIds?.length) {
    const [desks, cards] = await Promise.all([
      prisma.kassaDesk.findMany({ where: { firmId: { in: scopedFirmIds }, status: 'ACTIVE', deletedAt: null }, select: { id: true, firmId: true } }),
      prisma.paymentCard.findMany({ where: { firmId: { in: scopedFirmIds }, status: 'ACTIVE', deletedAt: null }, select: { id: true, firmId: true, currency: true } }),
    ]);
    await Promise.all([
      ...desks.flatMap((desk) => ['UZS', 'USD'].map((currency) => ensureFinancialAccount({ firmId: desk.firmId, currency, type: FinancialAccountType.CASH, kassaDeskId: desk.id, createdByUserId: user.userId }))),
      ...cards.filter((card): card is typeof card & { firmId: string } => Boolean(card.firmId)).map((card) => ensureFinancialAccount({ firmId: card.firmId, currency: card.currency, type: FinancialAccountType.CARD, paymentCardId: card.id, createdByUserId: user.userId })),
    ]);
  }
  const accounts = await prisma.financialAccount.findMany({
    where: { status: 'ACTIVE', deletedAt: null, ...(requestedFirmId ? { firmId: requestedFirmId } : firmIds ? { firmId: { in: firmIds } } : {}) },
    include: { firm: { select: { id: true, name: true } } }, orderBy: [{ firmId: 'asc' }, { type: 'asc' }, { name: 'asc' }],
  });
  const ids = accounts.map((account) => account.id);
  const transactions = ids.length ? await prisma.transaction.findMany({
    where: visibleTransactionWhere({ OR: [{ sourceAccountId: { in: ids } }, { destinationAccountId: { in: ids } }] }),
    select: { sourceAccountId: true, destinationAccountId: true, originalAmount: true, destinationAmount: true, currency: true, destinationCurrency: true, kassaDeskId: true, paymentCardId: true, type: true, direction: true },
  }) : [];
  return res.json(accounts.map((account) => ({ ...account, openingBalance: String(account.openingBalance), balance: calculateAccountBalance(account, transactions) })));
}

export async function createAccount(req: Request, res: Response) {
  const user = auth(req);
  const role = normalizeRole(user.role);
  const firmId = role === 'FIRM' ? String(user.firmId || '') : String(req.body?.firmId || '');
  if (!firmId || !(await canAccessFirm(user, firmId))) return res.status(403).json({ error: 'Forbidden' });
  if (role === 'FIRM' && String(user.firmRole || '').toUpperCase() !== 'FIRM_ADMIN') return res.status(403).json({ error: 'Only firm admin can create accounts' });
  const name = String(req.body?.name || '').trim();
  const currency = String(req.body?.currency || 'UZS').toUpperCase();
  const type = String(req.body?.type || 'BANK').toUpperCase() as FinancialAccountType;
  const openingBalance = new Prisma.Decimal(String(req.body?.openingBalance || '0'));
  if (!name || !['USD', 'UZS'].includes(currency) || !Object.values(FinancialAccountType).includes(type) || !openingBalance.isFinite()) return res.status(400).json({ error: 'Valid name, type, USD/UZS currency and balance are required' });
  const digits = String(req.body?.accountNumber || req.body?.accountNumberMasked || '').replace(/\D/g, '');
  const accountNumberMasked = digits ? `•••• ${digits.slice(-4).padStart(4, '•')}` : null;
  const isPrimary = req.body?.isPrimary === true;
  const created = await prisma.$transaction(async (tx) => {
    if (isPrimary) await tx.financialAccount.updateMany({ where: { firmId, currency, type, deletedAt: null }, data: { isPrimary: false } });
    return tx.financialAccount.create({ data: { firmId, name, currency, type, openingBalance, createdByUserId: user.userId, bankName: String(req.body?.bankName || '').trim() || null, accountNumberMasked, bankCode: String(req.body?.bankCode || '').trim() || null, swiftCode: String(req.body?.swiftCode || '').trim() || null, isPrimary }, include: { firm: { select: { id: true, name: true } } } });
  });
  await writeAuditLog(req, { action: 'CREATE', entityType: 'financialAccount', entityId: created.id, entityLabel: created.name, summary: `Created financial account ${created.name}`, after: created });
  return res.status(201).json(created);
}

export async function updateAccount(req: Request, res: Response) {
  const user = auth(req);
  const account = await prisma.financialAccount.findFirst({ where: { id: String(req.params.id), deletedAt: null } });
  if (!account || !(await canAccessFirm(user, account.firmId))) return res.status(403).json({ error: 'Forbidden' });
  if (normalizeRole(user.role) === 'FIRM' && String(user.firmRole || '').toUpperCase() !== 'FIRM_ADMIN') return res.status(403).json({ error: 'Only firm admin can update accounts' });
  const digits = String(req.body?.accountNumber || '').replace(/\D/g, '');
  const isPrimary = req.body?.isPrimary ?? account.isPrimary;
  const updated = await prisma.$transaction(async (tx) => {
    if (isPrimary) await tx.financialAccount.updateMany({ where: { firmId: account.firmId, currency: account.currency, type: account.type, id: { not: account.id }, deletedAt: null }, data: { isPrimary: false } });
    return tx.financialAccount.update({ where: { id: account.id }, data: {
      name: req.body?.name == null ? account.name : String(req.body.name).trim(),
      bankName: req.body?.bankName == null ? account.bankName : String(req.body.bankName).trim() || null,
      accountNumberMasked: digits ? `•••• ${digits.slice(-4).padStart(4, '•')}` : account.accountNumberMasked,
      bankCode: req.body?.bankCode == null ? account.bankCode : String(req.body.bankCode).trim() || null,
      swiftCode: req.body?.swiftCode == null ? account.swiftCode : String(req.body.swiftCode).trim() || null,
      status: req.body?.status == null ? account.status : String(req.body.status).toUpperCase(),
      isPrimary,
    } });
  });
  await writeAuditLog(req, { action: 'UPDATE', entityType: 'financialAccount', entityId: account.id, entityLabel: updated.name, summary: `Updated financial account ${updated.name}`, before: account, after: updated });
  return res.json(updated);
}

export async function deleteAccount(req: Request, res: Response) {
  const user = auth(req);
  const account = await prisma.financialAccount.findFirst({ where: { id: String(req.params.id), deletedAt: null } });
  if (!account || !(await canAccessFirm(user, account.firmId))) return res.status(403).json({ error: 'Forbidden' });
  if (normalizeRole(user.role) === 'FIRM' && String(user.firmRole || '').toUpperCase() !== 'FIRM_ADMIN') return res.status(403).json({ error: 'Only firm admin can deactivate accounts' });
  const updated = await prisma.financialAccount.update({ where: { id: account.id }, data: { status: 'INACTIVE', deletedAt: new Date(), isPrimary: false } });
  await writeAuditLog(req, { action: 'DELETE', entityType: 'financialAccount', entityId: account.id, entityLabel: account.name, summary: `Deactivated financial account ${account.name}`, before: account, after: updated });
  return res.json({ ok: true });
}
