import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '../db';
import { logger } from '../logger';

type AuthUser = {
  userId?: string | null;
  role?: string | null;
  firmId?: string | null;
};

type Counter = {
  month: Date;
  featureKey: string;
  featureLabel: string;
  action: string;
  firmId: string;
  actorUserId: string;
  actorRole: string;
  count: number;
  firstUsedAt: Date;
  lastUsedAt: Date;
};

const FLUSH_MS = 60_000;
const MAX_BATCH = 500;
const counters = new Map<string, Counter>();
let flushTimer: NodeJS.Timeout | null = null;
let flushing = false;

function monthStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function singular(value: string) {
  const irregular: Record<string, string> = { people: 'person', services: 'service', companies: 'company' };
  if (irregular[value]) return irregular[value];
  return value.endsWith('ies') ? `${value.slice(0, -3)}y` : value.endsWith('s') ? value.slice(0, -1) : value;
}

function labelFromKey(key: string) {
  return key.split('.').map((part) => part.replace(/[-_]/g, ' ')).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export function featureFromRequest(req: Request): { featureKey: string; featureLabel: string } | null {
  const method = req.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return null;
  const routePath = `${req.baseUrl || ''}${req.route?.path || ''}`.replace(/\\+/g, '/');
  const parts = routePath.split('/').filter((part) => part && !part.startsWith(':'));
  if (!parts.length || (parts[0] === 'reports' && parts[1] === 'product-metrics')) return null;
  const semantic = parts.map(singular);
  const actionWords = new Set(['open', 'close', 'reopen', 'assign', 'read', 'transfer', 'reconcile', 'cancel', 'release', 'link', 'preferences', 'change-password']);
  const keyParts = method === 'POST'
    ? semantic.length === 1 ? [semantic[0], 'create'] : actionWords.has(semantic[semantic.length - 1]) ? semantic : [...semantic, 'create']
    : semantic.length === 1 ? [semantic[0], method === 'DELETE' ? 'delete' : 'update'] : [...semantic, method === 'DELETE' ? 'delete' : 'update'];
  const featureKey = keyParts.join('.');
  return { featureKey, featureLabel: labelFromKey(featureKey) };
}

function counterKey(counter: Omit<Counter, 'count' | 'firstUsedAt' | 'lastUsedAt'>) {
  return [
    counter.month.toISOString(),
    counter.featureKey,
    counter.action,
    counter.firmId,
    counter.actorUserId,
    counter.actorRole,
  ].join('|');
}

export function recordFeatureUsage(req: Request) {
  const feature = featureFromRequest(req);
  if (!feature) return;
  const actor = (((req as any).user || {}) as AuthUser);
  if (!actor.userId) return;
  const now = new Date();
  const base = {
    month: monthStart(now),
    featureKey: feature.featureKey,
    featureLabel: feature.featureLabel,
    action: 'USE',
    firmId: actor.firmId ? String(actor.firmId) : '',
    actorUserId: actor.userId ? String(actor.userId) : '',
    actorRole: actor.role ? String(actor.role).toUpperCase() : '',
  };
  const key = counterKey(base);
  const existing = counters.get(key);
  if (existing) {
    existing.count += 1;
    existing.lastUsedAt = now;
    return;
  }
  counters.set(key, { ...base, count: 1, firstUsedAt: now, lastUsedAt: now });
}

export function featureUsageMiddleware(req: Request, res: Response, next: NextFunction) {
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 400) recordFeatureUsage(req);
  });
  next();
}

export async function flushFeatureUsage() {
  if (flushing || counters.size === 0) return;
  flushing = true;
  const batch = [...counters.values()].slice(0, MAX_BATCH);
  for (const item of batch) {
    counters.delete(counterKey(item));
  }
  try {
    for (const item of batch) {
      await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "FeatureEventMonthly" (
        "id", "month", "featureKey", "featureLabel", "action", "firmId", "actorUserId", "actorRole",
        "count", "firstUsedAt", "lastUsedAt", "createdAt", "updatedAt"
      )
      VALUES (
        ${randomUUID()}, ${item.month}, ${item.featureKey}, ${item.featureLabel}, ${item.action}, ${item.firmId}, ${item.actorUserId}, ${item.actorRole},
        ${item.count}, ${item.firstUsedAt}, ${item.lastUsedAt}, now(), now()
      )
      ON CONFLICT ("month", "featureKey", "action", "firmId", "actorUserId", "actorRole")
      DO UPDATE SET
        "count" = "FeatureEventMonthly"."count" + EXCLUDED."count",
        "lastUsedAt" = GREATEST("FeatureEventMonthly"."lastUsedAt", EXCLUDED."lastUsedAt"),
        "updatedAt" = now()
      `);
    }
  } catch (err) {
    for (const item of batch) {
      const key = counterKey(item);
      const existing = counters.get(key);
      counters.set(key, existing ? { ...existing, count: existing.count + item.count } : item);
    }
    logger.warn({ err }, 'Failed to flush feature usage telemetry');
  } finally {
    flushing = false;
  }
}

export function startFeatureUsageFlush() {
  if (flushTimer) return;
  flushTimer = setInterval(() => void flushFeatureUsage(), FLUSH_MS);
  flushTimer.unref?.();
}

export async function listMonthlyFeatureUsage(now = new Date()) {
  const currentMonth = monthStart(now);
  const previousMonth = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - 1, 1));
  const rows = await prisma.$queryRaw<Array<{ month: Date; featureKey: string; featureLabel: string; action: string; firmId: string; actorUserId: string; count: number; lastUsedAt: Date }>>(Prisma.sql`
    SELECT "month", "featureKey", "featureLabel", "action", "firmId", "actorUserId", "count", "lastUsedAt"
    FROM "FeatureEventMonthly"
    WHERE "month" IN (${currentMonth}, ${previousMonth})
  `);
  const previous = new Map<string, number>();
  const current = new Map<string, { featureKey: string; featureLabel: string; totalActions: number; firmIds: Set<string>; userIds: Set<string>; readActions: number; writeActions: number; lastUsedAt: Date | null }>();
  for (const row of rows) {
    const isCurrent = row.month.getTime() === currentMonth.getTime();
    const count = row.count || 0;
    if (!isCurrent) {
      previous.set(row.featureKey, (previous.get(row.featureKey) || 0) + count);
      continue;
    }
    const item = current.get(row.featureKey) || { featureKey: row.featureKey, featureLabel: row.featureLabel, totalActions: 0, firmIds: new Set<string>(), userIds: new Set<string>(), readActions: 0, writeActions: 0, lastUsedAt: null };
    item.totalActions += count;
    if (row.firmId) item.firmIds.add(row.firmId);
    if (row.actorUserId) item.userIds.add(row.actorUserId);
    item.writeActions += count;
    if (!item.lastUsedAt || row.lastUsedAt > item.lastUsedAt) item.lastUsedAt = row.lastUsedAt;
    current.set(row.featureKey, item);
  }
  return [...current.values()]
    .map((item) => ({
      featureKey: item.featureKey,
      featureLabel: item.featureLabel,
      totalActions: item.totalActions,
      uniqueFirms: item.firmIds.size,
      uniqueUsers: item.userIds.size,
      readActions: item.readActions,
      writeActions: item.writeActions,
      previousMonthActions: previous.get(item.featureKey) || 0,
      lastUsedAt: item.lastUsedAt?.toISOString() || null,
    }))
    .sort((a, b) => b.totalActions - a.totalActions);
}
