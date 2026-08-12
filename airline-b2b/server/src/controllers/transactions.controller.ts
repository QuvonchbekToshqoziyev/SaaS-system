import { Request, Response } from 'express';
import { prisma } from '../db';
import { FinancialAccountType, Prisma } from '@prisma/client';
import { canAccessFirm, canViewRelatedFirm, getAccessibleFirmIds } from '../utils/access';
import { assertKassaOpenForDate, findKassaForDate, getTransactionBusinessDateKey, parseBusinessDate } from '../utils/kassa';
import { writeAuditLog } from '../utils/audit';
import { requireCorrectionReason } from '../domains/transactions/correction';
import { assertActiveKassaDesk, assertKassaDeskForFirmSetSelection } from '../utils/kassa-desk-policy';
import { resolveExchangeRateToUzs } from '../services/currency-rates.service';
import { assertKassirDeskAccess, getBoundKassaDeskId, isKassirUser, KassaDeskAccessError } from '../utils/kassa-desk-access';
import { ensureFinancialAccount } from '../utils/financial-accounts';
import { softDeleteTransaction, visibleTransactionWhere } from '../utils/transaction-visibility';
import { canOperateKassa } from '../utils/kassa-permissions';
import { historicalKassaIdempotencyKey, normalizeHistoricalKassaImportRows, type HistoricalKassaImportError, type HistoricalKassaImportRow } from '../domains/transactions/historical-kassa-import';
import { randomUUID } from 'node:crypto';
import { maskCardNumber } from '../domains/transactions/transaction-display';
import { activeFlightWhere, firmFlightParticipationWhere } from '../domains/flights/flight-scope';
import { resolveKassaTransactionFlow } from '../services/kassa.service';
import { expenseInputError } from '../domains/expenses/expense-classification';

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
    throw new KassaDeskAccessError('Forbidden');
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

function historicalImportMatches(
  existing: { direction: string | null; originalAmount: Prisma.Decimal; currency: string; exchangeRate: Prisma.Decimal; metadata: unknown },
  row: HistoricalKassaImportRow,
) {
  const metadata = existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
    ? existing.metadata as Record<string, unknown>
    : {};
  return existing.direction === (row.flow === 'IN' ? 'KASSA_IN' : 'KASSA_OUT')
    && existing.originalAmount.eq(row.amount)
    && existing.currency === row.currency
    && existing.exchangeRate.eq(row.exchangeRate)
    && metadata.date === row.date
    && String(metadata.importReference || '').toUpperCase() === row.referenceKey;
}

