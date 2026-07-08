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

export type AuthUser = {
  userId?: string;
  role?: Role | string;
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
  const where: Prisma.TransactionWhereInput = {
    ...(firmScopeIds ? { firmId: { in: firmScopeIds } } : {}),
    ...(kassaDeskId ? { kassaDeskId } : {}),
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

  for (const tx of transactions) {
    const base = sumToNumber(tx.baseAmount);
    const method = String(tx.paymentMethod || '').toLowerCase();
    if (tx.type === 'PAYMENT') {
      paymentCount += 1;
      if (method === 'cash') {
        cashTotal += base;
        cashInTotal += base;
      }
      else if (method === 'card') {
        cardTotal += base;
        cardInTotal += base;
      }
    } else if (tx.type === 'ADJUSTMENT' && tx.direction === 'KASSA_IN') {
      if (method === 'card') {
        cardTotal += base;
        cardInTotal += base;
      } else {
        cashTotal += base;
        cashInTotal += base;
      }
    } else if (tx.type === 'ADJUSTMENT' && tx.direction === 'KASSA_OUT') {
      if (method === 'card') {
        cardTotal -= base;
        cardOutTotal += base;
      } else {
        cashTotal -= base;
        cashOutTotal += base;
      }
    } else if (tx.type === 'SALE') {
      saleTotal += base;
    } else if (isPayableDebtType(tx.type)) {
      payableTotal += base;
    }
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
  };
}

function normalizeCurrency(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

function serializePaymentCard(card: any) {
  return {
    id: card.id,
    ownerName: card.ownerName,
    cardNumber: card.cardNumber,
    currency: card.currency,
    firmId: card.firmId,
    firm: card.firm ?? null,
    status: card.status,
    createdAt: card.createdAt instanceof Date ? card.createdAt.toISOString() : card.createdAt,
  };
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

function cardFlowAmount(tx: { type: string; direction: string | null; baseAmount: unknown }) {
  const base = sumToNumber(tx.baseAmount as any);
  if (tx.type === 'PAYMENT') return base;
  if (tx.type === 'ADJUSTMENT' && tx.direction === 'KASSA_IN') return base;
  if (tx.type === 'ADJUSTMENT' && tx.direction === 'KASSA_OUT') return -base;
  return 0;
}

async function loadPaymentCards(firmScopeIds?: string[]) {
  return prisma.paymentCard.findMany({
    where: {
      status: 'ACTIVE',
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
          baseAmount: true,
        },
      })
    : [];

  const dayKey = formatBusinessDateKey(businessDate);
  const daily = new Map<string, { in: number; out: number }>();
  for (const tx of dayTransactions) {
    if (!tx.paymentCardId || String(tx.paymentMethod || '').toLowerCase() !== 'card') continue;
    const amount = cardFlowAmount(tx);
    const row = daily.get(tx.paymentCardId) || { in: 0, out: 0 };
    if (amount >= 0) row.in += amount;
    else row.out += Math.abs(amount);
    daily.set(tx.paymentCardId, row);
  }

  const balances = new Map<string, number>();
  for (const tx of allCardTransactions) {
    if (!tx.paymentCardId) continue;
    balances.set(tx.paymentCardId, (balances.get(tx.paymentCardId) || 0) + cardFlowAmount(tx));
  }

  return cards.map((card) => {
    const d = daily.get(card.id) || { in: 0, out: 0 };
    return {
      ...serializePaymentCard(card),
      day: dayKey,
      dailyIn: d.in,
      dailyOut: d.out,
      dailyNet: d.in - d.out,
      balance: balances.get(card.id) || 0,
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

  return {
    businessDate: formatBusinessDateKey(day),
    status,
    kassa: kassa ? serializeKassa(kassa) : null,
    totals: { ...totals, expectedCash, cardBalanceTotal },
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
      metadata: tx.metadata,
      createdAt: tx.createdAt.toISOString(),
    })),
    duePayments: [],
  };
}

export async function listPaymentCardsService(authUser: AuthUser) {
  const firmScopeIds = await getAccessibleFirmIds(authUser);
  const cards = await loadPaymentCards(firmScopeIds);
  return cards.map(serializePaymentCard);
}

export async function createPaymentCardService(authUser: AuthUser, input: { ownerName?: unknown; cardNumber?: unknown; currency?: unknown; firmId?: unknown }) {
  const role = normalizeRole(authUser.role);
  const ownerName = String(input.ownerName || '').trim();
  const cardNumber = String(input.cardNumber || '').trim();
  const currency = normalizeCurrency(input.currency || 'UZS');
  const firmId = typeof input.firmId === 'string' && input.firmId.trim() ? input.firmId.trim() : undefined;

  if (role !== 'SUPERADMIN' && role !== 'ADMIN') {
    throw new ServiceError('Forbidden', 403);
  }
  if (!ownerName || !cardNumber || !currency) {
    throw new ServiceError('Card owner, number and currency are required');
  }
  if (currency !== 'UZS' && currency !== 'USD') {
    throw new ServiceError('Card currency must be UZS or USD');
  }
  const accessibleFirmIds = await getAccessibleFirmIds(authUser);
  if (firmId && accessibleFirmIds && !accessibleFirmIds.includes(firmId)) {
    throw new ServiceError('Forbidden', 403);
  }

  const created = await prisma.paymentCard.create({
    data: {
      ownerName,
      cardNumber,
      currency,
      firmId,
      createdByUserId: authUser.userId ? String(authUser.userId) : undefined,
    },
    include: { firm: { select: { id: true, name: true } } },
  });

  return serializePaymentCard(created);
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
