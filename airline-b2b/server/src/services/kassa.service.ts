import { FinancialAccountType, KassaStatus, Prisma, Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '../db';
import {
  findKassaForDate,
  formatBusinessDateKey,
  getTransactionBusinessDateKey,
  nextDayUtc,
  normalizeBusinessDate,
  parseBusinessDate,
  startOfDayUtc,
  sumToNumber,
} from '../utils/kassa';
import { isPayableDebtType } from '../utils/transaction-types';
import { getAccessibleFirmIds } from '../utils/access';
import { assertCanOperateKassa, canOperateKassa } from '../utils/kassa-permissions';
import { normalizeFirmUserRole } from '../utils/firm-user-roles';
import { getBoundKassaDeskId, isKassirUser } from '../utils/kassa-desk-access';
import { visibleTransactionWhere } from '../utils/transaction-visibility';
import { flightDisplayName } from '../domains/flights/flight-display';
import { kassaTransactionDisplay } from '../domains/transactions/transaction-display';
import { ensureFinancialAccount } from '../utils/financial-accounts';

export type AuthUser = {
  userId?: string;
  role?: Role | string;
  firmRole?: string | null;
  firmId?: string | null;
};

export class ServiceError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

export function resolveOpeningBalance(input: { previousClosingBalance?: Prisma.Decimal | null; requestedBalance?: Prisma.Decimal | null; canAdjust: boolean; adjustmentReason?: string }) {
  const automaticBalance = input.previousClosingBalance || new Prisma.Decimal(0);
  const adjusted = input.requestedBalance != null && !input.requestedBalance.equals(automaticBalance);
  if (adjusted && !input.canAdjust) throw new ServiceError('Opening balance cannot be changed by kassir', 403);
  if (adjusted && input.previousClosingBalance != null && !input.adjustmentReason) throw new ServiceError('Opening balance adjustment reason is required');
  return { automaticBalance, openingBalance: adjusted ? input.requestedBalance! : automaticBalance, adjusted };
}

export function resolveCarryForwardBalance(input: { actualClosingBalance?: Prisma.Decimal | null; closingBalance?: Prisma.Decimal | null; expectedCash?: Prisma.Decimal | null }) {
  return input.actualClosingBalance ?? input.closingBalance ?? input.expectedCash ?? null;
}

export function calculateExpectedCashByCurrency(
  opening: { openingBalance?: Prisma.Decimal | null; openingBalanceUsd?: Prisma.Decimal | null },
  byCurrency: Record<string, { cashTotal?: number }> = {},
) {
  return {
    UZS: sumToNumber(opening.openingBalance) + Number(byCurrency.UZS?.cashTotal || 0),
    USD: sumToNumber(opening.openingBalanceUsd) + Number(byCurrency.USD?.cashTotal || 0),
  };
}

export function previousKassaRemainderQuery(firmId: string, cashDeskId: string, day: Date, currency: 'UZS' | 'USD'): Prisma.KassaDayFindFirstArgs {
  const remainderWhere = currency === 'USD'
    ? { OR: [{ actualClosingBalanceUsd: { not: null } }, { closingBalanceUsd: { not: null } }, { expectedCashUsd: { not: null } }] }
    : { OR: [{ actualClosingBalance: { not: null } }, { closingBalance: { not: null } }, { expectedCash: { not: null } }] };
  return {
    where: { firmId, cashDeskId, currency: 'UZS', status: KassaStatus.CLOSED, businessDate: { lt: day }, ...remainderWhere },
    orderBy: [{ businessDate: 'desc' }, { closedAt: 'desc' }],
  };
}

async function findPreviousKassaRemainders(db: typeof prisma | Prisma.TransactionClient, firmId: string, cashDeskId: string, day: Date) {
  const [uzsSession, usdSession] = await Promise.all([
    db.kassaDay.findFirst(previousKassaRemainderQuery(firmId, cashDeskId, day, 'UZS')),
    db.kassaDay.findFirst(previousKassaRemainderQuery(firmId, cashDeskId, day, 'USD')),
  ]);
  return {
    UZS: { session: uzsSession, balance: uzsSession ? resolveCarryForwardBalance(uzsSession) : null },
    USD: {
      session: usdSession,
      balance: usdSession ? resolveCarryForwardBalance({
        actualClosingBalance: usdSession.actualClosingBalanceUsd,
        closingBalance: usdSession.closingBalanceUsd,
        expectedCash: usdSession.expectedCashUsd,
      }) : null,
    },
  };
}

export function resolveKassaDayStatus(selectedDesk: boolean, selectedSessionStatus: KassaStatus | null | undefined, allSessionStatuses: KassaStatus[]) {
  if (selectedDesk) return selectedSessionStatus || 'NOT_OPEN';
  if (allSessionStatuses.some((status) => status === KassaStatus.OPEN)) return KassaStatus.OPEN;
  return allSessionStatuses.length ? KassaStatus.CLOSED : 'NOT_OPEN';
}

function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

function serializeKassa(kassa: NonNullable<Awaited<ReturnType<typeof findKassaForDate>>>) {
  return {
    id: kassa.id,
    firmId: kassa.firmId,
    cashDeskId: kassa.cashDeskId,
    currency: kassa.currency,
    previousSessionId: kassa.previousSessionId,
    businessDate: formatBusinessDateKey(kassa.businessDate),
    status: kassa.status,
    openedAt: kassa.openedAt.toISOString(),
    closedAt: kassa.closedAt?.toISOString() ?? null,
    openedBy: kassa.openedBy,
    closedBy: kassa.closedBy,
    openingBalance: String(kassa.openingBalance),
    openingBalanceUsd: String(kassa.openingBalanceUsd),
    closingBalance: kassa.closingBalance != null ? String(kassa.closingBalance) : null,
    closingBalanceUsd: kassa.closingBalanceUsd != null ? String(kassa.closingBalanceUsd) : null,
    actualClosingBalance: kassa.actualClosingBalance != null ? String(kassa.actualClosingBalance) : null,
    actualClosingBalanceUsd: kassa.actualClosingBalanceUsd != null ? String(kassa.actualClosingBalanceUsd) : null,
    expectedCash: kassa.expectedCash != null ? String(kassa.expectedCash) : null,
    expectedCashUsd: kassa.expectedCashUsd != null ? String(kassa.expectedCashUsd) : null,
    variance: kassa.variance != null ? String(kassa.variance) : null,
    varianceUsd: kassa.varianceUsd != null ? String(kassa.varianceUsd) : null,
    openingAdjustmentReason: kassa.openingAdjustmentReason,
    notes: kassa.notes,
  };
}

function serializeKassaDesk(desk: any) {
  const cashier = desk.assignedCashier ?? null;
  const displayName = [desk.code, desk.name].filter(Boolean).join(' — ') || 'Nomsiz kassa';
  return {
    id: desk.id,
    firmId: desk.firmId,
    firm: desk.firm ?? null,
    name: desk.name,
    displayName,
    assignedCashierUserId: desk.assignedCashierUserId,
    assignedCashier: cashier,
    code: desk.code,
    status: desk.status,
    createdByUserId: desk.createdByUserId,
    createdBy: desk.createdBy ?? null,
    createdAt: desk.createdAt instanceof Date ? desk.createdAt.toISOString() : desk.createdAt,
    updatedAt: desk.updatedAt instanceof Date ? desk.updatedAt.toISOString() : desk.updatedAt,
  };
}

export function activeKassaDeskWhere(firmScopeIds?: string[]): Prisma.KassaDeskWhereInput {
  return {
    status: 'ACTIVE',
    deletedAt: null,
    ...(firmScopeIds ? { firmId: { in: firmScopeIds } } : {}),
  };
}

async function loadKassaDesks(firmScopeIds?: string[]) {
  return prisma.kassaDesk.findMany({
    where: activeKassaDeskWhere(firmScopeIds),
    include: {
      firm: { select: { id: true, name: true } },
      createdBy: { select: { id: true, email: true } },
      assignedCashier: { select: { id: true, email: true, fullName: true, status: true } },
    },
    orderBy: [{ firmId: 'asc' }, { name: 'asc' }],
  });
}

async function resolveKassaDeskFilter(rawKassaDeskId: unknown, firmScopeIds?: string[]) {
  const kassaDeskId = typeof rawKassaDeskId === 'string' ? rawKassaDeskId.trim() : '';
  if (!kassaDeskId) return null;

  const desk = await prisma.kassaDesk.findUnique({
    where: { id: kassaDeskId },
    select: { id: true, firmId: true, status: true, deletedAt: true },
  });
  if (!desk || desk.status === 'DELETED' || desk.deletedAt) {
    throw new ServiceError('Kassa desk not found', 404);
  }
  if (firmScopeIds && !firmScopeIds.includes(desk.firmId)) {
    throw new ServiceError('Forbidden', 403);
  }
  return desk;
}

async function loadDayTransactions(businessDate: Date, firmScopeIds?: string[], kassaDeskId?: string) {
  const dayKey = formatBusinessDateKey(businessDate);
  const where: Prisma.TransactionWhereInput = {
    ...(firmScopeIds ? { firmId: { in: firmScopeIds } } : {}),
    ...(kassaDeskId ? { kassaDeskId } : {}),
  };
  const rows = await prisma.transaction.findMany({
    where: visibleTransactionWhere(where),
    include: {
      firm: true, flight: true, paymentCard: true, payerFirm: { select: { id: true, name: true } }, receiverFirm: { select: { id: true, name: true } },
      sourceAccount: { select: { id: true, name: true, type: true, currency: true } }, destinationAccount: { select: { id: true, name: true, type: true, currency: true } },
      createdBy: { select: { id: true, email: true, fullName: true } }, kassaDesk: { include: { firm: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return rows.filter((tx) => getTransactionBusinessDateKey(tx) === dayKey);
}

export function resolveKassaTransactionFlow(tx: {
  type: string;
  direction?: string | null;
  firmId: string;
  payerFirmId?: string | null;
  receiverFirmId?: string | null;
  metadata?: unknown;
}): 'IN' | 'OUT' | null {
  if (tx.type === 'ADJUSTMENT' && tx.direction === 'KASSA_IN') return 'IN';
  if (tx.type === 'ADJUSTMENT' && tx.direction === 'KASSA_OUT') return 'OUT';
  if (tx.type !== 'PAYMENT') return null;

  const metadata = tx.metadata && typeof tx.metadata === 'object' && !Array.isArray(tx.metadata)
    ? tx.metadata as Record<string, unknown>
    : {};
  const explicitFlow = String(metadata.cashFlow || '').toUpperCase();
  if (explicitFlow === 'IN' || explicitFlow === 'OUT') return explicitFlow;
  if (tx.payerFirmId === tx.firmId && tx.receiverFirmId !== tx.firmId) return 'OUT';
  if (tx.receiverFirmId === tx.firmId && tx.payerFirmId !== tx.firmId) return 'IN';
  return 'IN';
}

function computeDayTotals(transactions: Awaited<ReturnType<typeof loadDayTransactions>>) {
  let cashTotal = 0;
  let cashInTotal = 0;
  let cashOutTotal = 0;
  let cardTotal = 0;
  let cardInTotal = 0;
  let cardOutTotal = 0;
  let paymentCount = 0;
  let saleTotal = 0;
  let payableTotal = 0;
  const byCurrency: Record<string, {
    cashTotal: number;
    cashInTotal: number;
    cashOutTotal: number;
    cardTotal: number;
    cardInTotal: number;
    cardOutTotal: number;
    dailyIncomeTotal: number;
    dailyExpenseTotal: number;
    paymentCount: number;
    saleTotal: number;
    payableTotal: number;
    transactionCount: number;
  }> = {};

  const currencyRow = (currency: string) => {
    const key = normalizeCurrency(currency) || 'UZS';
    byCurrency[key] ||= {
      cashTotal: 0,
      cashInTotal: 0,
      cashOutTotal: 0,
      cardTotal: 0,
      cardInTotal: 0,
      cardOutTotal: 0,
      dailyIncomeTotal: 0,
      dailyExpenseTotal: 0,
      paymentCount: 0,
      saleTotal: 0,
      payableTotal: 0,
      transactionCount: 0,
    };
    return byCurrency[key];
  };

  for (const tx of transactions) {
    const base = sumToNumber(tx.baseAmount);
    const original = sumToNumber(tx.originalAmount);
    const method = String(tx.paymentMethod || '').toLowerCase();
    const row = currencyRow(tx.currency);
    row.transactionCount += 1;
    if (tx.type === 'PAYMENT') {
      const outgoing = resolveKassaTransactionFlow(tx) === 'OUT';
      paymentCount += 1;
      row.paymentCount += 1;
      if (method === 'cash') {
        cashTotal += outgoing ? -base : base;
        row.cashTotal += outgoing ? -original : original;
        if (outgoing) {
          cashOutTotal += base;
          row.cashOutTotal += original;
        } else {
          cashInTotal += base;
          row.cashInTotal += original;
        }
      }
      else if (method === 'card') {
        cardTotal += outgoing ? -base : base;
        row.cardTotal += outgoing ? -original : original;
        if (outgoing) {
          cardOutTotal += base;
          row.cardOutTotal += original;
        } else {
          cardInTotal += base;
          row.cardInTotal += original;
        }
      }
    } else if (tx.type === 'ADJUSTMENT' && tx.direction === 'KASSA_IN') {
      if (method === 'card') {
        cardTotal += base;
        cardInTotal += base;
        row.cardTotal += original;
        row.cardInTotal += original;
      } else {
        cashTotal += base;
        cashInTotal += base;
        row.cashTotal += original;
        row.cashInTotal += original;
      }
    } else if (tx.type === 'ADJUSTMENT' && tx.direction === 'KASSA_OUT') {
      if (method === 'card') {
        cardTotal -= base;
        cardOutTotal += base;
        row.cardTotal -= original;
        row.cardOutTotal += original;
      } else {
        cashTotal -= base;
        cashOutTotal += base;
        row.cashTotal -= original;
        row.cashOutTotal += original;
      }
    } else if (tx.type === 'SALE') {
      saleTotal += base;
      row.saleTotal += original;
    } else if (isPayableDebtType(tx.type)) {
      payableTotal += base;
      row.payableTotal += original;
    }
  }

  for (const row of Object.values(byCurrency)) {
    row.dailyIncomeTotal = row.cashInTotal + row.cardInTotal;
    row.dailyExpenseTotal = row.cashOutTotal + row.cardOutTotal;
  }

  return {
    cashTotal,
    cashInTotal,
    cashOutTotal,
    cardTotal,
    cardInTotal,
    cardOutTotal,
    dailyIncomeTotal: cashInTotal + cardInTotal,
    dailyExpenseTotal: cashOutTotal + cardOutTotal,
    paymentCount,
    saleTotal,
    payableTotal,
    transactionCount: transactions.length,
    byCurrency,
  };
}

function normalizeCurrency(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

function isPlatformAdmin(authUser: AuthUser) {
  const role = normalizeRole(authUser.role);
  return role === 'SUPERADMIN' || role === 'ADMIN';
}

function isFirmAdmin(authUser: AuthUser) {
  return normalizeRole(authUser.role) === 'FIRM' && normalizeFirmUserRole(authUser.firmRole) === 'FIRM_ADMIN';
}

function decimal(value: unknown, field: string) {
  try {
    const parsed = new Prisma.Decimal(String(value ?? ''));
    if (parsed.isFinite() && parsed.gt(0)) return parsed;
  } catch {}
  throw new ServiceError(`${field} musbat summa bo‘lishi kerak`);
}

export function calculateTransferBalance(account: { id: string; currency: string; openingBalance: unknown }, transactions: Array<{ sourceAccountId: string | null; destinationAccountId: string | null; originalAmount: unknown; destinationAmount?: unknown; currency: string; destinationCurrency?: string | null }>) {
  let balance = new Prisma.Decimal(String(account.openingBalance || '0'));
  for (const tx of transactions) {
    if (tx.sourceAccountId === account.id && tx.currency === account.currency) balance = balance.sub(String(tx.originalAmount || '0'));
    if (tx.destinationAccountId === account.id && (tx.destinationCurrency || tx.currency) === account.currency) balance = balance.add(String(tx.destinationAmount ?? tx.originalAmount ?? '0'));
  }
  return balance;
}

type TransferOperation = 'CASH_TO_CARD' | 'CARD_TO_CASH' | 'CASH_DESK_TO_CASH_DESK' | 'CURRENCY_EXCHANGE';

export function assertTransferCurrencyPair(operationType: TransferOperation, currency: string, destinationCurrency: string) {
  if (operationType === 'CURRENCY_EXCHANGE') {
    if (!((currency === 'USD' && destinationCurrency === 'UZS') || (currency === 'UZS' && destinationCurrency === 'USD'))) {
      throw new ServiceError('VASH faqat USD ↔ UZS ayirboshlash uchun');
    }
    return;
  }
  if (destinationCurrency !== currency) throw new ServiceError('Turli valyuta uchun VASH tanlang');
}

function transferAuditAction(operationType: TransferOperation) {
  if (operationType === 'CASH_TO_CARD') return 'CASH_TO_CARD_TRANSFER';
  if (operationType === 'CARD_TO_CASH') return 'CARD_TO_CASH_TRANSFER';
  if (operationType === 'CASH_DESK_TO_CASH_DESK') return 'CASH_DESK_TRANSFER';
  return 'CURRENCY_EXCHANGE';
}

function serializePaymentCard(card: any) {
  return {
    id: card.id,
    ownerName: card.ownerName,
    cardNumber: maskCardNumber(card.cardNumber),
    currency: card.currency,
    openingBalance: String(card.openingBalance ?? 0),
    firmId: card.firmId,
    cashDeskId: card.cashDeskId,
    firm: card.firm ?? null,
    status: card.status,
    createdByUserId: card.createdByUserId,
    createdAt: card.createdAt instanceof Date ? card.createdAt.toISOString() : card.createdAt,
  };
}

export function canDeletePaymentCard(authUser: AuthUser, card: { firmId?: string | null; createdByUserId?: string | null }) {
  const actorUserId = authUser.userId ? String(authUser.userId) : '';
  if (normalizeRole(authUser.role) === 'SUPERADMIN') return true;
  if (actorUserId && card.createdByUserId === actorUserId) return true;
  return isFirmAdmin(authUser) && Boolean(authUser.firmId) && card.firmId === authUser.firmId;
}

function emptyCurrencyTotals() {
  return { in: 0, out: 0, net: 0 };
}

function addCurrencyAmount(target: Record<string, { in: number; out: number; net: number }>, currencyValue: unknown, amount: number) {
  const currency = normalizeCurrency(currencyValue) || 'UZS';
  target[currency] ||= emptyCurrencyTotals();
  if (amount >= 0) target[currency].in += amount;
  else target[currency].out += Math.abs(amount);
  target[currency].net += amount;
}

function maskCardNumber(value: unknown) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return raw ? '****' : '';
  const last4 = digits.slice(-4);
  const first4 = digits.length >= 8 ? digits.slice(0, 4) : '';
  return first4 ? `${first4} **** **** ${last4}` : `**** ${last4}`;
}

export function resolveMonitoringFirmScope(role: unknown, authFirmId: unknown, accessible: string[] | undefined, requestedFirmId?: unknown) {
  const firmId = typeof requestedFirmId === 'string' ? requestedFirmId.trim() : '';
  if (!firmId) return accessible;
  if (normalizeRole(role) === 'FIRM' && firmId !== String(authFirmId || '')) throw new ServiceError('Forbidden', 403);
  if (accessible && !accessible.includes(firmId)) throw new ServiceError('Forbidden', 403);
  return [firmId];
}

export function resolveKassaFirmScope(role: unknown, authFirmId: unknown, accessible: string[] | undefined) {
  if (normalizeRole(role) !== 'FIRM') return accessible;
  const firmId = String(authFirmId || '').trim();
  return firmId ? [firmId] : [];
}

async function kassaFirmScope(authUser: AuthUser) {
  return resolveKassaFirmScope(authUser.role, authUser.firmId, await getAccessibleFirmIds(authUser));
}

async function monitoringFirmScope(authUser: AuthUser, requestedFirmId?: unknown) {
  return resolveMonitoringFirmScope(authUser.role, authUser.firmId, await kassaFirmScope(authUser), requestedFirmId);
}

export async function listKassaDesksService(authUser: AuthUser, input: { firmId?: unknown } = {}) {
  const firmScopeIds = await monitoringFirmScope(authUser, input.firmId);
  const boundDeskId = await getBoundKassaDeskId(authUser);
  const desks = await loadKassaDesks(firmScopeIds);
  if (isKassirUser(authUser)) return (boundDeskId ? desks.filter((desk) => desk.id === boundDeskId) : []).map(serializeKassaDesk);
  return desks.map(serializeKassaDesk);
}

export async function createKassaDeskService(
  authUser: AuthUser,
  input: { firmId?: unknown; name?: unknown; code?: unknown; status?: unknown; assignedCashierUserId?: unknown },
) {
  const role = normalizeRole(authUser.role);
  const actorUserId = authUser.userId ? String(authUser.userId) : '';
  const firmId = typeof input.firmId === 'string' ? input.firmId.trim() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  const status = typeof input.status === 'string' && input.status.trim() ? input.status.trim().toUpperCase() : 'ACTIVE';
  const assignedCashierUserId = typeof input.assignedCashierUserId === 'string' ? input.assignedCashierUserId.trim() : '';

  if (!actorUserId) {
    throw new ServiceError('Unauthorized', 401);
  }
  if (!['SUPERADMIN', 'ADMIN', 'FIRM'].includes(role)) {
    throw new ServiceError('Forbidden', 403);
  }
  if (role === 'FIRM' && !isFirmAdmin(authUser)) throw new ServiceError('Forbidden', 403);
  if (!name) {
    throw new ServiceError('Kassa desk name is required');
  }

  const accessibleFirmIds = await kassaFirmScope(authUser);
  const resolvedFirmId = role === 'FIRM' ? (authUser.firmId ? String(authUser.firmId) : '') : firmId;
  if (!resolvedFirmId) {
    throw new ServiceError('Firm id is required');
  }
  if (accessibleFirmIds && !accessibleFirmIds.includes(resolvedFirmId)) {
    throw new ServiceError('Forbidden', 403);
  }
  if (!['ACTIVE', 'INACTIVE'].includes(status)) {
    throw new ServiceError('Invalid kassa desk status');
  }
  if (assignedCashierUserId) {
    const cashier = await prisma.user.findFirst({ where: { id: assignedCashierUserId, firmId: resolvedFirmId, role: 'FIRM', status: 'ACTIVE', deletedAt: null }, select: { id: true } });
    if (!cashier) throw new ServiceError('Cashier must be an active user of this firm');
  }

  const duplicate = await prisma.kassaDesk.findFirst({
    where: {
      firmId: resolvedFirmId,
      name: { equals: name, mode: 'insensitive' },
      status: { not: 'DELETED' },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new ServiceError('An active kassa desk with this name already exists');
  }

  const created = await prisma.kassaDesk.create({
    data: {
      firmId: resolvedFirmId,
      name,
      code: code || null,
      status,
      createdByUserId: actorUserId,
      assignedCashierUserId: assignedCashierUserId || null,
    },
    include: {
      firm: { select: { id: true, name: true } },
      createdBy: { select: { id: true, email: true } },
      assignedCashier: { select: { id: true, email: true, fullName: true, status: true } },
    },
  });

  return serializeKassaDesk(created);
}

export async function updateKassaDeskService(authUser: AuthUser, id: string, input: { name?: unknown; status?: unknown; assignedCashierUserId?: unknown }) {
  if (!isPlatformAdmin(authUser) && !isFirmAdmin(authUser)) throw new ServiceError('Forbidden', 403);
  const existing = await prisma.kassaDesk.findUnique({ where: { id }, select: { id: true, firmId: true, name: true, status: true, assignedCashierUserId: true, deletedAt: true } });
  if (!existing || existing.deletedAt) throw new ServiceError('Kassa desk not found', 404);
  const scope = await monitoringFirmScope(authUser);
  if (scope && !scope.includes(existing.firmId)) throw new ServiceError('Forbidden', 403);
  const data: Prisma.KassaDeskUpdateInput = {};
  if (input.name !== undefined) {
    const name = String(input.name || '').trim();
    if (!name) throw new ServiceError('Kassa desk name is required');
    data.name = name;
  }
  if (input.status !== undefined) {
    const status = String(input.status || '').toUpperCase();
    if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new ServiceError('Invalid kassa desk status');
    data.status = status;
  }
  if (input.assignedCashierUserId !== undefined) {
    const userId = String(input.assignedCashierUserId || '').trim();
    if (userId) {
      const cashier = await prisma.user.findFirst({ where: { id: userId, firmId: existing.firmId, role: 'FIRM', status: 'ACTIVE', deletedAt: null }, select: { id: true } });
      if (!cashier) throw new ServiceError('Cashier must be an active user of this firm');
      data.assignedCashier = { connect: { id: userId } };
    } else data.assignedCashier = { disconnect: true };
  }
  const updated = await prisma.kassaDesk.update({ where: { id }, data, include: { firm: { select: { id: true, name: true } }, createdBy: { select: { id: true, email: true } }, assignedCashier: { select: { id: true, email: true, fullName: true, status: true } } } });
  return { before: existing, desk: serializeKassaDesk(updated) };
}

function cardFlowAmount(tx: { type: string; direction: string | null; firmId: string; payerFirmId: string | null; receiverFirmId: string | null; originalAmount: unknown; metadata?: unknown }) {
  const original = sumToNumber(tx.originalAmount as any);
  const flow = resolveKassaTransactionFlow(tx);
  if (flow === 'IN') return original;
  if (flow === 'OUT') return -original;
  return 0;
}

async function loadPaymentCards(firmScopeIds?: string[]) {
  return prisma.paymentCard.findMany({
    where: {
      deletedAt: null,
      ...(firmScopeIds ? { OR: [{ firmId: { in: firmScopeIds } }, { firmId: null }] } : {}),
    },
    include: { firm: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: 'desc' }],
  });
}

async function loadCardSummaries(
  businessDate: Date,
  dayTransactions: Awaited<ReturnType<typeof loadDayTransactions>>,
  firmScopeIds?: string[],
  kassaDeskId?: string,
) {
  if (kassaDeskId === '__unassigned_kassir__') return [];
  const cards = (await loadPaymentCards(firmScopeIds)).filter((card) => !kassaDeskId || !card.cashDeskId || card.cashDeskId === kassaDeskId);
  const cardIds = cards.map((card) => card.id);
  const allCardTransactions = cardIds.length
    ? await prisma.transaction.findMany({
        where: visibleTransactionWhere({
          paymentCardId: { in: cardIds },
          paymentMethod: 'card',
          ...(firmScopeIds ? { firmId: { in: firmScopeIds } } : {}),
        }),
        select: {
          paymentCardId: true,
          type: true,
          direction: true,
          firmId: true,
          payerFirmId: true,
          receiverFirmId: true,
          originalAmount: true,
          currency: true,
          metadata: true,
          createdAt: true,
        },
      })
    : [];

  const dayKey = formatBusinessDateKey(businessDate);
  const daily = new Map<string, Record<string, { in: number; out: number; net: number }>>();
  for (const tx of dayTransactions) {
    if (!tx.paymentCardId || String(tx.paymentMethod || '').toLowerCase() !== 'card') continue;
    const amount = cardFlowAmount(tx);
    const row = daily.get(tx.paymentCardId) || {};
    addCurrencyAmount(row, tx.currency, amount);
    daily.set(tx.paymentCardId, row);
  }

  const balances = new Map<string, Record<string, { in: number; out: number; net: number }>>();
  for (const tx of allCardTransactions) {
    if (!tx.paymentCardId) continue;
    if (getTransactionBusinessDateKey(tx) > dayKey) continue;
    const row = balances.get(tx.paymentCardId) || {};
    addCurrencyAmount(row, tx.currency, cardFlowAmount(tx));
    balances.set(tx.paymentCardId, row);
  }

  return cards.map((card) => {
    const primaryCurrency = normalizeCurrency(card.currency) || 'UZS';
    const dailyByCurrency = daily.get(card.id) || {};
    const balanceTotals = balances.get(card.id) || {};
    balanceTotals[primaryCurrency] ||= emptyCurrencyTotals();
    const opening = sumToNumber(card.openingBalance);
    balanceTotals[primaryCurrency].in += opening;
    balanceTotals[primaryCurrency].net += opening;
    const balanceByCurrency = Object.fromEntries(
      Object.entries(balanceTotals).map(([currency, totals]) => [currency, totals.net]),
    );
    const primaryDaily = dailyByCurrency[primaryCurrency] || emptyCurrencyTotals();
    return {
      ...serializePaymentCard(card),
      day: dayKey,
      dailyIn: primaryDaily.in,
      dailyOut: primaryDaily.out,
      dailyNet: primaryDaily.net,
      dailyByCurrency,
      balance: balanceByCurrency[primaryCurrency] || 0,
      balanceByCurrency,
    };
  });
}

export async function getKassaDayService(authUser: AuthUser, rawDate: unknown, input: { kassaDeskId?: unknown; firmId?: unknown } = {}) {
  const role = normalizeRole(authUser.role);
  const businessDate = parseBusinessDate(String(rawDate || ''));
  if (!businessDate) {
    throw new ServiceError('Invalid or missing date (YYYY-MM-DD)');
  }

  const firmScopeIds = await monitoringFirmScope(authUser, input.firmId);
  if (role === 'FIRM' && !firmScopeIds?.length) {
    throw new ServiceError('Firm account is missing firmId');
  }
  const boundDeskId = await getBoundKassaDeskId(authUser);
  const effectiveDeskId = isKassirUser(authUser)
    ? (boundDeskId || '__unassigned_kassir__')
    : input.kassaDeskId;
  const kassaDeskFilter = effectiveDeskId === '__unassigned_kassir__' ? null : await resolveKassaDeskFilter(effectiveDeskId, firmScopeIds);

  const day = normalizeBusinessDate(businessDate);
  const [kassa, transactions] = await Promise.all([
    findKassaForDate(day, kassaDeskFilter?.id),
    loadDayTransactions(day, firmScopeIds, effectiveDeskId === '__unassigned_kassir__' ? effectiveDeskId : kassaDeskFilter?.id),
  ]);

  const totals = computeDayTotals(transactions);
  const paymentCards = await loadCardSummaries(
    day,
    transactions,
    firmScopeIds,
    effectiveDeskId === '__unassigned_kassir__' ? effectiveDeskId : kassaDeskFilter?.id,
  );
  const scopedDesks = await loadKassaDesks(firmScopeIds);
  const kassaDesks = isKassirUser(authUser) ? scopedDesks.filter((desk) => desk.id === boundDeskId) : scopedDesks;
  const deskSessions = kassaDesks.length ? await prisma.kassaDay.findMany({ where: { businessDate: day, cashDeskId: { in: kassaDesks.map((desk) => desk.id) } }, include: { openedBy: { select: { id: true, email: true } }, closedBy: { select: { id: true, email: true } } } }) : [];
  const deskMonitoring = kassaDesks.map((desk) => {
    const session = deskSessions.find((row) => row.cashDeskId === desk.id) || null;
    const deskTransactions = transactions.filter((tx) => tx.kassaDeskId === desk.id);
    const deskTotals = computeDayTotals(deskTransactions);
    const cashByCurrency = calculateExpectedCashByCurrency(session || {}, deskTotals.byCurrency);
    return {
      ...serializeKassaDesk(desk),
      session: session ? serializeKassa(session as any) : null,
      status: session?.status || 'NOT_OPEN',
      totals: deskTotals,
      cashBalanceByCurrency: cashByCurrency,
      lastOperationAt: deskTransactions[0]?.createdAt?.toISOString() || null,
    };
  });
  const status = resolveKassaDayStatus(Boolean(kassaDeskFilter), kassa?.status, deskSessions.map((row) => row.status));
  const previous = kassaDeskFilter ? await findPreviousKassaRemainders(prisma, kassaDeskFilter.firmId, kassaDeskFilter.id, day) : null;
  const previousSession = previous?.UZS.session || previous?.USD.session || null;
  const suggestedOpeningBalance = previous?.UZS.balance ?? null;
  const suggestedOpeningBalanceUsd = previous?.USD.balance ?? null;
  const expectedCashByCurrency = kassa ? calculateExpectedCashByCurrency(kassa, totals.byCurrency) : null;
  const expectedCash = expectedCashByCurrency?.UZS ?? null;
  const cardBalanceTotal = paymentCards.reduce((sum, card) => sum + card.balance, 0);
  const cardBalanceByCurrency = paymentCards.reduce<Record<string, number>>((acc, card) => {
    const balances = (card as any).balanceByCurrency || {};
    for (const [currency, amount] of Object.entries(balances)) {
      acc[currency] = (acc[currency] || 0) + Number(amount || 0);
    }
    return acc;
  }, {});

  return {
    businessDate: formatBusinessDateKey(day),
    status,
    kassa: kassa ? serializeKassa(kassa) : null,
    totals: { ...totals, expectedCash, expectedCashByCurrency, cardBalanceTotal, cardBalanceByCurrency },
    paymentCards,
    kassaDesks: kassaDesks.map(serializeKassaDesk),
    deskMonitoring,
    filters: {
      kassaDeskId: kassaDeskFilter?.id ?? null,
    },
    openingSuggestion: previousSession ? {
      previousSessionId: previousSession.id,
      previousClosedAt: previousSession.closedAt?.toISOString() || null,
      previousBusinessDate: formatBusinessDateKey(previousSession.businessDate),
      previousBusinessDates: {
        UZS: previous?.UZS.session ? formatBusinessDateKey(previous.UZS.session.businessDate) : null,
        USD: previous?.USD.session ? formatBusinessDateKey(previous.USD.session.businessDate) : null,
      },
      openingBalance: suggestedOpeningBalance != null ? String(suggestedOpeningBalance) : null,
      openingBalances: { UZS: suggestedOpeningBalance != null ? String(suggestedOpeningBalance) : '0', USD: suggestedOpeningBalanceUsd != null ? String(suggestedOpeningBalanceUsd) : '0' },
      currency: 'UZS',
      firstSession: false,
    } : { previousSessionId: null, previousClosedAt: null, previousBusinessDate: null, openingBalance: '0', openingBalances: { UZS: '0', USD: '0' }, currency: 'UZS', firstSession: true },
    permissions: {
      canOperateKassa: await canOperateKassa(authUser),
    },
    transactions: transactions.map((tx) => {
      const flow = resolveKassaTransactionFlow(tx);
      const display = kassaTransactionDisplay(tx, flow);
      const bankAccount = tx.paymentMethod === 'bank' ? (flow === 'OUT' ? tx.sourceAccount : tx.destinationAccount) : null;
      return {
        id: tx.id, type: tx.type, transactionType: flow === 'IN' ? 'INCOME' : flow === 'OUT' ? 'EXPENSE' : 'INTERNAL_TRANSFER',
        firmId: tx.firmId, firm: tx.firm, payerFirmId: tx.payerFirmId, receiverFirmId: tx.receiverFirmId,
        counterpartyType: display.counterpartyType, counterpartyId: display.counterpartyId, counterpartyName: display.counterpartyName, directionLabel: display.directionLabel,
        kassaDeskId: tx.kassaDeskId, cashDeskId: tx.kassaDeskId, cashDeskName: tx.kassaDesk?.name || null, kassaDesk: tx.kassaDesk,
        flightId: tx.flightId, flight: tx.flight, flightDisplayName: tx.flight ? flightDisplayName(tx.flight) : null,
        originalAmount: String(tx.originalAmount), currency: tx.currency, exchangeRate: String(tx.exchangeRate), baseAmount: String(tx.baseAmount),
        destinationAmount: tx.destinationAmount ? String(tx.destinationAmount) : null, destinationCurrency: tx.destinationCurrency || null,
        paymentMethod: tx.paymentMethod, paymentCardId: tx.paymentCardId, cardId: tx.paymentCardId,
        cardDisplayName: display.cardDisplayName, cardMaskedNumber: display.cardMaskedNumber,
        paymentCard: tx.paymentCardId ? { id: tx.paymentCardId, displayName: display.cardDisplayName, maskedNumber: display.cardMaskedNumber, currency: tx.paymentCard?.currency, status: tx.paymentCard?.status } : null,
        bankAccountId: bankAccount?.id || null, bankAccountDisplayName: bankAccount ? `${bankAccount.name} — Bank` : null,
        direction: tx.direction, sourceMode: tx.sourceMode, operationType: tx.operationType, sourceAccountName: tx.sourceAccount?.name || null, destinationAccountName: tx.destinationAccount?.name || null, subjectType: tx.subjectType, subjectId: tx.subjectId,
        allocationId: tx.subjectType === 'TICKET_ALLOCATION' ? tx.subjectId : null,
        operationPurpose: tx.subjectType === 'TICKET_ALLOCATION' ? 'TICKET_ALLOCATION' : tx.subjectType === 'TOUR_PACKAGE' ? 'TOUR_PACKAGE' : tx.flightId ? 'FLIGHT' : 'GENERAL',
        tourPackageId: tx.subjectType === 'TOUR_PACKAGE' ? tx.subjectId : null,
        tourPackageDisplayName: tx.metadata && typeof tx.metadata === 'object' && !Array.isArray(tx.metadata) ? String((tx.metadata as Record<string, unknown>).tourPackageName || '') || null : null,
        note: display.note, createdByUserId: tx.createdByUserId, createdByDisplayName: tx.createdBy?.fullName || tx.createdBy?.email || null,
        createdBy: tx.createdBy, metadata: tx.metadata, createdAt: tx.createdAt.toISOString(), updatedAt: tx.updatedAt.toISOString(),
      };
    }),
    duePayments: [],
  };
}

export async function listPaymentCardsService(authUser: AuthUser) {
  const firmScopeIds = await kassaFirmScope(authUser);
  const boundDeskId = await getBoundKassaDeskId(authUser);
  return loadCardSummaries(new Date(), [], firmScopeIds, isKassirUser(authUser) ? (boundDeskId || '__unassigned_kassir__') : undefined);
}

export async function createPaymentCardService(authUser: AuthUser, input: { ownerName?: unknown; cardNumber?: unknown; currency?: unknown; firmId?: unknown; cashDeskId?: unknown; openingBalance?: unknown }) {
  const role = normalizeRole(authUser.role);
  const ownerName = String(input.ownerName || '').trim();
  const cardNumber = String(input.cardNumber || '').trim();
  const currency = normalizeCurrency(input.currency || 'UZS');
  const cashDeskId = typeof input.cashDeskId === 'string' ? input.cashDeskId.trim() : '';
  let firmId = typeof input.firmId === 'string' && input.firmId.trim() ? input.firmId.trim() : undefined;
  let openingBalance = new Prisma.Decimal(0);

  if (!isPlatformAdmin(authUser) && !isFirmAdmin(authUser)) {
    throw new ServiceError('Forbidden', 403);
  }
  if (role === 'FIRM') {
    if (!authUser.firmId) throw new ServiceError('Firm account is missing firmId', 400);
    if (firmId && firmId !== authUser.firmId) throw new ServiceError('Forbidden', 403);
    firmId = authUser.firmId;
  }
  if (!ownerName || !cardNumber || !currency) {
    throw new ServiceError('Card owner, number and currency are required');
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ServiceError('Invalid card currency');
  }
  if (input.openingBalance != null && String(input.openingBalance).trim() !== '') {
    openingBalance = new Prisma.Decimal(String(input.openingBalance));
    if (!openingBalance.isFinite() || openingBalance.lt(0)) {
      throw new ServiceError('Opening balance must be zero or greater');
    }
  }
  const accessibleFirmIds = await kassaFirmScope(authUser);
  if (firmId && accessibleFirmIds && !accessibleFirmIds.includes(firmId)) {
    throw new ServiceError('Forbidden', 403);
  }
  if (cashDeskId) {
    const desk = await resolveKassaDeskFilter(cashDeskId, accessibleFirmIds);
    if (!desk || (firmId && desk.firmId !== firmId)) throw new ServiceError('Forbidden', 403);
    firmId ||= desk.firmId;
  }

  const created = await prisma.paymentCard.create({
    data: {
      ownerName,
      cardNumber: maskCardNumber(cardNumber),
      currency,
      openingBalance: openingBalance.toDecimalPlaces(4),
      firmId,
      cashDeskId: cashDeskId || null,
      createdByUserId: authUser.userId ? String(authUser.userId) : undefined,
    },
    include: { firm: { select: { id: true, name: true } } },
  });

  return serializePaymentCard(created);
}

export async function updatePaymentCardService(
  authUser: AuthUser,
  id: string,
  input: { ownerName?: unknown; cardNumber?: unknown; currency?: unknown; firmId?: unknown; openingBalance?: unknown; status?: unknown },
) {
  const role = normalizeRole(authUser.role);
  if (!isPlatformAdmin(authUser) && !isFirmAdmin(authUser)) {
    throw new ServiceError('Forbidden', 403);
  }
  const existing = await prisma.paymentCard.findUnique({
    where: { id },
    select: { id: true, firmId: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) {
    throw new ServiceError('Payment card not found', 404);
  }
  if (role === 'FIRM') {
    if (!authUser.firmId) throw new ServiceError('Firm account is missing firmId', 400);
    if (existing.firmId !== authUser.firmId) throw new ServiceError('Forbidden', 403);
  }

  const accessibleFirmIds = await kassaFirmScope(authUser);
  if (accessibleFirmIds && existing.firmId && !accessibleFirmIds.includes(existing.firmId)) {
    throw new ServiceError('Forbidden', 403);
  }

  const data: Prisma.PaymentCardUpdateInput = {};
  if (input.ownerName != null) {
    const ownerName = String(input.ownerName || '').trim();
    if (!ownerName) throw new ServiceError('Card owner is required');
    data.ownerName = ownerName;
  }
  if (input.cardNumber != null) {
    const cardNumber = String(input.cardNumber || '').trim();
    if (!cardNumber) throw new ServiceError('Card number is required');
    data.cardNumber = maskCardNumber(cardNumber);
  }
  if (input.currency != null) {
    const currency = normalizeCurrency(input.currency);
    if (!/^[A-Z]{3}$/.test(currency)) throw new ServiceError('Invalid card currency');
    data.currency = currency;
  }
  if (input.openingBalance != null) {
    const openingBalance = new Prisma.Decimal(String(input.openingBalance || '0'));
    if (!openingBalance.isFinite()) throw new ServiceError('Opening balance is invalid');
    data.openingBalance = openingBalance.toDecimalPlaces(4);
  }
  if (input.status != null) {
    const status = String(input.status || '').trim().toUpperCase();
    if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new ServiceError('Invalid card status');
    data.status = status;
  }
  if (input.firmId !== undefined) {
    const firmId = typeof input.firmId === 'string' && input.firmId.trim() ? input.firmId.trim() : null;
    if (role === 'FIRM' && firmId !== authUser.firmId) throw new ServiceError('Forbidden', 403);
    if (firmId && accessibleFirmIds && !accessibleFirmIds.includes(firmId)) throw new ServiceError('Forbidden', 403);
    data.firm = firmId ? { connect: { id: firmId } } : { disconnect: true };
  }

  const updated = await prisma.paymentCard.update({
    where: { id },
    data,
    include: { firm: { select: { id: true, name: true } } },
  });

  return serializePaymentCard(updated);
}

export async function deletePaymentCardService(authUser: AuthUser, id: string, input: { reason?: unknown } = {}) {
  const actorUserId = authUser.userId ? String(authUser.userId) : '';
  if (!actorUserId) {
    throw new ServiceError('Unauthorized', 401);
  }

  const existing = await prisma.paymentCard.findUnique({
    where: { id },
    select: { id: true, ownerName: true, firmId: true, createdByUserId: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) {
    throw new ServiceError('Payment card not found', 404);
  }

  if (!canDeletePaymentCard(authUser, existing)) throw new ServiceError('Only the card creator, superadmin, or the owning firm admin can delete this card', 403);

  const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim().slice(0, 500) : null;
  if (!reason) throw new ServiceError('Delete reason is required');
  const updated = await prisma.paymentCard.update({
    where: { id },
    data: {
      status: 'DELETED',
      deletedAt: new Date(),
      deletedByUserId: actorUserId,
      deleteReason: reason,
    },
    include: { firm: { select: { id: true, name: true } } },
  });

  return serializePaymentCard(updated);
}

export async function createKassaTransferService(authUser: AuthUser, input: {
  operationType?: unknown;
  sourceCashDeskId?: unknown;
  destinationCashDeskId?: unknown;
  sourceCardId?: unknown;
  destinationCardId?: unknown;
  sourceAccountId?: unknown;
  destinationAccountId?: unknown;
  amount?: unknown;
  currency?: unknown;
  destinationAmount?: unknown;
  destinationCurrency?: unknown;
  feeAmount?: unknown;
  exchangeRate?: unknown;
  operationDate?: unknown;
  note?: unknown;
  reason?: unknown;
}) {
  await assertCanOperateKassa(authUser);
  const firmScopeIds = await kassaFirmScope(authUser);
  const operationType = String(input.operationType || '').trim().toUpperCase() as TransferOperation;
  if (!['CASH_TO_CARD', 'CARD_TO_CASH', 'CASH_DESK_TO_CASH_DESK', 'CURRENCY_EXCHANGE'].includes(operationType)) throw new ServiceError('Transfer turi noto‘g‘ri');
  const amount = decimal(input.amount, 'Summa').toDecimalPlaces(4);
  const currency = normalizeCurrency(input.currency) || 'UZS';
  if (!['UZS', 'USD'].includes(currency)) throw new ServiceError('Valyuta UZS yoki USD bo‘lishi kerak');
  const destinationAmount = input.destinationAmount != null && String(input.destinationAmount).trim() !== '' ? decimal(input.destinationAmount, 'Qabul summa').toDecimalPlaces(4) : amount;
  const destinationCurrency = normalizeCurrency(input.destinationCurrency) || currency;
  if (!['UZS', 'USD'].includes(destinationCurrency)) throw new ServiceError('Qabul valyutasi UZS yoki USD bo‘lishi kerak');
  assertTransferCurrencyPair(operationType, currency, destinationCurrency);
  const feeAmount = input.feeAmount != null && String(input.feeAmount).trim() !== '' ? decimal(input.feeAmount, 'Komissiya').toDecimalPlaces(4) : new Prisma.Decimal(0);
  const operationDate = input.operationDate ? new Date(String(input.operationDate)) : new Date();
  if (Number.isNaN(operationDate.getTime())) throw new ServiceError('Sana noto‘g‘ri');

  const sourceDesk = input.sourceCashDeskId ? await resolveKassaDeskFilter(input.sourceCashDeskId, firmScopeIds) : null;
  const destinationDesk = input.destinationCashDeskId ? await resolveKassaDeskFilter(input.destinationCashDeskId, firmScopeIds) : null;
  const sourceCard = input.sourceCardId ? await prisma.paymentCard.findFirst({ where: { id: String(input.sourceCardId), status: 'ACTIVE', deletedAt: null, ...(firmScopeIds ? { firmId: { in: firmScopeIds } } : {}) } }) : null;
  const destinationCard = input.destinationCardId ? await prisma.paymentCard.findFirst({ where: { id: String(input.destinationCardId), status: 'ACTIVE', deletedAt: null, ...(firmScopeIds ? { firmId: { in: firmScopeIds } } : {}) } }) : null;
  if (input.sourceCardId && !sourceCard) throw new ServiceError('Manba karta topilmadi', 404);
  if (input.destinationCardId && !destinationCard) throw new ServiceError('Qabul qiluvchi karta topilmadi', 404);

  const sourceAccount = sourceDesk
    ? await ensureFinancialAccount({ firmId: sourceDesk.firmId, currency, type: FinancialAccountType.CASH, kassaDeskId: sourceDesk.id, createdByUserId: authUser.userId })
    : sourceCard
      ? await ensureFinancialAccount({ firmId: sourceCard.firmId!, currency, type: FinancialAccountType.CARD, paymentCardId: sourceCard.id, createdByUserId: authUser.userId })
      : input.sourceAccountId ? await prisma.financialAccount.findFirst({ where: { id: String(input.sourceAccountId), currency, status: 'ACTIVE', deletedAt: null, ...(firmScopeIds ? { firmId: { in: firmScopeIds } } : {}) } }) : null;
  const destinationAccount = destinationDesk
    ? await ensureFinancialAccount({ firmId: destinationDesk.firmId, currency: destinationCurrency, type: FinancialAccountType.CASH, kassaDeskId: destinationDesk.id, createdByUserId: authUser.userId })
    : destinationCard
      ? await ensureFinancialAccount({ firmId: destinationCard.firmId!, currency: destinationCurrency, type: FinancialAccountType.CARD, paymentCardId: destinationCard.id, createdByUserId: authUser.userId })
      : input.destinationAccountId ? await prisma.financialAccount.findFirst({ where: { id: String(input.destinationAccountId), currency: destinationCurrency, status: 'ACTIVE', deletedAt: null, ...(firmScopeIds ? { firmId: { in: firmScopeIds } } : {}) } }) : null;
  if (!sourceAccount || !destinationAccount) throw new ServiceError('Manba va qabul qiluvchi hisob tanlanishi kerak');
  if (sourceAccount.id === destinationAccount.id) throw new ServiceError('Manba va qabul qiluvchi bir xil bo‘lmasligi kerak');
  if (operationType === 'CASH_TO_CARD' && (!sourceDesk || !destinationCard)) throw new ServiceError('CASH_TO_CARD uchun manba kassa va qabul karta tanlanadi');
  if (operationType === 'CARD_TO_CASH' && (!sourceCard || !destinationDesk)) throw new ServiceError('CARD_TO_CASH uchun manba karta va qabul kassa tanlanadi');
  if (operationType === 'CASH_DESK_TO_CASH_DESK' && (!sourceDesk || !destinationDesk)) throw new ServiceError('K2K uchun ikkita kassa tanlanadi');

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "FinancialAccount" WHERE id IN (${Prisma.join([sourceAccount.id, destinationAccount.id])}) FOR UPDATE`;
    const relatedTransactions = await tx.transaction.findMany({
      where: { deletedAt: null, status: { notIn: ['CANCELLED', 'REVERSED', 'DELETED'] }, OR: [{ sourceAccountId: sourceAccount.id }, { destinationAccountId: sourceAccount.id }] },
      select: { sourceAccountId: true, destinationAccountId: true, originalAmount: true, destinationAmount: true, currency: true, destinationCurrency: true },
    });
    const balance = calculateTransferBalance(sourceAccount, relatedTransactions);
    if (balance.lt(amount)) throw new ServiceError(`Manba hisobda mablag‘ yetarli emas. Qoldiq: ${balance.toFixed(4)} ${currency}`, 409);
    const exchangeRate = input.exchangeRate != null && String(input.exchangeRate).trim() !== '' ? new Prisma.Decimal(String(input.exchangeRate)) : destinationCurrency !== currency ? destinationAmount.div(amount) : new Prisma.Decimal(1);
    if (!exchangeRate.isFinite() || exchangeRate.lte(0)) throw new ServiceError('Ayirboshlash kursi noto‘g‘ri');
    const linkedTransferId = randomUUID();
    const transaction = await tx.transaction.create({ data: {
      firmId: sourceAccount.firmId,
      createdByUserId: authUser.userId,
      type: 'ADJUSTMENT',
      operationType,
      direction: operationType === 'CASH_DESK_TO_CASH_DESK' ? 'K2K_TRANSFER' : operationType === 'CURRENCY_EXCHANGE' ? 'CURRENCY_EXCHANGE' : 'TRANSFER',
      sourceMode: 'KASSA_TRANSFER',
      status: 'APPLIED',
      approvalStatus: 'APPROVED',
      sourceAccountId: sourceAccount.id,
      destinationAccountId: destinationAccount.id,
      kassaDeskId: sourceDesk?.id || destinationDesk?.id || null,
      paymentCardId: sourceCard?.id || destinationCard?.id || null,
      originalAmount: amount,
      currency,
      destinationAmount: feeAmount.gt(0) && operationType !== 'CURRENCY_EXCHANGE' ? destinationAmount.sub(feeAmount) : destinationAmount,
      destinationCurrency,
      exchangeRate,
      baseAmount: currency === 'UZS' ? amount : amount.mul(exchangeRate).toDecimalPlaces(4),
      accountingTreatment: feeAmount.gt(0) ? 'MIXED_TRANSFER_FEE' : 'BALANCE_SHEET',
      paymentDate: operationDate,
      postingDate: operationDate,
      reportingPeriod: operationDate.toISOString().slice(0, 7),
      metadata: { linkedTransferId, feeAmount: feeAmount.toString(), note: String(input.note || '').trim() || null, reason: String(input.reason || '').trim() || null, source: sourceAccount.name, destination: destinationAccount.name } as Prisma.InputJsonValue,
    } });
    const journal = await tx.journalEntry.create({ data: { firmId: sourceAccount.firmId, transactionId: transaction.id, status: 'POSTED', postingDate: operationDate, description: String(input.note || operationType), postedByUserId: authUser.userId } });
    const ledgerRows = [
      { transactionId: transaction.id, journalEntryId: journal.id, debitAccount: `${destinationAccount.type}:${destinationAccount.id}`, creditAccount: `${sourceAccount.type}:${sourceAccount.id}`, amount: transaction.baseAmount, currency: 'UZS', exchangeRateSnapshot: exchangeRate },
    ];
    if (feeAmount.gt(0)) ledgerRows.push({ transactionId: transaction.id, journalEntryId: journal.id, debitAccount: 'BANK_CARD_COMMISSION_EXPENSE', creditAccount: `${sourceAccount.type}:${sourceAccount.id}`, amount: feeAmount, currency, exchangeRateSnapshot: exchangeRate });
    await tx.ledgerEntry.createMany({ data: ledgerRows });
    await tx.auditLog.create({ data: { actorUserId: authUser.userId, actorRole: normalizeRole(authUser.role), action: transferAuditAction(operationType), entityType: 'transaction', entityId: transaction.id, entityLabel: `${operationType} ${amount} ${currency}`, summary: `${operationType} transfer yaratildi`, metadata: { actorFirmId: authUser.firmId || null, linkedTransferId, sourceAccountId: sourceAccount.id, destinationAccountId: destinationAccount.id, amount: amount.toString(), currency, destinationAmount: destinationAmount.toString(), destinationCurrency, feeAmount: feeAmount.toString() } } });
    return tx.transaction.findUnique({ where: { id: transaction.id }, include: { sourceAccount: true, destinationAccount: true, ledgerEntries: true, journalEntry: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function openKassaService(authUser: AuthUser, input: { businessDate?: unknown; kassaDeskId?: unknown; openingBalance?: unknown; openingBalanceUsd?: unknown; openingAdjustmentReason?: unknown }) {
  const actorUserId = authUser.userId ? String(authUser.userId) : '';
  const businessDate = parseBusinessDate(String(input.businessDate || ''));

  if (!actorUserId) {
    throw new ServiceError('Unauthorized', 401);
  }
  try {
    await assertCanOperateKassa(authUser);
  } catch (err: any) {
    throw new ServiceError(err?.message || 'Forbidden', 403);
  }
  if (!businessDate) {
    throw new ServiceError('Invalid businessDate (YYYY-MM-DD)');
  }

  const firmScopeIds = await kassaFirmScope(authUser);
  const desk = await resolveKassaDeskFilter(input.kassaDeskId, firmScopeIds);
  if (!desk) throw new ServiceError('Kassa desk is required');
  if (desk.status !== 'ACTIVE') throw new ServiceError('Inactive kassa cannot be opened');
  const boundDeskId = await getBoundKassaDeskId(authUser);
  if (isKassirUser(authUser) && (!boundDeskId || boundDeskId !== desk.id)) throw new ServiceError('Kassir can access only their own kassa', 403);

  let requestedBalance: Prisma.Decimal | null = null;
  let requestedBalanceUsd: Prisma.Decimal | null = null;
  if (input.openingBalance != null && String(input.openingBalance).trim() !== '') {
    try {
      requestedBalance = new Prisma.Decimal(String(input.openingBalance));
      if (requestedBalance.lt(0)) {
        throw new ServiceError('Opening balance cannot be negative');
      }
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError('Invalid opening balance');
    }
  }
  if (input.openingBalanceUsd != null && String(input.openingBalanceUsd).trim() !== '') {
    try {
      requestedBalanceUsd = new Prisma.Decimal(String(input.openingBalanceUsd));
      if (requestedBalanceUsd.lt(0)) throw new ServiceError('USD opening balance cannot be negative');
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError('Invalid USD opening balance');
    }
  }

  const day = normalizeBusinessDate(businessDate);
  const adjustmentReason = typeof input.openingAdjustmentReason === 'string' ? input.openingAdjustmentReason.trim().slice(0, 500) : '';
  const canAdjustOpening = isPlatformAdmin(authUser) || (normalizeRole(authUser.role) === 'FIRM' && ['FIRM_ADMIN', 'MANAGER'].includes(normalizeFirmUserRole(authUser.firmRole)));
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.kassaDay.findFirst({
      where: { businessDate: day, cashDeskId: desk.id },
      include: {
        openedBy: { select: { id: true, email: true } },
        closedBy: { select: { id: true, email: true } },
      },
    });

    if (existing) {
      if (existing.status === KassaStatus.CLOSED) {
        throw new ServiceError('Kassa is already closed for this date and cannot be reopened');
      }
      throw new ServiceError('Ushbu kassa shu sana uchun allaqachon ochilgan.');
    }

    const previous = await findPreviousKassaRemainders(tx, desk.firmId, desk.id, day);
    const previousBalance = previous.UZS.balance;
    const previousBalanceUsd = previous.USD.balance;
    const previousSession = previous.UZS.session || previous.USD.session || null;
    const resolved = resolveOpeningBalance({ previousClosingBalance: previousBalance, requestedBalance, canAdjust: canAdjustOpening, adjustmentReason });
    const resolvedUsd = resolveOpeningBalance({ previousClosingBalance: previousBalanceUsd, requestedBalance: requestedBalanceUsd, canAdjust: canAdjustOpening, adjustmentReason });
    const { automaticBalance, openingBalance } = resolved;
    const wantsAdjustment = resolved.adjusted || resolvedUsd.adjusted;

    const kassa = await tx.kassaDay.create({
      data: {
        firmId: desk.firmId,
        cashDeskId: desk.id,
        activeSessionKey: null,
        currency: 'UZS',
        previousSessionId: null,
        businessDate: day,
        status: KassaStatus.OPEN,
        openedByUserId: actorUserId,
        openingBalance: openingBalance.toDecimalPlaces(4),
        openingBalanceUsd: resolvedUsd.openingBalance.toDecimalPlaces(4),
        openingAdjustmentReason: wantsAdjustment ? (adjustmentReason || 'Dastlabki kassa qoldig‘i') : null,
      },
      include: {
        openedBy: { select: { id: true, email: true } },
        closedBy: { select: { id: true, email: true } },
      },
    });
    const actor = await tx.user.findUnique({ where: { id: actorUserId }, select: { email: true, role: true } });
    await tx.auditLog.create({
      data: {
        actorUserId,
        actorEmail: actor?.email || null,
        actorRole: actor?.role ? String(actor.role) : normalizeRole(authUser.role),
        action: 'OPEN',
        entityType: 'kassaDay',
        entityId: kassa.id,
        entityLabel: formatBusinessDateKey(day),
        summary: `Opened kassa for ${formatBusinessDateKey(day)}`,
        metadata: {
          firmId: desk.firmId,
          cashDeskId: desk.id,
          currency: 'UZS',
          previousSessionId: previousSession?.id || null,
          previousSessionIds: { UZS: previous.UZS.session?.id || null, USD: previous.USD.session?.id || null },
          automaticOpeningBalance: String(automaticBalance),
          automaticOpeningBalanceUsd: String(resolvedUsd.automaticBalance),
          finalOpeningBalance: String(kassa.openingBalance),
          finalOpeningBalanceUsd: String(kassa.openingBalanceUsd),
          adjusted: wantsAdjustment,
          adjustmentReason: kassa.openingAdjustmentReason,
        },
      },
    });
    return { kassa, previous, previousSession, automaticBalance, automaticBalanceUsd: resolvedUsd.automaticBalance, adjusted: wantsAdjustment };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return {
    kassa: serializeKassa(result.kassa),
    openingAudit: {
      previousSessionId: result.previousSession?.id || null,
      previousSessionIds: { UZS: result.previous.UZS.session?.id || null, USD: result.previous.USD.session?.id || null },
      automaticOpeningBalance: String(result.automaticBalance),
      automaticOpeningBalanceUsd: String(result.automaticBalanceUsd),
      finalOpeningBalance: String(result.kassa.openingBalance),
      finalOpeningBalanceUsd: String(result.kassa.openingBalanceUsd),
      adjusted: result.adjusted,
      adjustmentReason: result.kassa.openingAdjustmentReason,
      cashDeskId: desk.id,
      firmId: desk.firmId,
      currency: 'UZS',
    },
  };
}

export async function closeKassaService(authUser: AuthUser, input: { businessDate?: unknown; kassaDeskId?: unknown; closingBalance?: unknown; closingBalanceUsd?: unknown; notes?: unknown }) {
  const actorUserId = authUser.userId ? String(authUser.userId) : '';
  const businessDate = parseBusinessDate(String(input.businessDate || ''));

  if (!actorUserId) {
    throw new ServiceError('Unauthorized', 401);
  }
  try {
    await assertCanOperateKassa(authUser);
  } catch (err: any) {
    throw new ServiceError(err?.message || 'Forbidden', 403);
  }
  if (!businessDate) {
    throw new ServiceError('Invalid businessDate (YYYY-MM-DD)');
  }
  const firmScopeIds = await kassaFirmScope(authUser);
  const desk = await resolveKassaDeskFilter(input.kassaDeskId, firmScopeIds);
  if (!desk) throw new ServiceError('Kassa desk is required');
  const boundDeskId = await getBoundKassaDeskId(authUser);
  if (isKassirUser(authUser) && (!boundDeskId || boundDeskId !== desk.id)) throw new ServiceError('Kassir can access only their own kassa', 403);

  let closingBalance: Prisma.Decimal | undefined;
  let closingBalanceUsd: Prisma.Decimal | undefined;
  if (input.closingBalance != null && String(input.closingBalance).trim() !== '') {
    try {
      closingBalance = new Prisma.Decimal(String(input.closingBalance));
      if (closingBalance.lt(0)) {
        throw new ServiceError('Closing balance cannot be negative');
      }
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError('Invalid closing balance');
    }
  }
  if (input.closingBalanceUsd != null && String(input.closingBalanceUsd).trim() !== '') {
    try {
      closingBalanceUsd = new Prisma.Decimal(String(input.closingBalanceUsd));
      if (closingBalanceUsd.lt(0)) throw new ServiceError('USD closing balance cannot be negative');
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError('Invalid USD closing balance');
    }
  }

  const notes = typeof input.notes === 'string' ? input.notes.trim() : undefined;
  const day = normalizeBusinessDate(businessDate);
  const updated = await prisma.$transaction(async (tx) => {
    const kassa = await tx.kassaDay.findFirst({
      where: { businessDate: day, cashDeskId: desk.id },
      include: {
        openedBy: { select: { id: true, email: true } },
        closedBy: { select: { id: true, email: true } },
      },
    });
    if (!kassa) {
      throw new ServiceError('No kassa session exists for the selected desk and date', 409);
    }
    if (kassa.status === KassaStatus.CLOSED) {
      throw new ServiceError('Kassa is already closed for this date');
    }

    const transactions = await loadDayTransactions(day, [desk.firmId], desk.id);
    const totals = computeDayTotals(transactions);
    const expected = calculateExpectedCashByCurrency(kassa, totals.byCurrency);
    const variance = closingBalance != null ? sumToNumber(closingBalance) - expected.UZS : null;
    const varianceUsd = closingBalanceUsd != null ? sumToNumber(closingBalanceUsd) - expected.USD : null;

    return tx.kassaDay.update({
      where: { id: kassa.id },
      data: {
        status: KassaStatus.CLOSED,
        activeSessionKey: null,
        closedAt: new Date(),
        closedByUserId: actorUserId,
        closingBalance: new Prisma.Decimal(expected.UZS).toDecimalPlaces(4),
        closingBalanceUsd: new Prisma.Decimal(expected.USD).toDecimalPlaces(4),
        actualClosingBalance: closingBalance?.toDecimalPlaces(4),
        actualClosingBalanceUsd: closingBalanceUsd?.toDecimalPlaces(4),
        expectedCash: new Prisma.Decimal(expected.UZS).toDecimalPlaces(4),
        expectedCashUsd: new Prisma.Decimal(expected.USD).toDecimalPlaces(4),
        variance: variance != null ? new Prisma.Decimal(variance).toDecimalPlaces(4) : null,
        varianceUsd: varianceUsd != null ? new Prisma.Decimal(varianceUsd).toDecimalPlaces(4) : null,
        notes: notes || null,
      },
      include: {
        openedBy: { select: { id: true, email: true } },
        closedBy: { select: { id: true, email: true } },
      },
    });
  });

  return { kassa: serializeKassa(updated) };
}

export async function reopenKassaService(authUser: AuthUser, input: { businessDate?: unknown; kassaDeskId?: unknown; notes?: unknown }) {
  const actorUserId = authUser.userId ? String(authUser.userId) : '';
  const businessDate = parseBusinessDate(String(input.businessDate || ''));

  if (!actorUserId) {
    throw new ServiceError('Unauthorized', 401);
  }
  try {
    await assertCanOperateKassa(authUser);
  } catch (err: any) {
    throw new ServiceError(err?.message || 'Forbidden', 403);
  }
  if (!businessDate) {
    throw new ServiceError('Invalid businessDate (YYYY-MM-DD)');
  }

  const firmScopeIds = await kassaFirmScope(authUser);
  const desk = await resolveKassaDeskFilter(input.kassaDeskId, firmScopeIds);
  if (!desk) throw new ServiceError('Kassa desk is required');
  const boundDeskId = await getBoundKassaDeskId(authUser);
  if (isKassirUser(authUser) && (!boundDeskId || boundDeskId !== desk.id)) throw new ServiceError('Kassir can access only their own kassa', 403);
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  const day = normalizeBusinessDate(businessDate);
  const updated = await prisma.$transaction(async (tx) => {
    const kassa = await tx.kassaDay.findFirst({
      where: { businessDate: day, cashDeskId: desk.id },
      include: {
        openedBy: { select: { id: true, email: true } },
        closedBy: { select: { id: true, email: true } },
      },
    });

    if (!kassa) {
      throw new ServiceError('No kassa session exists for the selected desk and date', 409);
    }
    if (kassa.status !== KassaStatus.CLOSED) {
      throw new ServiceError('Only closed kassa days can be reopened');
    }
    const reopenNote = notes
      ? `Kassa qayta ochildi: ${notes}`
      : 'Kassa qayta ochildi';
    const nextNotes = kassa.notes ? `${kassa.notes}\n${reopenNote}` : reopenNote;

    return tx.kassaDay.update({
      where: { id: kassa.id },
      data: {
        status: KassaStatus.OPEN,
        activeSessionKey: null,
        closedAt: null,
        closedByUserId: null,
        closingBalance: null,
        closingBalanceUsd: null,
        actualClosingBalance: null,
        actualClosingBalanceUsd: null,
        expectedCash: null,
        expectedCashUsd: null,
        variance: null,
        varianceUsd: null,
        notes: nextNotes,
      },
      include: {
        openedBy: { select: { id: true, email: true } },
        closedBy: { select: { id: true, email: true } },
      },
    });
  });

  return { kassa: serializeKassa(updated) };
}

export async function getKassaHistoryService(authUser: AuthUser, input: { page?: unknown; limit?: unknown; firmId?: unknown; kassaDeskId?: unknown }) {
  const page = Math.max(1, parseInt(String(input.page || '1'), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(input.limit || '20'), 10) || 20));
  const skip = (page - 1) * limit;
  const firmScopeIds = await monitoringFirmScope(authUser, input.firmId);
  const boundDeskId = await getBoundKassaDeskId(authUser);
  const requestedDeskId = isKassirUser(authUser) ? (boundDeskId || '__unassigned_kassir__') : input.kassaDeskId;
  const desk = requestedDeskId === '__unassigned_kassir__' ? null : await resolveKassaDeskFilter(requestedDeskId, firmScopeIds);
  const where: Prisma.KassaDayWhereInput = {
    ...(firmScopeIds ? { firmId: { in: firmScopeIds } } : {}),
    ...(requestedDeskId ? { cashDeskId: desk?.id || '__unassigned_kassir__' } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.kassaDay.count({ where }),
    prisma.kassaDay.findMany({
      where,
      orderBy: { businessDate: 'desc' },
      skip,
      take: limit,
      include: {
        openedBy: { select: { id: true, email: true } },
        closedBy: { select: { id: true, email: true } },
      },
    }),
  ]);

  return {
    data: rows.map(serializeKassa),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
  };
}
