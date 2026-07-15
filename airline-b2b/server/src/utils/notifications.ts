import { Prisma } from '@prisma/client';
import { prisma } from '../db';

type Db = typeof prisma | Prisma.TransactionClient;

export type NotificationInput = {
  firmId?: string | null;
  userId?: string | null;
  title: string;
  body: string;
  type?: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export async function createNotification(db: Db, input: NotificationInput) {
  if (!input.firmId && !input.userId) return null;
  const notification = await db.notification.create({
    data: {
      firmId: input.firmId || undefined,
      userId: input.userId || undefined,
      title: input.title,
      body: input.body,
      type: input.type || 'INFO',
      entityType: input.entityType || undefined,
      entityId: input.entityId || undefined,
      metadata: input.metadata ?? undefined,
    },
  });
  const recipients = await db.user.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      telegramNotificationsEnabled: true,
      telegramChatId: { not: null },
      OR: [
        ...(input.userId ? [{ id: input.userId }] : []),
        ...(input.firmId ? [{ firmId: input.firmId }] : []),
      ],
    },
    select: { id: true, telegramChatId: true },
  });
  if (recipients.length) {
    await db.telegramDelivery.createMany({
      data: recipients.map((user) => ({ notificationId: notification.id, userId: user.id, chatId: user.telegramChatId! })),
      skipDuplicates: true,
    });
  }
  return notification;
}

export async function createFirmNotification(db: Db, firmId: string | null | undefined, input: Omit<NotificationInput, 'firmId'>) {
  if (!firmId) return null;
  return createNotification(db, { ...input, firmId });
}