export const importHistoricalKassaTransactions = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  const dryRun = req.body?.dryRun !== false;
  let firmId = String(req.body?.firmId || '').trim();
  const kassaDeskId = String(req.body?.kassaDeskId || '').trim();

  if (!(await canOperateKassa(authUser))) {
    return res.status(403).json({ error: 'Kassa importi uchun ruxsat yo‘q.' });
  }
  if (role === 'FIRM') firmId = String(authUser.firmId || '');
  if (!firmId || !kassaDeskId) {
    return res.status(400).json({ error: 'Firma va kassa tanlanishi kerak.' });
  }
  if (!(await canAccessFirm(authUser, firmId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  let kassaDesk: Awaited<ReturnType<typeof resolveKassaDesk>>;
  try {
    kassaDesk = await resolveKassaDesk(authUser, kassaDeskId);
    await assertKassirDeskAccess(authUser, kassaDesk?.id);
    if (!kassaDesk || kassaDesk.firmId !== firmId) throw new KassaDeskAccessError('Tanlangan kassa bu firmaga tegishli emas.');
  } catch (err: any) {
    return res.status(err?.statusCode || 400).json({ error: err?.message || 'Kassa noto‘g‘ri tanlangan.' });
  }

  const normalized = normalizeHistoricalKassaImportRows(req.body?.rows);
  const errors: HistoricalKassaImportError[] = [...normalized.errors];
  if (errors.length) {
    return res.status(dryRun ? 200 : 422).json({ ok: false, validCount: normalized.rows.length, readyCount: 0, skippedCount: 0, errors });
  }

  const dates = Array.from(new Set(normalized.rows.map((row) => row.date)));
  const sessions = await prisma.kassaDay.findMany({
    where: { cashDeskId: kassaDeskId, businessDate: { in: dates.map((date) => new Date(`${date}T00:00:00.000Z`)) } },
    select: { businessDate: true, status: true },
  });
  const sessionsByDate = new Map(sessions.map((session) => [session.businessDate.toISOString().slice(0, 10), session.status]));
  for (const row of normalized.rows) {
    const status = sessionsByDate.get(row.date);
    if (!status) errors.push({ row: row.rowNumber, field: 'date', message: `${row.date} uchun bu kassa ochilmagan.` });
    else if (status !== 'OPEN') errors.push({ row: row.rowNumber, field: 'date', message: `${row.date} kassasi yopiq. Avval shu kunni qayta oching.` });
  }

  const keys = normalized.rows.map((row) => historicalKassaIdempotencyKey(firmId, kassaDeskId, row.referenceKey));
  const existingRows = await prisma.transaction.findMany({
    where: { idempotencyKey: { in: keys } },
    select: { idempotencyKey: true, direction: true, originalAmount: true, currency: true, exchangeRate: true, metadata: true, deletedAt: true },
  });
  const existingByKey = new Map(existingRows.map((row) => [String(row.idempotencyKey), row]));
  const skippedKeys = new Set<string>();
  for (const row of normalized.rows) {
    const key = historicalKassaIdempotencyKey(firmId, kassaDeskId, row.referenceKey);
    const existing = existingByKey.get(key);
    if (!existing) continue;
    if (!existing.deletedAt && historicalImportMatches(existing, row)) skippedKeys.add(key);
    else errors.push({ row: row.rowNumber, field: 'reference', message: `${row.reference} Import ID oldin boshqa ma’lumot bilan ishlatilgan.` });
  }

  const rowsToCreate = normalized.rows.filter((row) => !skippedKeys.has(historicalKassaIdempotencyKey(firmId, kassaDeskId, row.referenceKey)));
  const preview = {
    ok: errors.length === 0,
    validCount: normalized.rows.length,
    readyCount: rowsToCreate.length,
    skippedCount: skippedKeys.size,
    errors,
  };
  if (dryRun || errors.length) return res.status(dryRun ? 200 : 422).json(preview);

  if (skippedKeys.size) {
    await prisma.transaction.updateMany({
      where: { idempotencyKey: { in: [...skippedKeys] }, sourceMode: { not: 'HISTORICAL_IMPORT' } },
      data: { sourceMode: 'HISTORICAL_IMPORT' },
    });
  }

  const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { id: true, name: true } });
  if (!firm) return res.status(404).json({ error: 'Firma topilmadi.' });

  const accounts = new Map<string, Awaited<ReturnType<typeof ensureFinancialAccount>>>();
  for (const currency of Array.from(new Set(rowsToCreate.map((row) => row.currency)))) {
    accounts.set(currency, await ensureFinancialAccount({
      firmId,
      currency,
      type: FinancialAccountType.CASH,
      kassaDeskId,
      createdByUserId: authUser.userId,
    }));
  }

  const batchId = randomUUID();
  const importedAt = new Date();
  const created = await prisma.transaction.createMany({
    data: rowsToCreate.map((row) => {
      const amount = new Prisma.Decimal(row.amount);
      const exchangeRate = new Prisma.Decimal(row.exchangeRate);
      const account = accounts.get(row.currency)!;
      return {
        firmId,
        payerFirmId: firmId,
        receiverFirmId: firmId,
        kassaDeskId,
        createdByUserId: authUser.userId ? String(authUser.userId) : undefined,
        type: 'ADJUSTMENT' as const,
        sourceMode: 'HISTORICAL_IMPORT',
        status: 'CONFIRMED',
        direction: row.flow === 'IN' ? 'KASSA_IN' : 'KASSA_OUT',
        subjectType: 'KASSA',
        subjectId: firmId,
        sourceAccountId: row.flow === 'OUT' ? account.id : undefined,
        destinationAccountId: row.flow === 'IN' ? account.id : undefined,
        originalAmount: amount,
        currency: row.currency,
        exchangeRate,
        baseAmount: amount.mul(exchangeRate).toDecimalPlaces(4),
        paymentMethod: 'cash',
        idempotencyKey: historicalKassaIdempotencyKey(firmId, kassaDeskId, row.referenceKey),
        metadata: {
          note: row.note,
          date: row.date,
          cashFlow: row.flow,
          firmLabel: firm.name,
          kassaDeskId,
          kassaDeskLabel: kassaDesk.name,
          importReference: row.reference,
          importBatchId: batchId,
          importedAt: importedAt.toISOString(),
        },
        createdAt: new Date(`${row.date}T12:00:00.000Z`),
      };
    }),
    skipDuplicates: true,
  });

  await writeAuditLog(req, {
    action: 'IMPORT',
    entityType: 'transactionBatch',
    entityId: batchId,
    entityLabel: `${kassaDesk.name} · ${created.count} qator`,
    summary: `Imported ${created.count} historical kassa transactions`,
    after: { firmId, kassaDeskId, createdCount: created.count, skippedCount: normalized.rows.length - created.count },
    metadata: { references: rowsToCreate.map((row) => row.reference) },
  });

  return res.status(201).json({
    ok: true,
    batchId,
    createdCount: created.count,
    skippedCount: normalized.rows.length - created.count,
  });
};

