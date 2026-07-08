import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../db';
import { logger } from '../logger';

type AuditActor = {
  userId?: string | null;
  role?: string | null;
};

type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

type AuditClient = Pick<Prisma.TransactionClient, 'auditLog' | 'user'> | typeof prisma;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/password|token|secret/i.test(key)) {
      result[key] = '[redacted]';
    } else {
      result[key] = redact(child);
    }
  }
  return result;
}

function asJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(redact(value))) as Prisma.InputJsonValue;
}

function getIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.ip || req.socket.remoteAddress || undefined;
}

export async function writeAuditLog(req: Request, input: AuditInput, client: AuditClient = prisma) {
  const actor = (((req as any).user || {}) as AuditActor);
  const actorUserId = actor.userId ? String(actor.userId) : null;
  let actorEmail: string | null = null;
  let actorRole = actor.role ? String(actor.role) : null;

  try {
    if (actorUserId) {
      const user = await client.user.findUnique({
        where: { id: actorUserId },
        select: { email: true, role: true },
      });
      actorEmail = user?.email || null;
      actorRole = user?.role ? String(user.role) : actorRole;
    }

    await client.auditLog.create({
      data: {
        actorUserId,
        actorEmail,
        actorRole,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId || null,
        entityLabel: input.entityLabel || null,
        summary: input.summary,
        before: asJson(input.before),
        after: asJson(input.after),
        metadata: asJson(input.metadata),
        ipAddress: getIp(req),
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      },
    });
  } catch (err) {
    logger.warn({ err, action: input.action, entityType: input.entityType }, 'Failed to write audit log');
  }
}
