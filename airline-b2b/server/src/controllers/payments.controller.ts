import { Request, Response } from 'express';
import { prisma } from '../db';
import { Prisma, Role } from '@prisma/client';
import { assertKassaOpenForDate, startOfDayUtc } from '../utils/kassa';
import { canAccessFirm, getAccessibleFirmIds } from '../utils/access';
import { assertActiveKassaDesk, assertKassaDeskForFirmSelection } from '../utils/kassa-desk-policy';
import { resolveExchangeRateToUzs } from '../services/currency-rates.service';
import { canOperateKassa } from '../utils/kassa-permissions';

type AuthUser = {
  userId?: string;
  role?: Role | string;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseDecimal(value: unknown): Prisma.Decimal | undefined {
  try {
    if (value instanceof Prisma.Decimal) return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return undefined;
      return new Prisma.Decimal(String(value));
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      return new Prisma.Decimal(trimmed);
    }
  } catch {
    return undefined;
  }
  return undefined;
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

async function assertKassaDeskForFirm(kassaDesk: Awaited<ReturnType<typeof resolveKassaDesk>>, firmId: string) {
  const activeDeskCount = await prisma.kassaDesk.count({
    where: { firmId, status: 'ACTIVE', deletedAt: null },
  });
  assertKassaDeskForFirmSelection(kassaDesk, firmId, activeDeskCount);
}

const PAYMENT_METHODS = new Set(['cash', 'card']);

export const processPayment = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  const actorUserId = authUser.userId ? String(authUser.userId) : undefined;

  const rawFirmId = (req.body as any)?.firmId;
  const rawFlightId = (req.body as any)?.flightId;
  const rawAmount = (req.body as any)?.amount;
  const rawCurrency = (req.body as any)?.currency;
  const rawMethod = (req.body as any)?.method;
  const rawMetadata = (req.body as any)?.metadata;
  const rawPaymentCardId = (req.body as any)?.paymentCardId ?? (req.body as any)?.cardId;
  const rawKassaDeskId = (req.body as any)?.kassaDeskId;
  const rawExchangeRate = (req.body as any)?.exchangeRate;

  const method = String(rawMethod || '').trim().toLowerCase();
  const currency = normalizeCurrency(rawCurrency);
  const amount = parseDecimal(rawAmount);
  const paymentCardId = typeof rawPaymentCardId === 'string' ? rawPaymentCardId.trim() : '';

  let firmId = typeof rawFirmId === 'string' ? rawFirmId.trim() : '';
  const flightId = typeof rawFlightId === 'string' ? rawFlightId.trim() : '';
  let operatorFirmId = '';
  let firmCanOperateKassa = false;

  if (role === 'FIRM') {
    operatorFirmId = authUser.firmId ? String(authUser.firmId) : '';
    if (!operatorFirmId) {
      return res.status(400).json({ error: 'Firm account is missing firmId' });
    }
    firmCanOperateKassa = await canOperateKassa(authUser);
    if (firmId && firmId !== operatorFirmId && (!firmCanOperateKassa || !(await canAccessFirm(authUser, firmId)))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!firmId) firmId = operatorFirmId;
  } else if (role === 'ADMIN' && firmId && !(await canAccessFirm(authUser, firmId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!firmId || !amount || !currency || !method) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!PAYMENT_METHODS.has(method)) {
    return res.status(400).json({ error: 'Unsupported payment method' });
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return res.status(400).json({ error: 'Invalid currency code' });
  }
  if (!amount.gt(0)) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }

  let kassaDesk: Awaited<ReturnType<typeof resolveKassaDesk>> = null;
  try {
    kassaDesk = await resolveKassaDesk(authUser, rawKassaDeskId);
    const deskFirmId = role === 'FIRM' && firmCanOperateKassa ? operatorFirmId : firmId;
    await assertKassaDeskForFirm(kassaDesk, deskFirmId);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Invalid kassa desk' });
  }

  if (!isPlainObject(rawMetadata)) {
    return res.status(400).json({ error: 'metadata must be an object' });
  }

  if (method === 'cash') {
    const dateValue = rawMetadata.date;
    if (typeof dateValue !== 'string' || !dateValue.trim()) {
      return res.status(400).json({ error: 'Cash requires date in metadata' });
    }
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'Invalid cash payment date' });
    }
  }

  if (method === 'card') {
    if (!paymentCardId) {
      return res.status(400).json({ error: 'Card payment requires paymentCardId' });
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const [firm, flight, paymentCard] = await Promise.all([
        tx.firm.findUnique({ where: { id: firmId }, select: { id: true, name: true } }),
        flightId ? tx.flight.findUnique({ where: { id: flightId }, select: { id: true } }) : Promise.resolve(null),
        paymentCardId
          ? tx.paymentCard.findUnique({ where: { id: paymentCardId }, select: { id: true, ownerName: true, cardNumber: true, currency: true, status: true } })
          : Promise.resolve(null),
      ]);

      if (!firm) throw new Error('Firm not found');
      if (flightId && !flight) throw new Error('Flight not found');
      if (method === 'card') {
        if (!paymentCard) throw new Error('Payment card not found');
        if (paymentCard.status !== 'ACTIVE') throw new Error('Payment card is not active');
      }

      let paymentDate = new Date();
      if (method === 'cash') {
        paymentDate = new Date(String((rawMetadata as any).date));
      } else if (typeof (rawMetadata as any).date === 'string' && String((rawMetadata as any).date).trim()) {
        const parsed = new Date(String((rawMetadata as any).date));
        if (Number.isNaN(parsed.getTime())) {
          throw new Error('Invalid payment date');
        }
        paymentDate = parsed;
      }

      const dayStart = startOfDayUtc(paymentDate);
      await assertKassaOpenForDate(dayStart);

      const exchangeRate = await resolveExchangeRateToUzs(authUser, {
        currency,
        date: paymentDate,
        overrideRate: rawExchangeRate,
        rateFirmId: firmId,
      });
      const baseAmount = amount.mul(exchangeRate).toDecimalPlaces(4);

      await tx.transaction.create({
        data: {
          firmId,
          payerFirmId: firmId,
          direction: 'FIRM_TO_PLATFORM',
          subjectType: flightId ? 'FLIGHT' : 'DEPOSIT',
          subjectId: flightId || firmId,
          flightId: flightId || undefined,
          createdByUserId: actorUserId,
          kassaDeskId: kassaDesk?.id,
          type: 'PAYMENT',
          originalAmount: amount.toDecimalPlaces(4),
          currency,
          exchangeRate: exchangeRate.toDecimalPlaces(6),
          baseAmount,
          paymentMethod: method,
          paymentCardId: method === 'card' ? paymentCardId : undefined,
          metadata: {
            ...(rawMetadata as Record<string, unknown>),
            paymentCardId: method === 'card' ? paymentCardId : undefined,
            kassaDeskId: kassaDesk?.id,
            kassaDeskLabel: kassaDesk?.name,
            paymentCardOwner: paymentCard?.ownerName,
            paymentCardNumber: paymentCard?.cardNumber,
            payerLabel: firm.name,
            receiverLabel: 'Admin / Airline',
            directionLabel: `${firm.name} -> Admin / Airline`,
          } as Prisma.InputJsonValue,
        }
      });
    });
    res.json({ success: true, message: 'Payment recorded' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};
