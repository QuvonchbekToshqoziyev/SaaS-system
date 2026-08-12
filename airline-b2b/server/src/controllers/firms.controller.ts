import { Request, Response } from 'express';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';
import { seedDefaultExpenseCategories } from '../services/expense-categories.service';
import { isPayableDebtType, payableAndPaymentTypeFilter } from '../utils/transaction-types';
import { canAccessFirm, canViewRelatedFirm, getRelatedFirmIds } from '../utils/access';
import { writeAuditLog } from '../utils/audit';
import { canManageFirmWork } from '../utils/firm-user-roles';
import { resolveExchangeRateToUzs } from '../services/currency-rates.service';
import { visibleTransactionWhere } from '../utils/transaction-visibility';
import { backfillExternalAirlineFirms } from '../services/external-airline-firms';

type AuthUser = {
  userId?: string;
  role?: string;
  firmId?: string | null;
  firmRole?: string | null;
};

function getAuthUser(req: Request): AuthUser {
  return ((req as any).user || {}) as AuthUser;
}

function sumToNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getFirmBalances(firmIds?: string[]) {
  const rows = await prisma.transaction.findMany({
    where: visibleTransactionWhere({
      type: payableAndPaymentTypeFilter,
      ...(firmIds?.length
        ? {
            OR: [
              { firmId: { in: firmIds } },
              { payerFirmId: { in: firmIds } },
              { receiverFirmId: { in: firmIds } },
            ],
          }
        : {}),
    }),
    select: { firmId: true, payerFirmId: true, receiverFirmId: true, type: true, baseAmount: true },
  });

  const byFirm = new Map<string, { debt: number; paid: number; receivable: number; received: number }>();
  const get = (firmId: string) => byFirm.get(firmId) || { debt: 0, paid: 0, receivable: 0, received: 0 };
  const put = (firmId: string, value: { debt: number; paid: number; receivable: number; received: number }) => byFirm.set(firmId, value);

  for (const row of rows) {
    const value = sumToNumber(row.baseAmount);
    if (isPayableDebtType(row.type)) {
      const debtorId = row.payerFirmId || row.firmId;
      const debtor = get(debtorId);
      debtor.debt += value;
      put(debtorId, debtor);
      if (row.receiverFirmId) {
        const creditor = get(row.receiverFirmId);
        creditor.receivable += value;
        put(row.receiverFirmId, creditor);
      }
    }
    if (row.type === 'PAYMENT') {
      const payerId = row.payerFirmId || row.firmId;
      const payer = get(payerId);
      payer.paid += value;
      put(payerId, payer);
      if (row.receiverFirmId) {
        const receiver = get(row.receiverFirmId);
        receiver.received += value;
        put(row.receiverFirmId, receiver);
      }
    }
  }

  return byFirm;
}

function withBalance<T extends { id: string }>(firm: T, balances: Map<string, { debt: number; paid: number; receivable: number; received: number }>) {
  const totals = balances.get(firm.id) || { debt: 0, paid: 0, receivable: 0, received: 0 };
  const balance = totals.paid - totals.debt;
  const receivableOutstanding = Math.max(totals.receivable - totals.received, 0);
  return {
    ...firm,
    debt: totals.debt,
    paid: totals.paid,
    receivable: totals.receivable,
    received: totals.received,
    receivableOutstanding,
    balance,
    outstanding: Math.max(-balance, 0),
    credit: Math.max(balance, 0) + receivableOutstanding,
  };
}

function parseCreditLimit(value: unknown): Prisma.Decimal | undefined {
  if (value === null || value === undefined || String(value).trim() === '') return undefined;
  const decimal = new Prisma.Decimal(String(value).trim());
  if (!decimal.isFinite() || decimal.lt(0)) {
    throw new Error('creditLimit must be zero or greater');
  }
  return decimal.toDecimalPlaces(4);
}

function normalizeCurrency(value: unknown): string {
  const currency = String(value || 'USD').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid currency code');
  return currency;
}

function parseDecimal(value: unknown): Prisma.Decimal | undefined {
  if (value === null || value === undefined || String(value).trim() === '') return undefined;
  const decimal = new Prisma.Decimal(String(value).trim());
  if (!decimal.isFinite()) throw new Error('Amount must be a valid number');
  return decimal.toDecimalPlaces(4);
}

