import { KassaStatus, Prisma, Role } from '@prisma/client';
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

function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

function serializeKassa(kassa: NonNullable<Awaited<ReturnType<typeof findKassaForDate>>>) {
  return {
    id: kassa.id,
    businessDate: formatBusinessDateKey(kassa.businessDate),
    status: kassa.status,
    openedAt: kassa.openedAt.toISOString(),
    closedAt: kassa.closedAt?.toISOString() ?? null,
    openedBy: kassa.openedBy,
    closedBy: kassa.closedBy,
    openingBalance: String(kassa.openingBalance),
    closingBalance: kassa.closingBalance != null ? String(kassa.closingBalance) : null,
    expectedCash: kassa.expectedCash != null ? String(kassa.expectedCash) : null,
    variance: kassa.variance != null ? String(kassa.variance) : null,
    notes: kassa.notes,
  };
}

function serializeKassaDesk(desk: any) {
  return {
    id: desk.id,
    firmId: desk.firmId,
    firm: desk.firm ?? null,
    name: desk.name,
    code: desk.code,
    status: desk.status,
    createdByUserId: desk.createdByUserId,
    createdBy: desk.createdBy ?? null,
    createdAt: desk.createdAt instanceof Date ? desk.createdAt.toISOString() : desk.createdAt,
    updatedAt: desk.updatedAt instanceof Date ? desk.updatedAt.toISOString() : desk.updatedAt,
  };
}

