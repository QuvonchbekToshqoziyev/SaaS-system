import { FinancialAccountType, FirmUserRole, PrismaClient, Role, TicketStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const password = 'QaDev2026!';

async function firm(name: string, kind: 'AGENCY' | 'AIRLINE' | 'CONTRACTOR', currency: 'UZS' | 'USD') {
  return (await prisma.firm.findFirst({ where: { name } })) || prisma.firm.create({ data: { name, kind, currency, contactFullName: 'QA DEV', phone: '+998900000000', subscriptionEndsAt: new Date('2030-12-31') } });
}

async function user(email: string, role: Role, firmId?: string, firmRole: FirmUserRole = FirmUserRole.MANAGER) {
  const hash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({ where: { email }, update: { password: hash, role, firmId, firmRole, status: 'ACTIVE', deletedAt: null, fullName: `QA DEV ${firmRole}` }, create: { email, password: hash, role, firmId, firmRole, fullName: `QA DEV ${firmRole}` } });
}

async function main() {
  const agency = await firm('QA DEV Tashkent Tours', 'AGENCY', 'UZS');
  const partner = await firm('QA DEV Partner Agency', 'AGENCY', 'USD');
  const airlineFirm = await firm('QA DEV Airways Firm', 'AIRLINE', 'USD');
  const provider = await firm('QA DEV Visa Provider', 'CONTRACTOR', 'USD');

  const superadmin = await user('qa.superadmin@ado.test', Role.SUPERADMIN);
  const admin = await user('qa.admin@ado.test', Role.ADMIN);
  const firmAdmin = await user('qa.firmadmin@ado.test', Role.FIRM, agency.id, FirmUserRole.FIRM_ADMIN);
  const manager = await user('qa.manager@ado.test', Role.FIRM, agency.id, FirmUserRole.MANAGER);
  const kassir1 = await user('qa.kassir1@ado.test', Role.FIRM, agency.id, FirmUserRole.KASSIR);
  const kassir2 = await user('qa.kassir2@ado.test', Role.FIRM, agency.id, FirmUserRole.KASSIR);
  await prisma.userFirmAccess.createMany({ data: [agency.id, partner.id].map((firmId) => ({ userId: admin.id, firmId })), skipDuplicates: true });

  const airline = await prisma.airline.upsert({ where: { name: 'QA DEV Airways' }, update: { firmId: airlineFirm.id, status: 'ACTIVE' }, create: { name: 'QA DEV Airways', code: 'QAD', firmId: airlineFirm.id } });
  const flight = (await prisma.flight.findFirst({ where: { flightNumber: 'QA-101' } })) || await prisma.flight.create({ data: { flightNumber: 'QA-101', route: 'TAS-DXB-TAS', airlineId: airline.id, departure: new Date('2026-08-15T08:00:00Z'), arrival: new Date('2026-08-15T12:00:00Z'), currency: 'USD', status: 'ACTIVE' } });
  if (!(await prisma.ticket.findFirst({ where: { flightId: flight.id } }))) await prisma.ticket.createMany({ data: Array.from({ length: 30 }, () => ({ flightId: flight.id, status: TicketStatus.AVAILABLE, basePrice: 350, currency: 'USD', assignedFirmId: agency.id })) });

  const desk1 = (await prisma.kassaDesk.findFirst({ where: { firmId: agency.id, name: 'QA DEV Kassa 1' } })) || await prisma.kassaDesk.create({ data: { firmId: agency.id, name: 'QA DEV Kassa 1', code: 'QA-K1', createdByUserId: firmAdmin.id } });
  const desk2 = (await prisma.kassaDesk.findFirst({ where: { firmId: agency.id, name: 'QA DEV Kassa 2' } })) || await prisma.kassaDesk.create({ data: { firmId: agency.id, name: 'QA DEV Kassa 2', code: 'QA-K2', createdByUserId: firmAdmin.id } });
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

  console.log(JSON.stringify({ password, users: ['qa.superadmin@ado.test', 'qa.admin@ado.test', 'qa.firmadmin@ado.test', 'qa.manager@ado.test', 'qa.kassir1@ado.test', 'qa.kassir2@ado.test'], firms: [agency.name, partner.name, airlineFirm.name, provider.name] }, null, 2));
}

main().finally(() => prisma.$disconnect());