function readPriorBalanceInput(body: any) {
  const amount = parseDecimal(body?.priorBalanceAmount ?? body?.balanceAdjustmentAmount);
  if (!amount) return null;
  const direction = String(body?.priorBalanceDirection ?? body?.balanceAdjustmentDirection ?? 'DEBT').trim().toUpperCase();
  if (!['DEBT', 'CREDIT'].includes(direction)) {
    throw new Error('Balance direction must be DEBT or CREDIT');
  }
  if (!amount.gt(0)) throw new Error('Prior balance amount must be greater than 0');
  return {
    amount,
    direction,
    currency: normalizeCurrency(body?.priorBalanceCurrency ?? body?.balanceAdjustmentCurrency ?? body?.currency ?? 'UZS'),
    counterpartyFirmId: typeof (body?.priorBalanceCounterpartyFirmId ?? body?.balanceAdjustmentCounterpartyFirmId) === 'string'
      ? String(body?.priorBalanceCounterpartyFirmId ?? body?.balanceAdjustmentCounterpartyFirmId).trim()
      : '',
    note: typeof (body?.priorBalanceNote ?? body?.balanceAdjustmentNote) === 'string'
      ? String(body?.priorBalanceNote ?? body?.balanceAdjustmentNote).trim()
      : '',
    exchangeRate: body?.exchangeRate ?? body?.priorBalanceExchangeRate ?? body?.balanceAdjustmentExchangeRate,
  };
}

async function createPriorBalanceTransaction(args: {
  tx: Prisma.TransactionClient;
  authUser: AuthUser;
  targetFirmId: string;
  targetFirmName: string;
  actorFirmId: string | null;
  input: NonNullable<ReturnType<typeof readPriorBalanceInput>>;
}) {
  const counterpartyFirmId = args.input.counterpartyFirmId || args.actorFirmId || '';
  if (args.input.direction === 'CREDIT' && !counterpartyFirmId) {
    throw new Error('Counterparty firm is required when recording firm credit');
  }
  if (counterpartyFirmId === args.targetFirmId) {
    throw new Error('Counterparty firm must be different');
  }

  const counterparty = counterpartyFirmId
    ? await args.tx.firm.findUnique({ where: { id: counterpartyFirmId }, select: { id: true, name: true } })
    : null;
  if (counterpartyFirmId && !counterparty) throw new Error('Counterparty firm not found');

  const exchangeRate = await resolveExchangeRateToUzs(args.authUser, {
    currency: args.input.currency,
    date: new Date(),
    overrideRate: args.input.exchangeRate,
  });
  const baseAmount = args.input.amount.mul(exchangeRate).toDecimalPlaces(4);
  const targetOwes = args.input.direction === 'DEBT';

  return args.tx.transaction.create({
    data: {
      firmId: args.targetFirmId,
      payerFirmId: targetOwes ? args.targetFirmId : counterpartyFirmId,
      receiverFirmId: targetOwes ? counterpartyFirmId || undefined : args.targetFirmId,
      createdByUserId: args.authUser.userId ? String(args.authUser.userId) : undefined,
      type: 'PAYABLE',
      direction: 'OPENING_BALANCE',
      subjectType: 'FIRM_OPENING_BALANCE',
      subjectId: args.targetFirmId,
      originalAmount: args.input.amount,
      currency: args.input.currency,
      exchangeRate: exchangeRate.toDecimalPlaces(6),
      baseAmount,
      metadata: {
        note: args.input.note,
        targetFirmName: args.targetFirmName,
        counterpartyFirmId: counterparty?.id,
        counterpartyLabel: counterparty?.name,
        directionLabel: targetOwes
          ? `${args.targetFirmName} owes ${counterparty?.name || 'opening balance'}`
          : `${counterparty?.name || 'counterparty'} owes ${args.targetFirmName}`,
        source: 'manual_prior_balance',
      },
    },
  });
}

function parseOptionalDate(value: unknown): Date | undefined {
  if (value === null || value === undefined || String(value).trim() === '') return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error('Invalid subscription date');
  return date;
}