async function loadKassaDesks(firmScopeIds?: string[]) {
  return prisma.kassaDesk.findMany({
    where: {
      status: { not: 'DELETED' },
      deletedAt: null,
      ...(firmScopeIds ? { firmId: { in: firmScopeIds } } : {}),
    },
    include: {
      firm: { select: { id: true, name: true } },
      createdBy: { select: { id: true, email: true } },
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
  const scopedDeskIds = kassaDeskId
    ? [kassaDeskId]
    : firmScopeIds
      ? (await prisma.kassaDesk.findMany({
          where: { firmId: { in: firmScopeIds }, status: { not: 'DELETED' }, deletedAt: null },
          select: { id: true },
        })).map((desk) => desk.id)
      : [];
  const where: Prisma.TransactionWhereInput = {
    ...(firmScopeIds
      ? {
          OR: [
            { firmId: { in: firmScopeIds } },
            ...(scopedDeskIds.length ? [{ kassaDeskId: { in: scopedDeskIds } }] : []),
          ],
        }
      : kassaDeskId ? { kassaDeskId } : {}),
  };
  const rows = await prisma.transaction.findMany({
    where,
    include: { firm: true, flight: true, paymentCard: true, kassaDesk: { include: { firm: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: 'desc' },
  });

  return rows.filter((tx) => getTransactionBusinessDateKey(tx) === dayKey);
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
      paymentCount += 1;
      row.paymentCount += 1;
      if (method === 'cash') {
        cashTotal += base;
        cashInTotal += base;
        row.cashTotal += original;
        row.cashInTotal += original;
      }
      else if (method === 'card') {
        cardTotal += base;
        cardInTotal += base;
        row.cardTotal += original;
        row.cardInTotal += original;
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

function serializePaymentCard(card: any) {
  return {
    id: card.id,
    ownerName: card.ownerName,
    cardNumber: maskCardNumber(card.cardNumber),
    currency: card.currency,
    openingBalance: String(card.openingBalance ?? 0),
    firmId: card.firmId,
    firm: card.firm ?? null,
    status: card.status,
    createdAt: card.createdAt instanceof Date ? card.createdAt.toISOString() : card.createdAt,
  };
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

export async function listKassaDesksService(authUser: AuthUser) {
  const firmScopeIds = await getAccessibleFirmIds(authUser);
  const desks = await loadKassaDesks(firmScopeIds);
  return desks.map(serializeKassaDesk);
}

export async function createKassaDeskService(
  authUser: AuthUser,
  input: { firmId?: unknown; name?: unknown; code?: unknown; status?: unknown },
) {
  const role = normalizeRole(authUser.role);
  const actorUserId = authUser.userId ? String(authUser.userId) : '';
  const firmId = typeof input.firmId === 'string' ? input.firmId.trim() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  const status = typeof input.status === 'string' && input.status.trim() ? input.status.trim().toUpperCase() : 'ACTIVE';

  if (!actorUserId) {
    throw new ServiceError('Unauthorized', 401);
  }
  if (!['SUPERADMIN', 'ADMIN', 'FIRM'].includes(role)) {
    throw new ServiceError('Forbidden', 403);
  }
  if (!name) {
    throw new ServiceError('Kassa desk name is required');
  }

  const accessibleFirmIds = await getAccessibleFirmIds(authUser);
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
    },
    include: {
      firm: { select: { id: true, name: true } },
      createdBy: { select: { id: true, email: true } },
    },
  });

  return serializeKassaDesk(created);
}

function cardFlowAmount(tx: { type: string; direction: string | null; originalAmount: unknown }) {
  const original = sumToNumber(tx.originalAmount as any);
  if (tx.type === 'PAYMENT') return original;
  if (tx.type === 'ADJUSTMENT' && tx.direction === 'KASSA_IN') return original;
  if (tx.type === 'ADJUSTMENT' && tx.direction === 'KASSA_OUT') return -original;
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
) {
  const cards = await loadPaymentCards(firmScopeIds);
  const cardIds = cards.map((card) => card.id);
  const allCardTransactions = cardIds.length
    ? await prisma.transaction.findMany({
        where: {
          paymentCardId: { in: cardIds },
          paymentMethod: 'card',
          ...(firmScopeIds ? { firmId: { in: firmScopeIds } } : {}),
        },
        select: {
          paymentCardId: true,
          type: true,
          direction: true,
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

export async function getKassaDayService(authUser: AuthUser, rawDate: unknown, input: { kassaDeskId?: unknown } = {}) {
  const role = normalizeRole(authUser.role);
  const businessDate = parseBusinessDate(String(rawDate || ''));
  if (!businessDate) {
    throw new ServiceError('Invalid or missing date (YYYY-MM-DD)');
  }

  const firmScopeIds = await getAccessibleFirmIds(authUser);
  if (role === 'FIRM' && !firmScopeIds?.length) {
    throw new ServiceError('Firm account is missing firmId');
  }
  const kassaDeskFilter = await resolveKassaDeskFilter(input.kassaDeskId, firmScopeIds);

  const day = normalizeBusinessDate(businessDate);
  const [kassa, transactions] = await Promise.all([
    findKassaForDate(day),
    loadDayTransactions(day, firmScopeIds, kassaDeskFilter?.id),
  ]);

  const totals = computeDayTotals(transactions);
  const paymentCards = await loadCardSummaries(day, transactions, firmScopeIds);
  const kassaDesks = await loadKassaDesks(firmScopeIds);
  const status = kassa?.status === KassaStatus.CLOSED ? KassaStatus.CLOSED : kassa ? KassaStatus.OPEN : 'NOT_OPEN';
  const expectedCash = kassa ? sumToNumber(kassa.openingBalance) + totals.cashTotal : null;
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
    totals: { ...totals, expectedCash, cardBalanceTotal, cardBalanceByCurrency },
    paymentCards,
    kassaDesks: kassaDesks.map(serializeKassaDesk),
    filters: {
      kassaDeskId: kassaDeskFilter?.id ?? null,
    },
    permissions: {
      canOperateKassa: await canOperateKassa(authUser),
    },
    transactions: transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      firmId: tx.firmId,
      kassaDeskId: tx.kassaDeskId,
      flightId: tx.flightId,
      firm: tx.firm,
      flight: tx.flight,
      kassaDesk: tx.kassaDesk,
      originalAmount: String(tx.originalAmount),
      currency: tx.currency,
      baseAmount: String(tx.baseAmount),
      paymentMethod: tx.paymentMethod,
      paymentCardId: tx.paymentCardId,
      paymentCard: tx.paymentCard,
      direction: tx.direction,
      createdByUserId: tx.createdByUserId,
      metadata: tx.metadata,
      createdAt: tx.createdAt.toISOString(),
    })),
    duePayments: [],
  };
}

export async function listPaymentCardsService(authUser: AuthUser) {
  const firmScopeIds = await getAccessibleFirmIds(authUser);
  return loadCardSummaries(new Date(), [], firmScopeIds);
}

export async function createPaymentCardService(authUser: AuthUser, input: { ownerName?: unknown; cardNumber?: unknown; currency?: unknown; firmId?: unknown; openingBalance?: unknown }) {
  const role = normalizeRole(authUser.role);
  const ownerName = String(input.ownerName || '').trim();
  const cardNumber = String(input.cardNumber || '').trim();
  const currency = normalizeCurrency(input.currency || 'UZS');
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
  const accessibleFirmIds = await getAccessibleFirmIds(authUser);
  if (firmId && accessibleFirmIds && !accessibleFirmIds.includes(firmId)) {
    throw new ServiceError('Forbidden', 403);
  }

  const created = await prisma.paymentCard.create({
    data: {
      ownerName,
      cardNumber: maskCardNumber(cardNumber),
      currency,
      openingBalance: openingBalance.toDecimalPlaces(4),
      firmId,
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

  const accessibleFirmIds = await getAccessibleFirmIds(authUser);
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
  const role = normalizeRole(authUser.role);
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

  const isCreator = existing.createdByUserId === actorUserId;
  const isOwnFirmAdmin = isFirmAdmin(authUser) && Boolean(authUser.firmId) && existing.firmId === authUser.firmId;
  if (!isPlatformAdmin(authUser) && !isCreator && !isOwnFirmAdmin) {
    throw new ServiceError('Forbidden', 403);
  }
  if (role === 'FIRM' && !isCreator && !isOwnFirmAdmin) {
    throw new ServiceError('Forbidden', 403);
  }

  const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim().slice(0, 500) : null;
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

export async function openKassaService(authUser: AuthUser, input: { businessDate?: unknown; openingBalance?: unknown }) {
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

  let openingBalance = new Prisma.Decimal(0);
  if (input.openingBalance != null && String(input.openingBalance).trim() !== '') {
    try {
      openingBalance = new Prisma.Decimal(String(input.openingBalance));
      if (openingBalance.lt(0)) {
        throw new ServiceError('Opening balance cannot be negative');
      }
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError('Invalid opening balance');
    }
  }

  const day = normalizeBusinessDate(businessDate);
  const kassa = await prisma.$transaction(async (tx) => {
    const existing = await tx.kassaDay.findUnique({
      where: { businessDate: day },
      include: {
        openedBy: { select: { id: true, email: true } },
        closedBy: { select: { id: true, email: true } },
      },
    });

    if (existing) {
      if (existing.status === KassaStatus.CLOSED) {
        throw new ServiceError('Kassa is already closed for this date and cannot be reopened');
      }
      throw new ServiceError('Kassa is already open for this date');
    }

    return tx.kassaDay.create({
      data: {
        businessDate: day,
        status: KassaStatus.OPEN,
        openedByUserId: actorUserId,
        openingBalance: openingBalance.toDecimalPlaces(4),
      },
      include: {
        openedBy: { select: { id: true, email: true } },
        closedBy: { select: { id: true, email: true } },
      },
    });
  });

  return { kassa: serializeKassa(kassa) };
}

export async function closeKassaService(authUser: AuthUser, input: { businessDate?: unknown; closingBalance?: unknown; notes?: unknown }) {
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

  let closingBalance: Prisma.Decimal | undefined;
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

  const notes = typeof input.notes === 'string' ? input.notes.trim() : undefined;
  const day = normalizeBusinessDate(businessDate);
  const updated = await prisma.$transaction(async (tx) => {
    const kassa = await tx.kassaDay.findUnique({
      where: { businessDate: day },
      include: {
        openedBy: { select: { id: true, email: true } },
        closedBy: { select: { id: true, email: true } },
      },
    });
    if (!kassa) {
      throw new ServiceError('Kassa is not open for this date', 404);
    }
    if (kassa.status === KassaStatus.CLOSED) {
      throw new ServiceError('Kassa is already closed for this date');
    }

    const transactions = await loadDayTransactions(day);
    const totals = computeDayTotals(transactions);
    const expectedCash = sumToNumber(kassa.openingBalance) + totals.cashTotal;
    const variance =
      closingBalance != null ? sumToNumber(closingBalance) - expectedCash : null;

    return tx.kassaDay.update({
      where: { businessDate: day },
      data: {
        status: KassaStatus.CLOSED,
        closedAt: new Date(),
        closedByUserId: actorUserId,
        closingBalance: closingBalance?.toDecimalPlaces(4),
        expectedCash: new Prisma.Decimal(expectedCash).toDecimalPlaces(4),
        variance: variance != null ? new Prisma.Decimal(variance).toDecimalPlaces(4) : null,
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

export async function reopenKassaService(authUser: AuthUser, input: { businessDate?: unknown; notes?: unknown }) {
  const actorUserId = authUser.userId ? String(authUser.userId) : '';
  const role = normalizeRole(authUser.role);
  const businessDate = parseBusinessDate(String(input.businessDate || ''));

  if (!actorUserId) {
    throw new ServiceError('Unauthorized', 401);
  }
  if (role !== 'SUPERADMIN') {
    throw new ServiceError('Only superadmin can reopen kassa', 403);
  }
  if (!businessDate) {
    throw new ServiceError('Invalid businessDate (YYYY-MM-DD)');
  }

  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  const day = normalizeBusinessDate(businessDate);
  const updated = await prisma.$transaction(async (tx) => {
    const kassa = await tx.kassaDay.findUnique({
      where: { businessDate: day },
      include: {
        openedBy: { select: { id: true, email: true } },
        closedBy: { select: { id: true, email: true } },
      },
    });

    if (!kassa) {
      throw new ServiceError('Kassa day not found', 404);
    }
    if (kassa.status !== KassaStatus.CLOSED) {
      throw new ServiceError('Only closed kassa days can be reopened');
    }

    const reopenNote = notes
      ? `Reopened by superadmin: ${notes}`
      : 'Reopened by superadmin';
    const nextNotes = kassa.notes ? `${kassa.notes}\n${reopenNote}` : reopenNote;

    return tx.kassaDay.update({
      where: { businessDate: day },
      data: {
        status: KassaStatus.OPEN,
        closedAt: null,
        closedByUserId: null,
        closingBalance: null,
        expectedCash: null,
        variance: null,
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

export async function getKassaHistoryService(input: { page?: unknown; limit?: unknown }) {
  const page = Math.max(1, parseInt(String(input.page || '1'), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(input.limit || '20'), 10) || 20));
  const skip = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    prisma.kassaDay.count(),
    prisma.kassaDay.findMany({
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
