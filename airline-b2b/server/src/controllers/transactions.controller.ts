import { Request, Response } from 'express';
import { prisma } from '../db';
import { FinancialAccountType, Prisma } from '@prisma/client';
import { canAccessFirm, getAccessibleFirmIds } from '../utils/access';
import { assertKassaOpenForDate, findKassaForDate, getTransactionBusinessDateKey, parseBusinessDate } from '../utils/kassa';
import { writeAuditLog } from '../utils/audit';
import { requireCorrectionReason } from '../domains/transactions/correction';
import { assertActiveKassaDesk, assertKassaDeskForFirmSetSelection } from '../utils/kassa-desk-policy';
import { resolveExchangeRateToUzs } from '../services/currency-rates.service';
import { assertKassirDeskAccess, getBoundKassaDeskId, isKassirUser } from '../utils/kassa-desk-access';
import { ensureFinancialAccount } from '../utils/financial-accounts';

type AuthUser = {
  userId?: string;
  role?: string;
  firmId?: string | null;
  firmRole?: string | null;
};

function getAuthUser(req: Request): AuthUser {
  return ((req as any).user || {}) as AuthUser;
}

function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

function normalizeCurrency(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

export function canDeleteFirmTransaction(authUser: AuthUser, transactionFirmId: string) {
  const userRole = normalizeRole(authUser.role);
  return userRole === 'SUPERADMIN' || (userRole === 'FIRM'
    && String(authUser.firmRole || '').toUpperCase() === 'FIRM_ADMIN'
    && Boolean(authUser.firmId)
    && transactionFirmId === String(authUser.firmId));
}

async function resolveKassaDesk(authUser: AuthUser, rawKassaDeskId: unknown) {
  const kassaDeskId = typeof rawKassaDeskId === 'string' ? rawKassaDeskId.trim() : '';
  if (!kassaDeskId) return null;

  const desk = await prisma.kassaDesk.findUnique({
    where: { id: kassaDeskId },
    select: { id: true, firmId: true, name: true, status: true, deletedAt: true },
  });
  assertActiveKassaDesk(desk);

  const accessibleFirmIds = await getAccessibleFirmIds(authUser);
  if (accessibleFirmIds && !accessibleFirmIds.includes(desk.firmId)) {
    throw new Error('Forbidden');
  }

  return desk;
}

async function firmHasActiveKassaDesks(firmId: string) {
  const count = await prisma.kassaDesk.count({
    where: { firmId, status: 'ACTIVE', deletedAt: null },
  });
  return count > 0;
}

async function assertKassaDeskBelongsToOneOf(
  kassaDesk: Awaited<ReturnType<typeof resolveKassaDesk>>,
  firmIds: string[],
  requireForFirmId?: string,
) {
  const activeDeskCount = requireForFirmId && await firmHasActiveKassaDesks(requireForFirmId) ? 1 : 0;
  assertKassaDeskForFirmSetSelection(kassaDesk, firmIds, requireForFirmId, activeDeskCount);
}

const DEFAULT_CURRENCY = 'UZS';

class TransactionConflictError extends Error {}

async function assertTransactionKassaEditable(row: { type: string; paymentMethod?: string | null; metadata?: unknown; createdAt: Date; kassaDeskId?: string | null }) {
  if (!row.kassaDeskId) return;
  const day = parseBusinessDate(getTransactionBusinessDateKey(row));
  const session = day ? await findKassaForDate(day, row.kassaDeskId) : null;
  if (!session || session.status !== 'OPEN') throw new TransactionConflictError('Reopen the exact kassa session before changing its transactions');
}

function parseDecimal(value: unknown): Prisma.Decimal | undefined {
  try {
    if (value instanceof Prisma.Decimal) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return new Prisma.Decimal(String(value));
    if (typeof value === 'string' && value.trim()) return new Prisma.Decimal(value.trim());
  } catch {
    return undefined;
  }
  return undefined;
}

export const getTransactions = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);

  const { dateFrom, dateTo, firmId, flightId, allocationId, kassaDeskId, paymentCardId, paymentMethod, sourceMode, status, confirmedOnly, type, currency, page = '1', limit = '10' } = req.query;
  const where: Prisma.TransactionWhereInput = { deletedAt: null };
  const conditions: Prisma.TransactionWhereInput[] = [];

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(String(dateFrom));
    if (dateTo) where.createdAt.lte = new Date(String(dateTo));
  }
  const accessibleFirmIds = await getAccessibleFirmIds(authUser);

  if (firmId) {
    const scopedFirmId = String(firmId);
    if (accessibleFirmIds && !accessibleFirmIds.includes(scopedFirmId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    conditions.push({ OR: [
      { firmId: scopedFirmId },
      { payerFirmId: scopedFirmId },
      { receiverFirmId: scopedFirmId },
    ] });
  } else if (accessibleFirmIds) {
    if (!accessibleFirmIds.length) {
      return res.json({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } });
    }
    conditions.push({ OR: [
      { firmId: { in: accessibleFirmIds } },
      { payerFirmId: { in: accessibleFirmIds } },
      { receiverFirmId: { in: accessibleFirmIds } },
    ] });
  }
  if (flightId) where.flightId = String(flightId);
  if (allocationId) conditions.push({ OR: [
    { subjectType: 'TICKET_ALLOCATION', subjectId: String(allocationId) },
    { metadata: { path: ['allocationId'], equals: String(allocationId) } },
  ] });
  if (kassaDeskId) where.kassaDeskId = String(kassaDeskId);
  if (paymentCardId) where.paymentCardId = String(paymentCardId);
  if (isKassirUser(authUser)) where.kassaDeskId = (await getBoundKassaDeskId(authUser)) || '__unassigned_kassir__';
  if (type) where.type = String(type).toUpperCase() as any;
  if (currency) where.currency = String(currency);
  if (paymentMethod) where.paymentMethod = String(paymentMethod).toLowerCase();
  if (sourceMode) where.sourceMode = String(sourceMode).toUpperCase();
  if (status) where.status = String(status).toUpperCase();
  if (String(confirmedOnly || '').toLowerCase() === 'true') where.status = 'CONFIRMED';
  if (conditions.length) where.AND = conditions;

  const pageNum = Math.max(1, parseInt(String(page)) || 1);
  const limitNum = Math.max(1, parseInt(String(limit)) || 10);
  const skip = (pageNum - 1) * limitNum;

  const [total, data, summaryRows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: { firm: true, flight: true, payerFirm: true, receiverFirm: true, paymentCard: true, createdBy: { select: { id: true, email: true, fullName: true } }, kassaDesk: { include: { firm: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum
    }),
    prisma.transaction.groupBy({ by: ['currency', 'type'], where, _sum: { originalAmount: true }, _count: { _all: true } }),
  ]);
  
  res.json({
    data,
    summaryByCurrency: summaryRows.map((row) => ({ currency: row.currency, type: row.type, count: row._count._all, total: Number(row._sum.originalAmount || 0) })),
    reversals: data.filter((row) => row.sourceMode === 'REVERSAL' || Boolean(row.reversedTransactionId)),
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
    include: { firm: true, flight: true, ticket: true, payerFirm: true, receiverFirm: true, kassaDesk: { include: { firm: true } } }
  });
  if (!tx) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const accessibleFirmIds = await getAccessibleFirmIds(authUser);
  if (accessibleFirmIds) {
    const ids = [tx.firmId, tx.payerFirmId, tx.receiverFirmId].filter(Boolean) as string[];
    if (!ids.some((id) => accessibleFirmIds.includes(id))) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
  }
  res.json(tx);
};