export const getTransactions = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);

  const { dateFrom, dateTo, firmId, flightId, allocationId, kassaDeskId, paymentCardId, paymentMethod, sourceMode, operationType, status, confirmedOnly, type, currency, page = '1', limit = '10' } = req.query;
  const where: Prisma.TransactionWhereInput = {};
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
  if (operationType) where.operationType = String(operationType).toUpperCase();
  if (status) where.status = String(status).toUpperCase();
  if (String(confirmedOnly || '').toLowerCase() === 'true') where.status = 'CONFIRMED';
  if (conditions.length) where.AND = conditions;

  const pageNum = Math.max(1, parseInt(String(page)) || 1);
  const limitNum = Math.max(1, parseInt(String(limit)) || 10);
  const skip = (pageNum - 1) * limitNum;
  const visibleWhere = visibleTransactionWhere(where);

  const [total, data, summaryRows] = await Promise.all([
    prisma.transaction.count({ where: visibleWhere }),
    prisma.transaction.findMany({
      where: visibleWhere,
      include: { firm: true, flight: true, payerFirm: true, receiverFirm: true, paymentCard: true, expenseCategory: true, sourceAccount: true, destinationAccount: true, createdBy: { select: { id: true, email: true, fullName: true } }, kassaDesk: { include: { firm: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum
    }),
    prisma.transaction.groupBy({ by: ['currency', 'type'], where: visibleWhere, _sum: { originalAmount: true }, _count: { _all: true } }),
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
  const { id } = req.params;
  const accessibleFirmIds = await getAccessibleFirmIds(authUser);
  const accessWhere: Prisma.TransactionWhereInput = accessibleFirmIds ? { OR: [
    { firmId: { in: accessibleFirmIds } },
    { payerFirmId: { in: accessibleFirmIds } },
    { receiverFirmId: { in: accessibleFirmIds } },
  ] } : {};
  const tx = await prisma.transaction.findFirst({
    where: visibleTransactionWhere({ id: String(id), ...accessWhere }),
    include: { firm: true, flight: true, ticket: true, payerFirm: true, receiverFirm: true, expenseCategory: true, sourceAccount: true, destinationAccount: true, ledgerEntries: true, journalEntry: true, kassaDesk: { include: { firm: true } } }
  });
  if (!tx) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  res.json(tx);
};

async function getOwnedDailyCashTransaction(req: Request, id: string) {
  const authUser = getAuthUser(req);
  const row = await prisma.transaction.findFirst({ where: visibleTransactionWhere({ id }) });
  if (!row) throw new Error('Transaction not found');
  const manualCash = row.type === 'ADJUSTMENT' && ['KASSA_IN', 'KASSA_OUT'].includes(String(row.direction || ''));
  const manualPayment = row.type === 'PAYMENT' && String(row.sourceMode || '').startsWith('MANUAL_');
  if (!manualCash && !manualPayment) {
    throw new Error('Only manually entered income/expense can be changed');
  }
  const isCreator = Boolean(authUser.userId) && row.createdByUserId === String(authUser.userId);
  const isSuperadmin = normalizeRole(authUser.role) === 'SUPERADMIN';
  const isOwnFirmAdmin = normalizeRole(authUser.role) === 'FIRM'
    && String(authUser.firmRole || '').toUpperCase() === 'FIRM_ADMIN'
    && Boolean(authUser.firmId)
    && row.firmId === String(authUser.firmId);
  if (!isSuperadmin && !isCreator && !isOwnFirmAdmin) {
    throw new Error('Only the creator or the firm admin can correct this transaction');
  }
  if (isKassirUser(authUser)) await assertKassirDeskAccess(authUser, row.kassaDeskId);
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  const businessDay = String(metadata.date || row.createdAt.toISOString().slice(0, 10));
  await assertTransactionKassaEditable(row);
  return { row, metadata, isCreator };
}

export const updateOwnDailyCashTransaction = async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const { row, metadata } = await getOwnedDailyCashTransaction(req, String(req.params.id || ''));
    const expectedUpdatedAt = String(req.body?.expectedUpdatedAt || '').trim();
    if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== row.updatedAt.getTime()) {
      throw new TransactionConflictError('Transaction changed; refresh and retry');
    }
    const note = String(req.body?.note ?? metadata.note ?? '').trim().slice(0, 1000);
    const correctionReason = requireCorrectionReason(req.body?.correctionReason);
    const amount = parseDecimal(req.body?.amount ?? row.originalAmount);
    if (!amount?.gt(0)) return res.status(400).json({ error: 'Amount must be greater than zero' });
    const flow = String(req.body?.flow || (resolveKassaTransactionFlow(row) || 'IN')).toUpperCase();
    const method = String(req.body?.method || row.paymentMethod || 'cash').toLowerCase();
    const currency = normalizeCurrency(req.body?.currency || row.currency);
    const rawFlightId = String(req.body?.flightId ?? row.flightId ?? '').trim() || null;
    const allocationInputProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'allocationId');
    const rawAllocationId = String(allocationInputProvided ? (req.body?.allocationId || '') : (row.subjectType === 'TICKET_ALLOCATION' ? row.subjectId : '') || '').trim() || null;
    const rawTourPackageId = String(req.body?.tourPackageId ?? (row.subjectType === 'TOUR_PACKAGE' ? row.subjectId : '') ?? '').trim() || null;
    const operationPurpose = String(req.body?.operationPurpose || (rawAllocationId ? 'TICKET_ALLOCATION' : rawTourPackageId ? 'TOUR_PACKAGE' : rawFlightId ? 'FLIGHT' : 'GENERAL')).trim().toUpperCase();
    if (!['GENERAL', 'FLIGHT', 'TICKET_ALLOCATION', 'TOUR_PACKAGE'].includes(operationPurpose)) return res.status(400).json({ error: 'Invalid operation purpose' });
    const allocationId = operationPurpose === 'TICKET_ALLOCATION' ? rawAllocationId : null;
    const tourPackageId = operationPurpose === 'TOUR_PACKAGE' ? rawTourPackageId : null;
    const flightId = operationPurpose === 'GENERAL' ? null : rawFlightId;
    const counterpartyFirmId = String(req.body?.counterpartyFirmId || (flow === 'IN' ? row.payerFirmId : row.receiverFirmId) || '').trim() || null;
    if (!['IN', 'OUT'].includes(flow)) return res.status(400).json({ error: 'flow must be IN or OUT' });
    if (!['cash', 'card', 'bank'].includes(method)) return res.status(400).json({ error: 'method must be cash, card or bank' });
    if (!/^[A-Z]{3}$/.test(currency)) return res.status(400).json({ error: 'Invalid currency code' });

    const kassaDeskId = String(req.body?.kassaDeskId ?? row.kassaDeskId ?? '').trim() || null;
    const paymentCardId = method === 'card' ? String(req.body?.paymentCardId ?? row.paymentCardId ?? '').trim() : '';
    const bankAccountId = method === 'bank' ? String(req.body?.bankAccountId || '').trim() : '';
    if (method === 'cash' && !kassaDeskId) return res.status(400).json({ error: 'Cash transaction requires a kassa desk' });
    if (method === 'card' && !paymentCardId) return res.status(400).json({ error: 'Card transaction requires a card' });
    if (method === 'bank' && !bankAccountId) return res.status(400).json({ error: 'Bank transaction requires a bank account' });
    if (operationPurpose === 'TICKET_ALLOCATION' && !allocationId) return res.status(400).json({ error: 'Ticket allocation must be selected' });
    if (operationPurpose === 'FLIGHT' && !flightId) return res.status(400).json({ error: 'Flight must be selected' });
    if (operationPurpose === 'TOUR_PACKAGE' && !tourPackageId) return res.status(400).json({ error: 'Tour package must be selected' });

    if (counterpartyFirmId && !(await canViewRelatedFirm(authUser, counterpartyFirmId))) {
      return res.status(403).json({ error: 'Kontragent bu firma doirasida emas' });
    }

    const [desk, card, bankAccount, flight, allocation, tourPackage, counterparty] = await Promise.all([
      kassaDeskId ? resolveKassaDesk(authUser, kassaDeskId) : Promise.resolve(null),
      paymentCardId ? prisma.paymentCard.findFirst({ where: { id: paymentCardId, deletedAt: null }, select: { id: true, firmId: true, ownerName: true, cardNumber: true, currency: true, status: true } }) : Promise.resolve(null),
      bankAccountId ? prisma.financialAccount.findFirst({ where: { id: bankAccountId, status: 'ACTIVE' }, select: { id: true, firmId: true, name: true, currency: true, type: true } }) : Promise.resolve(null),
      flightId ? prisma.flight.findFirst({ where: { id: flightId, AND: [activeFlightWhere(), firmFlightParticipationWhere([row.firmId])] }, select: { id: true, flightNumber: true, route: true } }) : Promise.resolve(null),
      allocationId ? prisma.ticketAllocation.findFirst({ where: { id: allocationId, status: 'ACCEPTED', OR: [{ fromFirmId: row.firmId }, { toFirmId: row.firmId }] }, select: { id: true, flightId: true, fromFirmId: true, toFirmId: true } }) : Promise.resolve(null),
      tourPackageId ? prisma.tourPackage.findFirst({ where: { id: tourPackageId, deletedAt: null, OR: [{ ownerFirmId: row.firmId }, { sales: { some: { deletedAt: null, OR: [{ sellerFirmId: row.firmId }, { buyerFirmId: row.firmId }] } } }] }, select: { id: true, name: true, flightId: true } }) : Promise.resolve(null),
      counterpartyFirmId ? prisma.firm.findUnique({ where: { id: counterpartyFirmId }, select: { id: true, name: true } }) : Promise.resolve(null),
    ]);
    if (kassaDeskId) await assertKassirDeskAccess(authUser, kassaDeskId);
    if (kassaDeskId && (!desk || desk.firmId !== row.firmId)) return res.status(403).json({ error: 'Kassa boshqa firmaga tegishli' });
    if (paymentCardId && (!card || card.firmId !== row.firmId)) return res.status(403).json({ error: 'Karta boshqa firmaga tegishli' });
    if (card && (card.status !== 'ACTIVE' || card.currency !== currency)) return res.status(400).json({ error: 'Karta faol va tranzaksiya valyutasiga mos bo‘lishi kerak' });
    if (bankAccountId && (!bankAccount || bankAccount.firmId !== row.firmId || bankAccount.type !== 'BANK')) return res.status(403).json({ error: 'Bank hisobi boshqa firmaga tegishli yoki noto‘g‘ri' });
    if (bankAccount && bankAccount.currency !== currency) return res.status(400).json({ error: 'Bank hisobi valyutasi mos emas' });
    if (flightId && !flight) return res.status(403).json({ error: 'Reys bu firma doirasida emas' });
    if (allocationId && (!allocation || (flightId && allocation.flightId !== flightId))) return res.status(400).json({ error: 'Tasdiqlangan ajratma topilmadi yoki reysga mos emas' });
    if (tourPackageId && !tourPackage) return res.status(403).json({ error: 'Tur paketi bu firma doirasida emas' });
    if (counterpartyFirmId && !counterparty) return res.status(404).json({ error: 'Kontragent topilmadi' });

    const exchangeRate = req.body?.exchangeRate == null && currency === row.currency
      ? new Prisma.Decimal(row.exchangeRate)
      : await resolveExchangeRateToUzs(authUser, { currency, overrideRate: req.body?.exchangeRate, rateFirmId: row.firmId });
    const operationalAccount = method === 'bank'
      ? bankAccount!
      : await ensureFinancialAccount({ firmId: row.firmId, currency, type: method === 'card' ? FinancialAccountType.CARD : FinancialAccountType.CASH, kassaDeskId: method === 'cash' ? kassaDeskId : undefined, paymentCardId: method === 'card' ? paymentCardId : undefined, createdByUserId: authUser.userId });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Transaction" WHERE id = ${row.id} FOR UPDATE`;
      const current = await tx.transaction.findUnique({ where: { id: row.id } });
      if (!current || current.updatedAt.getTime() !== row.updatedAt.getTime()) throw new TransactionConflictError('Transaction changed; refresh and retry');
      return tx.transaction.update({
        where: { id: row.id },
        data: {
          direction: row.type === 'ADJUSTMENT' ? (flow === 'IN' ? 'KASSA_IN' : 'KASSA_OUT') : row.direction,
          payerFirmId: flow === 'IN' ? (counterpartyFirmId || row.firmId) : row.firmId,
          receiverFirmId: flow === 'OUT' ? (counterpartyFirmId || row.firmId) : row.firmId,
          flightId: flightId || tourPackage?.flightId || null,
          subjectType: allocationId ? 'TICKET_ALLOCATION' : tourPackageId ? 'TOUR_PACKAGE' : flightId ? 'FLIGHT' : row.type === 'PAYMENT' ? 'DEPOSIT' : 'KASSA', subjectId: allocationId || tourPackageId || flightId || row.firmId,
          kassaDeskId, paymentMethod: method, paymentCardId: method === 'card' ? paymentCardId : null,
          sourceAccountId: flow === 'OUT' ? operationalAccount.id : null, destinationAccountId: flow === 'IN' ? operationalAccount.id : null,
          originalAmount: amount.toDecimalPlaces(4), currency, exchangeRate, baseAmount: amount.mul(exchangeRate).toDecimalPlaces(4),
          sourceMode: method === 'card' ? 'MANUAL_CARD' : method === 'bank' ? 'MANUAL_BANK' : 'MANUAL_CASH',
          updatedByUserId: authUser.userId || null,
          counterpartyNameSnapshot: counterparty?.name || String(req.body?.counterpartyName || '').trim() || row.counterpartyNameSnapshot,
          cardNameSnapshot: card?.ownerName || null, cardMaskedNumberSnapshot: card?.cardNumber ? maskCardNumber(card.cardNumber) : null,
          metadata: { ...metadata, note, cashFlow: flow, correctionReason, operationPurpose, counterpartyFirmId, counterpartyLabel: counterparty?.name, paymentCardId: card?.id, paymentCardOwner: card?.ownerName, paymentCardNumber: card ? maskCardNumber(card.cardNumber) : null, bankAccountId: bankAccount?.id, bankAccountName: bankAccount?.name, allocationId, tourPackageId, tourPackageName: tourPackage?.name, flightNumber: flight?.flightNumber, kassaDeskId, kassaDeskLabel: desk?.name } as Prisma.InputJsonValue,
        },
      });
    });
    await writeAuditLog(req, { action: 'CASH_TRANSACTION_UPDATED', entityType: 'transaction', entityId: row.id, summary: `Cash correction: ${correctionReason}`, before: row, after: updated, metadata: { transactionId: row.id, reason: correctionReason, oldCashDeskId: row.kassaDeskId, newCashDeskId: updated.kassaDeskId, oldCardId: row.paymentCardId, newCardId: updated.paymentCardId, oldAmount: row.originalAmount, newAmount: updated.originalAmount, oldPaymentMethod: row.paymentMethod, newPaymentMethod: updated.paymentMethod } });
    return res.json(updated);
  } catch (err: any) {
    return res.status(err instanceof TransactionConflictError ? 409 : err?.message === 'Transaction not found' ? 404 : 400).json({ error: err?.message || 'Failed to update transaction' });
  }
};

