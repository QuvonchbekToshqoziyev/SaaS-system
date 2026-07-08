import { Request, Response } from 'express';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';
import { canAccessFirm, getAccessibleFirmIds } from '../utils/access';
import { assertKassaOpenForDate, parseBusinessDate } from '../utils/kassa';
import { writeAuditLog } from '../utils/audit';
import { assertActiveKassaDesk, assertKassaDeskForFirmSetSelection } from '../utils/kassa-desk-policy';

type AuthUser = {
  userId?: string;
  role?: string;
  firmId?: string | null;
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

  const { dateFrom, dateTo, firmId, flightId, kassaDeskId, type, currency, page = '1', limit = '10' } = req.query;
  const where: Prisma.TransactionWhereInput = {};

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
    where.OR = [
      { firmId: scopedFirmId },
      { payerFirmId: scopedFirmId },
      { receiverFirmId: scopedFirmId },
    ];
  } else if (accessibleFirmIds) {
    if (!accessibleFirmIds.length) {
      return res.json({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } });
    }
    where.OR = [
      { firmId: { in: accessibleFirmIds } },
      { payerFirmId: { in: accessibleFirmIds } },
      { receiverFirmId: { in: accessibleFirmIds } },
    ];
  }
  if (flightId) where.flightId = String(flightId);
  if (kassaDeskId) where.kassaDeskId = String(kassaDeskId);
  if (type) where.type = String(type).toUpperCase() as any;
  if (currency) where.currency = String(currency);

  const pageNum = Math.max(1, parseInt(String(page)) || 1);
  const limitNum = Math.max(1, parseInt(String(limit)) || 10);
  const skip = (pageNum - 1) * limitNum;

  const [total, data] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: { firm: true, flight: true, payerFirm: true, receiverFirm: true, kassaDesk: { include: { firm: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum
    })
  ]);
  
  res.json({
    data,
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

export const createDirectedTransaction = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  const body = req.body || {};

  const type = String(body.type || '').trim().toUpperCase();
  const payerFirmId = String(body.payerFirmId || '').trim();
  const receiverFirmId = String(body.receiverFirmId || '').trim();
  const flightId = String(body.flightId || '').trim() || undefined;
  const amount = parseDecimal(body.amount);
  const currency = normalizeCurrency(body.currency || DEFAULT_CURRENCY);
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

    const exchangeRate = new Prisma.Decimal(1);
    const baseAmount = amount.toDecimalPlaces(4);
    const created = await prisma.transaction.create({
      data: {
        firmId: receiverFirmId,
        payerFirmId,
        receiverFirmId,
        flightId,
        createdByUserId: authUser.userId ? String(authUser.userId) : undefined,
        type: type as any,
        direction: 'FIRM_TO_FIRM',
        subjectType: flightId ? 'FLIGHT' : 'MANUAL',
        subjectId: flightId,
        kassaDeskId: kassaDesk?.id,
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

export const createManualCashTransaction = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  const body = req.body || {};

  const flow = String(body.flow || '').trim().toUpperCase();
  const rawFirmId = String(body.firmId || '').trim();
  const flightId = String(body.flightId || '').trim() || undefined;
  const amount = parseDecimal(body.amount);
  const currency = normalizeCurrency(body.currency || DEFAULT_CURRENCY);
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
  if (!amount.gt(0)) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return res.status(400).json({ error: 'Invalid currency code' });
  }
  if (!(await canAccessFirm(authUser, firmId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    kassaDesk = await resolveKassaDesk(authUser, body.kassaDeskId);
    await assertKassaDeskBelongsToOneOf(kassaDesk, [firmId], firmId);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Invalid kassa desk' });
  }
  if (businessDate) {
    await assertKassaOpenForDate(businessDate);
  }

  try {
    const [firm, flight, paymentCard] = await Promise.all([
      prisma.firm.findUnique({ where: { id: firmId }, select: { id: true, name: true } }),
      flightId ? prisma.flight.findUnique({ where: { id: flightId }, select: { id: true, flightNumber: true } }) : Promise.resolve(null),
      paymentCardId
        ? prisma.paymentCard.findUnique({ where: { id: paymentCardId }, select: { id: true, ownerName: true, cardNumber: true, currency: true, status: true } })
        : Promise.resolve(null),
    ]);
    if (!firm) return res.status(404).json({ error: 'Firm not found' });
    if (flightId && !flight) return res.status(404).json({ error: 'Flight not found' });
    if (method === 'card') {
      if (!paymentCard) return res.status(404).json({ error: 'Payment card not found' });
      if (paymentCard.status !== 'ACTIVE') return res.status(400).json({ error: 'Payment card is not active' });
      if (paymentCard.currency !== currency) return res.status(400).json({ error: `Selected card currency is ${paymentCard.currency}` });
    }

    const exchangeRate = new Prisma.Decimal(1);
    const baseAmount = amount.toDecimalPlaces(4);
    const created = await prisma.transaction.create({
      data: {
        firmId,
        payerFirmId: flow === 'IN' ? firmId : undefined,
        receiverFirmId: flow === 'OUT' ? firmId : undefined,
        flightId,
        createdByUserId: authUser.userId ? String(authUser.userId) : undefined,
        type: 'ADJUSTMENT',
        direction: flow === 'IN' ? 'KASSA_IN' : 'KASSA_OUT',
        subjectType: flightId ? 'FLIGHT' : 'KASSA',
        subjectId: flightId || firmId,
        kassaDeskId: kassaDesk?.id,
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