async function getOwnedDailyCashTransaction(req: Request, id: string) {
  const authUser = getAuthUser(req);
  const row = await prisma.transaction.findUnique({ where: { id } });
  if (!row) throw new Error('Transaction not found');
  if (row.type !== 'ADJUSTMENT' || !['KASSA_IN', 'KASSA_OUT'].includes(String(row.direction || ''))) {
    throw new Error('Only manually entered cash income/expense can be changed');
  }
  const isCreator = Boolean(authUser.userId) && row.createdByUserId === String(authUser.userId);
  const isOwnFirmAdmin = normalizeRole(authUser.role) === 'FIRM'
    && String(authUser.firmRole || '').toUpperCase() === 'FIRM_ADMIN'
    && Boolean(authUser.firmId)
    && row.firmId === String(authUser.firmId);
  if (!isCreator && !isOwnFirmAdmin) {
    throw new Error('Only the creator or the firm admin can correct this transaction');
  }
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  const businessDay = String(metadata.date || row.createdAt.toISOString().slice(0, 10));
  const today = new Date().toISOString().slice(0, 10);
  if (businessDay !== today) throw new Error('Only today\'s transactions can be changed');
  await assertTransactionKassaEditable(row);
  return { row, metadata, isCreator };
}

export const updateOwnDailyCashTransaction = async (req: Request, res: Response) => {
  try {
    const { row, metadata } = await getOwnedDailyCashTransaction(req, String(req.params.id || ''));
    const note = String(req.body?.note || '').trim().slice(0, 500);
    const correctionReason = requireCorrectionReason(req.body?.correctionReason);
    const originalAmount = req.body?.amount == null ? row.originalAmount : Number(req.body.amount);
    if (!Number.isFinite(Number(originalAmount)) || Number(originalAmount) <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than zero' });
    }
    const baseAmount = Number(originalAmount) * Number(row.exchangeRate);
    const updated = await prisma.transaction.update({
      where: { id: row.id },
      data: { originalAmount, baseAmount, metadata: { ...metadata, note, ...(correctionReason ? { correctionReason } : {}) } },
    });
    await writeAuditLog(req, { action: 'UPDATE', entityType: 'transaction', entityId: row.id, summary: `Cash correction: ${correctionReason}`, before: row, after: updated, metadata: { correctionReason } });
    return res.json(updated);
  } catch (err: any) {
    return res.status(err instanceof TransactionConflictError ? 409 : err?.message === 'Transaction not found' ? 404 : 400).json({ error: err?.message || 'Failed to update transaction' });
  }
};

