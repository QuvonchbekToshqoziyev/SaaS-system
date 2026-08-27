import type { Pool } from 'pg';
import type { Notification, NotificationRepository } from './notification-service.js';

type Row = { id: string; tenant_key: string; recipient_key: string; channel: Notification['channel']; template: string; payload: Record<string, string>; idempotency_key: string; status: Notification['status']; attempts: number; last_error: string | null; created_at: string; updated_at: string };

export class PgNotificationRepository implements NotificationRepository {
  constructor(private readonly pool: Pool) {}
  async findByIdempotency(tenantKey: string, key: string): Promise<Notification | null> {
    const result = await this.pool.query<Row>(`SELECT * FROM ado_extension_notifications WHERE tenant_key = $1 AND idempotency_key = $2`, [tenantKey, key]);
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }
  async enqueue(notification: Notification): Promise<Notification> {
    const result = await this.pool.query<Row>(
      `INSERT INTO ado_extension_notifications
        (id, tenant_key, recipient_key, channel, template, payload, idempotency_key, status, attempts, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
       ON CONFLICT (tenant_key, idempotency_key) DO UPDATE SET id = ado_extension_notifications.id
       RETURNING *`,
      [notification.id, notification.tenantKey, notification.recipientKey, notification.channel, notification.template, JSON.stringify(notification.payload), notification.idempotencyKey, notification.status, notification.attempts, notification.createdAt, notification.updatedAt]);
    return this.map(result.rows[0]);
  }
  async find(tenantKey: string, id: string): Promise<Notification | null> { const result = await this.pool.query<Row>(`SELECT * FROM ado_extension_notifications WHERE tenant_key = $1 AND id = $2`, [tenantKey, id]); return result.rows[0] ? this.map(result.rows[0]) : null; }
  async markSending(tenantKey: string, id: string, updatedAt: string): Promise<Notification> {
    const result = await this.pool.query<Row>(`UPDATE ado_extension_notifications SET status = 'SENDING', attempts = attempts + 1, updated_at = $3 WHERE tenant_key = $1 AND id = $2 RETURNING *`, [tenantKey, id, updatedAt]);
    if (!result.rows[0]) throw new Error('Notification not found.'); return this.map(result.rows[0]);
  }
  async markDelivered(tenantKey: string, id: string, updatedAt: string): Promise<Notification> {
    const result = await this.pool.query<Row>(`UPDATE ado_extension_notifications SET status = 'DELIVERED', updated_at = $3 WHERE tenant_key = $1 AND id = $2 RETURNING *`, [tenantKey, id, updatedAt]);
    if (!result.rows[0]) throw new Error('Notification not found.'); return this.map(result.rows[0]);
  }
  async markFailed(tenantKey: string, id: string, error: string, updatedAt: string): Promise<Notification> {
    const result = await this.pool.query<Row>(`UPDATE ado_extension_notifications SET status = 'FAILED', attempts = attempts + 1, last_error = $3, updated_at = $4 WHERE tenant_key = $1 AND id = $2 RETURNING *`, [tenantKey, id, error, updatedAt]);
    if (!result.rows[0]) throw new Error('Notification not found.'); return this.map(result.rows[0]);
  }
  private map(row: Row): Notification { return Object.freeze({ id: row.id, tenantKey: row.tenant_key, recipientKey: row.recipient_key, channel: row.channel, template: row.template, payload: Object.freeze(row.payload), idempotencyKey: row.idempotency_key, status: row.status, attempts: row.attempts, ...(row.last_error ? { lastError: row.last_error } : {}), createdAt: row.created_at, updatedAt: row.updated_at }); }
}
