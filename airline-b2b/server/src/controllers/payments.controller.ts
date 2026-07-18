import { Request, Response } from 'express';
import { prisma } from '../db';
import { FinancialAccountType, Prisma, Role } from '@prisma/client';
import { assertKassaOpenForDate, startOfDayUtc } from '../utils/kassa';
import { canAccessFirm, canViewRelatedFirm, getAccessibleFirmIds } from '../utils/access';
import { assertActiveKassaDesk, assertKassaDeskForFirmSelection } from '../utils/kassa-desk-policy';
import { resolveExchangeRateToUzs } from '../services/currency-rates.service';
import { canOperateKassa } from '../utils/kassa-permissions';
import { assertKassirDeskAccess, KassaDeskAccessError } from '../utils/kassa-desk-access';
import { ensureFinancialAccount } from '../utils/financial-accounts';

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
    throw new KassaDeskAccessError('Forbidden');
  }

  return desk;
}

async function assertKassaDeskForFirm(kassaDesk: Awaited<ReturnType<typeof resolveKassaDesk>>, firmId: string) {
  const activeDeskCount = await prisma.kassaDesk.count({
    where: { firmId, status: 'ACTIVE', deletedAt: null },
  });
  assertKassaDeskForFirmSelection(kassaDesk, firmId, activeDeskCount);
}

const PAYMENT_METHODS = new Set(['cash', 'card', 'bank']);

