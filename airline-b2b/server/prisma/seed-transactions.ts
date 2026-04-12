import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const flight = await prisma.flight.findFirst();
  const firm = await prisma.firm.findFirst();
  
  if (!flight || !firm) {
    console.log("No flight or firm found. Run seed.ts first.");
    return;
  }

  console.log("Creating tickets and transactions...");
  
  // Create 10 tickets
  const ticketsData = Array.from({ length: 10 }).map(() => ({
    flightId: flight.id,
    price: 500.00,
    currency: 'USD',
    status: 'AVAILABLE' as any,
  }));
  
  await prisma.ticket.createMany({ data: ticketsData });
  const tickets = await prisma.ticket.findMany({ where: { flightId: flight.id } });

  // Allocate 5 of them
  for (let i = 0; i < 5; i++) {
    const t = tickets[i];
    await prisma.ticket.update({ where: { id: t.id }, data: { status: 'ASSIGNED', assignedFirmId: firm.id } });
    await prisma.transaction.create({
      data: {
        firmId: firm.id,
        flightId: flight.id,
        ticketId: t.id,
        type: 'PAYABLE',
        originalAmount: t.price,
        currency: t.currency,
        exchangeRate: 1.0,
        baseAmount: t.price,
      }
    });
  }

  // Sell 2 of those 5
  for (let i = 0; i < 2; i++) {
    const t = tickets[i];
    await prisma.ticket.update({ where: { id: t.id }, data: { status: 'SOLD' } });
    await prisma.transaction.create({
      data: {
        firmId: firm.id,
        flightId: flight.id,
        ticketId: t.id,
        type: 'SALE',
        originalAmount: t.price,
        currency: t.currency,
        exchangeRate: 1.0,
        baseAmount: t.price,
      }
    });
  }

  // Make a payment from the firm
  await prisma.transaction.create({
    data: {
      firmId: firm.id,
      flightId: flight.id,
      type: 'PAYMENT',
      originalAmount: 1000.00, // They paid for the two sold tickets
      currency: 'USD',
      exchangeRate: 1.0,
      baseAmount: 1000.00,
      metadata: { note: 'Direct bank transfer' }
    }
  });

  console.log("Transactions seeded!");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
