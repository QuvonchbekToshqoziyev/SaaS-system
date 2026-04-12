import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function getEnvNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

async function main() {
  const count = getEnvNumber('FIRMS_COUNT', 5);
  const startIndex = getEnvNumber('FIRMS_START_INDEX', 1);
  const emailDomain = (process.env.FIRMS_EMAIL_DOMAIN || 'airline.com').trim();
  const password = process.env.FIRMS_PASSWORD || 'firm123';
  const namePrefix = (process.env.FIRMS_NAME_PREFIX || 'Test Firm').trim();

  console.log(`Seeding ${count} firm(s) (startIndex=${startIndex})...`);

  const hashedPassword = await bcrypt.hash(password, 10);

  let created = 0;
  let skipped = 0;

  for (let i = startIndex; i < startIndex + count; i += 1) {
    const email = `firm${i}@${emailDomain}`;
    const firmName = `${namePrefix} ${i}`;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      skipped += 1;
      continue;
    }

    await prisma.firm.create({
      data: {
        name: firmName,
        users: {
          create: {
            email,
            password: hashedPassword,
            role: Role.FIRM,
          },
        },
      },
    });

    created += 1;
  }

  console.log('Firm seed complete.', { created, skipped });
  console.log('Firm users created with FIRMS_PASSWORD (default: firm123).');
}

main()
  .catch((e) => {
    console.error('An error occurred during firm seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
