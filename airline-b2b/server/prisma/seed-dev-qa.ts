import { FinancialAccountType, FirmUserRole, KassaStatus, Prisma, PrismaClient, Role, TicketLegDirection, TicketLegStatus, TicketProductType, TicketStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { seedDefaultExpenseCategories } from '../src/services/expense-categories.service';

const prisma = new PrismaClient();
const password = 'QaDev2026!Secure';
const RELEASE_FIXTURE_VERSION = '1.10.0';
const RELEASE_FIXTURE_DESCRIPTION = 'ADO-SYSTEM capability contract, device verification va cookie session regressiyasi';

function assertDevSeedEnvironment() {
  const databaseUrl = String(process.env.DATABASE_URL || '');
  const packageVersion = String(process.env.npm_package_version || '');
  if (process.env.ALLOW_DEV_QA_SEED !== '1' || !databaseUrl.includes('airline_b2b_dev')) {
    throw new Error('QA seed faqat ALLOW_DEV_QA_SEED=1 bilan airline_b2b_dev bazasida ishlaydi');
  }
  if (packageVersion !== RELEASE_FIXTURE_VERSION) {
    throw new Error(`Release fixture ${RELEASE_FIXTURE_VERSION}, package versiyasi esa ${packageVersion || 'aniqlanmadi'}`);
  }
}

async function firm(name: string, kind: 'AGENCY' | 'AIRLINE' | 'CONTRACTOR', currency: 'UZS' | 'USD') {
  return (await prisma.firm.findFirst({ where: { name } })) || prisma.firm.create({ data: { name, kind, currency, contactFullName: 'QA DEV', phone: '+998900000000', subscriptionEndsAt: new Date('2030-12-31') } });
}

async function user(email: string, role: Role, firmId?: string, firmRole: FirmUserRole = FirmUserRole.MANAGER, readOnlyAccess = false) {
  const hash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: { password: hash, role, firmId, firmRole, readOnlyAccess, sessionVersion: 0, status: 'ACTIVE', deletedAt: null, fullName: `QA DEV ${firmRole}` },
    create: { email, password: hash, role, firmId, firmRole, readOnlyAccess, fullName: `QA DEV ${firmRole}` },
  });
}

