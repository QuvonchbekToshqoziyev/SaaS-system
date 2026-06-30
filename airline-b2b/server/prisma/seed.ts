import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SUPERADMIN_EMAIL = 'admin@ado-finance.com';
const INITIAL_SUPERADMIN_PASSWORD = '12345678';

async function clearApplicationData() {
  await prisma.$transaction([
    prisma.saleCancellationRequest.deleteMany({}),
    prisma.ledgerEntry.deleteMany({}),
    prisma.tourPackageSale.deleteMany({}),
    prisma.tourPackage.deleteMany({}),
    prisma.kassaDay.deleteMany({}),
    prisma.payment.deleteMany({}),
    prisma.transaction.deleteMany({}),
    prisma.ticket.deleteMany({}),
    prisma.flight.deleteMany({}),
    prisma.invitation.deleteMany({}),
    prisma.currencyRate.deleteMany({}),
    prisma.user.deleteMany({}),
    prisma.firm.deleteMany({}),
  ]);
}

async function main() {
  const passwordHash = await bcrypt.hash(INITIAL_SUPERADMIN_PASSWORD, 10);

  console.log('Clearing demo/application data...');
  await clearApplicationData();

  await prisma.user.create({
    data: {
      email: SUPERADMIN_EMAIL,
      password: passwordHash,
      role: Role.SUPERADMIN,
    },
  });

  console.log(`Superadmin bootstrap complete. Created SUPERADMIN user: ${SUPERADMIN_EMAIL}`);
  console.log('Ask the client to change the initial password after first login.');
}

main()
  .catch((error) => {
    console.error('Superadmin bootstrap failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
