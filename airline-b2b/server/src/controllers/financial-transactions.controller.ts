import { FinancialAccount, Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { prisma } from '../db';
import { FINANCIAL_OPERATION_TYPES, FinancialOperationType, isNonCashOperation, resolveFinancialImpact } from '../domains/transactions/financial-impact';
import { activeFlightWhere, firmFlightParticipationWhere } from '../domains/flights/flight-scope';
import { resolveExchangeRateToUzs } from '../services/currency-rates.service';
import { canAccessFirm, normalizeRole } from '../utils/access';

type AuthUser = { userId?: string; role?: string; firmRole?: string | null; firmId?: string | null };
const auth = (req: Request) => ((req as any).user || {}) as AuthUser;

function decimal(value: unknown) {
  try {
    const parsed = new Prisma.Decimal(String(value ?? ''));
    return parsed.isFinite() ? parsed : null;
  } catch { return null; }
}

function date(value: unknown, fallback = new Date()) {
  if (!value) return fallback;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function canCreate(user: AuthUser) {
  const role = normalizeRole(user.role);
  return role === 'SUPERADMIN' || role === 'ADMIN' || (role === 'FIRM' && String(user.firmRole || '').toUpperCase() === 'FIRM_ADMIN');
}

function operationNeedsSource(type: FinancialOperationType) {
  return ['BANK_EXPENSE', 'BANK_TO_BANK_TRANSFER', 'CREDITOR_PAYMENT_MADE', 'ADVANCE_PAID', 'BANK_FEE', 'CURRENCY_EXCHANGE'].includes(type);
}

function operationNeedsDestination(type: FinancialOperationType) {
  return ['BANK_INCOME', 'BANK_TO_BANK_TRANSFER', 'DEBTOR_PAYMENT_RECEIVED', 'ADVANCE_RECEIVED', 'CURRENCY_EXCHANGE'].includes(type);
}

async function accessibleAccount(user: AuthUser, id: string, firmId: string) {
  if (!id) return null;
  const account = await prisma.financialAccount.findFirst({ where: { id, firmId, status: 'ACTIVE', deletedAt: null } });
  if (!account || !(await canAccessFirm(user, account.firmId))) return null;
  return account;
}

async function resolveFirm(req: Request) {
  const user = auth(req);
  return normalizeRole(user.role) === 'FIRM' ? String(user.firmId || '') : String(req.body?.firmId || '');
}

type DebtKind = 'RECEIVABLE' | 'PAYABLE';

async function loadDebt(id: string, firmId: string, kind: DebtKind) {
  if (!id) return null;
  const row = await prisma.transaction.findFirst({
    where: { id, firmId, deletedAt: null, status: { notIn: ['CANCELLED', 'REVERSED', 'DELETED'] }, type: kind === 'RECEIVABLE' ? 'SALE' : 'PAYABLE' },
    include: { payerFirm: { select: { id: true, name: true } }, receiverFirm: { select: { id: true, name: true } } },
  });
  if (!row) return null;
  const allocated = await prisma.paymentAllocation.aggregate({
    where: { companyId: firmId, documentId: id, documentType: kind, payment: { deletedAt: null, status: { notIn: ['CANCELLED', 'REVERSED', 'DELETED'] } } },
    _sum: { allocatedAmount: true },
  });
  return { ...row, outstanding: row.originalAmount.sub(allocated._sum.allocatedAmount || 0) };
}

function accountCode(account: FinancialAccount | null) {
  if (!account) return undefined;
  if (['BANK', 'BANK_ACCOUNT'].includes(account.type)) return `BANK:${account.id}`;
  return `${account.type}:${account.id}`;
}

const settlementAuditAction: Partial<Record<FinancialOperationType, string>> = {
  MUTUAL_OFFSET: 'MUTUAL_OFFSET_APPLIED',
  SERVICE_OFFSET: 'SERVICE_OFFSET_APPLIED',
  TICKET_OFFSET: 'TICKET_OFFSET_APPLIED',
  TOUR_OFFSET: 'TOUR_OFFSET_APPLIED',
  PRODUCT_OFFSET: 'DEBT_SETTLEMENT_APPLIED',
  THREE_PARTY_SETTLEMENT: 'DEBT_SETTLEMENT_APPLIED',
  COMPENSATION: 'DEBT_SETTLEMENT_APPLIED',
  ADVANCE_OFFSET: 'DEBT_SETTLEMENT_APPLIED',
  OVERPAYMENT_OFFSET: 'DEBT_SETTLEMENT_APPLIED',
  MANUAL_ACCOUNTING_ADJUSTMENT: 'DEBT_SETTLEMENT_APPLIED',
};

function settlementInstrument(body: Request['body']) {
  const method = String(body?.settlementInstrument || body?.paymentWith || body?.settlementWith || body?.closeWith || '').trim().toUpperCase();
  const allowed = ['PUL', 'CASH', 'BANK', 'CARD', 'BILET', 'TICKET', 'TUR', 'TOUR', 'VISA', 'HOTEL', 'PAKET', 'PACKAGE', 'SERVICE', 'XIZMAT', 'PRODUCT', 'OMBOR', 'MUTUAL', 'ADVANCE', 'OTHER'];
  return allowed.includes(method) ? method : null;
}

export async function previewFinancialTransaction(req: Request, res: Response) {
  const operationType = String(req.body?.operationType || '').toUpperCase() as FinancialOperationType;
  if (!FINANCIAL_OPERATION_TYPES.includes(operationType)) return res.status(400).json({ error: 'Operatsiya turi noto‘g‘ri' });
  const impact = resolveFinancialImpact({
    operationType,
    economicPurpose: req.body?.economicPurpose,
    expenseAccountCode: req.body?.expenseAccountCode,
    debitAccountCode: req.body?.debitAccountCode,
    creditAccountCode: req.body?.creditAccountCode,
  });
  return res.json({ operationType, ...impact, bankCashEffect: isNonCashOperation(operationType) ? 0 : null });
}

export async function createFinancialTransaction(req: Request, res: Response) {
  const user = auth(req);
  if (!canCreate(user)) return res.status(403).json({ error: 'Bu operatsiyani yaratish uchun ruxsat yo‘q' });
  const firmId = await resolveFirm(req);
  if (!firmId || !(await canAccessFirm(user, firmId))) return res.status(403).json({ error: 'Forbidden' });

  const operationType = String(req.body?.operationType || '').toUpperCase() as FinancialOperationType;
  if (!FINANCIAL_OPERATION_TYPES.includes(operationType)) return res.status(400).json({ error: 'Operatsiya turi tanlanishi kerak' });
  const amount = decimal(req.body?.amount);
  const currency = String(req.body?.currency || '').trim().toUpperCase();
  if (!amount?.gt(0) || !/^[A-Z]{3}$/.test(currency)) return res.status(400).json({ error: 'Musbat summa va valyuta talab qilinadi' });

  const sourceAccountId = String(req.body?.sourceAccountId || '').trim();
  const destinationAccountId = String(req.body?.destinationAccountId || '').trim();
  const [sourceAccount, destinationAccount] = await Promise.all([
    accessibleAccount(user, sourceAccountId, firmId),
    accessibleAccount(user, destinationAccountId, firmId),
  ]);
  if ((sourceAccountId && !sourceAccount) || (destinationAccountId && !destinationAccount)) return res.status(403).json({ error: 'Bank hisobi boshqa firmaga tegishli yoki mavjud emas' });
  if (operationNeedsSource(operationType) && !sourceAccount) return res.status(400).json({ error: 'Manba bank hisobi tanlanishi kerak' });
  if (operationNeedsDestination(operationType) && !destinationAccount) return res.status(400).json({ error: 'Qabul qiluvchi bank hisobi tanlanishi kerak' });
  if (sourceAccount && ['CASH', 'CASH_DESK', 'CARD', 'PAYMENT_CARD'].includes(sourceAccount.type)) return res.status(400).json({ error: 'Naqd yoki karta harakati Kassa modulida kiritiladi' });
  if (destinationAccount && ['CASH', 'CASH_DESK', 'CARD', 'PAYMENT_CARD'].includes(destinationAccount.type)) return res.status(400).json({ error: 'Naqd yoki karta harakati Kassa modulida kiritiladi' });
  if (sourceAccount && sourceAccount.currency !== currency) return res.status(400).json({ error: 'Manba hisobi valyutasi mos emas' });

  const destinationAmount = decimal(req.body?.destinationAmount) || amount;
  const destinationCurrency = destinationAccount?.currency || currency;
  if (destinationAccount && destinationCurrency !== currency && !['CURRENCY_EXCHANGE'].includes(operationType)) return res.status(400).json({ error: 'Turli valyutadagi hisoblar uchun Valyuta ayirboshlashni tanlang' });
  if (sourceAccount && destinationAccount && sourceAccount.id === destinationAccount.id) return res.status(400).json({ error: 'Manba va qabul qiluvchi hisob bir xil bo‘lmasligi kerak' });

  const receivableId = String(req.body?.receivableId || '').trim();
  const payableId = String(req.body?.payableId || '').trim();
  const [receivable, payable] = await Promise.all([loadDebt(receivableId, firmId, 'RECEIVABLE'), loadDebt(payableId, firmId, 'PAYABLE')]);
  if (receivableId && !receivable) return res.status(403).json({ error: 'Debitorlik bu firma doirasida emas' });
  if (payableId && !payable) return res.status(403).json({ error: 'Kreditorlik bu firma doirasida emas' });
  const closesBothDebts = ['THREE_PARTY_SETTLEMENT', 'MUTUAL_OFFSET', 'COMPENSATION', 'SERVICE_OFFSET', 'TICKET_OFFSET', 'TOUR_OFFSET', 'PRODUCT_OFFSET', 'ADVANCE_OFFSET', 'OVERPAYMENT_OFFSET'].includes(operationType);
  if (closesBothDebts && (!receivable || !payable)) return res.status(400).json({ error: 'Debitorlik va kreditorlik tanlanishi kerak' });
  if (operationType === 'MUTUAL_OFFSET' && receivable && payable && receivable.payerFirmId !== payable.receiverFirmId) return res.status(400).json({ error: 'O‘zaro hisobga olish bir xil agent bo‘yicha bo‘lishi kerak' });
  if (['DEBTOR_PAYMENT_RECEIVED', 'CASH_PAYMENT', 'CARD_PAYMENT'].includes(operationType) && !receivable && !payable) return res.status(400).json({ error: 'Yopiladigan debitorlik yoki kreditorlik tanlanishi kerak' });
  if (operationType === 'DEBTOR_PAYMENT_RECEIVED' && !receivable) return res.status(400).json({ error: 'Debitorlik tanlanishi kerak' });
  if (operationType === 'CREDITOR_PAYMENT_MADE' && !payable) return res.status(400).json({ error: 'Kreditorlik tanlanishi kerak' });
  if (operationType === 'BANK_PAYMENT' && receivable && !destinationAccount) return res.status(400).json({ error: 'Debitorlik to‘lovi uchun qabul qiluvchi bank hisobi tanlanishi kerak' });
  if (operationType === 'BANK_PAYMENT' && payable && !sourceAccount) return res.status(400).json({ error: 'Kreditorlik to‘lovi uchun manba bank hisobi tanlanishi kerak' });
  if (receivable && (receivable.currency !== currency || amount.gt(receivable.outstanding))) return res.status(400).json({ error: `Summa debitorlik qoldig‘idan oshmasligi kerak. Maksimal summa: ${receivable.outstanding} ${receivable.currency}` });
  if (payable && (payable.currency !== currency || amount.gt(payable.outstanding))) return res.status(400).json({ error: `Summa kreditorlik qoldig‘idan oshmasligi kerak. Maksimal summa: ${payable.outstanding} ${payable.currency}` });

  const categoryId = String(req.body?.expenseCategoryId || '').trim() || null;
  const category = categoryId ? await prisma.expenseCategory.findFirst({ where: { id: categoryId, firmId, isActive: true, deletedAt: null } }) : null;
  if (categoryId && !category) return res.status(403).json({ error: 'Xarajat kategoriyasi bu firma doirasida emas' });
  const flightId = String(req.body?.flightId || '').trim() || null;
  const flight = flightId ? await prisma.flight.findFirst({ where: { id: flightId, AND: [activeFlightWhere(), firmFlightParticipationWhere([firmId])] }, select: { id: true } }) : null;
  if (flightId && !flight) return res.status(403).json({ error: 'Reys bu firma doirasida emas' });
  const economicPurpose = String(req.body?.economicPurpose || '').trim().toUpperCase();
  if (operationType === 'BANK_INCOME' && !receivable && !['NEW_SALE', 'ADVANCE_RECEIVED', 'LOAN_REPAYMENT', 'FOUNDER_FUNDS', 'OTHER'].includes(economicPurpose)) return res.status(400).json({ error: 'Bank kirimining iqtisodiy mazmuni tanlanishi kerak' });
  if (operationType === 'BANK_EXPENSE' && !payable && !category) return res.status(400).json({ error: 'Yangi bank xarajati uchun xarajat kategoriyasi tanlanishi kerak' });

  const operationDate = date(req.body?.operationDate || req.body?.paymentDate);
  const documentDate = req.body?.documentDate ? date(req.body.documentDate, new Date()) : null;
  if (!operationDate || req.body?.documentDate && !documentDate) return res.status(400).json({ error: 'Sana noto‘g‘ri' });
  const exchangeRate = await resolveExchangeRateToUzs(user, { currency, date: operationDate, overrideRate: req.body?.exchangeRate, rateFirmId: firmId });
  const baseAmount = amount.mul(exchangeRate).toDecimalPlaces(4);
  const impact = resolveFinancialImpact({ operationType, economicPurpose: receivable ? 'RECEIVABLE_PAYMENT' : payable ? 'PAYABLE_PAYMENT' : economicPurpose, expenseAccountCode: category?.defaultAccountCode || category?.financialStatementGroup, debitAccountCode: req.body?.debitAccountCode, creditAccountCode: req.body?.creditAccountCode, sourceAccountCode: accountCode(sourceAccount), destinationAccountCode: accountCode(destinationAccount) });
  if (impact.debitAccount === impact.creditAccount) return res.status(400).json({ error: 'Debet va kredit schyotlari bir xil bo‘lmasligi kerak' });

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (receivable) await tx.$queryRaw`SELECT id FROM "Transaction" WHERE id = ${receivable.id} FOR UPDATE`;
      if (payable) await tx.$queryRaw`SELECT id FROM "Transaction" WHERE id = ${payable.id} FOR UPDATE`;
      for (const debt of [receivable && { ...receivable, kind: 'RECEIVABLE' }, payable && { ...payable, kind: 'PAYABLE' }].filter(Boolean) as Array<(NonNullable<typeof receivable>) & { kind: DebtKind }>) {
        const allocated = await tx.paymentAllocation.aggregate({ where: { companyId: firmId, documentId: debt.id, documentType: debt.kind, payment: { deletedAt: null, status: { notIn: ['CANCELLED', 'REVERSED', 'DELETED'] } } }, _sum: { allocatedAmount: true } });
        const outstanding = debt.originalAmount.sub(allocated._sum.allocatedAmount || 0);
        if (amount.gt(outstanding)) throw new Error(`Maksimal summa: ${outstanding} ${debt.currency}`);
      }
      const transaction = await tx.transaction.create({ data: {
        firmId, createdByUserId: user.userId, type: 'ADJUSTMENT', operationType, economicPurpose: economicPurpose || null,
        payerFirmId: receivable?.payerFirmId || payable?.payerFirmId || null,
        receiverFirmId: receivable?.receiverFirmId || payable?.receiverFirmId || null,
        direction: isNonCashOperation(operationType) ? 'NON_CASH' : sourceAccount ? destinationAccount ? 'ACCOUNT_TRANSFER' : 'ACCOUNT_OUT' : 'ACCOUNT_IN',
        sourceMode: 'FINANCIAL_MODULE', status: 'APPLIED', approvalStatus: 'APPROVED',
        sourceAccountId: sourceAccount?.id, destinationAccountId: destinationAccount?.id,
        originalAmount: amount.toDecimalPlaces(4), currency, exchangeRate, baseAmount,
        destinationAmount: destinationAccount ? destinationAmount.toDecimalPlaces(4) : null,
        destinationCurrency: destinationAccount ? destinationCurrency : null,
        accountingTreatment: category?.accountingTreatment || (impact.pnlEffect === 'EXPENSE' ? 'EXPENSE' : impact.pnlEffect === 'REVENUE' ? 'REVENUE' : 'BALANCE_SHEET'),
        expenseCategoryId: category?.id, expenseSubcategoryId: category?.parentId ? category.id : null,
        expenseDate: req.body?.expenseDate ? date(req.body.expenseDate) : null, paymentDate: operationDate, documentDate,
        postingDate: operationDate, reportingPeriod: String(req.body?.reportingPeriod || operationDate.toISOString().slice(0, 7)),
        documentNumber: String(req.body?.documentNumber || '').trim() || null, taxDeductible: category?.taxDeductible,
        vatAmount: decimal(req.body?.vatAmount), flightId: flight?.id,
        counterpartyNameSnapshot: String(req.body?.counterpartyName || '').trim() || null,
        metadata: { note: String(req.body?.note || '').trim(), contractNumber: String(req.body?.contractNumber || '').trim() || null, receivableId: receivable?.id, payableId: payable?.id, debtorFirmId: receivable?.payerFirmId, creditorFirmId: payable?.receiverFirmId, settlementInstrument: settlementInstrument(req.body), settlementSubjectType: String(req.body?.settlementSubjectType || req.body?.appliesTo || '').trim().toUpperCase() || null, settlementSubjectId: String(req.body?.settlementSubjectId || '').trim() || null, settlementDetails: req.body?.settlementDetails || null, cashFlowCategory: impact.cashFlowGroup, pnlEffect: impact.pnlEffect, destinationAmount: destinationAmount.toString(), destinationCurrency } as Prisma.InputJsonValue,
      } });
      const journal = await tx.journalEntry.create({ data: { firmId, transactionId: transaction.id, status: 'POSTED', postingDate: operationDate, description: String(req.body?.note || operationType), postedByUserId: user.userId } });
      await tx.ledgerEntry.create({ data: { transactionId: transaction.id, journalEntryId: journal.id, debitAccount: impact.debitAccount, creditAccount: impact.creditAccount, amount: baseAmount, currency: 'UZS', exchangeRateSnapshot: exchangeRate } });
      if (receivable) await tx.paymentAllocation.create({ data: { companyId: firmId, paymentId: transaction.id, documentType: 'RECEIVABLE', documentId: receivable.id, allocatedAmount: amount } });
      if (payable) await tx.paymentAllocation.create({ data: { companyId: firmId, paymentId: transaction.id, documentType: 'PAYABLE', documentId: payable.id, allocatedAmount: amount } });
      await tx.auditLog.create({ data: { actorUserId: user.userId, actorRole: normalizeRole(user.role), action: settlementAuditAction[operationType] || operationType, entityType: 'transaction', entityId: transaction.id, entityLabel: `${operationType} ${amount} ${currency}`, summary: `${operationType} moliyaviy operatsiyasi yaratildi`, after: transaction as unknown as Prisma.InputJsonValue, metadata: { actorFirmId: user.firmId || null, transactionId: transaction.id, journalEntryId: journal.id, receivableIds: receivable ? [receivable.id] : [], payableIds: payable ? [payable.id] : [], bankAccountIds: [sourceAccount?.id, destinationAccount?.id].filter((id): id is string => Boolean(id)), amount: amount.toString(), currency, settlementInstrument: settlementInstrument(req.body) } } });
      return tx.transaction.findUnique({ where: { id: transaction.id }, include: { ledgerEntries: true, journalEntry: true, expenseCategory: true, sourceAccount: true, destinationAccount: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(409).json({ error: error?.message || 'Moliyaviy operatsiyani saqlab bo‘lmadi' });
  }
}

export async function reverseFinancialTransaction(req: Request, res: Response) {
  const user = auth(req);
  if (!canCreate(user)) return res.status(403).json({ error: 'Reversal uchun ruxsat yo‘q' });
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Reversal sababi majburiy' });
  const current = await prisma.transaction.findFirst({
    where: { id: String(req.params.id), sourceMode: 'FINANCIAL_MODULE', deletedAt: null },
    include: { ledgerEntries: true, journalEntry: true },
  });
  if (!current) return res.status(404).json({ error: 'Moliyaviy tranzaksiya topilmadi' });
  if (!(await canAccessFirm(user, current.firmId))) return res.status(403).json({ error: 'Forbidden' });
  if (current.status !== 'APPLIED' || !current.journalEntry || !current.ledgerEntries.length) return res.status(409).json({ error: 'Faqat APPLIED tranzaksiya reversal qilinadi' });

  const reversed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Transaction" WHERE id = ${current.id} FOR UPDATE`;
    const locked = await tx.transaction.findUnique({ where: { id: current.id } });
    if (!locked || locked.status !== 'APPLIED') throw new Error('Tranzaksiya allaqachon o‘zgargan');
    const reversal = await tx.transaction.create({ data: {
      firmId: current.firmId, createdByUserId: user.userId, type: 'ADJUSTMENT', operationType: current.operationType,
      economicPurpose: current.economicPurpose, direction: 'REVERSAL', sourceMode: 'REVERSAL', status: 'APPLIED', approvalStatus: 'APPROVED',
      sourceAccountId: current.destinationAccountId, destinationAccountId: current.sourceAccountId,
      originalAmount: current.destinationAmount || current.originalAmount,
      currency: current.destinationCurrency || current.currency,
      exchangeRate: current.exchangeRate, baseAmount: current.baseAmount,
      destinationAmount: current.sourceAccountId ? current.originalAmount : null,
      destinationCurrency: current.sourceAccountId ? current.currency : null,
      accountingTreatment: 'REVERSAL', postingDate: new Date(), paymentDate: new Date(), reportingPeriod: new Date().toISOString().slice(0, 7),
      reversedTransactionId: current.id,
      metadata: { reversalReason: reason, reversedTransactionId: current.id, cashFlowCategory: (current.metadata as any)?.cashFlowCategory, pnlEffect: 'REVERSAL' },
    } });
    const journal = await tx.journalEntry.create({ data: { firmId: current.firmId, transactionId: reversal.id, status: 'POSTED', postingDate: new Date(), description: `Reversal: ${reason}`, reversalOfId: current.journalEntry!.id, postedByUserId: user.userId } });
    await tx.ledgerEntry.createMany({ data: current.ledgerEntries.map((line) => ({ transactionId: reversal.id, journalEntryId: journal.id, debitAccount: line.creditAccount, creditAccount: line.debitAccount, amount: line.amount, currency: line.currency, exchangeRateSnapshot: line.exchangeRateSnapshot })) });
    await tx.transaction.update({ where: { id: current.id }, data: { status: 'REVERSED', reversedTransactionId: reversal.id, updatedByUserId: user.userId, deletionReason: reason } });
    await tx.auditLog.create({ data: { actorUserId: user.userId, actorRole: normalizeRole(user.role), action: 'TRANSACTION_REVERSED', entityType: 'transaction', entityId: current.id, summary: `Moliyaviy tranzaksiya reversal qilindi: ${reason}`, metadata: { actorFirmId: user.firmId || null, transactionId: current.id, reversalTransactionId: reversal.id, journalEntryId: journal.id, reason } } });
    return reversal;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return res.status(201).json(reversed);
}
