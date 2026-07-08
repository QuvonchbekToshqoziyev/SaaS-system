import '../src/env';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();
const CONFIRM_VALUE = 'WIPE_ALL_KEEP_SUPERADMIN';

function isConfirmed() {
  return process.env.CLEAN_WIPE_CONFIRM === CONFIRM_VALUE;
}

function preferredSuperadminEmail() {
  return String(process.env.KEEP_SUPERADMIN_EMAIL || process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
}

async function pickSuperadminToKeep() {
  const preferredEmail = preferredSuperadminEmail();
  if (preferredEmail) {
    const preferred = await prisma.user.findFirst({
      where: {
        email: { equals: preferredEmail, mode: 'insensitive' },
        role: Role.SUPERADMIN,
        status: { not: 'DELETED' },
        deletedAt: null,
      },
      select: { id: true, email: true },
    });
    if (!preferred) {
      throw new Error(`Preferred superadmin was not found or is not active: ${preferredEmail}`);
    }
    return preferred;
  }

  const first = await prisma.user.findFirst({
    where: {
      role: Role.SUPERADMIN,
      status: { not: 'DELETED' },
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  });
  if (!first) {
    throw new Error('No active SUPERADMIN user found. Create one before running a clean wipe.');
  }
  return first;
}

async function tableCounts() {
  const [
    users,
    firms,
    flights,
    tickets,
    transactions,
    payments,
    kassaDays,
    kassaDesks,
    paymentCards,
    employees,
    invitations,
    auditLogs,
    chatConversations,
    chatMessages,
    tourPackages,
    tourPackageSales,
    saleCancellationRequests,
    currencyRates,
    siteContent,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.firm.count(),
    prisma.flight.count(),
    prisma.ticket.count(),
    prisma.transaction.count(),
    prisma.payment.count(),
    prisma.kassaDay.count(),
    prisma.kassaDesk.count(),
    prisma.paymentCard.count(),
    prisma.employee.count(),
    prisma.invitation.count(),
    prisma.auditLog.count(),
    prisma.chatConversation.count(),
    prisma.chatMessage.count(),
    prisma.tourPackage.count(),
    prisma.tourPackageSale.count(),
    prisma.saleCancellationRequest.count(),
    prisma.currencyRate.count(),
    prisma.siteContent.count(),
  ]);

  return {
    users,
    firms,
    flights,
    tickets,
    transactions,
    payments,
    kassaDays,
    kassaDesks,
    paymentCards,
    employees,
    invitations,
    auditLogs,
    chatConversations,
    chatMessages,
    tourPackages,
    tourPackageSales,
    saleCancellationRequests,
    currencyRates,
    siteContent,
  };
}

async function wipeKeepingSuperadmin(superadminId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.chatMessage.deleteMany({});
    await tx.chatParticipant.deleteMany({});
    await tx.chatFirmPermission.deleteMany({});
    await tx.chatConversation.deleteMany({});

    await tx.auditLog.deleteMany({});
    await tx.saleCancellationRequest.deleteMany({});
    await tx.ledgerEntry.deleteMany({});
    await tx.tourPackageSale.deleteMany({});
    await tx.tourPackage.deleteMany({});
    await tx.kassaDay.deleteMany({});
    await tx.payment.deleteMany({});
    await tx.transaction.deleteMany({});
    await tx.paymentCard.deleteMany({});
    await tx.kassaDesk.deleteMany({});
    await tx.ticket.deleteMany({});
    await tx.flight.deleteMany({});
    await tx.invitation.deleteMany({});
    await tx.currencyRate.deleteMany({});
    await tx.siteContent.deleteMany({});
    await tx.employee.deleteMany({});
    await tx.userFirmAccess.deleteMany({});

    await tx.user.update({
      where: { id: superadminId },
      data: {
        role: Role.SUPERADMIN,
        status: 'ACTIVE',
        firmId: null,
        deletedAt: null,
        deletedByUserId: null,
        deleteReason: null,
      },
    });
    await tx.user.deleteMany({ where: { id: { not: superadminId } } });
    await tx.firm.deleteMany({});
  }, { timeout: 60_000 });
}

async function main() {
  const keep = await pickSuperadminToKeep();
  const before = await tableCounts();

  console.log(`Keeping SUPERADMIN login: ${keep.email}`);
  console.log('Before wipe:', before);

  if (!isConfirmed()) {
    console.log(`Dry run only. To wipe, rerun with CLEAN_WIPE_CONFIRM=${CONFIRM_VALUE}`);
    return;
  }

  await wipeKeepingSuperadmin(keep.id);

  const after = await tableCounts();
  console.log('Clean wipe complete.');
  console.log('After wipe:', after);
}

main()
  .catch((error) => {
    console.error('Clean wipe failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