async function main() {
  assertDevSeedEnvironment();

  const agency = await firm('QA DEV Tashkent Tours', 'AGENCY', 'UZS');
  const partner = await firm('QA DEV Partner Agency', 'AGENCY', 'USD');
  const airlineFirm = await firm('QA DEV Airways Firm', 'AIRLINE', 'USD');
  const provider = await firm('QA DEV Visa Provider', 'CONTRACTOR', 'USD');
  const noLoginFirm = await firm(`QA DEV No Login Firm ${RELEASE_FIXTURE_VERSION}`, 'CONTRACTOR', 'UZS');
  await prisma.firm.update({
    where: { id: noLoginFirm.id },
    data: { status: 'ACTIVE', subscriptionEndsAt: new Date('2026-07-01T00:00:00.000Z'), deletedAt: null },
  });

  const superadmin = await user('qa.superadmin@ado.test', Role.SUPERADMIN);
  await user('qa.readonly-superadmin@ado.test', Role.SUPERADMIN, undefined, FirmUserRole.MANAGER, true);
  const admin = await user('qa.admin@ado.test', Role.ADMIN);
  const firmAdmin = await user('qa.firmadmin@ado.test', Role.FIRM, agency.id, FirmUserRole.FIRM_ADMIN);
  const partnerAdmin = await user('qa.partneradmin@ado.test', Role.FIRM, partner.id, FirmUserRole.FIRM_ADMIN);
  const manager = await user('qa.manager@ado.test', Role.FIRM, agency.id, FirmUserRole.MANAGER);
  const securityUser = await user('qa.security@ado.test', Role.FIRM, agency.id, FirmUserRole.MANAGER);
  const kassir1 = await user('qa.kassir1@ado.test', Role.FIRM, agency.id, FirmUserRole.KASSIR);
  const kassir2 = await user('qa.kassir2@ado.test', Role.FIRM, agency.id, FirmUserRole.KASSIR);
  await user('qa.ombor.mudiri@ado.test', Role.FIRM, agency.id, FirmUserRole.OMBOR_MUDIRI);
  const securityEmployeeName = `QA ${RELEASE_FIXTURE_VERSION} Security employee`;
  const existingSecurityEmployee = await prisma.employee.findFirst({
    where: { firmId: agency.id, OR: [{ loginUserId: securityUser.id }, { name: securityEmployeeName }] },
  });
  const securityEmployee = existingSecurityEmployee
    ? await prisma.employee.update({ where: { id: existingSecurityEmployee.id }, data: { name: securityEmployeeName, role: 'MANAGER', status: 'ACTIVE', deletedAt: null, loginUserId: securityUser.id } })
    : await prisma.employee.create({ data: { name: securityEmployeeName, role: 'MANAGER', firmId: agency.id, status: 'ACTIVE', loginUserId: securityUser.id } });
  await prisma.userFirmAccess.createMany({ data: [agency.id, partner.id].map((firmId) => ({ userId: admin.id, firmId })), skipDuplicates: true });
  await prisma.$transaction(async (tx) => {
    for (const seededFirm of [agency, partner, airlineFirm, provider, noLoginFirm]) {
      await seedDefaultExpenseCategories(tx, seededFirm.id, firmAdmin.id);
    }
  });

  const airline = await prisma.airline.upsert({ where: { name: 'QA DEV Airways' }, update: { firmId: airlineFirm.id, status: 'ACTIVE' }, create: { name: 'QA DEV Airways', code: 'QAD', firmId: airlineFirm.id } });
  const flight = (await prisma.flight.findFirst({ where: { flightNumber: 'QA-101' } })) || await prisma.flight.create({ data: { flightNumber: 'QA-101', route: 'TAS-DXB-TAS', airlineId: airline.id, departure: new Date('2026-08-15T08:00:00Z'), arrival: new Date('2026-08-15T12:00:00Z'), currency: 'USD', status: 'ACTIVE' } });
  if (!(await prisma.ticket.findFirst({ where: { flightId: flight.id } }))) await prisma.ticket.createMany({ data: Array.from({ length: 30 }, () => ({ flightId: flight.id, status: TicketStatus.AVAILABLE, basePrice: 350, currency: 'USD', assignedFirmId: agency.id })) });

  const desk1 = (await prisma.kassaDesk.findFirst({ where: { firmId: agency.id, name: 'QA DEV Kassa 1' } })) || await prisma.kassaDesk.create({ data: { firmId: agency.id, name: 'QA DEV Kassa 1', code: 'QA-K1', createdByUserId: firmAdmin.id } });
  const desk2 = (await prisma.kassaDesk.findFirst({ where: { firmId: agency.id, name: 'QA DEV Kassa 2' } })) || await prisma.kassaDesk.create({ data: { firmId: agency.id, name: 'QA DEV Kassa 2', code: 'QA-K2', createdByUserId: firmAdmin.id } });
  await prisma.kassaDesk.update({ where: { id: desk1.id }, data: { code: 'QA-K1', status: 'ACTIVE', deletedAt: null, assignedCashierUserId: kassir1.id } });
  await prisma.kassaDesk.update({ where: { id: desk2.id }, data: { code: 'QA-K2', status: 'ACTIVE', deletedAt: null, assignedCashierUserId: kassir2.id } });
  const releaseDeskCode = `QA-${RELEASE_FIXTURE_VERSION.replace(/\./g, '')}-K1`;
  const releaseDesk = (await prisma.kassaDesk.findFirst({ where: { firmId: noLoginFirm.id, code: releaseDeskCode } })) || await prisma.kassaDesk.create({
    data: { firmId: noLoginFirm.id, name: `QA ${RELEASE_FIXTURE_VERSION} Login yo‘q kassa`, code: releaseDeskCode, createdByUserId: superadmin.id },
  });
  const carryDeskCode = `QA-${RELEASE_FIXTURE_VERSION.replace(/\./g, '')}-CARRY`;
  const carryDesk = (await prisma.kassaDesk.findFirst({ where: { firmId: agency.id, code: carryDeskCode } })) || await prisma.kassaDesk.create({
    data: { firmId: agency.id, name: `QA ${RELEASE_FIXTURE_VERSION} Qoldiq`, code: carryDeskCode, createdByUserId: firmAdmin.id },
  });
  await prisma.kassaDesk.update({ where: { id: carryDesk.id }, data: { status: 'ACTIVE', deletedAt: null } });
  const importDeskCode = `QA-${RELEASE_FIXTURE_VERSION.replace(/\./g, '')}-IMPORT`;
  const importDesk = (await prisma.kassaDesk.findFirst({ where: { firmId: agency.id, code: importDeskCode } })) || await prisma.kassaDesk.create({
    data: { firmId: agency.id, name: `QA ${RELEASE_FIXTURE_VERSION} Tarixiy import`, code: importDeskCode, createdByUserId: firmAdmin.id },
  });
  await prisma.kassaDesk.update({ where: { id: importDesk.id }, data: { status: 'ACTIVE', deletedAt: null } });
  const editDeskCode = `QA-${RELEASE_FIXTURE_VERSION.replace(/\./g, '')}-EDIT`;
  const editDesk = (await prisma.kassaDesk.findFirst({ where: { firmId: agency.id, code: editDeskCode } })) || await prisma.kassaDesk.create({
    data: { firmId: agency.id, name: `QA ${RELEASE_FIXTURE_VERSION} Atomar tahrir`, code: editDeskCode, createdByUserId: firmAdmin.id },
  });
  await prisma.kassaDesk.update({ where: { id: editDesk.id }, data: { status: 'ACTIVE', deletedAt: null } });
  const card = (await prisma.paymentCard.findFirst({ where: { firmId: agency.id, ownerName: 'QA DEV Shared Visa Card' } })) || await prisma.paymentCard.create({ data: { firmId: agency.id, ownerName: 'QA DEV Shared Visa Card', cardNumber: '8600123412345678', currency: 'UZS', openingBalance: 5_000_000, createdByUserId: firmAdmin.id } });
  const editCardName = `QA ${RELEASE_FIXTURE_VERSION} Edit Visa`;
  const editCard = (await prisma.paymentCard.findFirst({ where: { firmId: agency.id, ownerName: editCardName } })) || await prisma.paymentCard.create({ data: { firmId: agency.id, cashDeskId: editDesk.id, ownerName: editCardName, cardNumber: '**** **** **** 4821', currency: 'USD', openingBalance: 0, createdByUserId: firmAdmin.id } });
  await prisma.paymentCard.update({ where: { id: editCard.id }, data: { cashDeskId: editDesk.id, cardNumber: '**** **** **** 4821', currency: 'USD', status: 'ACTIVE', deletedAt: null } });

  await prisma.currencyRate.upsert({ where: { firmId_targetCurrency_recordedAt: { firmId: agency.id, targetCurrency: 'USD', recordedAt: new Date('2026-07-11T00:00:00Z') } }, update: { rate: 12850 }, create: { firmId: agency.id, baseCurrency: 'UZS', targetCurrency: 'USD', rate: 12850, source: `firm:${agency.id}`, recordedAt: new Date('2026-07-11T00:00:00Z'), createdByUserId: firmAdmin.id } });

  const bank = await prisma.financialAccount.upsert({ where: { firmId_name_currency: { firmId: agency.id, name: 'QA DEV Bank', currency: 'UZS' } }, update: { status: 'ACTIVE' }, create: { firmId: agency.id, name: 'QA DEV Bank', type: FinancialAccountType.BANK, currency: 'UZS', openingBalance: 25_000_000, createdByUserId: firmAdmin.id } });
  const cash1 = await prisma.financialAccount.upsert({ where: { firmId_name_currency: { firmId: agency.id, name: 'Kassa: QA DEV Kassa 1', currency: 'UZS' } }, update: { kassaDeskId: desk1.id }, create: { firmId: agency.id, name: 'Kassa: QA DEV Kassa 1', type: FinancialAccountType.CASH, currency: 'UZS', kassaDeskId: desk1.id, openingBalance: 2_000_000, createdByUserId: firmAdmin.id } });
  const cash1Usd = await prisma.financialAccount.upsert({ where: { firmId_name_currency: { firmId: agency.id, name: 'Kassa: QA DEV Kassa 1', currency: 'USD' } }, update: { kassaDeskId: desk1.id }, create: { firmId: agency.id, name: 'Kassa: QA DEV Kassa 1', type: FinancialAccountType.CASH, currency: 'USD', kassaDeskId: desk1.id, openingBalance: 0, createdByUserId: firmAdmin.id } });
  const editCashUsd = await prisma.financialAccount.upsert({ where: { firmId_name_currency: { firmId: agency.id, name: `Kassa: QA ${RELEASE_FIXTURE_VERSION} Atomar tahrir`, currency: 'USD' } }, update: { kassaDeskId: editDesk.id, status: 'ACTIVE' }, create: { firmId: agency.id, name: `Kassa: QA ${RELEASE_FIXTURE_VERSION} Atomar tahrir`, type: FinancialAccountType.CASH, currency: 'USD', kassaDeskId: editDesk.id, openingBalance: 0, createdByUserId: firmAdmin.id } });
  const editCardAccount = await prisma.financialAccount.upsert({ where: { firmId_name_currency: { firmId: agency.id, name: `Karta: ${editCardName}`, currency: 'USD' } }, update: { paymentCardId: editCard.id, status: 'ACTIVE' }, create: { firmId: agency.id, name: `Karta: ${editCardName}`, type: FinancialAccountType.CARD, currency: 'USD', paymentCardId: editCard.id, openingBalance: 0, createdByUserId: firmAdmin.id } });
  await prisma.financialAccount.upsert({ where: { firmId_name_currency: { firmId: agency.id, name: 'Kassa: QA DEV Kassa 2', currency: 'UZS' } }, update: { kassaDeskId: desk2.id }, create: { firmId: agency.id, name: 'Kassa: QA DEV Kassa 2', type: FinancialAccountType.CASH, currency: 'UZS', kassaDeskId: desk2.id, openingBalance: 1_000_000, createdByUserId: firmAdmin.id } });
  await prisma.financialAccount.upsert({ where: { firmId_name_currency: { firmId: agency.id, name: 'Karta: QA DEV Shared Visa Card', currency: 'UZS' } }, update: { paymentCardId: card.id }, create: { firmId: agency.id, name: 'Karta: QA DEV Shared Visa Card', type: FinancialAccountType.CARD, currency: 'UZS', paymentCardId: card.id, openingBalance: card.openingBalance, createdByUserId: firmAdmin.id } });

  if (!(await prisma.transaction.findFirst({ where: { subjectId: 'qa-dev-bank-income' } }))) await prisma.transaction.create({ data: { firmId: agency.id, receiverFirmId: agency.id, createdByUserId: firmAdmin.id, destinationAccountId: bank.id, type: 'ADJUSTMENT', direction: 'ACCOUNT_IN', subjectType: 'QA_DEV', subjectId: 'qa-dev-bank-income', originalAmount: 10_000_000, currency: 'UZS', exchangeRate: 1, baseAmount: 10_000_000, metadata: { marker: 'QA DEV', category: 'OTHER_INCOME' } } });
  if (!(await prisma.transaction.findFirst({ where: { subjectId: 'qa-dev-kassa-sale' } }))) await prisma.transaction.create({ data: { firmId: agency.id, receiverFirmId: agency.id, flightId: flight.id, kassaDeskId: desk1.id, createdByUserId: kassir1.id, destinationAccountId: cash1.id, type: 'SALE', direction: 'KASSA_IN', subjectType: 'QA_DEV', subjectId: 'qa-dev-kassa-sale', originalAmount: 4_500_000, currency: 'UZS', exchangeRate: 1, baseAmount: 4_500_000, paymentMethod: 'cash', metadata: { marker: 'QA DEV', date: new Date().toISOString().slice(0, 10) } } });

  const bankFeeCategory = await prisma.expenseCategory.findUniqueOrThrow({
    where: { firmId_code: { firmId: agency.id, code: 'BANK_FEES' } },
  });
  const financeFixtureKey = `qa-${RELEASE_FIXTURE_VERSION}-bank-fee`;
  const financeFixture = await prisma.transaction.upsert({
    where: { idempotencyKey: financeFixtureKey },
    update: {
      firmId: agency.id, sourceAccountId: bank.id, expenseCategoryId: bankFeeCategory.id,
      status: 'APPLIED', deletedAt: null, operationType: 'BANK_FEE', accountingTreatment: 'EXPENSE',
      originalAmount: 125_000, baseAmount: 125_000, metadata: { marker: RELEASE_FIXTURE_VERSION, cashFlowCategory: 'OPERATING', pnlEffect: 'EXPENSE' },
    },
    create: {
      firmId: agency.id, createdByUserId: firmAdmin.id, type: 'ADJUSTMENT', direction: 'ACCOUNT_OUT',
      sourceMode: 'FINANCIAL_MODULE', status: 'APPLIED', approvalStatus: 'APPROVED', operationType: 'BANK_FEE',
      economicPurpose: 'BANK_FEE', sourceAccountId: bank.id, expenseCategoryId: bankFeeCategory.id,
      accountingTreatment: 'EXPENSE', originalAmount: 125_000, currency: 'UZS', exchangeRate: 1, baseAmount: 125_000,
      expenseDate: new Date(), paymentDate: new Date(), postingDate: new Date(), reportingPeriod: new Date().toISOString().slice(0, 7),
      idempotencyKey: financeFixtureKey, metadata: { marker: RELEASE_FIXTURE_VERSION, cashFlowCategory: 'OPERATING', pnlEffect: 'EXPENSE' },
    },
  });
  const financeJournal = await prisma.journalEntry.upsert({
    where: { transactionId: financeFixture.id },
    update: { firmId: agency.id, status: 'POSTED', description: `QA ${RELEASE_FIXTURE_VERSION} bank komissiyasi` },
    create: { firmId: agency.id, transactionId: financeFixture.id, status: 'POSTED', postingDate: new Date(), description: `QA ${RELEASE_FIXTURE_VERSION} bank komissiyasi`, postedByUserId: firmAdmin.id },
  });
  const financeLedger = (await prisma.ledgerEntry.findFirst({ where: { transactionId: financeFixture.id } })) || await prisma.ledgerEntry.create({
    data: { transactionId: financeFixture.id, journalEntryId: financeJournal.id, debitAccount: 'FINANCE_COSTS', creditAccount: `BANK:${bank.id}`, amount: 125_000, currency: 'UZS', exchangeRateSnapshot: 1 },
  });

  const releaseBusinessDateKey = new Date().toISOString().slice(0, 10);
  const releaseBusinessDate = new Date(`${releaseBusinessDateKey}T00:00:00.000Z`);
  await prisma.kassaDay.upsert({
    where: { businessDate_cashDeskId: { businessDate: releaseBusinessDate, cashDeskId: editDesk.id } },
    update: { firmId: agency.id, status: KassaStatus.OPEN, openedByUserId: firmAdmin.id, closedAt: null, closedByUserId: null, closingBalance: null, closingBalanceUsd: null, actualClosingBalance: null, actualClosingBalanceUsd: null, notes: `QA RELEASE ${RELEASE_FIXTURE_VERSION} atomar edit` },
    create: { firmId: agency.id, cashDeskId: editDesk.id, businessDate: releaseBusinessDate, status: KassaStatus.OPEN, openedByUserId: firmAdmin.id, openingBalance: 0, openingBalanceUsd: 0, notes: `QA RELEASE ${RELEASE_FIXTURE_VERSION} atomar edit` },
  });
  const editTransactionKey = `qa-${RELEASE_FIXTURE_VERSION}-cash-edit`;
  const releaseEditTransaction = await prisma.transaction.upsert({
    where: { idempotencyKey: editTransactionKey },
    update: {
      firmId: agency.id, payerFirmId: partner.id, receiverFirmId: agency.id, flightId: flight.id, kassaDeskId: editDesk.id,
      createdByUserId: firmAdmin.id, destinationAccountId: editCardAccount.id, sourceAccountId: null, paymentCardId: editCard.id,
      type: 'ADJUSTMENT', direction: 'KASSA_IN', subjectType: 'FLIGHT', subjectId: flight.id, sourceMode: 'MANUAL_CARD', status: 'CONFIRMED',
      originalAmount: 500, currency: 'USD', exchangeRate: 12100, baseAmount: 6_050_000, paymentMethod: 'card', deletedAt: null,
      deletedByUserId: null, deletionReason: null, counterpartyNameSnapshot: partner.name, cardNameSnapshot: editCard.ownerName, cardMaskedNumberSnapshot: editCard.cardNumber,
      metadata: { marker: RELEASE_FIXTURE_VERSION, date: releaseBusinessDateKey, note: 'QA old 500 USD card income', cashFlow: 'IN', operationPurpose: 'FLIGHT', counterpartyFirmId: partner.id, counterpartyLabel: partner.name, paymentCardId: editCard.id, paymentCardOwner: editCard.ownerName, paymentCardNumber: editCard.cardNumber, flightNumber: flight.flightNumber, kassaDeskId: editDesk.id, kassaDeskLabel: editDesk.name },
    },
    create: {
      firmId: agency.id, payerFirmId: partner.id, receiverFirmId: agency.id, flightId: flight.id, kassaDeskId: editDesk.id,
      createdByUserId: firmAdmin.id, destinationAccountId: editCardAccount.id, paymentCardId: editCard.id, type: 'ADJUSTMENT', direction: 'KASSA_IN', subjectType: 'FLIGHT', subjectId: flight.id,
      sourceMode: 'MANUAL_CARD', status: 'CONFIRMED', originalAmount: 500, currency: 'USD', exchangeRate: 12100, baseAmount: 6_050_000,
      paymentMethod: 'card', idempotencyKey: editTransactionKey, counterpartyNameSnapshot: partner.name, cardNameSnapshot: editCard.ownerName, cardMaskedNumberSnapshot: editCard.cardNumber,
      metadata: { marker: RELEASE_FIXTURE_VERSION, date: releaseBusinessDateKey, note: 'QA old 500 USD card income', cashFlow: 'IN', operationPurpose: 'FLIGHT', counterpartyFirmId: partner.id, counterpartyLabel: partner.name, paymentCardId: editCard.id, paymentCardOwner: editCard.ownerName, paymentCardNumber: editCard.cardNumber, flightNumber: flight.flightNumber, kassaDeskId: editDesk.id, kassaDeskLabel: editDesk.name },
    },
  });

  if (!(await prisma.employee.findFirst({ where: { firmId: agency.id, name: 'QA DEV Tour Manager' } }))) await prisma.employee.create({ data: { firmId: agency.id, name: 'QA DEV Tour Manager', role: 'MANAGER', salary: 8_000_000, currency: 'UZS' } });
  const salaryEmployeeName = `QA ${RELEASE_FIXTURE_VERSION} Kassa xodimi`;
  const salaryEmployee = (await prisma.employee.findFirst({ where: { firmId: agency.id, name: salaryEmployeeName } })) || await prisma.employee.create({ data: { firmId: agency.id, name: salaryEmployeeName, role: 'KASSIR', salary: 6_500_000, currency: 'UZS' } });
  await prisma.employee.update({ where: { id: salaryEmployee.id }, data: { status: 'ACTIVE', deletedAt: null, salary: 6_500_000, currency: 'UZS' } });
  const warehouseManagerEmployee = (await prisma.employee.findFirst({ where: { firmId: agency.id, name: 'QA DEV Ombor mudiri' } })) || await prisma.employee.create({ data: { firmId: agency.id, name: 'QA DEV Ombor mudiri', role: 'OMBOR_MUDIRI', salary: 7_000_000, currency: 'UZS' } });
  await prisma.employee.update({ where: { id: warehouseManagerEmployee.id }, data: { role: 'OMBOR_MUDIRI', status: 'ACTIVE', deletedAt: null } });
  if (!(await prisma.tourPackage.findFirst({ where: { ownerFirmId: agency.id, name: 'QA DEV Dubai Tour' } }))) await prisma.tourPackage.create({ data: { ownerFirmId: agency.id, flightId: flight.id, name: 'QA DEV Dubai Tour', destination: 'Dubai', quantity: 20, availableQuantity: 20, unitPrice: 8_000_000, ticketPrice: 4_500_000, servicePrice: 3_500_000, currency: 'UZS', notes: 'QA DEV full tour package' } });
  const discountTourName = `QA ${RELEASE_FIXTURE_VERSION} Discount Tour`;
  let discountTour = await prisma.tourPackage.findFirst({ where: { ownerFirmId: agency.id, name: discountTourName } });
  if (discountTour) discountTour = await prisma.tourPackage.update({ where: { id: discountTour.id }, data: { flightId: flight.id, destination: 'Dubai', quantity: 1, availableQuantity: 0, soldQuantity: 1, unitPrice: 700, totalCost: 700, currency: 'USD', status: 'ACTIVE', deletedAt: null } });
  else discountTour = await prisma.tourPackage.create({ data: { ownerFirmId: agency.id, flightId: flight.id, name: discountTourName, destination: 'Dubai', quantity: 1, availableQuantity: 0, soldQuantity: 1, unitPrice: 700, totalCost: 700, currency: 'USD', notes: 'QA discount snapshot fixture' } });
  const discountTransaction = await prisma.transaction.upsert({
    where: { idempotencyKey: `qa-${RELEASE_FIXTURE_VERSION}-tour-discount` },
    update: { firmId: agency.id, flightId: flight.id, payerFirmId: partner.id, receiverFirmId: agency.id, createdByUserId: firmAdmin.id, type: 'SALE', direction: 'FIRM_TO_FIRM', subjectType: 'TOUR_PACKAGE', subjectId: discountTour.id, sourceMode: 'AUTO_TOUR_SALE', status: 'CONFIRMED', originalAmount: 850, currency: 'USD', exchangeRate: 12100, baseAmount: 10_285_000, deletedAt: null, metadata: { marker: RELEASE_FIXTURE_VERSION, packageId: discountTour.id, packageName: discountTour.name, quantity: 1, unitCost: '700', grossAmount: '950', discountAmount: '100', netAmount: '850', saleNote: 'Doimiy mijoz uchun kelishilgan chegirma.' } },
    create: { firmId: agency.id, flightId: flight.id, payerFirmId: partner.id, receiverFirmId: agency.id, createdByUserId: firmAdmin.id, type: 'SALE', direction: 'FIRM_TO_FIRM', subjectType: 'TOUR_PACKAGE', subjectId: discountTour.id, sourceMode: 'AUTO_TOUR_SALE', status: 'CONFIRMED', originalAmount: 850, currency: 'USD', exchangeRate: 12100, baseAmount: 10_285_000, idempotencyKey: `qa-${RELEASE_FIXTURE_VERSION}-tour-discount`, metadata: { marker: RELEASE_FIXTURE_VERSION, packageId: discountTour.id, packageName: discountTour.name, quantity: 1, unitCost: '700', grossAmount: '950', discountAmount: '100', netAmount: '850', saleNote: 'Doimiy mijoz uchun kelishilgan chegirma.' } },
  });
  await prisma.tourPackageSale.upsert({
    where: { transactionId: discountTransaction.id },
    update: { packageId: discountTour.id, sellerFirmId: agency.id, buyerFirmId: partner.id, quantity: 1, unitPrice: 950, currency: 'USD', totalAmount: 850, grossAmount: 950, discountAmount: 100, netAmount: 850, discountPercent: new Prisma.Decimal(100).div(950).mul(100).toDecimalPlaces(4), saleNote: 'Doimiy mijoz uchun kelishilgan chegirma.', exchangeRateSnapshot: 12100, grossAmountBaseCurrency: 11_495_000, discountAmountBaseCurrency: 1_210_000, netAmountBaseCurrency: 10_285_000, unitCostSnapshot: 700, costOfGoodsSold: 700, grossProfit: 150, notes: 'Doimiy mijoz uchun kelishilgan chegirma.', status: 'CONFIRMED', deletedAt: null },
    create: { packageId: discountTour.id, sellerFirmId: agency.id, buyerFirmId: partner.id, quantity: 1, unitPrice: 950, currency: 'USD', totalAmount: 850, grossAmount: 950, discountAmount: 100, netAmount: 850, discountPercent: new Prisma.Decimal(100).div(950).mul(100).toDecimalPlaces(4), saleNote: 'Doimiy mijoz uchun kelishilgan chegirma.', exchangeRateSnapshot: 12100, grossAmountBaseCurrency: 11_495_000, discountAmountBaseCurrency: 1_210_000, netAmountBaseCurrency: 10_285_000, unitCostSnapshot: 700, costOfGoodsSold: 700, grossProfit: 150, transactionId: discountTransaction.id, notes: 'Doimiy mijoz uchun kelishilgan chegirma.' },
  });
  if (!(await prisma.serviceOffering.findFirst({ where: { ownerFirmId: agency.id, name: 'QA DEV Visa Service' } }))) await prisma.serviceOffering.create({ data: { ownerFirmId: agency.id, providerFirmId: provider.id, providerName: provider.name, createdByUserId: firmAdmin.id, flightId: flight.id, name: 'QA DEV Visa Service', quantity: 20, availableQuantity: 0, unitPrice: 80, currency: 'USD', paymentStatus: 'DEBT', description: 'QA DEV purchased visa service' } });
  await prisma.airlineFirmConnection.upsert({ where: { airlineFirmId_firmId: { airlineFirmId: airlineFirm.id, firmId: agency.id } }, update: { status: 'ACTIVE' }, create: { airlineFirmId: airlineFirm.id, firmId: agency.id, createdByUserId: superadmin.id, notes: 'QA DEV contract' } });
  if (!(await prisma.notification.findFirst({ where: { userId: firmAdmin.id, title: 'QA DEV notification' } }))) await prisma.notification.create({ data: { userId: firmAdmin.id, firmId: agency.id, title: 'QA DEV notification', body: 'Endpoint and UI testing notification', type: 'INFO' } });

  const releaseTag = RELEASE_FIXTURE_VERSION.replace(/\./g, '');
  const releaseFlightNumber = `QA-${releaseTag}-NULL-ALLOC`;
  let releaseFlight = await prisma.flight.findFirst({ where: { flightNumber: releaseFlightNumber } });
  if (releaseFlight) {
    releaseFlight = await prisma.flight.update({
      where: { id: releaseFlight.id },
      data: {
        ownerFirmId: agency.id, airlineId: airline.id, route: 'TAS-JED-TAS', tripType: TicketProductType.ROUND_TRIP,
        departure: new Date('2026-09-01T06:00:00.000Z'), arrival: new Date('2026-09-01T11:00:00.000Z'),
        returnDeparture: new Date('2026-09-10T13:00:00.000Z'), returnArrival: new Date('2026-09-10T18:00:00.000Z'),
        currency: 'USD', status: null, deletedAt: null,
      },
    });
  } else {
    releaseFlight = await prisma.flight.create({
      data: {
        flightNumber: releaseFlightNumber, ownerFirmId: agency.id, airlineId: airline.id, route: 'TAS-JED-TAS',
        tripType: TicketProductType.ROUND_TRIP, departure: new Date('2026-09-01T06:00:00.000Z'),
        arrival: new Date('2026-09-01T11:00:00.000Z'), returnDeparture: new Date('2026-09-10T13:00:00.000Z'),
        returnArrival: new Date('2026-09-10T18:00:00.000Z'), currency: 'USD', status: null,
      },
    });
  }

  const releaseAllocationNote = `QA RELEASE ${RELEASE_FIXTURE_VERSION} allocation invariant`;
  let releaseAllocation = await prisma.ticketAllocation.findFirst({ where: { note: releaseAllocationNote } });
  if (releaseAllocation) {
    releaseAllocation = await prisma.ticketAllocation.update({
      where: { id: releaseAllocation.id },
      data: {
        flightId: releaseFlight.id, fromFirmId: agency.id, toFirmId: partner.id, status: 'ACCEPTED', currency: 'USD',
        totalAmount: 840, createdByUserId: firmAdmin.id, acceptedAt: new Date('2026-07-15T09:00:00.000Z'),
        acceptedByUserId: partnerAdmin.id, productType: TicketProductType.ROUND_TRIP, direction: null,
        parentTicketCount: 2, segmentCount: 4,
      },
    });
  } else {
    releaseAllocation = await prisma.ticketAllocation.create({
      data: {
        flightId: releaseFlight.id, fromFirmId: agency.id, toFirmId: partner.id, status: 'ACCEPTED', currency: 'USD',
        totalAmount: 840, note: releaseAllocationNote, createdByUserId: firmAdmin.id,
        acceptedAt: new Date('2026-07-15T09:00:00.000Z'), acceptedByUserId: partnerAdmin.id,
        productType: TicketProductType.ROUND_TRIP, parentTicketCount: 2, segmentCount: 4,
      },
    });
  }

  const releasePriceRow = await prisma.ticketAllocationPriceRow.findFirst({ where: { allocationId: releaseAllocation.id, position: 0 } });
  if (releasePriceRow) {
    await prisma.ticketAllocationPriceRow.update({
      where: { id: releasePriceRow.id },
      data: { quantity: 2, unitPrice: 420, totalAmount: 840, currency: 'USD', productType: TicketProductType.ROUND_TRIP, direction: null },
    });
  } else {
    await prisma.ticketAllocationPriceRow.create({
      data: { allocationId: releaseAllocation.id, position: 0, quantity: 2, unitPrice: 420, totalAmount: 840, currency: 'USD', productType: TicketProductType.ROUND_TRIP },
    });
  }

  await prisma.transaction.upsert({
    where: { idempotencyKey: `qa-${RELEASE_FIXTURE_VERSION}-allocation-payment` },
    update: { firmId: agency.id, flightId: releaseFlight.id, payerFirmId: partner.id, receiverFirmId: agency.id, type: 'PAYMENT', subjectType: 'TICKET_ALLOCATION', subjectId: releaseAllocation.id, sourceMode: 'MANUAL_BANK', status: 'CONFIRMED', originalAmount: 300, currency: 'USD', exchangeRate: 12100, baseAmount: 3_630_000, deletedAt: null, metadata: { marker: RELEASE_FIXTURE_VERSION, allocationId: releaseAllocation.id, note: 'QA allocation-linked payment' } },
    create: { firmId: agency.id, flightId: releaseFlight.id, payerFirmId: partner.id, receiverFirmId: agency.id, createdByUserId: firmAdmin.id, type: 'PAYMENT', subjectType: 'TICKET_ALLOCATION', subjectId: releaseAllocation.id, sourceMode: 'MANUAL_BANK', status: 'CONFIRMED', originalAmount: 300, currency: 'USD', exchangeRate: 12100, baseAmount: 3_630_000, idempotencyKey: `qa-${RELEASE_FIXTURE_VERSION}-allocation-payment`, metadata: { marker: RELEASE_FIXTURE_VERSION, allocationId: releaseAllocation.id, note: 'QA allocation-linked payment' } },
  });
  await prisma.transaction.upsert({
    where: { idempotencyKey: `qa-${RELEASE_FIXTURE_VERSION}-flight-only-payment` },
    update: { firmId: agency.id, flightId: releaseFlight.id, payerFirmId: partner.id, receiverFirmId: agency.id, type: 'PAYMENT', subjectType: 'FLIGHT', subjectId: releaseFlight.id, sourceMode: 'MANUAL_BANK', status: 'CONFIRMED', originalAmount: 200, currency: 'USD', exchangeRate: 12100, baseAmount: 2_420_000, deletedAt: null, metadata: { marker: RELEASE_FIXTURE_VERSION, note: 'QA flight-only unallocated payment' } },
    create: { firmId: agency.id, flightId: releaseFlight.id, payerFirmId: partner.id, receiverFirmId: agency.id, createdByUserId: firmAdmin.id, type: 'PAYMENT', subjectType: 'FLIGHT', subjectId: releaseFlight.id, sourceMode: 'MANUAL_BANK', status: 'CONFIRMED', originalAmount: 200, currency: 'USD', exchangeRate: 12100, baseAmount: 2_420_000, idempotencyKey: `qa-${RELEASE_FIXTURE_VERSION}-flight-only-payment`, metadata: { marker: RELEASE_FIXTURE_VERSION, note: 'QA flight-only unallocated payment' } },
  });

  const releaseTicketCount = await prisma.ticket.count({ where: { allocationId: releaseAllocation.id } });
  if (releaseTicketCount < 2) {
    await prisma.ticket.createMany({
      data: Array.from({ length: 2 - releaseTicketCount }, () => ({
        flightId: releaseFlight.id, status: TicketStatus.ASSIGNED, ticketType: TicketProductType.ROUND_TRIP,
        basePrice: 420, originPrice: 300, currency: 'USD', assignedFirmId: partner.id,
        originalOwnerFirmId: agency.id, allocationSourceFirmId: agency.id, allocationSourcePrice: 420,
        allocationId: releaseAllocation.id,
      })),
    });
  }

  const mixedRejectAllocationId = `qa-${releaseTag}-mixed-reject-allocation`;
  const mixedRejectAllocationNote = `QA RELEASE ${RELEASE_FIXTURE_VERSION} mixed segment rejection`;
  const mixedRejectAllocation = await prisma.ticketAllocation.upsert({
    where: { id: mixedRejectAllocationId },
    update: {
      flightId: releaseFlight.id, fromFirmId: agency.id, toFirmId: partner.id, status: 'PENDING', currency: 'USD',
      totalAmount: 700, note: mixedRejectAllocationNote, createdByUserId: firmAdmin.id,
      acceptedAt: null, acceptedByUserId: null, rejectionReason: null, rejectedAt: null, rejectedByUserId: null,
      productType: TicketProductType.ROUND_TRIP, direction: null, parentTicketCount: 2, segmentCount: 4, version: 1,
    },
    create: {
      id: mixedRejectAllocationId, flightId: releaseFlight.id, fromFirmId: agency.id, toFirmId: partner.id,
      status: 'PENDING', currency: 'USD', totalAmount: 700, note: mixedRejectAllocationNote, createdByUserId: firmAdmin.id,
      productType: TicketProductType.ROUND_TRIP, parentTicketCount: 2, segmentCount: 4,
    },
  });
  const mixedRejectPriceRow = await prisma.ticketAllocationPriceRow.findFirst({ where: { allocationId: mixedRejectAllocation.id, position: 0 } });
  const mixedRejectPriceData = {
    quantity: 2, unitPrice: 350, totalAmount: 700, currency: 'USD',
    productType: TicketProductType.ROUND_TRIP, direction: null,
  };
  if (mixedRejectPriceRow) await prisma.ticketAllocationPriceRow.update({ where: { id: mixedRejectPriceRow.id }, data: mixedRejectPriceData });
  else await prisma.ticketAllocationPriceRow.create({ data: { allocationId: mixedRejectAllocation.id, position: 0, ...mixedRejectPriceData } });

  const mixedRejectTicketIds: string[] = [];
  for (let index = 1; index <= 2; index += 1) {
    const ticketId = `qa-${releaseTag}-mixed-reject-ticket-${index}`;
    const outboundLegId = `${ticketId}-outbound`;
    const returnLegId = `${ticketId}-return`;
    mixedRejectTicketIds.push(ticketId);
    await prisma.ticket.upsert({
      where: { id: ticketId },
      update: {
        flightId: releaseFlight.id, status: TicketStatus.PENDING, ticketType: TicketProductType.ROUND_TRIP,
        basePrice: 350, originPrice: 250, currency: 'USD', assignedFirmId: agency.id, originalOwnerFirmId: agency.id,
        allocationSourceFirmId: agency.id, allocationSourcePrice: 350, allocationId: mixedRejectAllocation.id,
        tourPackageId: null, soldPrice: null, soldCurrency: null, purchaserInfo: Prisma.DbNull, deletedAt: null,
      },
      create: {
        id: ticketId, flightId: releaseFlight.id, status: TicketStatus.PENDING, ticketType: TicketProductType.ROUND_TRIP,
        basePrice: 350, originPrice: 250, currency: 'USD', assignedFirmId: agency.id, originalOwnerFirmId: agency.id,
        allocationSourceFirmId: agency.id, allocationSourcePrice: 350, allocationId: mixedRejectAllocation.id,
      },
    });
    await prisma.ticketLeg.upsert({
      where: { id: outboundLegId },
      update: {
        ticketId, flightId: releaseFlight.id, direction: TicketLegDirection.OUTBOUND, origin: 'TAS', destination: 'JED',
        departureAt: releaseFlight.departure, arrivalAt: releaseFlight.arrival, status: TicketLegStatus.PENDING_ALLOCATION,
        currentOwnerFirmId: agency.id, pendingAllocationId: mixedRejectAllocation.id, acceptedAllocationId: null,
        tourPackageId: null, acquisitionCostSnapshot: 125, originalCostSnapshot: 125,
        allocationPriceSnapshot: 175, currencySnapshot: 'USD',
      },
      create: {
        id: outboundLegId, ticketId, flightId: releaseFlight.id, direction: TicketLegDirection.OUTBOUND,
        origin: 'TAS', destination: 'JED', departureAt: releaseFlight.departure, arrivalAt: releaseFlight.arrival,
        status: TicketLegStatus.PENDING_ALLOCATION, currentOwnerFirmId: agency.id, pendingAllocationId: mixedRejectAllocation.id,
        acquisitionCostSnapshot: 125, originalCostSnapshot: 125, allocationPriceSnapshot: 175, currencySnapshot: 'USD',
      },
    });
    await prisma.ticketLeg.upsert({
      where: { id: returnLegId },
      update: {
        ticketId, flightId: releaseFlight.id, direction: TicketLegDirection.RETURN, origin: 'JED', destination: 'TAS',
        departureAt: releaseFlight.returnDeparture, arrivalAt: releaseFlight.returnArrival, status: TicketLegStatus.ASSIGNED,
        currentOwnerFirmId: partner.id, pendingAllocationId: null, acceptedAllocationId: null, tourPackageId: null,
        acquisitionCostSnapshot: 175, originalCostSnapshot: 125, allocationPriceSnapshot: 175, currencySnapshot: 'USD',
      },
      create: {
        id: returnLegId, ticketId, flightId: releaseFlight.id, direction: TicketLegDirection.RETURN,
        origin: 'JED', destination: 'TAS', departureAt: releaseFlight.returnDeparture, arrivalAt: releaseFlight.returnArrival,
        status: TicketLegStatus.ASSIGNED, currentOwnerFirmId: partner.id,
        acquisitionCostSnapshot: 175, originalCostSnapshot: 125, allocationPriceSnapshot: 175, currencySnapshot: 'USD',
      },
    });
    for (const [legId, direction] of [[outboundLegId, TicketLegDirection.OUTBOUND], [returnLegId, TicketLegDirection.RETURN]] as const) {
      const itemId = `${mixedRejectAllocation.id}-${direction.toLowerCase()}-${index}`;
      await prisma.ticketAllocationLeg.upsert({
        where: { id: itemId },
        update: {
          allocationId: mixedRejectAllocation.id, ticketLegId: legId, productType: TicketProductType.ROUND_TRIP,
          direction, previousOwnerFirmId: agency.id, previousStatus: TicketLegStatus.AVAILABLE,
          acquisitionCostSnapshot: 125, allocationPriceSnapshot: 175, productUnitPriceSnapshot: 350,
          currencySnapshot: 'USD', acquisitionCurrencySnapshot: 'USD', allocationCurrencySnapshot: 'USD', status: 'ACTIVE',
        },
        create: {
          id: itemId, allocationId: mixedRejectAllocation.id, ticketLegId: legId,
          productType: TicketProductType.ROUND_TRIP, direction, previousOwnerFirmId: agency.id,
          previousStatus: TicketLegStatus.AVAILABLE, acquisitionCostSnapshot: 125, allocationPriceSnapshot: 175,
          productUnitPriceSnapshot: 350, currencySnapshot: 'USD', acquisitionCurrencySnapshot: 'USD',
          allocationCurrencySnapshot: 'USD', status: 'ACTIVE',
        },
      });
    }
  }

  const mixedDeleteAllocationId = `qa-${releaseTag}-mixed-delete-allocation`;
  const mixedDeleteTicketId = `qa-${releaseTag}-mixed-delete-ticket`;
  const mixedDeleteAllocation = await prisma.ticketAllocation.upsert({
    where: { id: mixedDeleteAllocationId },
    update: {
      flightId: releaseFlight.id, fromFirmId: agency.id, toFirmId: partner.id, status: 'ACCEPTED', currency: 'USD',
      totalAmount: 400, note: `QA RELEASE ${RELEASE_FIXTURE_VERSION} superadmin delete`, createdByUserId: firmAdmin.id,
      acceptedAt: new Date('2026-07-21T08:00:00.000Z'), acceptedByUserId: partnerAdmin.id,
      cancelledAt: null, cancelledByUserId: null, productType: TicketProductType.ROUND_TRIP,
      direction: null, parentTicketCount: 1, segmentCount: 2, version: 1,
    },
    create: {
      id: mixedDeleteAllocationId, flightId: releaseFlight.id, fromFirmId: agency.id, toFirmId: partner.id,
      status: 'ACCEPTED', currency: 'USD', totalAmount: 400, note: `QA RELEASE ${RELEASE_FIXTURE_VERSION} superadmin delete`,
      createdByUserId: firmAdmin.id, acceptedAt: new Date('2026-07-21T08:00:00.000Z'), acceptedByUserId: partnerAdmin.id,
      productType: TicketProductType.ROUND_TRIP, parentTicketCount: 1, segmentCount: 2,
    },
  });
  const mixedDeletePriceRow = await prisma.ticketAllocationPriceRow.findFirst({ where: { allocationId: mixedDeleteAllocation.id, position: 0 } });
  const mixedDeletePriceData = { quantity: 1, unitPrice: 400, totalAmount: 400, currency: 'USD', productType: TicketProductType.ROUND_TRIP, direction: null };
  if (mixedDeletePriceRow) await prisma.ticketAllocationPriceRow.update({ where: { id: mixedDeletePriceRow.id }, data: mixedDeletePriceData });
  else await prisma.ticketAllocationPriceRow.create({ data: { allocationId: mixedDeleteAllocation.id, position: 0, ...mixedDeletePriceData } });
  await prisma.ticket.upsert({
    where: { id: mixedDeleteTicketId },
    update: {
      flightId: releaseFlight.id, status: TicketStatus.ASSIGNED, ticketType: TicketProductType.ROUND_TRIP,
      basePrice: 400, originPrice: 250, currency: 'USD', assignedFirmId: null, originalOwnerFirmId: agency.id,
      allocationSourceFirmId: agency.id, allocationSourcePrice: 400, allocationId: mixedDeleteAllocation.id,
      tourPackageId: null, soldPrice: null, soldCurrency: null, purchaserInfo: Prisma.DbNull, deletedAt: null,
    },
    create: {
      id: mixedDeleteTicketId, flightId: releaseFlight.id, status: TicketStatus.ASSIGNED,
      ticketType: TicketProductType.ROUND_TRIP, basePrice: 400, originPrice: 250, currency: 'USD',
      originalOwnerFirmId: agency.id, allocationSourceFirmId: agency.id, allocationSourcePrice: 400,
      allocationId: mixedDeleteAllocation.id,
    },
  });
  for (const direction of [TicketLegDirection.OUTBOUND, TicketLegDirection.RETURN]) {
    const legId = `${mixedDeleteTicketId}-${direction.toLowerCase()}`;
    const assignedToReceiver = direction === TicketLegDirection.OUTBOUND;
    await prisma.ticketLeg.upsert({
      where: { id: legId },
      update: {
        ticketId: mixedDeleteTicketId, flightId: releaseFlight.id, direction,
        origin: assignedToReceiver ? 'TAS' : 'JED', destination: assignedToReceiver ? 'JED' : 'TAS',
        departureAt: assignedToReceiver ? releaseFlight.departure : releaseFlight.returnDeparture,
        arrivalAt: assignedToReceiver ? releaseFlight.arrival : releaseFlight.returnArrival,
        status: assignedToReceiver ? TicketLegStatus.ASSIGNED : TicketLegStatus.AVAILABLE,
        currentOwnerFirmId: assignedToReceiver ? partner.id : agency.id, pendingAllocationId: null,
        acceptedAllocationId: assignedToReceiver ? mixedDeleteAllocation.id : null, tourPackageId: null,
        acquisitionCostSnapshot: assignedToReceiver ? 200 : 125, originalCostSnapshot: 125,
        allocationPriceSnapshot: assignedToReceiver ? 200 : null, currencySnapshot: 'USD',
      },
      create: {
        id: legId, ticketId: mixedDeleteTicketId, flightId: releaseFlight.id, direction,
        origin: assignedToReceiver ? 'TAS' : 'JED', destination: assignedToReceiver ? 'JED' : 'TAS',
        departureAt: assignedToReceiver ? releaseFlight.departure : releaseFlight.returnDeparture,
        arrivalAt: assignedToReceiver ? releaseFlight.arrival : releaseFlight.returnArrival,
        status: assignedToReceiver ? TicketLegStatus.ASSIGNED : TicketLegStatus.AVAILABLE,
        currentOwnerFirmId: assignedToReceiver ? partner.id : agency.id,
        acceptedAllocationId: assignedToReceiver ? mixedDeleteAllocation.id : null,
        acquisitionCostSnapshot: assignedToReceiver ? 200 : 125, originalCostSnapshot: 125,
        allocationPriceSnapshot: assignedToReceiver ? 200 : null, currencySnapshot: 'USD',
      },
    });
    const itemId = `${mixedDeleteAllocation.id}-${direction.toLowerCase()}`;
    await prisma.ticketAllocationLeg.upsert({
      where: { id: itemId },
      update: {
        allocationId: mixedDeleteAllocation.id, ticketLegId: legId, productType: TicketProductType.ROUND_TRIP,
        direction, previousOwnerFirmId: agency.id, previousStatus: TicketLegStatus.AVAILABLE,
        acquisitionCostSnapshot: 125, allocationPriceSnapshot: 200, productUnitPriceSnapshot: 400,
        currencySnapshot: 'USD', acquisitionCurrencySnapshot: 'USD', allocationCurrencySnapshot: 'USD', status: 'ACTIVE',
      },
      create: {
        id: itemId, allocationId: mixedDeleteAllocation.id, ticketLegId: legId,
        productType: TicketProductType.ROUND_TRIP, direction, previousOwnerFirmId: agency.id,
        previousStatus: TicketLegStatus.AVAILABLE, acquisitionCostSnapshot: 125, allocationPriceSnapshot: 200,
        productUnitPriceSnapshot: 400, currencySnapshot: 'USD', acquisitionCurrencySnapshot: 'USD',
        allocationCurrencySnapshot: 'USD', status: 'ACTIVE',
      },
    });
  }

  await prisma.transaction.deleteMany({
    where: { subjectType: 'TICKET_ALLOCATION', subjectId: releaseAllocation.id, type: 'PAYABLE' },
  });

  const releaseOpeningSubject = `qa-${RELEASE_FIXTURE_VERSION}-agent-opening`;
  const releaseOpening = await prisma.transaction.findFirst({ where: { subjectType: 'FIRM_OPENING_BALANCE', subjectId: releaseOpeningSubject } });
  const releaseOpeningData = {
    firmId: partner.id, payerFirmId: partner.id, receiverFirmId: agency.id, createdByUserId: superadmin.id,
    type: 'PAYABLE' as const, direction: 'OPENING_BALANCE', subjectType: 'FIRM_OPENING_BALANCE', subjectId: releaseOpeningSubject,
    originalAmount: 200, currency: 'USD', exchangeRate: 12850, baseAmount: 2_570_000, sourceMode: 'MANUAL_BANK', status: 'CONFIRMED',
    metadata: { source: 'manual_prior_balance', targetFirmName: partner.name, counterpartyFirmId: agency.id, counterpartyLabel: agency.name },
  };
  if (releaseOpening) await prisma.transaction.update({ where: { id: releaseOpening.id }, data: releaseOpeningData });
  else await prisma.transaction.create({ data: releaseOpeningData });

  const releasePaymentSubject = `qa-${RELEASE_FIXTURE_VERSION}-agent-payment`;
  const releasePayment = await prisma.transaction.findFirst({ where: { subjectType: 'QA_AGENT_PAYMENT', subjectId: releasePaymentSubject } });
  const releasePaymentData = {
    firmId: agency.id, payerFirmId: partner.id, receiverFirmId: agency.id, createdByUserId: firmAdmin.id,
    destinationAccountId: cash1.id, type: 'PAYMENT' as const, direction: 'FIRM_TO_FIRM', subjectType: 'QA_AGENT_PAYMENT', subjectId: releasePaymentSubject,
    originalAmount: 300, currency: 'USD', exchangeRate: 12850, baseAmount: 3_855_000, paymentMethod: 'cash', sourceMode: 'MANUAL_CASH', status: 'CONFIRMED',
    metadata: { payerLabel: partner.name, receiverLabel: agency.name, directionLabel: `${partner.name} -> ${agency.name}`, marker: RELEASE_FIXTURE_VERSION },
  };
  if (releasePayment) await prisma.transaction.update({ where: { id: releasePayment.id }, data: releasePaymentData });
  else await prisma.transaction.create({ data: releasePaymentData });

  const releaseOutgoingPaymentSubject = `qa-${RELEASE_FIXTURE_VERSION}-airline-payment`;
  const releaseOutgoingPayment = await prisma.transaction.findFirst({ where: { subjectType: 'QA_AIRLINE_PAYMENT', subjectId: releaseOutgoingPaymentSubject } });
  const releaseOutgoingPaymentData = {
    firmId: agency.id, payerFirmId: agency.id, receiverFirmId: airlineFirm.id, flightId: releaseFlight.id,
    createdByUserId: firmAdmin.id, kassaDeskId: desk1.id, sourceAccountId: cash1Usd.id,
    type: 'PAYMENT' as const, direction: 'FIRM_TO_FIRM', subjectType: 'QA_AIRLINE_PAYMENT', subjectId: releaseOutgoingPaymentSubject,
    originalAmount: 250, currency: 'USD', exchangeRate: 12850, baseAmount: 3_212_500,
    paymentMethod: 'cash', sourceMode: 'MANUAL_CASH', status: 'CONFIRMED',
    metadata: { payerLabel: agency.name, receiverLabel: airlineFirm.name, directionLabel: `${agency.name} -> ${airlineFirm.name}`, cashFlow: 'OUT', date: new Date().toISOString().slice(0, 10), flightNumber: releaseFlight.flightNumber, marker: RELEASE_FIXTURE_VERSION },
  };
  if (releaseOutgoingPayment) await prisma.transaction.update({ where: { id: releaseOutgoingPayment.id }, data: releaseOutgoingPaymentData });
  else await prisma.transaction.create({ data: releaseOutgoingPaymentData });

  const partnerOnlyServiceName = `QA ${RELEASE_FIXTURE_VERSION} Partner-only Service`;
  const partnerOnlyService = await prisma.serviceOffering.findFirst({ where: { ownerFirmId: partner.id, name: partnerOnlyServiceName } });
  const partnerOnlyServiceData = {
    ownerFirmId: partner.id, providerFirmId: agency.id, providerName: agency.name, createdByUserId: partnerAdmin.id,
    flightId: releaseFlight.id, name: partnerOnlyServiceName, description: RELEASE_FIXTURE_DESCRIPTION,
    quantity: 6, availableQuantity: 6, reservedQuantity: 0, consumedQuantity: 0, unitPrice: 50,
    currency: 'USD', paymentStatus: 'DEBT', status: 'ACTIVE', deletedAt: null,
  };
  if (partnerOnlyService) await prisma.serviceOffering.update({ where: { id: partnerOnlyService.id }, data: partnerOnlyServiceData });
  else await prisma.serviceOffering.create({ data: partnerOnlyServiceData });

  const unassignedServiceName = `QA ${RELEASE_FIXTURE_VERSION} Unassigned Service`;
  const unassignedService = await prisma.serviceOffering.findFirst({ where: { ownerFirmId: provider.id, name: unassignedServiceName } });
  const unassignedServiceData = {
    ownerFirmId: provider.id, providerFirmId: airlineFirm.id, providerName: airlineFirm.name, createdByUserId: superadmin.id,
    name: unassignedServiceName, description: RELEASE_FIXTURE_DESCRIPTION,
    quantity: 3, availableQuantity: 3, reservedQuantity: 0, consumedQuantity: 0, unitPrice: 25,
    currency: 'USD', paymentStatus: 'DEBT', status: 'ACTIVE', deletedAt: null,
  };
  if (unassignedService) await prisma.serviceOffering.update({ where: { id: unassignedService.id }, data: unassignedServiceData });
  else await prisma.serviceOffering.create({ data: unassignedServiceData });

  const historicalBusinessDate = new Date('2026-07-01T00:00:00.000Z');
  await prisma.kassaDay.upsert({
    where: { businessDate_cashDeskId: { businessDate: historicalBusinessDate, cashDeskId: desk1.id } },
    update: {
      firmId: agency.id, status: KassaStatus.CLOSED, activeSessionKey: null, currency: 'UZS', openedByUserId: firmAdmin.id,
      openedAt: new Date('2026-07-01T05:00:00.000Z'), closedByUserId: firmAdmin.id, closedAt: new Date('2026-07-01T14:00:00.000Z'),
      openingBalance: 2_000_000, closingBalance: 3_250_000, actualClosingBalance: 3_250_000, expectedCash: 3_250_000,
      variance: 0, notes: `QA RELEASE ${RELEASE_FIXTURE_VERSION} historical reopen fixture`,
    },
    create: {
      firmId: agency.id, cashDeskId: desk1.id, status: KassaStatus.CLOSED, currency: 'UZS', businessDate: historicalBusinessDate,
      openedByUserId: firmAdmin.id, openedAt: new Date('2026-07-01T05:00:00.000Z'), closedByUserId: firmAdmin.id,
      closedAt: new Date('2026-07-01T14:00:00.000Z'), openingBalance: 2_000_000, closingBalance: 3_250_000,
      actualClosingBalance: 3_250_000, expectedCash: 3_250_000, variance: 0,
      notes: `QA RELEASE ${RELEASE_FIXTURE_VERSION} historical reopen fixture`,
    },
  });

  const importBusinessDate = new Date('2026-06-25T00:00:00.000Z');
  await prisma.kassaDay.upsert({
    where: { businessDate_cashDeskId: { businessDate: importBusinessDate, cashDeskId: importDesk.id } },
    update: {
      firmId: agency.id, status: KassaStatus.OPEN, activeSessionKey: null, currency: 'UZS', openedByUserId: firmAdmin.id,
      closedByUserId: null, closedAt: null, openingBalance: 0, openingBalanceUsd: 0, closingBalance: null,
      closingBalanceUsd: null, actualClosingBalance: null, actualClosingBalanceUsd: null, expectedCash: null,
      expectedCashUsd: null, variance: null, varianceUsd: null, notes: `QA RELEASE ${RELEASE_FIXTURE_VERSION} historical import fixture`,
    },
    create: {
      firmId: agency.id, cashDeskId: importDesk.id, status: KassaStatus.OPEN, currency: 'UZS', businessDate: importBusinessDate,
      openedByUserId: firmAdmin.id, openingBalance: 0, openingBalanceUsd: 0,
      notes: `QA RELEASE ${RELEASE_FIXTURE_VERSION} historical import fixture`,
    },
  });

  const carryGoodDate = new Date('2026-06-10T00:00:00.000Z');
  const carryMissingDate = new Date('2026-06-11T00:00:00.000Z');
  await prisma.kassaDay.upsert({
    where: { businessDate_cashDeskId: { businessDate: carryGoodDate, cashDeskId: carryDesk.id } },
    update: {
      firmId: agency.id, status: KassaStatus.CLOSED, activeSessionKey: null, currency: 'UZS', openedByUserId: firmAdmin.id,
      openedAt: new Date('2026-06-10T05:00:00.000Z'), closedByUserId: firmAdmin.id, closedAt: new Date('2026-06-10T14:00:00.000Z'),
      openingBalance: 3_000_000, openingBalanceUsd: 100, closingBalance: 4_000_000, closingBalanceUsd: 125,
      actualClosingBalance: 4_000_000, actualClosingBalanceUsd: 125, expectedCash: 4_000_000, expectedCashUsd: 125,
      variance: 0, varianceUsd: 0, notes: `QA RELEASE ${RELEASE_FIXTURE_VERSION} usable carry-forward`,
    },
    create: {
      firmId: agency.id, cashDeskId: carryDesk.id, status: KassaStatus.CLOSED, currency: 'UZS', businessDate: carryGoodDate,
      openedByUserId: firmAdmin.id, openedAt: new Date('2026-06-10T05:00:00.000Z'), closedByUserId: firmAdmin.id,
      closedAt: new Date('2026-06-10T14:00:00.000Z'), openingBalance: 3_000_000, openingBalanceUsd: 100,
      closingBalance: 4_000_000, closingBalanceUsd: 125, actualClosingBalance: 4_000_000, actualClosingBalanceUsd: 125,
      expectedCash: 4_000_000, expectedCashUsd: 125, variance: 0, varianceUsd: 0,
      notes: `QA RELEASE ${RELEASE_FIXTURE_VERSION} usable carry-forward`,
    },
  });
  await prisma.kassaDay.upsert({
    where: { businessDate_cashDeskId: { businessDate: carryMissingDate, cashDeskId: carryDesk.id } },
    update: {
      firmId: agency.id, status: KassaStatus.CLOSED, activeSessionKey: null, currency: 'UZS', openedByUserId: firmAdmin.id,
      openedAt: new Date('2026-06-11T05:00:00.000Z'), closedByUserId: firmAdmin.id, closedAt: new Date('2026-07-16T14:00:00.000Z'),
      openingBalance: 0, openingBalanceUsd: 0, closingBalance: null, closingBalanceUsd: null,
      actualClosingBalance: null, actualClosingBalanceUsd: null, expectedCash: null, expectedCashUsd: null,
      variance: null, varianceUsd: null, notes: `QA RELEASE ${RELEASE_FIXTURE_VERSION} missing remainder`,
    },
    create: {
      firmId: agency.id, cashDeskId: carryDesk.id, status: KassaStatus.CLOSED, currency: 'UZS', businessDate: carryMissingDate,
      openedByUserId: firmAdmin.id, openedAt: new Date('2026-06-11T05:00:00.000Z'), closedByUserId: firmAdmin.id,
      closedAt: new Date('2026-07-16T14:00:00.000Z'), openingBalance: 0, openingBalanceUsd: 0,
      notes: `QA RELEASE ${RELEASE_FIXTURE_VERSION} missing remainder`,
    },
  });
  await prisma.kassaDay.deleteMany({
    where: {
      OR: [
        { cashDeskId: carryDesk.id, businessDate: new Date('2026-06-12T00:00:00.000Z') },
        { cashDeskId: desk1.id, businessDate: { in: ['2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-26'].map((date) => new Date(`${date}T00:00:00.000Z`)) } },
      ],
    },
  });

  const inventoryCategory = await prisma.inventoryCategory.upsert({
    where: { firmId_code: { firmId: agency.id, code: 'QA_GOODS' } },
    update: { name: 'QA Ombor mahsulotlari', isActive: true, deletedAt: null },
    create: { firmId: agency.id, code: 'QA_GOODS', name: 'QA Ombor mahsulotlari', isSystemDefault: false, createdByUserId: firmAdmin.id },
  });
  const inventoryUnit = await prisma.inventoryUnit.upsert({
    where: { firmId_code: { firmId: agency.id, code: 'PCS' } },
    update: { name: 'dona', isActive: true, deletedAt: null },
    create: { firmId: agency.id, code: 'PCS', name: 'dona', isSystemDefault: true, createdByUserId: firmAdmin.id },
  });
  const inventoryWarehouseCode = `QA-${RELEASE_FIXTURE_VERSION.replace(/\./g, '')}-MAIN`;
  const inventoryWarehouse = await prisma.warehouse.upsert({
    where: { firmId_code: { firmId: agency.id, code: inventoryWarehouseCode } },
    update: { name: `QA ${RELEASE_FIXTURE_VERSION} Asosiy ombor`, status: 'ACTIVE', deletedAt: null },
    create: { firmId: agency.id, code: inventoryWarehouseCode, name: `QA ${RELEASE_FIXTURE_VERSION} Asosiy ombor`, responsibleUserId: firmAdmin.id },
  });
  const inventorySupplier = (await prisma.inventorySupplier.findFirst({ where: { firmId: agency.id, name: `QA ${RELEASE_FIXTURE_VERSION} Yetkazib beruvchi` } }))
    || await prisma.inventorySupplier.create({ data: { firmId: agency.id, name: `QA ${RELEASE_FIXTURE_VERSION} Yetkazib beruvchi`, defaultCurrency: 'UZS' } });
  const inventorySku = `QA-${RELEASE_FIXTURE_VERSION.replace(/\./g, '')}-STOCK`;
  const inventoryProduct = await prisma.product.upsert({
    where: { firmId_sku: { firmId: agency.id, sku: inventorySku } },
    update: { name: `QA ${RELEASE_FIXTURE_VERSION} Ombor mahsuloti`, categoryId: inventoryCategory.id, unitId: inventoryUnit.id, defaultSupplierId: inventorySupplier.id, defaultWarehouseId: inventoryWarehouse.id, status: 'ACTIVE', deletedAt: null },
    create: { firmId: agency.id, sku: inventorySku, name: `QA ${RELEASE_FIXTURE_VERSION} Ombor mahsuloti`, categoryId: inventoryCategory.id, unitId: inventoryUnit.id, minimumStock: 2, reorderPoint: 3, defaultPurchasePrice: 100_000, defaultSalePrice: 150_000, currency: 'UZS', defaultSupplierId: inventorySupplier.id, defaultWarehouseId: inventoryWarehouse.id, tracksBatch: true, createdByUserId: firmAdmin.id },
  });
  const inventoryDocumentNumber = `QA-${RELEASE_FIXTURE_VERSION}-PURCHASE`;
  const inventoryDocument = await prisma.inventoryDocument.upsert({
    where: { firmId_documentNumber: { firmId: agency.id, documentNumber: inventoryDocumentNumber } },
    update: { status: 'APPLIED', warehouseId: inventoryWarehouse.id, supplierId: inventorySupplier.id, grossAmount: 1_000_000, netAmount: 1_000_000, currency: 'UZS', exchangeRateSnapshot: 1, deletedAt: null },
    create: { firmId: agency.id, type: 'PURCHASE', status: 'APPLIED', documentNumber: inventoryDocumentNumber, documentDate: new Date(), warehouseId: inventoryWarehouse.id, supplierId: inventorySupplier.id, paymentStatus: 'CREDIT', currency: 'UZS', exchangeRateSnapshot: 1, grossAmount: 1_000_000, netAmount: 1_000_000, createdByUserId: firmAdmin.id, approvedByUserId: firmAdmin.id, appliedAt: new Date() },
  });
  const inventoryBatch = await prisma.inventoryBatch.upsert({
    where: { warehouseId_productId_batchNumber: { warehouseId: inventoryWarehouse.id, productId: inventoryProduct.id, batchNumber: `QA-${RELEASE_FIXTURE_VERSION}-B1` } },
    update: { receivedQuantity: 10, issuedQuantity: 0, reservedQuantity: 0, unitCost: 100_000, currency: 'UZS', exchangeRateSnapshot: 1, status: 'ACTIVE', supplierId: inventorySupplier.id, sourceDocumentId: inventoryDocument.id },
    create: { firmId: agency.id, warehouseId: inventoryWarehouse.id, productId: inventoryProduct.id, batchNumber: `QA-${RELEASE_FIXTURE_VERSION}-B1`, receivedQuantity: 10, unitCost: 100_000, currency: 'UZS', exchangeRateSnapshot: 1, supplierId: inventorySupplier.id, sourceDocumentId: inventoryDocument.id },
  });
  const inventoryLine = (await prisma.inventoryDocumentLine.findFirst({ where: { documentId: inventoryDocument.id, productId: inventoryProduct.id, batchId: inventoryBatch.id } }))
    || await prisma.inventoryDocumentLine.create({ data: { documentId: inventoryDocument.id, productId: inventoryProduct.id, batchId: inventoryBatch.id, batchNumber: inventoryBatch.batchNumber, quantity: 10, unitPrice: 100_000, unitCostSnapshot: 100_000, lineTotal: 1_000_000, baseLineTotal: 1_000_000 } });
  const inventoryTransaction = await prisma.transaction.upsert({
    where: { idempotencyKey: `qa-${RELEASE_FIXTURE_VERSION}-inventory-purchase` },
    update: { firmId: agency.id, type: 'PAYABLE', direction: 'NON_CASH', subjectType: 'INVENTORY_MOVEMENT', originalAmount: 1_000_000, currency: 'UZS', exchangeRate: 1, baseAmount: 1_000_000, sourceMode: 'INVENTORY', status: 'APPLIED', approvalStatus: 'APPROVED', accountingTreatment: 'BALANCE_SHEET', deletedAt: null, metadata: { marker: RELEASE_FIXTURE_VERSION, inventorySku } },
    create: { firmId: agency.id, createdByUserId: firmAdmin.id, type: 'PAYABLE', direction: 'NON_CASH', subjectType: 'INVENTORY_MOVEMENT', originalAmount: 1_000_000, currency: 'UZS', exchangeRate: 1, baseAmount: 1_000_000, idempotencyKey: `qa-${RELEASE_FIXTURE_VERSION}-inventory-purchase`, sourceMode: 'INVENTORY', status: 'APPLIED', approvalStatus: 'APPROVED', accountingTreatment: 'BALANCE_SHEET', postingDate: new Date(), documentDate: new Date(), reportingPeriod: new Date().toISOString().slice(0, 7), metadata: { marker: RELEASE_FIXTURE_VERSION, inventorySku } },
  });
  const inventoryJournal = await prisma.journalEntry.upsert({
    where: { transactionId: inventoryTransaction.id },
    update: { firmId: agency.id, status: 'POSTED', description: `QA ${RELEASE_FIXTURE_VERSION} ombor xaridi` },
    create: { firmId: agency.id, transactionId: inventoryTransaction.id, status: 'POSTED', postingDate: new Date(), description: `QA ${RELEASE_FIXTURE_VERSION} ombor xaridi`, postedByUserId: firmAdmin.id },
  });
  const inventoryLedger = (await prisma.ledgerEntry.findFirst({ where: { transactionId: inventoryTransaction.id, debitAccount: 'INVENTORY', creditAccount: 'ACCOUNTS_PAYABLE' } }))
    || await prisma.ledgerEntry.create({ data: { transactionId: inventoryTransaction.id, journalEntryId: inventoryJournal.id, debitAccount: 'INVENTORY', creditAccount: 'ACCOUNTS_PAYABLE', amount: 1_000_000, currency: 'UZS', exchangeRateSnapshot: 1 } });
  const existingInventoryMovement = await prisma.inventoryMovement.findFirst({ where: { firmId: agency.id, sourceType: 'INVENTORY_DOCUMENT', sourceReferenceId: inventoryDocument.id, productId: inventoryProduct.id } });
  const inventoryMovement = existingInventoryMovement
    ? await prisma.inventoryMovement.update({ where: { id: existingInventoryMovement.id }, data: { warehouseId: inventoryWarehouse.id, batchId: inventoryBatch.id, documentLineId: inventoryLine.id, transactionId: inventoryTransaction.id, quantity: 10, unitCostSnapshot: 100_000, totalCostSnapshot: 1_000_000, status: 'APPLIED', deletedAt: null } })
    : await prisma.inventoryMovement.create({ data: { firmId: agency.id, warehouseId: inventoryWarehouse.id, productId: inventoryProduct.id, batchId: inventoryBatch.id, documentId: inventoryDocument.id, documentLineId: inventoryLine.id, movementType: 'PURCHASE_IN', quantity: 10, unitCostSnapshot: 100_000, totalCostSnapshot: 1_000_000, currency: 'UZS', exchangeRateSnapshot: 1, sourceType: 'INVENTORY_DOCUMENT', sourceReferenceId: inventoryDocument.id, documentNumber: inventoryDocumentNumber, movementDate: new Date(), status: 'APPLIED', createdByUserId: firmAdmin.id, approvedByUserId: firmAdmin.id, transactionId: inventoryTransaction.id } });

  const releaseNotificationTitle = `QA ${RELEASE_FIXTURE_VERSION} release fixture`;
  const releaseNotification = await prisma.notification.findFirst({ where: { userId: superadmin.id, title: releaseNotificationTitle } });
  const releaseNotificationData = {
    userId: superadmin.id, title: releaseNotificationTitle, body: RELEASE_FIXTURE_DESCRIPTION,
    type: 'QA_RELEASE', entityType: 'RELEASE_FIXTURE', entityId: RELEASE_FIXTURE_VERSION,
    metadata: { flightNumber: releaseFlightNumber, deskCode: releaseDesk.code, carryDeskCode: carryDesk.code, importDeskCode: importDesk.code, editDeskCode: editDesk.code, editTransactionId: releaseEditTransaction.id, discountTourName, partnerOnlyServiceName, unassignedServiceName, mixedRejectAllocationId, mixedDeleteAllocationId },
  };
  if (releaseNotification) await prisma.notification.update({ where: { id: releaseNotification.id }, data: releaseNotificationData });
  else await prisma.notification.create({ data: releaseNotificationData });

  console.log(JSON.stringify({
    releaseFixture: { version: RELEASE_FIXTURE_VERSION, description: RELEASE_FIXTURE_DESCRIPTION, flightNumber: releaseFlightNumber, deskCode: releaseDesk.code, carryDeskCode: carryDesk.code, importDeskCode: importDesk.code, editDeskCode: editDesk.code, editTransactionId: releaseEditTransaction.id, financeTransactionId: financeFixture.id, financeLedgerId: financeLedger.id, inventorySku, inventoryProductId: inventoryProduct.id, inventoryMovementId: inventoryMovement.id, inventoryTransactionId: inventoryTransaction.id, inventoryLedgerId: inventoryLedger.id, salaryEmployeeId: salaryEmployee.id, salaryEmployeeName, securityEmployeeId: securityEmployee.id, securityEmployeeName, discountTourName, partnerOnlyServiceName, unassignedServiceName, mixedRejectAllocationId, mixedRejectTicketIds, mixedDeleteAllocationId, mixedDeleteTicketId },
    password,
    users: ['qa.superadmin@ado.test', 'qa.readonly-superadmin@ado.test', 'qa.admin@ado.test', 'qa.firmadmin@ado.test', 'qa.partneradmin@ado.test', 'qa.manager@ado.test', 'qa.security@ado.test', 'qa.kassir1@ado.test', 'qa.kassir2@ado.test', 'qa.ombor.mudiri@ado.test'],
    firms: [agency.name, partner.name, airlineFirm.name, provider.name, noLoginFirm.name],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