export const deleteOwnDailyCashTransaction = async (req: Request, res: Response) => {
  try {
    const { row } = await getOwnedDailyCashTransaction(req, String(req.params.id || ''));
    const correctionReason = requireCorrectionReason(req.body?.correctionReason || req.body?.reason);
    await prisma.transaction.delete({ where: { id: row.id } });
    await writeAuditLog(req, { action: 'DELETE', entityType: 'transaction', entityId: row.id, summary: `Cash entry removed: ${correctionReason}`, before: row, metadata: { correctionReason } });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(err instanceof TransactionConflictError ? 409 : err?.message === 'Transaction not found' ? 404 : 400).json({ error: err?.message || 'Failed to delete transaction' });
  }
};

export const deleteTransaction = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const id = String(req.params.id || '');
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  if (!reason) return res.status(400).json({ error: 'Delete reason is required' });

  const row = await prisma.transaction.findUnique({ where: { id } });
  if (!row) return res.status(404).json({ error: 'Transaction not found' });
  if (!canDeleteFirmTransaction(authUser, row.firmId)) return res.status(403).json({ error: 'Only superadmin or the owning firm admin can delete this transaction' });
  try {
    await assertTransactionKassaEditable(row);
  } catch (err: any) {
    return res.status(409).json({ error: err?.message || 'Kassa session must be open' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceOffering.updateMany({ where: { transactionId: id }, data: { transactionId: null, paymentStatus: 'DELETED' } });
    await tx.tourPackageSale.updateMany({ where: { transactionId: id }, data: { transactionId: null } });
    await tx.paymentAllocation.deleteMany({ where: { paymentId: id } });
    await tx.ledgerEntry.deleteMany({ where: { transactionId: id } });
    await tx.transaction.delete({ where: { id } });
  });
  await writeAuditLog(req, { action: 'DELETE', entityType: 'transaction', entityId: id, summary: `Deleted transaction: ${reason}`, before: row, metadata: { reason } });
  return res.json({ ok: true });
};

