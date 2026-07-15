import { Request, Response } from 'express';
import { prisma } from '../db';
import { createTelegramLink } from '../services/telegram.service';
import { writeAuditLog } from '../utils/audit';

const userIdFrom = (req: Request) => String((req as any).user?.userId || '');

export async function telegramStatus(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: userIdFrom(req) },
    select: { telegramChatId: true, telegramUsername: true, telegramNotificationsEnabled: true, telegramLinkedAt: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({
    configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    connected: Boolean(user.telegramChatId),
    username: user.telegramUsername,
    enabled: Boolean(user.telegramChatId && user.telegramNotificationsEnabled),
    linkedAt: user.telegramLinkedAt,
  });
}

export async function createLink(req: Request, res: Response) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(503).json({ error: 'Telegram bot is not configured' });
  const userId = userIdFrom(req);
  const result = await createTelegramLink(userId);
  await writeAuditLog(req, { action: 'TELEGRAM_LINK_CREATED', entityType: 'User', entityId: userId, summary: 'Created a Telegram account connection link' });
  return res.json(result);
}

export async function setTelegramEnabled(req: Request, res: Response) {
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
  const userId = userIdFrom(req);
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true } });
  if (!existing?.telegramChatId) return res.status(409).json({ error: 'Connect Telegram first' });
  await prisma.user.update({ where: { id: userId }, data: { telegramNotificationsEnabled: req.body.enabled } });
  await writeAuditLog(req, { action: 'TELEGRAM_NOTIFICATIONS_UPDATED', entityType: 'User', entityId: userId, summary: `${req.body.enabled ? 'Enabled' : 'Disabled'} Telegram notifications` });
  return res.json({ enabled: req.body.enabled });
}

export async function disconnectTelegram(req: Request, res: Response) {
  const userId = userIdFrom(req);
  await prisma.user.update({
    where: { id: userId },
    data: { telegramChatId: null, telegramUsername: null, telegramLinkedAt: null, telegramLinkTokenHash: null, telegramLinkExpiresAt: null, telegramNotificationsEnabled: false },
  });
  await writeAuditLog(req, { action: 'TELEGRAM_DISCONNECTED', entityType: 'User', entityId: userId, summary: 'Disconnected Telegram notifications' });
  return res.json({ ok: true });
}
