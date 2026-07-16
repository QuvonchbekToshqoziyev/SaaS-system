import { FinancialAccountType, FirmUserRole, KassaStatus, PrismaClient, Role, TicketProductType, TicketStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();
const password = 'QaDev2026!';
const RELEASE_FIXTURE_VERSION = '1.0.4';
const RELEASE_FIXTURE_DESCRIPTION = 'Ajratilgan reys, kassa ko‘rinishi, xizmat izolyatsiyasi va bitta ajratma/bitta qarzdorlik';

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

async function user(email: string, role: Role, firmId?: string, firmRole: FirmUserRole = FirmUserRole.MANAGER) {
  const hash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({ where: { email }, update: { password: hash, role, firmId, firmRole, status: 'ACTIVE', deletedAt: null, fullName: `QA DEV ${firmRole}` }, create: { email, password: hash, role, firmId, firmRole, fullName: `QA DEV ${firmRole}` } });
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
  const admin = await user('qa.admin@ado.test', Role.ADMIN);
  const firmAdmin = await user('qa.firmadmin@ado.test', Role.FIRM, agency.id, FirmUserRole.FIRM_ADMIN);
  const partnerAdmin = await user('qa.partneradmin@ado.test', Role.FIRM, partner.id, FirmUserRole.FIRM_ADMIN);
  const manager = await user('qa.manager@ado.test', Role.FIRM, agency.id, FirmUserRole.MANAGER);
  const kassir1 = await user('qa.kassir1@ado.test', Role.FIRM, agency.id, FirmUserRole.KASSIR);
  const kassir2 = await user('qa.kassir2@ado.test', Role.FIRM, agency.id, FirmUserRole.KASSIR);
  await prisma.userFirmAccess.createMany({ data: [agency.id, partner.id].map((firmId) => ({ userId: admin.id, firmId })), skipDuplicates: true });

  const airline = await prisma.airline.upsert({ where: { name: 'QA DEV Airways' }, update: { firmId: airlineFirm.id, status: 'ACTIVE' }, create: { name: 'QA DEV Airways', code: 'QAD', firmId: airlineFirm.id } });
  const flight = (await prisma.flight.findFirst({ where: { flightNumber: 'QA-101' } })) || await prisma.flight.create({ data: { flightNumber: 'QA-101', route: 'TAS-DXB-TAS', airlineId: airline.id, departure: new Date('2026-08-15T08:00:00Z'), arrival: new Date('2026-08-15T12:00:00Z'), currency: 'USD', status: 'ACTIVE' } });
  if (!(await prisma.ticket.findFirst({ where: { flightId: flight.id } }))) await prisma.ticket.createMany({ data: Array.from({ length: 30 }, () => ({ flightId: flight.id, status: TicketStatus.AVAILABLE, basePrice: 350, currency: 'USD', assignedFirmId: agency.id })) });

  const desk1 = (await prisma.kassaDesk.findFirst({ where: { firmId: agency.id, name: 'QA DEV Kassa 1' } })) || await prisma.kassaDesk.create({ data: { firmId: agency.id, name: 'QA DEV Kassa 1', code: 'QA-K1', createdByUserId: firmAdmin.id } });
  const desk2 = (await prisma.kassaDesk.findFirst({ where: { firmId: agency.id, name: 'QA DEV Kassa 2' } })) || await prisma.kassaDesk.create({ data: { firmId: agency.id, name: 'QA DEV Kassa 2', code: 'QA-K2', createdByUserId: firmAdmin.id } });
  const releaseDeskCode = `QA-${RELEASE_FIXTURE_VERSION.replace(/\./g, '')}-K1`;
  const releaseDesk = (await prisma.kassaDesk.findFirst({ where: { firmId: noLoginFirm.id, code: releaseDeskCode } })) || await prisma.kassaDesk.create({
    data: { firmId: noLoginFirm.id, name: `QA ${RELEASE_FIXTURE_VERSION} Login yo‘q kassa`, code: releaseDeskCode, createdByUserId: superadmin.id },
  });
  const card = (await prisma.paymentCard.findFirst({ where: { firmId: agency.id, ownerName: 'QA DEV Shared Visa Card' } })) || await prisma.paymentCard.create({ data: { firmId: agency.id, ownerName: 'QA DEV Shared Visa Card', cardNumber: '8600123412345678', currency: 'UZS', openingBalance: 5_000_000, createdByUserId: firmAdmin.id } });

  await prisma.currencyRate.upsert({ where: { firmId_targetCurrency_recordedAt: { firmId: agency.id, targetCurrency: 'USD', recordedAt: new Date('2026-07-11T00:00:00Z') } }, update: { rate: 12850 }, create: { firmId: agency.id, baseCurrency: 'UZS', targetCurrency: 'USD', rate: 12850, source: `firm:${agency.id}`, recordedAt: new Date('2026-07-11T00:00:00Z'), createdByUserId: firmAdmin.id } });

  const bank = await prisma.financialAccount.upsert({ where: { firmId_name_currency: { firmId: agency.id, name: 'QA DEV Bank', currency: 'UZS' } }, update: { status: 'ACTIVE' }, create: { firmId: agency.id, name: 'QA DEV Bank', type: FinancialAccountType.BANK, currency: 'UZS', openingBalance: 25_000_000, createdByUserId: firmAdmin.id } });
  const cash1 = await prisma.financialAccount.upsert({ where: { firmId_name_currency: { firmId: agency.id, name: 'Kassa: QA DEV Kassa 1', currency: 'UZS' } }, update: { kassaDeskId: desk1.id }, create: { firmId: agency.id, name: 'Kassa: QA DEV Kassa 1', type: FinancialAccountType.CASH, currency: 'UZS', kassaDeskId: desk1.id, openingBalance: 2_000_000, createdByUserId: firmAdmin.id } });
  await prisma.financialAccount.upsert({ where: { firmId_name_currency: { firmId: agency.id, name: 'Kassa: QA DEV Kassa 2', currency: 'UZS' } }, update: { kassaDeskId: desk2.id }, create: { firmId: agency.id, name: 'Kassa: QA DEV Kassa 2', type: FinancialAccountType.CASH, currency: 'UZS', kassaDeskId: desk2.id, openingBalance: 1_000_000, createdByUserId: firmAdmin.id } });
  await prisma.financialAccount.upsert({ where: { firmId_name_currency: { firmId: agency.id, name: 'Karta: QA DEV Shared Visa Card', currency: 'UZS' } }, update: { paymentCardId: card.id }, create: { firmId: agency.id, name: 'Karta: QA DEV Shared Visa Card', type: FinancialAccountType.CARD, currency: 'UZS', paymentCardId: card.id, openingBalance: card.openingBalance, createdByUserId: firmAdmin.id } });

  if (!(await prisma.transaction.findFirst({ where: { subjectId: 'qa-dev-bank-income' } }))) await prisma.transaction.create({ data: { firmId: agency.id, receiverFirmId: agency.id, createdByUserId: firmAdmin.id, destinationAccountId: bank.id, type: 'ADJUSTMENT', direction: 'ACCOUNT_IN', subjectType: 'QA_DEV', subjectId: 'qa-dev-bank-income', originalAmount: 10_000_000, currency: 'UZS', exchangeRate: 1, baseAmount: 10_000_000, metadata: { marker: 'QA DEV', category: 'OTHER_INCOME' } } });
  if (!(await prisma.transaction.findFirst({ where: { subjectId: 'qa-dev-kassa-sale' } }))) await prisma.transaction.create({ data: { firmId: agency.id, receiverFirmId: agency.id, flightId: flight.id, kassaDeskId: desk1.id, createdByUserId: kassir1.id, destinationAccountId: cash1.id, type: 'SALE', direction: 'KASSA_IN', subjectType: 'QA_DEV', subjectId: 'qa-dev-kassa-sale', originalAmount: 4_500_000, currency: 'UZS', exchangeRate: 1, baseAmount: 4_500_000, paymentMethod: 'cash', metadata: { marker: 'QA DEV', date: new Date().toISOString().slice(0, 10) } } });

  if (!(await prisma.employee.findFirst({ where: { firmId: agency.id, name: 'QA DEV Tour Manager' } }))) await prisma.employee.create({ data: { firmId: agency.id, name: 'QA DEV Tour Manager', role: 'MANAGER', salary: 8_000_000, currency: 'UZS' } });
  if (!(await prisma.tourPackage.findFirst({ where: { ownerFirmId: agency.id, name: 'QA DEV Dubai Tour' } }))) await prisma.tourPackage.create({ data: { ownerFirmId: agency.id, flightId: flight.id, name: 'QA DEV Dubai Tour', destination: 'Dubai', quantity: 20, availableQuantity: 20, unitPrice: 8_000_000, ticketPrice: 4_500_000, servicePrice: 3_500_000, currency: 'UZS', notes: 'QA DEV full tour package' } });
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

  const releasePayable = await prisma.transaction.findFirst({
    where: { subjectType: 'TICKET_ALLOCATION', subjectId: releaseAllocation.id, type: 'PAYABLE', status: 'CONFIRMED', deletedAt: null, reversedTransactionId: null },
  });
  const releasePayableData = {
    firmId: partner.id, payerFirmId: partner.id, receiverFirmId: agency.id, flightId: releaseFlight.id,
    createdByUserId: partnerAdmin.id, type: 'PAYABLE' as const, originalAmount: 840, currency: 'USD', exchangeRate: 12850,
    baseAmount: 10_794_000, direction: 'FIRM_TO_FIRM', subjectType: 'TICKET_ALLOCATION', subjectId: releaseAllocation.id,
    sourceMode: 'AUTO_ALLOCATION', status: 'CONFIRMED',
    metadata: { note: `QA ${RELEASE_FIXTURE_VERSION} one allocation one payable`, allocationId: releaseAllocation.id, productType: 'ROUND_TRIP', parentTicketCount: 2, segmentCount: 4 },
  };
  if (releasePayable) await prisma.transaction.update({ where: { id: releasePayable.id }, data: releasePayableData });
  else await prisma.transaction.create({ data: releasePayableData });

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

  const releaseNotificationTitle = `QA ${RELEASE_FIXTURE_VERSION} release fixture`;
  const releaseNotification = await prisma.notification.findFirst({ where: { userId: superadmin.id, title: releaseNotificationTitle } });
  const releaseNotificationData = {
    userId: superadmin.id, title: releaseNotificationTitle, body: RELEASE_FIXTURE_DESCRIPTION,
    type: 'QA_RELEASE', entityType: 'RELEASE_FIXTURE', entityId: RELEASE_FIXTURE_VERSION,
    metadata: { flightNumber: releaseFlightNumber, deskCode: releaseDesk.code, partnerOnlyServiceName },
  };
  if (releaseNotification) await prisma.notification.update({ where: { id: releaseNotification.id }, data: releaseNotificationData });
  else await prisma.notification.create({ data: releaseNotificationData });

  console.log(JSON.stringify({
    releaseFixture: { version: RELEASE_FIXTURE_VERSION, description: RELEASE_FIXTURE_DESCRIPTION, flightNumber: releaseFlightNumber, deskCode: releaseDesk.code, partnerOnlyServiceName },
    password,
    users: ['qa.superadmin@ado.test', 'qa.admin@ado.test', 'qa.firmadmin@ado.test', 'qa.partneradmin@ado.test', 'qa.manager@ado.test', 'qa.kassir1@ado.test', 'qa.kassir2@ado.test'],
    firms: [agency.name, partner.name, airlineFirm.name, provider.name, noLoginFirm.name],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