export const createDirectedTransaction = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  const body = req.body || {};
  if (role === 'FIRM' && String(authUser.firmRole || '').toUpperCase() !== 'FIRM_ADMIN') {
    return res.status(403).json({ error: 'Only firm admin can create direct transactions' });
  }

  const type = String(body.type || '').trim().toUpperCase();
  const payerFirmId = String(body.payerFirmId || '').trim();
  const receiverFirmId = String(body.receiverFirmId || '').trim();
  const flightId = String(body.flightId || '').trim() || undefined;
  const amount = parseDecimal(body.amount);
  const currency = normalizeCurrency(body.currency || DEFAULT_CURRENCY);
  const rawExchangeRate = body.exchangeRate;
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  let kassaDesk: Awaited<ReturnType<typeof resolveKassaDesk>> = null;

  if (!['SALE', 'PAYMENT', 'REFUND', 'ADJUSTMENT', 'PAYABLE'].includes(type)) {
    return res.status(400).json({ error: 'Invalid transaction type' });
  }
  if (!payerFirmId || !receiverFirmId || !amount || !currency) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (payerFirmId === receiverFirmId) {
    return res.status(400).json({ error: 'Payer and receiver must be different' });
  }
  if (!amount.gt(0)) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return res.status(400).json({ error: 'Invalid currency code' });
  }

  if (role === 'FIRM') {
    const ownFirmId = authUser.firmId ? String(authUser.firmId) : '';
    if (!ownFirmId) return res.status(400).json({ error: 'Firm account is missing firmId' });
    if (payerFirmId !== ownFirmId && receiverFirmId !== ownFirmId) {
      return res.status(403).json({ error: 'Firm must be payer or receiver' });
    }
  } else if (role === 'ADMIN') {
    if (!(await canAccessFirm(authUser, payerFirmId)) || !(await canAccessFirm(authUser, receiverFirmId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  try {
    kassaDesk = await resolveKassaDesk(authUser, body.kassaDeskId);
    await assertKassirDeskAccess(authUser, kassaDesk?.id);
    await assertKassaDeskBelongsToOneOf(kassaDesk, [payerFirmId, receiverFirmId]);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Invalid kassa desk' });
  }

  try {
    const [payer, receiver, flight] = await Promise.all([
      prisma.firm.findUnique({ where: { id: payerFirmId }, select: { id: true, name: true } }),
      prisma.firm.findUnique({ where: { id: receiverFirmId }, select: { id: true, name: true } }),
      flightId ? prisma.flight.findUnique({ where: { id: flightId }, select: { id: true, flightNumber: true } }) : Promise.resolve(null),
    ]);
    if (!payer) return res.status(404).json({ error: 'Payer firm not found' });
    if (!receiver) return res.status(404).json({ error: 'Receiver firm not found' });
    if (flightId && !flight) return res.status(404).json({ error: 'Flight not found' });

    const exchangeRate = await resolveExchangeRateToUzs(authUser, {
      currency,
      date: new Date(),
      overrideRate: rawExchangeRate,
      rateFirmId: role === 'FIRM' ? authUser.firmId : payerFirmId,
    });
    const baseAmount = amount.mul(exchangeRate).toDecimalPlaces(4);
    const [sourceAccount, destinationAccount] = await Promise.all([
      ensureFinancialAccount({ firmId: payerFirmId, currency, type: FinancialAccountType.BANK, createdByUserId: authUser.userId }),
      ensureFinancialAccount({ firmId: receiverFirmId, currency, type: FinancialAccountType.BANK, createdByUserId: authUser.userId }),
    ]);
    const created = await prisma.transaction.create({
      data: {
        firmId: receiverFirmId,
        payerFirmId,
        receiverFirmId,
        flightId,
        createdByUserId: authUser.userId ? String(authUser.userId) : undefined,
        type: type as any,
        sourceMode: String(body.sourceMode || (body.paymentMethod === 'cash' ? 'MANUAL_CASH' : body.paymentMethod === 'card' ? 'MANUAL_CARD' : 'MANUAL_BANK')).toUpperCase(),
        status: 'CONFIRMED',
        direction: 'FIRM_TO_FIRM',
        subjectType: flightId ? 'FLIGHT' : 'MANUAL',
        subjectId: flightId,
        kassaDeskId: kassaDesk?.id,
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destinationAccount.id,
        originalAmount: amount.toDecimalPlaces(4),
        currency,
        exchangeRate: exchangeRate.toDecimalPlaces(6),
        baseAmount,
        metadata: {
          note,
          kassaDeskId: kassaDesk?.id,
          kassaDeskLabel: kassaDesk?.name,
          payerLabel: payer.name,
          receiverLabel: receiver.name,
          directionLabel: `${payer.name} -> ${receiver.name}`,
          flightNumber: flight?.flightNumber,
        },
      },
      include: { firm: true, flight: true, payerFirm: true, receiverFirm: true, kassaDesk: { include: { firm: true } } },
    });

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'transaction',
      entityId: created.id,
      entityLabel: `${created.type} ${created.originalAmount} ${created.currency}`,
      summary: `Created ${created.type} transaction`,
      after: created,
    });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create transaction' });
  }
};

export const createAccountTransaction = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  if (role === 'FIRM' && String(authUser.firmRole || '').toUpperCase() !== 'FIRM_ADMIN') return res.status(403).json({ error: 'Only firm admin can create account transactions' });
  const accountId = String(req.body?.accountId || '');
  const counterpartyName = String(req.body?.counterpartyName || '').trim();
  const flow = String(req.body?.flow || '').toUpperCase();
  const amount = parseDecimal(req.body?.amount);
  const category = String(req.body?.category || 'OTHER').trim().toUpperCase();
  const note = String(req.body?.note || '').trim().slice(0, 500);
  if (!accountId || !counterpartyName || !['IN', 'OUT'].includes(flow) || !amount?.gt(0)) return res.status(400).json({ error: 'Account, counterparty, IN/OUT flow and positive amount are required' });
  const account = await prisma.financialAccount.findUnique({ where: { id: accountId } });
  if (!account || account.status !== 'ACTIVE' || !(await canAccessFirm(authUser, account.firmId))) return res.status(403).json({ error: 'Account is not accessible' });
  const exchangeRate = await resolveExchangeRateToUzs(authUser, { currency: account.currency, overrideRate: req.body?.exchangeRate, rateFirmId: account.firmId });
  const created = await prisma.transaction.create({
    data: { firmId: account.firmId, createdByUserId: authUser.userId, type: 'ADJUSTMENT', sourceMode: 'MANUAL_BANK', status: 'CONFIRMED', direction: flow === 'IN' ? 'ACCOUNT_IN' : 'ACCOUNT_OUT', subjectType: 'ACCOUNT', subjectId: account.id, sourceAccountId: flow === 'OUT' ? account.id : undefined, destinationAccountId: flow === 'IN' ? account.id : undefined, originalAmount: amount.toDecimalPlaces(4), currency: account.currency, exchangeRate, baseAmount: amount.mul(exchangeRate).toDecimalPlaces(4), metadata: { category, note, accountName: account.name, counterpartyName, fromLabel: flow === 'IN' ? counterpartyName : account.name, toLabel: flow === 'IN' ? account.name : counterpartyName } },
  });
  await writeAuditLog(req, { action: 'CREATE', entityType: 'transaction', entityId: created.id, entityLabel: `${flow} ${account.name}`, summary: `Created ${category} account transaction`, after: created });
  return res.status(201).json(created);
};

