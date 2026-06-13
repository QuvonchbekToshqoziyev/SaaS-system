import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration to LedgerEntry and Payment...');
  
  const transactions = await prisma.transaction.findMany({
    where: {
      ledgerEntries: {
        none: {}
      }
    }
  });
  
  console.log(`Found ${transactions.length} transactions without ledger entries.`);

  for (const tx of transactions) {
    if (!tx.baseAmount) continue;

    let debitAccount = 'Unknown';
    let creditAccount = 'Unknown';

    if (tx.type === 'SALE') {
      debitAccount = 'Receivable';
      creditAccount = 'Revenue';
    } else if (tx.type === 'PAYMENT') {
      debitAccount = 'Cash';
      creditAccount = 'Receivable';
      
      // Migrate payment to Payment table if it doesn't exist
      const existingPayment = await prisma.payment.findFirst({
        where: { firmId: tx.firmId, amount: tx.baseAmount }
      });
      if (!existingPayment) {
        await prisma.payment.create({
          data: {
            firmId: tx.firmId,
            amount: tx.baseAmount,
            method: String(tx.paymentMethod).toLowerCase() === 'card' ? 'CARD' : 'CASH',
            status: 'CONFIRMED',
            createdAt: tx.createdAt
          }
        });
      }
    } else if (tx.type === 'PAYABLE') {
      debitAccount = 'Expense';
      creditAccount = 'Payable';
    }

    await prisma.ledgerEntry.create({
      data: {
        transactionId: tx.id,
        debitAccount,
        creditAccount,
        amount: tx.baseAmount,
        currency: tx.currency,
        exchangeRateSnapshot: tx.exchangeRate,
        createdAt: tx.createdAt
      }
    });
  }

  console.log('Migration complete.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
