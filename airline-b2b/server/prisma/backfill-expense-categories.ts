import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { seedDefaultExpenseCategories } from '../src/services/expense-categories.service';

const prisma = new PrismaClient();

async function main() {
  const firms = await prisma.firm.findMany({ where: { deletedAt: null }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    for (const firm of firms) await seedDefaultExpenseCategories(tx, firm.id);
  });
  console.log(JSON.stringify({ ok: true, firmsChecked: firms.length }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
