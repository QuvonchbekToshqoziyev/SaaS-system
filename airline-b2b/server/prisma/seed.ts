import { PrismaClient, TransactionType, TicketStatus, FlightSettlementStatus, PaymentMethod, PaymentStatus, ReconciliationStatus, FirmStatus, Role } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

// A pre-hashed password for '1111' using bcrypt 10 rounds
const HASHED_PASSWORD_1111 = '$2a$10$C1wz/4D7P6H1/f5Lz4G2b.0X6g7Z8z/l52.aB6qTzQ1O18R1/mRxy';

const ACCOUNTS = {
  AR: 'ACCOUNTS_RECEIVABLE',
  CASH: 'CASH',
  BANK: 'BANK',
  INV: 'TICKET_INVENTORY',
  REV: 'REVENUE',
  COGS: 'COGS',
  REFUND: 'REFUND_ADJUSTMENT'
};

async function main() {
  console.log('Seeding comprehensive edge cases...');
  
  // 1. Wipe current data for a clean slate
  await prisma.ledgerEntry.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.ticket.deleteMany({});
  await prisma.flight.deleteMany({});
  await prisma.invitation.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.firm.deleteMany({});

  // 2. Setup Superadmin
  await prisma.user.create({
    data: {
      email: 'admin@adob2b.com',
      password: HASHED_PASSWORD_1111,
      role: Role.SUPERADMIN,
    }
  });

  // 3. Setup Firms (Active, Suspended, Multi-currency)
  const firmA = await prisma.firm.create({
    data: {
      name: 'Alpha Travel (Active - USD)',
      creditLimit: 50000.00,
      currency: 'USD',
      status: FirmStatus.ACTIVE,
      users: {
        create: [{ email: 'alpha@firm.com', password: HASHED_PASSWORD_1111, role: Role.FIRM }]
      }
    }
  });

  const firmB = await prisma.firm.create({
    data: {
      name: 'Beta Tours (Active - EUR)',
      creditLimit: 100000.00,
      currency: 'EUR',
      status: FirmStatus.ACTIVE,
      users: {
        create: [{ email: 'beta@firm.com', password: HASHED_PASSWORD_1111, role: Role.FIRM }]
      }
    }
  });

  const firmC = await prisma.firm.create({
    data: {
      name: 'Gamma Suspended (Suspended)',
      creditLimit: 10000.00,
      currency: 'USD',
      status: FirmStatus.SUSPENDED,
      users: {
        create: [{ email: 'gamma@firm.com', password: HASHED_PASSWORD_1111, role: Role.FIRM }]
      }
    }
  });

  // 4. Setup Flights (OPEN, CLOSING, CLOSED)
  const flightOpen = await prisma.flight.create({
    data: {
      route: 'JFK-LHR',
      flightNumber: 'AD100',
      departureTime: new Date(Date.now() + 86400000 * 30), // 30 days later
      arrivalTime: new Date(Date.now() + 86400000 * 30 + 3600000 * 8),
      currency: 'USD',
      settlementStatus: FlightSettlementStatus.OPEN,
    }
  });

  const flightClosing = await prisma.flight.create({
    data: {
      route: 'LHR-DXB',
      flightNumber: 'AD200',
      departureTime: new Date(Date.now() - 86400000 * 1), // 1 day ago
      arrivalTime: new Date(Date.now() - 86400000 * 1 + 3600000 * 7),
      currency: 'USD',
      settlementStatus: FlightSettlementStatus.CLOSING,
    }
  });

  const flightClosed = await prisma.flight.create({
    data: {
      route: 'DXB-SYD',
      flightNumber: 'AD300',
      departureTime: new Date(Date.now() - 86400000 * 40), // 40 days ago
      arrivalTime: new Date(Date.now() - 86400000 * 40 + 3600000 * 10),
      currency: 'USD',
      settlementStatus: FlightSettlementStatus.CLOSED,
    }
  });

  // 5. Generate Tickets (10 for each flight)
  const basePrice = 500.00;
  const ticketsOpen = await Promise.all(
    Array.from({ length: 10 }).map(() => prisma.ticket.create({
      data: { flightId: flightOpen.id, basePrice }
    }))
  );

  const ticketsClosing = await Promise.all(
    Array.from({ length: 10 }).map(() => prisma.ticket.create({
      data: { flightId: flightClosing.id, basePrice }
    }))
  );

  const ticketsClosed = await Promise.all(
    Array.from({ length: 10 }).map(() => prisma.ticket.create({
      data: { flightId: flightClosed.id, basePrice }
    }))
  );

  // -----------------------
  // EDGE CASE 1: Standard Allocation & Sale (Flight OPEN, Firm A)
  // -----------------------
  console.log('Generating Edge Case 1: Standard Allocation & Sale...');
  
  // Allocate 4 tickets to Firm A
  const allocationTx1 = await prisma.transaction.create({
    data: {
      type: TransactionType.ALLOCATION,
      firmId: firmA.id,
      flightId: flightOpen.id,
      idempotencyKey: uuidv4(),
      metadata: { note: 'Initial basic allocation', ticketIds: ticketsOpen.slice(0, 4).map(t => t.id) },
      ledgerEntries: {
        create: {
          debitAccount: ACCOUNTS.AR,
          creditAccount: ACCOUNTS.INV,
          amount: 4 * basePrice,
          currency: 'USD',
          exchangeRateSnapshot: 1.0,
        }
      }
    }
  });

  for (const t of ticketsOpen.slice(0, 4)) {
    await prisma.ticket.update({
      where: { id: t.id },
      data: { status: TicketStatus.ALLOCATED, allocatedFirmId: firmA.id }
    });
  }

  // Sell 2 of those allocated tickets
  const sellPrice1 = 600.00;
  const soldTickets1 = ticketsOpen.slice(0, 2);
  const saleTx1 = await prisma.transaction.create({
    data: {
      type: TransactionType.SALE,
      firmId: firmA.id,
      flightId: flightOpen.id,
      idempotencyKey: uuidv4(),
      metadata: { note: 'Basic sale', ticketIds: soldTickets1.map(t => t.id) },
      ledgerEntries: {
        create: [
          // 1. DR COGS, CR TICKET_INVENTORY (At Base Price)
          { debitAccount: ACCOUNTS.COGS, creditAccount: ACCOUNTS.INV, amount: 2 * basePrice, currency: 'USD', exchangeRateSnapshot: 1.0 },
          // 2. DR ACCOUNTS_RECEIVABLE, CR REVENUE (At Sale Price)
          { debitAccount: ACCOUNTS.AR, creditAccount: ACCOUNTS.REV, amount: 2 * sellPrice1, currency: 'USD', exchangeRateSnapshot: 1.0 }
        ]
      }
    }
  });

  for (const t of soldTickets1) {
    await prisma.ticket.update({
      where: { id: t.id },
      data: { status: TicketStatus.SOLD, soldPrice: sellPrice1, soldCurrency: 'USD', purchaserInfo: { name: 'John Doe' } }
    });
  }


  // -----------------------
  // EDGE CASE 2: Multi-currency, Refunds, Payments (Flight OPEN, Firm B - EUR)
  // Firm B allocates 2 tickets in EUR equivalents, sells 1, refunds 1, makes Bank Payment.
  // -----------------------
  console.log('Generating Edge Case 2: Multi-Currency & Refund & Payments...');
  const exchangeRateEurToUsd = 1.1; // 1 EUR = 1.10 USD
  
  const allocTicketsB = ticketsOpen.slice(4, 6);
  await prisma.transaction.create({
    data: {
      type: TransactionType.ALLOCATION,
      firmId: firmB.id,
      flightId: flightOpen.id,
      idempotencyKey: uuidv4(),
      metadata: { note: 'EUR Allocation' },
      ledgerEntries: {
        create: {
          debitAccount: ACCOUNTS.AR, creditAccount: ACCOUNTS.INV,
          amount: 2 * basePrice, currency: 'USD', exchangeRateSnapshot: exchangeRateEurToUsd
        }
      }
    }
  });
  for (const t of allocTicketsB) {
    await prisma.ticket.update({ where: { id: t.id }, data: { status: TicketStatus.ALLOCATED, allocatedFirmId: firmB.id } });
  }

  // Sell 1 ticket (Eur firm)
  const sellPriceEur = 550.00; // EUR sale price
  await prisma.transaction.create({
    data: {
      type: TransactionType.SALE, firmId: firmB.id, flightId: flightOpen.id, idempotencyKey: uuidv4(),
      ledgerEntries: {
        create: [
          { debitAccount: ACCOUNTS.COGS, creditAccount: ACCOUNTS.INV, amount: basePrice, currency: 'USD', exchangeRateSnapshot: exchangeRateEurToUsd },
          { debitAccount: ACCOUNTS.AR, creditAccount: ACCOUNTS.REV, amount: sellPriceEur, currency: 'EUR', exchangeRateSnapshot: exchangeRateEurToUsd }
        ]
      }
    }
  });
  await prisma.ticket.update({
    where: { id: allocTicketsB[0].id },
    data: { status: TicketStatus.SOLD, soldPrice: sellPriceEur, soldCurrency: 'EUR' }
  });

  // Refund the allocated but NOT sold ticket? Or refund the SOLD ticket?
  // Let's refund the SOLD ticket to test the complete double-entry reversal.
  await prisma.transaction.create({
    data: {
      type: TransactionType.REFUND, firmId: firmB.id, flightId: flightOpen.id, idempotencyKey: uuidv4(),
      metadata: { ticketId: allocTicketsB[0].id, reason: 'Customer Cancelled' },
      ledgerEntries: {
        create: [
          // Reverse Revenue -> AR
          { debitAccount: ACCOUNTS.REV, creditAccount: ACCOUNTS.AR, amount: sellPriceEur, currency: 'EUR', exchangeRateSnapshot: exchangeRateEurToUsd },
          // Reverse COGS -> Inventory (or Refund_Adjustment)
          { debitAccount: ACCOUNTS.INV, creditAccount: ACCOUNTS.COGS, amount: basePrice, currency: 'USD', exchangeRateSnapshot: exchangeRateEurToUsd }
        ]
      }
    }
  });
  await prisma.ticket.update({
    where: { id: allocTicketsB[0].id },
    data: { status: TicketStatus.REFUNDED } 
  });

  // Make a Payment
  const paymentAmt = 2000.00;
  const payment = await prisma.payment.create({
    data: {
      firmId: firmB.id, amount: paymentAmt, method: PaymentMethod.BANK_TRANSFER,
      reference: 'WIRE-12345', status: PaymentStatus.CONFIRMED, reconciliationStatus: ReconciliationStatus.MATCHED
    }
  });
  await prisma.transaction.create({
    data: {
      type: TransactionType.PAYMENT, firmId: firmB.id, idempotencyKey: uuidv4(),
      metadata: { paymentId: payment.id },
      ledgerEntries: {
        create: {
          debitAccount: ACCOUNTS.BANK, creditAccount: ACCOUNTS.AR,
          amount: paymentAmt, currency: 'EUR', exchangeRateSnapshot: exchangeRateEurToUsd
        }
      }
    }
  });

  // -----------------------
  // EDGE CASE 3: CLOSED Flight Adjustments
  // -----------------------
  console.log('Generating Edge Case 3: CLOSED Flight logic...');
  // Force 1 ALLOCATED and 1 SOLD on the CLOSED flight to see final state
  await prisma.ticket.update({ where: { id: ticketsClosed[0].id }, data: { status: TicketStatus.ALLOCATED, allocatedFirmId: firmA.id }});
  await prisma.ticket.update({ where: { id: ticketsClosed[1].id }, data: { status: TicketStatus.SOLD, allocatedFirmId: firmA.id, soldPrice: 800.0, soldCurrency: 'USD' }});

  await prisma.transaction.create({
    data: {
      type: TransactionType.ADJUSTMENT, firmId: firmA.id, flightId: flightClosed.id, idempotencyKey: uuidv4(),
      metadata: { note: 'Manual accounting adjustment post-close for roundings.' },
      ledgerEntries: {
        create: {
          debitAccount: ACCOUNTS.AR, creditAccount: ACCOUNTS.REFUND,
          amount: 15.50, currency: 'USD', exchangeRateSnapshot: 1.0
        }
      }
    }
  });


  // -----------------------
  // EDGE CASE 4: Idempotency Attack simulation (No-op seed)
  // Handled inherently by unique constraint on Transaction.idempotencyKey.

  console.log('✅ Seed completed successfully! Database is full of B2B edge case data.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