export const createManualCashTransaction = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  const body = req.body || {};

  const flow = String(body.flow || '').trim().toUpperCase();
  const rawFirmId = String(body.firmId || '').trim();
  const counterpartyFirmId = String(body.counterpartyFirmId || body.counterpartyId || '').trim() || undefined;
  const flightId = String(body.flightId || '').trim() || undefined;
  const amount = parseDecimal(body.amount);
  const currency = normalizeCurrency(body.currency || DEFAULT_CURRENCY);
  const rawExchangeRate = body.exchangeRate;
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const businessDate = parseBusinessDate(String(body.businessDate || body.date || ''));
  const method = String(body.method || body.paymentMethod || 'cash').trim().toLowerCase();
  const paymentCardId = String(body.paymentCardId || body.cardId || '').trim();
  let kassaDesk: Awaited<ReturnType<typeof resolveKassaDesk>> = null;

  let firmId = rawFirmId;
  if (role === 'FIRM') {
    firmId = authUser.firmId ? String(authUser.firmId) : '';
  }

  if (!['IN', 'OUT'].includes(flow)) {
    return res.status(400).json({ error: 'flow must be IN or OUT' });
  }
  if (!['cash', 'card'].includes(method)) {
    return res.status(400).json({ error: 'method must be cash or card' });
  }
  if (method === 'card' && !paymentCardId) {
    return res.status(400).json({ error: 'Card movement requires paymentCardId' });
  }
  if (!firmId || !amount || !currency) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!businessDate) return res.status(400).json({ error: 'Valid businessDate is required' });
  if (!amount.gt(0)) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return res.status(400).json({ error: 'Invalid currency code' });
  }
  if (!(await canAccessFirm(authUser, firmId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (counterpartyFirmId && !(await canAccessFirm(authUser, counterpartyFirmId))) {
    return res.status(403).json({ error: 'Counterparty is not accessible' });
  }
  try {
    kassaDesk = await resolveKassaDesk(authUser, body.kassaDeskId);
    await assertKassirDeskAccess(authUser, kassaDesk?.id);
    await assertKassaDeskBelongsToOneOf(kassaDesk, [firmId], firmId);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Invalid kassa desk' });
  }
  try {
    await assertKassaOpenForDate(businessDate, kassaDesk?.id);
  } catch (err: any) {
    return res.status(409).json({ error: err?.message || 'Kassa session is not open' });
  }

  try {
    const [firm, counterparty, flight, paymentCard] = await Promise.all([
      prisma.firm.findUnique({ where: { id: firmId }, select: { id: true, name: true, kind: true } }),
      counterpartyFirmId ? prisma.firm.findUnique({ where: { id: counterpartyFirmId }, select: { id: true, name: true, kind: true } }) : Promise.resolve(null),
      flightId ? prisma.flight.findUnique({ where: { id: flightId }, select: { id: true, flightNumber: true } }) : Promise.resolve(null),
      paymentCardId
        ? prisma.paymentCard.findUnique({ where: { id: paymentCardId }, select: { id: true, ownerName: true, cardNumber: true, currency: true, status: true } })
        : Promise.resolve(null),
    ]);
    if (!firm) return res.status(404).json({ error: 'Firm not found' });
    if (counterpartyFirmId && !counterparty) return res.status(404).json({ error: 'Counterparty not found' });
    if (flightId && !flight) return res.status(404).json({ error: 'Flight not found' });
    if (method === 'card') {
      if (!paymentCard) return res.status(404).json({ error: 'Payment card not found' });
      if (paymentCard.status !== 'ACTIVE') return res.status(400).json({ error: 'Payment card is not active' });
    }

    const exchangeRate = await resolveExchangeRateToUzs(authUser, {
      currency,
      date: businessDate || new Date(),
      overrideRate: rawExchangeRate,
      rateFirmId: firmId,
    });
    const baseAmount = amount.mul(exchangeRate).toDecimalPlaces(4);
    const operationalAccount = await ensureFinancialAccount({
      firmId, currency,
      type: method === 'card' ? FinancialAccountType.CARD : FinancialAccountType.CASH,
      kassaDeskId: method === 'cash' ? kassaDesk?.id : undefined,
      paymentCardId: method === 'card' ? paymentCardId : undefined,
      createdByUserId: authUser.userId,
    });
    const created = await prisma.transaction.create({
      data: {
        firmId,
        payerFirmId: flow === 'IN' ? (counterpartyFirmId || firmId) : firmId,
        receiverFirmId: flow === 'OUT' ? (counterpartyFirmId || firmId) : firmId,
        flightId,
        createdByUserId: authUser.userId ? String(authUser.userId) : undefined,
        type: 'ADJUSTMENT',
        sourceMode: method === 'card' ? 'MANUAL_CARD' : 'MANUAL_CASH',
        status: 'CONFIRMED',
        direction: flow === 'IN' ? 'KASSA_IN' : 'KASSA_OUT',
        subjectType: flightId ? 'FLIGHT' : 'KASSA',
        subjectId: flightId || firmId,
        kassaDeskId: kassaDesk?.id,
        sourceAccountId: flow === 'OUT' ? operationalAccount.id : undefined,
        destinationAccountId: flow === 'IN' ? operationalAccount.id : undefined,
        originalAmount: amount.toDecimalPlaces(4),
        currency,
        exchangeRate: exchangeRate.toDecimalPlaces(6),
        baseAmount,
        paymentMethod: method,
        paymentCardId: method === 'card' ? paymentCardId : undefined,
        metadata: {
          note,
          date: businessDate ? businessDate.toISOString().slice(0, 10) : undefined,
          cashFlow: flow,
          kassaDeskId: kassaDesk?.id,
          kassaDeskLabel: kassaDesk?.name,
          paymentCardId: method === 'card' ? paymentCardId : undefined,
          paymentCardOwner: paymentCard?.ownerName,
          paymentCardNumber: paymentCard?.cardNumber,
          firmLabel: firm.name,
          counterpartyFirmId,
          counterpartyLabel: counterparty?.name,
          counterpartyKind: counterparty?.kind,
          flightNumber: flight?.flightNumber,
        },
      },
      include: { firm: true, flight: true, payerFirm: true, receiverFirm: true, kassaDesk: { include: { firm: true } } },
    });

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'transaction',
      entityId: created.id,
      entityLabel: `${created.direction} ${created.originalAmount} ${created.currency}`,
      summary: `Created kassa ${flow} transaction`,
      after: created,
    });
    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to create transaction' });
  }
};
