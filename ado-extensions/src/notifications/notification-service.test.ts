import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverNotification, enqueueNotification, failNotification, MemoryNotificationRepository, NotificationError } from './notification-service.js';

test('notifications are idempotent and deliver through explicit states', async () => {
  const repository = new MemoryNotificationRepository();
  const input = { tenantKey: 'tenant-a', recipientKey: 'user-a', channel: 'IN_APP' as const, template: 'PAYROLL_POSTED', payload: { period: '2026-08' }, idempotencyKey: 'payroll-001' };
  const first = await enqueueNotification(repository, input);
  const retry = await enqueueNotification(repository, input);
  assert.equal(first.id, retry.id);
  const delivered = await deliverNotification(repository, { tenantKey: 'tenant-a', notificationId: first.id });
  assert.equal(delivered.status, 'DELIVERED');
  assert.equal(delivered.attempts, 1);
});

test('notifications isolate tenants and enforce retry limits', async () => {
  const repository = new MemoryNotificationRepository();
  const notification = await enqueueNotification(repository, { tenantKey: 'tenant-a', recipientKey: 'user-a', channel: 'EMAIL', template: 'TEST', payload: {}, idempotencyKey: 'n-1' });
  await assert.rejects(() => deliverNotification(repository, { tenantKey: 'tenant-b', notificationId: notification.id }), (error: unknown) => error instanceof NotificationError && error.code === 'NOT_FOUND');
  await failNotification(repository, { tenantKey: 'tenant-a', notificationId: notification.id, error: 'temporary' });
  await failNotification(repository, { tenantKey: 'tenant-a', notificationId: notification.id, error: 'temporary' });
  await failNotification(repository, { tenantKey: 'tenant-a', notificationId: notification.id, error: 'temporary' });
  await assert.rejects(() => failNotification(repository, { tenantKey: 'tenant-a', notificationId: notification.id, error: 'again' }), (error: unknown) => error instanceof NotificationError && error.code === 'RETRY_LIMIT');
});
