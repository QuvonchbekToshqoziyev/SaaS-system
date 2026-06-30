import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required. Set it before running the superadmin bootstrap.`);
  }
  return value;
}

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
  const email = requiredEnv('SUPERADMIN_EMAIL').toLowerCase();
  const password = requiredEnv('SUPERADMIN_PASSWORD');
  const passwordHash = await bcrypt.hash(password, 10);

  console.log('Clearing demo/application data...');
  await clearApplicationData();

  await prisma.user.create({
    data: {
      email,
      password: passwordHash,
      role: Role.SUPERADMIN,
    },
  });

  console.log(`Superadmin bootstrap complete. Created SUPERADMIN user: ${email}`);
}

main()
  .catch((error) => {
    console.error('Superadmin bootstrap failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
