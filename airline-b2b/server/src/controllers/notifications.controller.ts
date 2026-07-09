import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { getAccessibleFirmIds } from '../utils/access';

type AuthUser = {
  userId?: string;
  role?: string;
  firmId?: string | null;
};

function getAuthUser(req: Request): AuthUser {
  return ((req as any).user || {}) as AuthUser;
}

function normalizeRole(role: unknown): string {
  return String(role || '').toUpperCase();
}

async function notificationWhere(authUser: AuthUser): Promise<Prisma.NotificationWhereInput> {
  const role = normalizeRole(authUser.role);
  if (role === 'SUPERADMIN') return {};

  const firmIds = await getAccessibleFirmIds(authUser);
  const userId = authUser.userId ? String(authUser.userId) : '';
  return {
    OR: [
      ...(userId ? [{ userId }] : []),
      ...(firmIds?.length ? [{ firmId: { in: firmIds } }] : []),
    ],
  };
}

export const listNotifications = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const limit = Math.min(Math.max(Number(req.query.limit || 30) || 30, 1), 100);
  const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true';
  const baseWhere = await notificationWhere(authUser);
  const where: Prisma.NotificationWhereInput = {
    AND: [
      baseWhere,
      ...(unreadOnly ? [{ readAt: null }] : []),
    ],
  };

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      include: { firm: { select: { id: true, name: true, kind: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.notification.count({ where: { AND: [baseWhere, { readAt: null }] } }),
  ]);

  return res.json({ items, unreadCount });
};

export const markNotificationRead = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Notification id is required' });

  const baseWhere = await notificationWhere(authUser);
  const existing = await prisma.notification.findFirst({ where: { AND: [baseWhere, { id }] }, select: { id: true } });
  if (!existing) return res.status(404).json({ error: 'Notification not found' });

  const updated = await prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
  });
  return res.json(updated);
};

export const markAllNotificationsRead = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const baseWhere = await notificationWhere(authUser);
  const result = await prisma.notification.updateMany({
    where: { AND: [baseWhere, { readAt: null }] },
    data: { readAt: new Date() },
  });
  return res.json({ ok: true, count: result.count });
};