export const processPayment = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  const actorUserId = authUser.userId ? String(authUser.userId) : undefined;

  const rawFirmId = (req.body as any)?.firmId;
  const rawPayerFirmId = (req.body as any)?.payerFirmId ?? (req.body as any)?.counterpartyFirmId;
  const rawReceiverFirmId = (req.body as any)?.receiverFirmId;
  const rawFlightId = (req.body as any)?.flightId;
  const rawAllocationId = (req.body as any)?.allocationId;
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
  const allocationId = typeof rawAllocationId === 'string' ? rawAllocationId.trim() : '';
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
  const payerFirmId = typeof rawPayerFirmId === 'string' && rawPayerFirmId.trim() ? rawPayerFirmId.trim() : firmId;
  const requestedReceiverFirmId = typeof rawReceiverFirmId === 'string' ? rawReceiverFirmId.trim() : '';
  if (payerFirmId !== firmId && !(await canViewRelatedFirm(authUser, payerFirmId))) {
    return res.status(403).json({ error: 'To‘lovchi firma ko‘rish doirasida emas' });
  }
  if (requestedReceiverFirmId && requestedReceiverFirmId !== firmId && !(await canViewRelatedFirm(authUser, requestedReceiverFirmId))) {
    return res.status(403).json({ error: 'To‘lov oluvchi firma ko‘rish doirasida emas' });
  }
  if (requestedReceiverFirmId && payerFirmId === requestedReceiverFirmId) {
    return res.status(400).json({ error: 'To‘lovchi va oluvchi firma bir xil bo‘lmasligi kerak' });
  }
  if (payerFirmId !== firmId && requestedReceiverFirmId && requestedReceiverFirmId !== firmId) {
    return res.status(400).json({ error: 'Kassa firmasi to‘lovchi yoki oluvchi bo‘lishi kerak' });
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
    if (method !== 'bank') {
      kassaDesk = await resolveKassaDesk(authUser, rawKassaDeskId);
      await assertKassirDeskAccess(authUser, kassaDesk?.id);
      const deskFirmId = role === 'FIRM' && firmCanOperateKassa ? operatorFirmId : firmId;
      await assertKassaDeskForFirm(kassaDesk, deskFirmId);
    }
  } catch (err: any) {
      return res.status(err?.statusCode || 400).json({ error: err.message || 'Invalid kassa desk' });
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
    const paymentCard = await prisma.paymentCard.findFirst({
      where: { id: paymentCardId, status: 'ACTIVE', deletedAt: null },
      select: { currency: true, firmId: true },
    });
    if (!paymentCard) return res.status(404).json({ error: 'Payment card not found or inactive' });
    if (normalizeCurrency(paymentCard.currency) !== currency) {
      return res.status(400).json({ error: `Payment card currency is ${paymentCard.currency}, not ${currency}` });
    }
    if (paymentCard.firmId && paymentCard.firmId !== firmId) {
      return res.status(403).json({ error: 'Payment card belongs to another firm' });
    }
  }

  const operationalAccount = await ensureFinancialAccount({
    firmId, currency,
    type: method === 'card' ? FinancialAccountType.CARD : method === 'bank' ? FinancialAccountType.BANK : FinancialAccountType.CASH,
    kassaDeskId: method === 'cash' ? kassaDesk?.id : undefined,
    paymentCardId: method === 'card' ? paymentCardId : undefined,
    createdByUserId: actorUserId,
  });

  try {
    await prisma.$transaction(async (tx) => {
      const [firm, payerFirm, requestedReceiverFirm, flight, allocation, paymentCard] = await Promise.all([
        tx.firm.findUnique({ where: { id: firmId }, select: { id: true, name: true } }),
        tx.firm.findUnique({ where: { id: payerFirmId }, select: { id: true, name: true } }),
        requestedReceiverFirmId
          ? tx.firm.findUnique({ where: { id: requestedReceiverFirmId }, select: { id: true, name: true } })
          : Promise.resolve(null),
        flightId ? tx.flight.findUnique({ where: { id: flightId }, select: { id: true, ownerFirmId: true, airline: { select: { firmId: true } } } }) : Promise.resolve(null),
        allocationId ? tx.ticketAllocation.findUnique({ where: { id: allocationId }, select: { id: true, flightId: true, fromFirmId: true, toFirmId: true, status: true } }) : Promise.resolve(null),
        paymentCardId
          ? tx.paymentCard.findUnique({ where: { id: paymentCardId }, select: { id: true, ownerName: true, cardNumber: true, currency: true, status: true } })
          : Promise.resolve(null),
      ]);

      if (!firm) throw new Error('Firm not found');
      if (!payerFirm) throw new Error('Payer firm not found');
      if (requestedReceiverFirmId && !requestedReceiverFirm) throw new Error('Receiver firm not found');
      if (flightId && !flight) throw new Error('Flight not found');
      if (allocationId && (!allocation || allocation.status !== 'ACCEPTED' || allocation.toFirmId !== firmId || (flightId && allocation.flightId !== flightId))) throw new Error('Accepted allocation not found for this paying firm');
      if (allocationId && payerFirmId !== allocation?.toFirmId) throw new Error('To‘lovchi firma ajratmani olgan firma bilan bir xil bo‘lishi kerak');
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
      if (method !== 'bank') await assertKassaOpenForDate(dayStart, kassaDesk?.id);

      const exchangeRate = await resolveExchangeRateToUzs(authUser, {
        currency,
        date: paymentDate,
        overrideRate: rawExchangeRate,
        rateFirmId: firmId,
      });
      const baseAmount = amount.mul(exchangeRate).toDecimalPlaces(4);
      const receiverFirmId = requestedReceiverFirmId
        || (payerFirmId !== firmId ? firmId : allocation?.fromFirmId || flight?.ownerFirmId || flight?.airline?.firmId || undefined);
      const cashFlow = payerFirmId === firmId && receiverFirmId !== firmId ? 'OUT' : 'IN';
      const receiverLabel = requestedReceiverFirm?.name || (receiverFirmId === firmId ? firm.name : receiverFirmId || 'Admin / Airline');

      await tx.transaction.create({
        data: {
          firmId,
          payerFirmId,
          receiverFirmId,
          direction: receiverFirmId ? 'FIRM_TO_FIRM' : 'FIRM_TO_PLATFORM',
          subjectType: allocationId ? 'TICKET_ALLOCATION' : flightId ? 'FLIGHT' : 'DEPOSIT',
          subjectId: allocationId || flightId || firmId,
          flightId: allocation?.flightId || flightId || undefined,
          createdByUserId: actorUserId,
          kassaDeskId: kassaDesk?.id,
          sourceAccountId: cashFlow === 'OUT' ? operationalAccount.id : undefined,
          destinationAccountId: cashFlow === 'IN' ? operationalAccount.id : undefined,
          type: 'PAYMENT',
          sourceMode: method === 'cash' ? 'MANUAL_CASH' : method === 'card' ? 'MANUAL_CARD' : 'MANUAL_BANK',
          status: 'CONFIRMED',
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
            payerLabel: payerFirm.name,
            allocationId: allocation?.id,
            receiverFirmId,
            receiverLabel,
            directionLabel: `${payerFirm.name} -> ${receiverLabel}`,
            cashFlow,
          } as Prisma.InputJsonValue,
        }
      });
    });
    res.json({ success: true, message: 'Payment recorded' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};
