import { randomUUID } from 'node:crypto';

export type NotificationChannel = 'IN_APP' | 'TELEGRAM' | 'EMAIL';
export type NotificationStatus = 'PENDING' | 'SENDING' | 'DELIVERED' | 'FAILED';
export type Notification = Readonly<{
  id: string;
  tenantKey: string;
  recipientKey: string;
  channel: NotificationChannel;
  template: string;
  payload: Readonly<Record<string, string>>;
  idempotencyKey: string;
  status: NotificationStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}>;

export interface NotificationRepository {
  findByIdempotency(tenantKey: string, key: string): Promise<Notification | null>;
  enqueue(notification: Notification): Promise<Notification>;
  find(tenantKey: string, id: string): Promise<Notification | null>;
  markSending(tenantKey: string, id: string, updatedAt: string): Promise<Notification>;
  markDelivered(tenantKey: string, id: string, updatedAt: string): Promise<Notification>;
  markFailed(tenantKey: string, id: string, error: string, updatedAt: string): Promise<Notification>;
}

export class NotificationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'NotificationError'; }
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new NotificationError('INVALID_INPUT', `${field} is required.`);
  return normalized;
}

export async function enqueueNotification(
  repository: NotificationRepository,
  input: Readonly<{ tenantKey: string; recipientKey: string; channel: NotificationChannel; template: string; payload: Readonly<Record<string, string>>; idempotencyKey: string }>,
): Promise<Notification> {
  const tenantKey = required(input.tenantKey, 'Tenant');
  const idempotencyKey = required(input.idempotencyKey, 'Idempotency key');
  const existing = await repository.findByIdempotency(tenantKey, idempotencyKey);
  if (existing) return existing;
  if (!['IN_APP', 'TELEGRAM', 'EMAIL'].includes(input.channel)) throw new NotificationError('INVALID_CHANNEL', 'Unsupported notification channel.');
  const timestamp = new Date().toISOString();
  return repository.enqueue(Object.freeze({ id: randomUUID(), tenantKey, recipientKey: required(input.recipientKey, 'Recipient'), channel: input.channel, template: required(input.template, 'Template'), payload: Object.freeze({ ...input.payload }), idempotencyKey, status: 'PENDING', attempts: 0, createdAt: timestamp, updatedAt: timestamp }));
}

export async function deliverNotification(repository: NotificationRepository, input: Readonly<{ tenantKey: string; notificationId: string }>): Promise<Notification> {
  const tenantKey = required(input.tenantKey, 'Tenant');
  const notification = await repository.find(tenantKey, required(input.notificationId, 'Notification ID'));
  if (!notification) throw new NotificationError('NOT_FOUND', 'Notification was not found.');
  if (notification.status === 'DELIVERED') return notification;
  if (notification.status === 'FAILED' && notification.attempts >= 3) throw new NotificationError('RETRY_LIMIT', 'Notification retry limit reached.');
  await repository.markSending(tenantKey, notification.id, new Date().toISOString());
  return repository.markDelivered(tenantKey, notification.id, new Date().toISOString());
}

export async function failNotification(repository: NotificationRepository, input: Readonly<{ tenantKey: string; notificationId: string; error: string }>): Promise<Notification> {
  const tenantKey = required(input.tenantKey, 'Tenant');
  const notification = await repository.find(tenantKey, required(input.notificationId, 'Notification ID'));
  if (!notification) throw new NotificationError('NOT_FOUND', 'Notification was not found.');
  if (notification.status === 'DELIVERED') throw new NotificationError('ALREADY_DELIVERED', 'Delivered notifications cannot fail.');
  if (notification.attempts >= 3) throw new NotificationError('RETRY_LIMIT', 'Notification retry limit reached.');
  return repository.markFailed(tenantKey, notification.id, required(input.error, 'Error'), new Date().toISOString());
}

export class MemoryNotificationRepository implements NotificationRepository {
  private readonly notifications = new Map<string, Notification>();
  async findByIdempotency(tenantKey: string, key: string): Promise<Notification | null> { return [...this.notifications.values()].find((item) => item.tenantKey === tenantKey && item.idempotencyKey === key) || null; }
  async enqueue(notification: Notification): Promise<Notification> { const existing = await this.findByIdempotency(notification.tenantKey, notification.idempotencyKey); if (existing) return existing; this.notifications.set(notification.id, notification); return notification; }
  async find(tenantKey: string, id: string): Promise<Notification | null> { const item = this.notifications.get(id); return item?.tenantKey === tenantKey ? item : null; }
  async markSending(tenantKey: string, id: string, updatedAt: string): Promise<Notification> { return this.update(tenantKey, id, { status: 'SENDING', attempts: (await this.mustFind(tenantKey, id)).attempts + 1, updatedAt }); }
  async markDelivered(tenantKey: string, id: string, updatedAt: string): Promise<Notification> { return this.update(tenantKey, id, { status: 'DELIVERED', updatedAt }); }
  async markFailed(tenantKey: string, id: string, error: string, updatedAt: string): Promise<Notification> { return this.update(tenantKey, id, { status: 'FAILED', attempts: (await this.mustFind(tenantKey, id)).attempts + 1, lastError: error, updatedAt }); }
  private async mustFind(tenantKey: string, id: string): Promise<Notification> { const item = await this.find(tenantKey, id); if (!item) throw new NotificationError('NOT_FOUND', 'Notification was not found.'); return item; }
  private async update(tenantKey: string, id: string, changes: Partial<Notification>): Promise<Notification> { const current = await this.mustFind(tenantKey, id); const updated = Object.freeze({ ...current, ...changes }); this.notifications.set(id, updated); return updated; }
}