export const deleteOwnDailyCashTransaction = async (req: Request, res: Response) => {
  try {
    const { row } = await getOwnedDailyCashTransaction(req, String(req.params.id || ''));
    const correctionReason = requireCorrectionReason(req.body?.correctionReason || req.body?.reason);
    const deleted = await softDeleteTransaction(prisma, row.id, new Date(), { updatedByUserId: getAuthUser(req).userId || null, deletedByUserId: getAuthUser(req).userId || null, deletionReason: correctionReason });
    await writeAuditLog(req, { action: 'CASH_TRANSACTION_CANCELLED', entityType: 'transaction', entityId: row.id, summary: `Cash entry removed: ${correctionReason}`, before: row, after: deleted, metadata: { transactionId: row.id, reason: correctionReason } });
    await writeAuditLog(req, { action: 'CASH_TRANSACTION_REVERSED', entityType: 'transaction', entityId: row.id, summary: 'Tranzaksiyaning balans ta’siri chiqarildi', before: { status: row.status }, after: { status: deleted.status }, metadata: { transactionId: row.id, reason: correctionReason, amount: row.originalAmount, currency: row.currency } });
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

  const row = await prisma.transaction.findFirst({ where: visibleTransactionWhere({ id }) });
  if (!row) return res.status(404).json({ error: 'Transaction not found' });
  if (!canDeleteFirmTransaction(authUser, row.firmId)) return res.status(403).json({ error: 'Only superadmin or the owning firm admin can delete this transaction' });
  if (row.sourceMode === 'FINANCIAL_MODULE' && row.status === 'APPLIED') return res.status(409).json({ error: 'APPLIED moliyaviy tranzaksiya o‘chirilmaydi. Reversal funksiyasidan foydalaning.' });
  try {
    await assertTransactionKassaEditable(row);
  } catch (err: any) {
    return res.status(409).json({ error: err?.message || 'Kassa session must be open' });
  }

  const deleted = await softDeleteTransaction(prisma, id, new Date(), { updatedByUserId: authUser.userId || null, deletedByUserId: authUser.userId || null, deletionReason: reason });
  await writeAuditLog(req, { action: 'CASH_TRANSACTION_CANCELLED', entityType: 'transaction', entityId: id, summary: `Deleted transaction: ${reason}`, before: row, after: deleted, metadata: { transactionId: id, reason } });
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
    return res.status(err?.statusCode || 400).json({ error: err.message || 'Invalid kassa desk' });
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
  const expenseDirection = flow === 'OUT' ? String(body.expenseDirection || '').trim().toUpperCase() : '';
  const expenseCategoryId = String(body.expenseCategoryId || '').trim() || undefined;
  const employeeId = String(body.employeeId || '').trim() || undefined;
  let kassaDesk: Awaited<ReturnType<typeof resolveKassaDesk>> = null;

  let firmId = rawFirmId;
  if (role === 'FIRM') {
    firmId = authUser.firmId ? String(authUser.firmId) : '';
  }

  if (!['IN', 'OUT'].includes(flow)) {
    return res.status(400).json({ error: 'flow must be IN or OUT' });
  }
  const expenseDirections = ['COMPANY_EXPENSE', 'EMPLOYEE_PAYMENT', 'COUNTERPARTY_PAYMENT', 'TAX_PAYMENT', 'ASSET_PURCHASE', 'ADVANCE_PAID', 'OWNER_WITHDRAWAL', 'DIVIDEND', 'INTERNAL_TRANSFER', 'OTHER_EXPENSE'];
  if (flow === 'OUT' && !expenseDirections.includes(expenseDirection)) return res.status(400).json({ error: 'Chiqim yo‘nalishi tanlanishi kerak' });
  if (expenseDirection === 'INTERNAL_TRANSFER') return res.status(400).json({ error: 'Hisoblararo o‘tkazmani Tranzaksiyalar modulida kiriting' });
  const inputError = flow === 'OUT' ? expenseInputError({ direction: expenseDirection, categoryId: expenseCategoryId, employeeId }) : null;
  if (inputError) return res.status(400).json({ error: inputError });
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
  if (counterpartyFirmId && !(await canViewRelatedFirm(authUser, counterpartyFirmId))) {
    return res.status(403).json({ error: 'Counterparty is not accessible' });
  }
  try {
    kassaDesk = await resolveKassaDesk(authUser, body.kassaDeskId);
    await assertKassirDeskAccess(authUser, kassaDesk?.id);
    await assertKassaDeskBelongsToOneOf(kassaDesk, [firmId], firmId);
  } catch (err: any) {
    return res.status(err?.statusCode || 400).json({ error: err.message || 'Invalid kassa desk' });
  }
  try {
    await assertKassaOpenForDate(businessDate, kassaDesk?.id);
  } catch (err: any) {
    return res.status(409).json({ error: err?.message || 'Kassa session is not open' });
  }

  try {
    const [firm, counterparty, flight, paymentCard, expenseCategory, employee] = await Promise.all([
      prisma.firm.findUnique({ where: { id: firmId }, select: { id: true, name: true, kind: true } }),
      counterpartyFirmId ? prisma.firm.findUnique({ where: { id: counterpartyFirmId }, select: { id: true, name: true, kind: true } }) : Promise.resolve(null),
      flightId ? prisma.flight.findUnique({ where: { id: flightId }, select: { id: true, flightNumber: true } }) : Promise.resolve(null),
      paymentCardId
        ? prisma.paymentCard.findUnique({ where: { id: paymentCardId }, select: { id: true, ownerName: true, cardNumber: true, currency: true, status: true } })
        : Promise.resolve(null),
      expenseCategoryId ? prisma.expenseCategory.findFirst({ where: { id: expenseCategoryId, firmId, isActive: true, deletedAt: null } }) : Promise.resolve(null),
      employeeId ? prisma.employee.findFirst({ where: { id: employeeId, firmId, status: 'ACTIVE', deletedAt: null }, select: { id: true, name: true, role: true } }) : Promise.resolve(null),
    ]);
    if (!firm) return res.status(404).json({ error: 'Firm not found' });
    if (counterpartyFirmId && !counterparty) return res.status(404).json({ error: 'Counterparty not found' });
    if (flightId && !flight) return res.status(404).json({ error: 'Flight not found' });
    if (method === 'card') {
      if (!paymentCard) return res.status(404).json({ error: 'Payment card not found' });
      if (paymentCard.status !== 'ACTIVE') return res.status(400).json({ error: 'Payment card is not active' });
    }
    if (expenseCategoryId && !expenseCategory) return res.status(403).json({ error: 'Xarajat kategoriyasi bu firma doirasida emas' });
    if (employeeId && !employee) return res.status(403).json({ error: 'Xodim bu firma doirasida emas yoki faol emas' });
    if (expenseCategory?.code === 'OTHER_OPERATING' && !note) return res.status(400).json({ error: 'Boshqa operatsion xarajat uchun izoh majburiy' });
    const exchangeRate = await resolveExchangeRateToUzs(authUser, { currency, date: businessDate, overrideRate: rawExchangeRate, rateFirmId: firmId });
    let budgetExceeded: { budgetId: string; limitAction: string; projected: Prisma.Decimal; limit: Prisma.Decimal } | null = null;
    if (flow === 'OUT' && expenseCategory) {
      const budget = await prisma.expenseBudget.findFirst({ where: { firmId, isActive: true, periodStart: { lte: businessDate }, periodEnd: { gte: businessDate }, OR: [{ expenseCategoryId: expenseCategory.id }, { expenseCategoryId: null }] }, orderBy: { expenseCategoryId: 'desc' } });
      if (budget) {
        const spent = await prisma.transaction.aggregate({ where: visibleTransactionWhere({ firmId, expenseCategoryId: expenseCategory.id, accountingTreatment: 'EXPENSE', status: { in: ['CONFIRMED', 'APPLIED', 'POSTED', 'PAID'] }, expenseDate: { gte: budget.periodStart, lte: budget.periodEnd } }), _sum: { baseAmount: true } });
        const projected = new Prisma.Decimal(spent._sum.baseAmount || 0).add(amount.mul(exchangeRate));
        if (projected.gt(budget.amount)) {
          budgetExceeded = { budgetId: budget.id, limitAction: budget.limitAction, projected, limit: budget.amount };
          const isApprover = role === 'SUPERADMIN' || (role === 'FIRM' && String(authUser.firmRole || '').toUpperCase() === 'FIRM_ADMIN');
          if (budget.limitAction === 'BLOCK' || (budget.limitAction === 'REQUIRE_APPROVAL' && !isApprover)) return res.status(409).json({ error: `Xarajat budjet limitidan oshadi. Limit: ${budget.amount} ${budget.currency}` });
        }
      }
    }

    const baseAmount = amount.mul(exchangeRate).toDecimalPlaces(4);
    const operationalAccount = await ensureFinancialAccount({
      firmId, currency,
      type: method === 'card' ? FinancialAccountType.CARD : FinancialAccountType.CASH,
      kassaDeskId: method === 'cash' ? kassaDesk?.id : undefined,
      paymentCardId: method === 'card' ? paymentCardId : undefined,
      createdByUserId: authUser.userId,
    });
    const treatmentByDirection: Record<string, { treatment: string; debit: string; cashFlow: string }> = {
      COMPANY_EXPENSE: { treatment: expenseCategory?.accountingTreatment || 'EXPENSE', debit: expenseCategory?.defaultAccountCode || expenseCategory?.financialStatementGroup || 'OPERATING_EXPENSES', cashFlow: expenseCategory?.cashFlowGroup || 'OPERATING' },
      EMPLOYEE_PAYMENT: { treatment: 'EXPENSE', debit: 'EMPLOYEE_EXPENSE', cashFlow: 'OPERATING' },
      COUNTERPARTY_PAYMENT: { treatment: 'LIABILITY_SETTLEMENT', debit: 'ACCOUNTS_PAYABLE', cashFlow: 'OPERATING' },
      TAX_PAYMENT: { treatment: 'LIABILITY_SETTLEMENT', debit: 'TAX_PAYABLE', cashFlow: 'OPERATING' },
      ASSET_PURCHASE: { treatment: 'ASSET', debit: 'PROPERTY_PLANT_EQUIPMENT', cashFlow: 'INVESTING' },
      ADVANCE_PAID: { treatment: 'PREPAYMENT', debit: 'SUPPLIER_ADVANCES', cashFlow: 'OPERATING' },
      OWNER_WITHDRAWAL: { treatment: 'OWNER_WITHDRAWAL', debit: 'FOUNDER_RECEIVABLE', cashFlow: 'FINANCING' },
      DIVIDEND: { treatment: 'EQUITY', debit: 'RETAINED_EARNINGS', cashFlow: 'FINANCING' },
      OTHER_EXPENSE: { treatment: 'EXPENSE', debit: 'OTHER_EXPENSE', cashFlow: 'OPERATING' },
    };
    const impact = flow === 'OUT' ? treatmentByDirection[expenseDirection] : null;
    const created = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({ data: {
        firmId,
        payerFirmId: flow === 'IN' ? (counterpartyFirmId || firmId) : firmId,
        receiverFirmId: flow === 'OUT' ? (counterpartyFirmId || firmId) : firmId,
        flightId,
        createdByUserId: authUser.userId ? String(authUser.userId) : undefined,
        type: 'ADJUSTMENT',
        sourceMode: method === 'card' ? 'MANUAL_CARD' : 'MANUAL_CASH',
        status: 'CONFIRMED',
        operationType: flow === 'OUT' ? expenseDirection : 'KASSA_INCOME',
        expenseDirection: flow === 'OUT' ? expenseDirection : null,
        accountingTreatment: impact?.treatment || (flow === 'IN' ? 'RECEIPT' : null),
        expenseCategoryId: expenseCategory?.id,
        expenseSubcategoryId: expenseCategory?.parentId ? expenseCategory.id : null,
        employeeId: employee?.id || null,
        counterpartyId: counterpartyFirmId || null,
        expenseDate: flow === 'OUT' ? (parseBusinessDate(String(body.expenseDate || body.businessDate || '')) || businessDate) : null,
        paymentDate: businessDate,
        documentDate: body.documentDate ? parseBusinessDate(String(body.documentDate)) : null,
        postingDate: businessDate,
        reportingPeriod: String(body.reportingPeriod || businessDate.toISOString().slice(0, 7)),
        documentNumber: String(body.documentNumber || '').trim() || null,
        taxDeductible: expenseCategory?.taxDeductible ?? (body.taxDeductible === true),
        vatAmount: parseDecimal(body.vatAmount),
        approvalStatus: 'APPROVED',
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
        counterpartyNameSnapshot: counterparty?.name || null,
        cardNameSnapshot: paymentCard?.ownerName || null,
        cardMaskedNumberSnapshot: paymentCard?.cardNumber ? maskCardNumber(paymentCard.cardNumber) : null,
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
          expenseDirection: flow === 'OUT' ? expenseDirection : undefined,
          expenseCategoryCode: expenseCategory?.code,
          expenseCategoryName: expenseCategory?.name,
          employeeId: employee?.id,
          employeeName: employee?.name,
          employeeRole: employee?.role,
          cashFlowCategory: impact?.cashFlow,
          pnlEffect: impact?.treatment === 'EXPENSE' ? 'EXPENSE' : 'NONE',
          documentNumber: String(body.documentNumber || '').trim() || undefined,
          budgetExceeded: budgetExceeded ? { budgetId: budgetExceeded.budgetId, limitAction: budgetExceeded.limitAction, projected: budgetExceeded.projected.toString(), limit: budgetExceeded.limit.toString() } : undefined,
        },
      },
      include: { firm: true, flight: true, payerFirm: true, receiverFirm: true, kassaDesk: { include: { firm: true } } },
    });
      if (flow === 'OUT' && impact) {
        const journal = await tx.journalEntry.create({ data: { firmId, transactionId: transaction.id, postingDate: businessDate, description: note || expenseDirection, postedByUserId: authUser.userId } });
        await tx.ledgerEntry.create({ data: { transactionId: transaction.id, journalEntryId: journal.id, debitAccount: impact.debit, creditAccount: `${method === 'card' ? 'PAYMENT_CARD' : 'CASH_DESK'}:${operationalAccount.id}`, amount: baseAmount, currency: 'UZS', exchangeRateSnapshot: exchangeRate } });
      }
      await tx.auditLog.create({ data: { actorUserId: authUser.userId, actorRole: role, action: flow === 'OUT' ? 'EXPENSE_CREATED' : 'CREATE', entityType: 'transaction', entityId: transaction.id, entityLabel: `${transaction.direction} ${transaction.originalAmount} ${transaction.currency}`, summary: `Created kassa ${flow} transaction`, after: transaction as unknown as Prisma.InputJsonValue, metadata: { actorFirmId: authUser.firmId || null, expenseCategoryId: expenseCategory?.id || null, expenseDirection: expenseDirection || null, cashDeskId: kassaDesk?.id || null, cardId: paymentCardId || null, amount: amount.toString(), currency } } });
      if (budgetExceeded) await tx.auditLog.create({ data: { actorUserId: authUser.userId, actorRole: role, action: 'EXPENSE_BUDGET_EXCEEDED', entityType: 'transaction', entityId: transaction.id, summary: 'Xarajat budjet limitidan oshdi', metadata: { actorFirmId: authUser.firmId || null, budgetId: budgetExceeded.budgetId, projected: budgetExceeded.projected.toString(), limit: budgetExceeded.limit.toString(), action: budgetExceeded.limitAction } } });
      return transaction;
    });
    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to create transaction' });
  }
};
