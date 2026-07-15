import { createHash, randomBytes } from 'crypto';
import { prisma } from '../db';
import { logger } from '../logger';

const token = () => String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const apiUrl = (method: string) => `https://api.telegram.org/bot${token()}/${method}`;

export function telegramStartCode(text: unknown): string | null {
  const match = String(text || '').trim().match(/^\/start(?:\s+([A-Za-z0-9_-]+))?$/);
  return match?.[1] || null;
}

async function telegram(method: string, body: Record<string, unknown>) {
  const response = await fetch(apiUrl(method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json() as { ok?: boolean; result?: any; description?: string; error_code?: number };
  if (!response.ok || !data.ok) throw Object.assign(new Error(data.description || `Telegram ${method} failed`), { status: data.error_code || response.status });
  return data.result;
}

export async function createTelegramLink(userId: string) {
  const code = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.user.update({
    where: { id: userId },
    data: { telegramLinkTokenHash: hash(code), telegramLinkExpiresAt: expiresAt },
  });
  const username = String(process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
  return { code, expiresAt, botUsername: username || null, botUrl: username ? `https://t.me/${username}?start=${code}` : null };
}

async function handleMessage(message: any) {
  const chatId = String(message?.chat?.id || '');
  const text = String(message?.text || '').trim();
  if (!chatId || !text) return;

  if (text === '/stop') {
    await prisma.user.updateMany({ where: { telegramChatId: chatId }, data: { telegramNotificationsEnabled: false } });
    await telegram('sendMessage', { chat_id: chatId, text: 'ADO notifications paused. Reconnect from ADO Settings to enable them again.' });
    return;
  }

  const linkCode = telegramStartCode(text);
  if (!linkCode) {
    await telegram('sendMessage', { chat_id: chatId, text: 'Open ADO Settings and choose Connect Telegram.' });
    return;
  }

  const user = await prisma.user.findFirst({
    where: { telegramLinkTokenHash: hash(linkCode), telegramLinkExpiresAt: { gt: new Date() }, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, email: true },
  });
  if (!user) {
    await telegram('sendMessage', { chat_id: chatId, text: 'This connection link is invalid or expired. Create a new one in ADO Settings.' });
    return;
  }

  await prisma.$transaction([
    prisma.user.updateMany({ where: { telegramChatId: chatId, id: { not: user.id } }, data: { telegramChatId: null, telegramUsername: null, telegramLinkedAt: null } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        telegramChatId: chatId,
        telegramUsername: message?.from?.username ? String(message.from.username) : null,
        telegramNotificationsEnabled: true,
        telegramLinkedAt: new Date(),
        telegramLinkTokenHash: null,
        telegramLinkExpiresAt: null,
      },
    }),
  ]);
  await telegram('sendMessage', { chat_id: chatId, text: `Connected to ${user.email}. ADO notifications will arrive here. Send /stop to pause.` });
}

async function pollBot() {
  let offset = 0;
  while (token()) {
    try {
      const updates = await telegram('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }) as any[];
      for (const update of updates) {
        offset = Math.max(offset, Number(update.update_id) + 1);
        await handleMessage(update.message);
      }
    } catch (err) {
      logger.warn({ err }, 'Telegram polling failed');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function deliverPending() {
  const rows = await prisma.telegramDelivery.findMany({
    where: { status: 'PENDING', attempts: { lt: 5 } },
    include: { notification: true, user: { select: { telegramNotificationsEnabled: true, telegramChatId: true } } },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
  for (const row of rows) {
    const claimed = await prisma.telegramDelivery.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'PROCESSING', attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    if (!row.user.telegramNotificationsEnabled || row.user.telegramChatId !== row.chatId) {
      await prisma.telegramDelivery.update({ where: { id: row.id }, data: { status: 'SKIPPED', lastError: 'Telegram disconnected or disabled' } });
      continue;
    }
    try {
      await telegram('sendMessage', { chat_id: row.chatId, text: `🔔 ${row.notification.title}\n\n${row.notification.body}` });
      await prisma.telegramDelivery.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date(), lastError: null } });
    } catch (err: any) {
      const permanent = err?.status === 400 || err?.status === 403;
      await prisma.telegramDelivery.update({ where: { id: row.id }, data: { status: permanent ? 'FAILED' : 'PENDING', lastError: String(err?.message || err).slice(0, 500) } });
      if (permanent) await prisma.user.update({ where: { id: row.userId }, data: { telegramNotificationsEnabled: false } });
    }
  }
}

export function startTelegramBot() {
  if (!token()) {
    logger.info('TELEGRAM_BOT_TOKEN is not set; Telegram integration is disabled');
    return;
  }
  void pollBot();
  const deliveryTimer = setInterval(() => void deliverPending().catch((err) => logger.warn({ err }, 'Telegram delivery failed')), 3000);
  deliveryTimer.unref();
  logger.info('Telegram bot polling started');
}
