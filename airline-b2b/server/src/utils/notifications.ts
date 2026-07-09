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
  return db.notification.create({
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
}

export async function createFirmNotification(db: Db, firmId: string | null | undefined, input: Omit<NotificationInput, 'firmId'>) {
  if (!firmId) return null;
  return createNotification(db, { ...input, firmId });
}