export const listFirms = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  await backfillExternalAirlineFirms();
  const scopedFirmIds = await getRelatedFirmIds(authUser);

  const firms = await prisma.firm.findMany({
    where: {
      status: { not: 'DELETED' },
      deletedAt: null,
      ...(scopedFirmIds ? { id: { in: scopedFirmIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      contactFullName: true,
      phone: true,
      subscriptionEndsAt: true,
      creditLimit: true,
      currency: true,
      kind: true,
      status: true,
      createdByUserId: true,
      createdByFirmId: true,
      createdByRole: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { name: 'asc' },
  });

  const balances = await getFirmBalances(firms.map((firm) => firm.id));
  const rows = firms
    .map((firm) => withBalance(firm, balances))
    .sort((a, b) => {
      const debtDiff = b.outstanding - a.outstanding;
      if (debtDiff !== 0) return debtDiff;
      return a.name.localeCompare(b.name);
    });

  return res.json(rows);
};

export const getFirmById = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const id = String(req.params.id || '');

  if (!id) return res.status(400).json({ error: 'Firm id is required' });

  if (!(await canViewRelatedFirm(authUser, id))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const firm = await prisma.firm.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      contactFullName: true,
      phone: true,
      subscriptionEndsAt: true,
      creditLimit: true,
      currency: true,
      kind: true,
      status: true,
      createdByUserId: true,
      createdByFirmId: true,
      createdByRole: true,
      createdAt: true,
      updatedAt: true,
      users: {
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!firm) return res.status(404).json({ error: 'Firm not found' });
  if (firm.status === 'DELETED') return res.status(404).json({ error: 'Firm not found' });

  const balances = await getFirmBalances([firm.id]);
  return res.json(withBalance(firm, balances));
};

export const createFirm = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = String(authUser.role || '').toUpperCase();
  const actorUserId = authUser.userId ? String(authUser.userId) : '';
  const actorFirmId = authUser.firmId ? String(authUser.firmId) : null;

  if (!['SUPERADMIN', 'ADMIN', 'FIRM'].includes(role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (role === 'FIRM' && !canManageFirmWork(authUser)) {
    return res.status(403).json({ error: 'Only firm admins and managers can add partner firms' });
  }
  if (!actorUserId) return res.status(401).json({ error: 'Unauthorized' });

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'Firm name is required' });
  if (role === 'FIRM' && !actorFirmId) return res.status(400).json({ error: 'Firm account is missing firmId' });

  try {
    const subscriptionEndsAt = parseOptionalDate(req.body?.subscriptionEndsAt);
    const creditLimit = parseCreditLimit(req.body?.creditLimit);
    const priorBalance = readPriorBalanceInput(req.body);
    const created = await prisma.$transaction(async (tx) => {
      const firm = await tx.firm.create({
        data: {
          name,
          contactFullName: typeof req.body?.contactFullName === 'string' ? req.body.contactFullName.trim() || undefined : undefined,
          phone: typeof req.body?.phone === 'string' ? req.body.phone.trim() || undefined : undefined,
          subscriptionEndsAt,
          creditLimit,
          currency: normalizeCurrency(req.body?.currency || 'USD'),
          kind: role === 'FIRM'
            ? 'CONTRACTOR'
            : String(req.body?.kind || '').toUpperCase() === 'AIRLINE'
              ? 'AIRLINE'
              : 'AGENCY',
          status: 'ACTIVE',
          createdByUserId: actorUserId,
          createdByFirmId: role === 'FIRM' ? actorFirmId : null,
          createdByRole: role,
        },
        select: {
          id: true,
          name: true,
          contactFullName: true,
          phone: true,
          subscriptionEndsAt: true,
          creditLimit: true,
          currency: true,
          kind: true,
          status: true,
          createdByUserId: true,
          createdByFirmId: true,
          createdByRole: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (role === 'ADMIN') {
        await tx.userFirmAccess.create({
          data: { userId: actorUserId, firmId: firm.id },
        });
      }

      await seedDefaultExpenseCategories(tx, firm.id, actorUserId);

      if (priorBalance) {
        await createPriorBalanceTransaction({
          tx,
          authUser,
          targetFirmId: firm.id,
          targetFirmName: firm.name,
          actorFirmId: role === 'FIRM' ? actorFirmId : null,
          input: priorBalance,
        });
      }

      return firm;
    });

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'firm',
      entityId: created.id,
      entityLabel: created.name,
      summary: role === 'FIRM' ? `Firm added partner firm ${created.name}` : `Created firm ${created.name}`,
      after: created,
      metadata: { createdByRole: role, createdByFirmId: role === 'FIRM' ? actorFirmId : null, directCreate: true },
    });

    const balances = await getFirmBalances([created.id]);
    return res.status(201).json(withBalance(created, balances));
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to create firm' });
  }
};

export const updateFirm = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = String(authUser.role || '').toUpperCase();
  const id = String(req.params.id || '');
  if (!id) return res.status(400).json({ error: 'Firm id is required' });

  try {
    const before = await prisma.firm.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        contactFullName: true,
        phone: true,
        subscriptionEndsAt: true,
        creditLimit: true,
        currency: true,
        accountingFramework: true,
        accountingPolicyVersion: true,
        chartOfAccountsVersion: true,
        reportingStartDate: true,
        fiscalYearStart: true,
        timezone: true,
        kind: true,
        status: true,
      },
    });
    const data: Prisma.FirmUpdateInput = {};
    const priorBalance = role === 'SUPERADMIN' ? readPriorBalanceInput(req.body) : null;
    if (role === 'FIRM') {
      if (!authUser.firmId || String(authUser.firmId) !== id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (typeof req.body?.currency === 'string' && req.body.currency.trim()) {
        data.currency = req.body.currency.trim().toUpperCase();
      }
      if (String(authUser.firmRole || '').toUpperCase() === 'FIRM_ADMIN') {
        if (typeof req.body?.accountingFramework === 'string' && ['IFRS', 'BHMS', 'MANAGEMENT_ONLY'].includes(req.body.accountingFramework.toUpperCase())) data.accountingFramework = req.body.accountingFramework.toUpperCase();
        if (typeof req.body?.accountingPolicyVersion === 'string' && req.body.accountingPolicyVersion.trim()) data.accountingPolicyVersion = req.body.accountingPolicyVersion.trim();
        if (typeof req.body?.chartOfAccountsVersion === 'string' && req.body.chartOfAccountsVersion.trim()) data.chartOfAccountsVersion = req.body.chartOfAccountsVersion.trim();
        if (typeof req.body?.timezone === 'string' && req.body.timezone.trim()) data.timezone = req.body.timezone.trim();
        if (Number.isInteger(req.body?.fiscalYearStart) && req.body.fiscalYearStart >= 1 && req.body.fiscalYearStart <= 12) data.fiscalYearStart = req.body.fiscalYearStart;
        if (req.body?.reportingStartDate !== undefined) data.reportingStartDate = req.body.reportingStartDate ? new Date(String(req.body.reportingStartDate)) : null;
      }
    } else if (role === 'SUPERADMIN') {
    if (typeof req.body?.name === 'string' && req.body.name.trim()) {
      data.name = req.body.name.trim();
    }
    if (typeof req.body?.contactFullName === 'string') {
      data.contactFullName = req.body.contactFullName.trim() || null;
    }
    if (typeof req.body?.phone === 'string') {
      data.phone = req.body.phone.trim() || null;
    }
    if (req.body?.subscriptionEndsAt !== undefined) {
      const raw = String(req.body.subscriptionEndsAt || '').trim();
      data.subscriptionEndsAt = raw ? new Date(raw) : null;
    }
    if (req.body?.creditLimit !== undefined) {
      data.creditLimit = parseCreditLimit(req.body.creditLimit);
    }
    if (typeof req.body?.currency === 'string' && req.body.currency.trim()) {
      data.currency = req.body.currency.trim().toUpperCase();
    }
    if (typeof req.body?.accountingFramework === 'string' && ['IFRS', 'BHMS', 'MANAGEMENT_ONLY'].includes(req.body.accountingFramework.toUpperCase())) data.accountingFramework = req.body.accountingFramework.toUpperCase();
    if (typeof req.body?.accountingPolicyVersion === 'string' && req.body.accountingPolicyVersion.trim()) data.accountingPolicyVersion = req.body.accountingPolicyVersion.trim();
    if (typeof req.body?.chartOfAccountsVersion === 'string' && req.body.chartOfAccountsVersion.trim()) data.chartOfAccountsVersion = req.body.chartOfAccountsVersion.trim();
    if (typeof req.body?.timezone === 'string' && req.body.timezone.trim()) data.timezone = req.body.timezone.trim();
    if (Number.isInteger(req.body?.fiscalYearStart) && req.body.fiscalYearStart >= 1 && req.body.fiscalYearStart <= 12) data.fiscalYearStart = req.body.fiscalYearStart;
    if (req.body?.reportingStartDate !== undefined) data.reportingStartDate = req.body.reportingStartDate ? new Date(String(req.body.reportingStartDate)) : null;
    if (typeof req.body?.kind === 'string' && ['AGENCY', 'AIRLINE', 'CONTRACTOR'].includes(req.body.kind.toUpperCase())) {
      data.kind = req.body.kind.toUpperCase() as any;
    }
    if (typeof req.body?.status === 'string' && ['ACTIVE', 'SUSPENDED'].includes(req.body.status.toUpperCase())) {
      data.status = req.body.status.toUpperCase() as any;
    }
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (Object.keys(data).length === 0 && !priorBalance) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const firm = await prisma.$transaction(async (tx) => {
      const updated = Object.keys(data).length > 0
        ? await tx.firm.update({
            where: { id },
            data,
            select: {
              id: true,
              name: true,
              contactFullName: true,
              phone: true,
              subscriptionEndsAt: true,
              creditLimit: true,
              currency: true,
              accountingFramework: true,
              accountingPolicyVersion: true,
              chartOfAccountsVersion: true,
              reportingStartDate: true,
              fiscalYearStart: true,
              timezone: true,
              kind: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          })
        : await tx.firm.findUniqueOrThrow({
            where: { id },
            select: {
              id: true,
              name: true,
              contactFullName: true,
              phone: true,
              subscriptionEndsAt: true,
              creditLimit: true,
              currency: true,
              accountingFramework: true,
              accountingPolicyVersion: true,
              chartOfAccountsVersion: true,
              reportingStartDate: true,
              fiscalYearStart: true,
              timezone: true,
              kind: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          });
      if (priorBalance) {
        await createPriorBalanceTransaction({
          tx,
          authUser,
          targetFirmId: updated.id,
          targetFirmName: updated.name,
          actorFirmId: null,
          input: priorBalance,
        });
      }
      return updated;
    });
    const balances = await getFirmBalances([firm.id]);
    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'firm',
      entityId: firm.id,
      entityLabel: firm.name,
      summary: `Updated firm ${firm.name}`,
      before,
      after: firm,
      metadata: { fields: Object.keys(data), priorBalanceAdded: Boolean(priorBalance) },
    });
    return res.json(withBalance(firm, balances));
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Firm not found' });
    return res.status(400).json({ error: err?.message || 'Failed to update firm' });
  }
};

export const deleteFirm = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = String(authUser.role || '').toUpperCase();
  const actorUserId = authUser.userId ? String(authUser.userId) : '';
  const id = String(req.params.id || '').trim();

  if (role !== 'SUPERADMIN') return res.status(403).json({ error: 'Forbidden' });
  if (!actorUserId) return res.status(401).json({ error: 'Unauthorized' });
  if (!id) return res.status(400).json({ error: 'Firm id is required' });

  try {
    const before = await prisma.firm.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        contactFullName: true,
        phone: true,
        subscriptionEndsAt: true,
        creditLimit: true,
        currency: true,
        status: true,
        createdByUserId: true,
        createdByFirmId: true,
        createdByRole: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!before || before.status === 'DELETED' || before.deletedAt) {
      return res.status(404).json({ error: 'Firm not found' });
    }

    const deleted = await prisma.$transaction(async (tx) => {
      await tx.userFirmAccess.deleteMany({ where: { firmId: id } });
      await tx.user.updateMany({
        where: { firmId: id, role: 'FIRM', status: { not: 'DELETED' }, deletedAt: null },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          deletedByUserId: actorUserId,
          deleteReason: 'Firm was deleted',
        },
      });
      await tx.kassaDesk.updateMany({
        where: { firmId: id, status: { not: 'DELETED' }, deletedAt: null },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          deletedByUserId: actorUserId,
          deleteReason: 'Firm was deleted',
        },
      });
      return tx.firm.update({
        where: { id },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          deletedByUserId: actorUserId,
          deleteReason: typeof req.body?.reason === 'string' ? req.body.reason.trim() || null : null,
        },
        select: {
          id: true,
          name: true,
          contactFullName: true,
          phone: true,
          subscriptionEndsAt: true,
          creditLimit: true,
          currency: true,
          status: true,
          createdByUserId: true,
          createdByFirmId: true,
          createdByRole: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    await writeAuditLog(req, {
      action: 'SOFT_DELETE',
      entityType: 'firm',
      entityId: id,
      entityLabel: before.name,
      summary: `Soft deleted firm ${before.name}`,
      before,
      after: deleted,
    });
    return res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Firm not found' });
    return res.status(400).json({ error: err?.message || 'Failed to delete firm' });
  }
};
