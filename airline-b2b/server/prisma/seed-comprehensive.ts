import { PrismaClient, Role, TicketStatus, TransactionType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const daysFromNow = (days: number, extraHours = 0) =>
  new Date(Date.now() + days * 86400000 + extraHours * 3600000);

async function main() {
  console.log('Wiping existing data...');
  // Order of deletion matters to avoid foreign key constraint violations
  await prisma.transaction.deleteMany({});
  await prisma.ticket.deleteMany({});
  await prisma.invitation.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.firm.deleteMany({});
  await prisma.flight.deleteMany({});
  await prisma.currencyRate.deleteMany({});
  console.log('Data wiped.');

  console.log('Starting comprehensive database seed...');

  // 1. Create Currency Rates
  console.log('Creating currency rates...');
  const usdToUzs = await prisma.currencyRate.create({
    data: { baseCurrency: 'USD', targetCurrency: 'UZS', rate: 12600, source: 'seed' },
  });
  const usdToEur = await prisma.currencyRate.create({
    data: { baseCurrency: 'USD', targetCurrency: 'EUR', rate: 0.92, source: 'seed' },
  });

  // 2. Create Superadmin
  console.log('Creating superadmin...');
  const superadminPassword = await bcrypt.hash('superadmin123', 10);
  const superadmin = await prisma.user.create({
    data: {
      email: 'admin@airline.com',
      password: superadminPassword,
      role: Role.SUPERADMIN,
    },
  });

  // 3. Create Firms and Firm Users
  console.log('Creating firms and users...');
  const firm1Password = await bcrypt.hash('firm123', 10);
  const firm1 = await prisma.firm.create({
    data: {
      name: 'Global Travel Agency',
      users: {
        create: {
          email: 'agency@airline.com',
          password: firm1Password,
          role: Role.FIRM,
        },
      },
    },
  });

  const firm2Password = await bcrypt.hash('firm456', 10);
  const firm2 = await prisma.firm.create({
    data: {
      name: 'Sky High Tours',
      users: {
        create: {
          email: 'skyhigh@airline.com',
          password: firm2Password,
          role: Role.FIRM,
        },
      },
    },
  });

  // 4. Create Flights
  console.log('Creating flights...');
  const flight1 = await prisma.flight.create({
    data: {
      flightNumber: 'JB-201',
      route: 'TAS-JFK',
      departure: daysFromNow(5),
      arrival: daysFromNow(5, 3),
      currency: 'USD',
    },
  });

  const flight2 = await prisma.flight.create({
    data: {
      flightNumber: 'JB-305',
      route: 'TAS-LHR',
      departure: daysFromNow(10),
      arrival: daysFromNow(10, 8),
      currency: 'USD',
    },
  });
  
  const flight3 = await prisma.flight.create({
    data: {
      flightNumber: 'JB-415',
      route: 'TAS-DXB',
      departure: daysFromNow(12),
      arrival: daysFromNow(12, 4),
      currency: 'USD',
    },
  });

  // 5. Create Tickets for Flights
  console.log('Creating tickets...');
  // Flight 1: Mix of tickets
  for (let i = 0; i < 20; i++) {
    await prisma.ticket.create({
      data: {
        flightId: flight1.id,
        basePrice: 350.00,
        currency: 'USD',
        status: TicketStatus.AVAILABLE,
      },
    });
  }
  for (let i = 0; i < 5; i++) {
    await prisma.ticket.create({
      data: {
        flightId: flight1.id,
        basePrice: 350.00,
        currency: 'USD',
        status: TicketStatus.ASSIGNED,
        assignedFirmId: firm1.id,
      },
    });
  }

  // Flight 2: All available
  for (let i = 0; i < 50; i++) {
    await prisma.ticket.create({
      data: {
        flightId: flight2.id,
        basePrice: 800.00,
        currency: 'USD',
        status: TicketStatus.AVAILABLE,
      },
    });
  }
  
  // Flight 3: Some sold tickets
  for (let i = 0; i < 10; i++) {
    const ticket = await prisma.ticket.create({
      data: {
        flightId: flight3.id,
        basePrice: 550.00,
        currency: 'USD',
        status: TicketStatus.SOLD,
        assignedFirmId: firm2.id,
      },
    });
    // Create a corresponding SALE transaction
    await prisma.transaction.create({
        data: {
            firmId: firm2.id,
            flightId: flight3.id,
            ticketId: ticket.id,
            type: TransactionType.SALE,
            originalAmount: ticket.basePrice,
            currency: ticket.currency,
            exchangeRate: 1, // Assuming USD base
            baseAmount: ticket.basePrice,
            paymentMethod: 'Credit Card',
        }
    });
  }


  console.log('Comprehensive database seed complete!');
  console.log('Created:');
  console.log(`- 1 Superadmin: ${superadmin.email}`);
  console.log(`- 2 Firms: ${firm1.name}, ${firm2.name}`);
  console.log(`- 3 Flights`);
  console.log(`- Many tickets with various statuses.`);
}

main()
  .catch((e) => {
    console.error('An error occurred during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
