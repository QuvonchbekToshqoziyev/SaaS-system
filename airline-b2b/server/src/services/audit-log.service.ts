import { Prisma } from '@prisma/client';
import { prisma } from '../db';

function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = parseInt(String(value || fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function listAuditLogsService(input: {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
  action?: unknown;
  entityType?: unknown;
}) {
  const page = Math.max(1, parsePositiveInt(input.page, 1));
  const limit = Math.min(100, Math.max(1, parsePositiveInt(input.limit, 30)));
  const skip = (page - 1) * limit;
  const search = String(input.search || '').trim();
  const action = String(input.action || '').trim();
  const entityType = String(input.entityType || '').trim();

  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(search
      ? {
          OR: [
            { actorEmail: { contains: search, mode: 'insensitive' } },
            { actorRole: { contains: search, mode: 'insensitive' } },
            { action: { contains: search, mode: 'insensitive' } },
            { entityType: { contains: search, mode: 'insensitive' } },
            { entityLabel: { contains: search, mode: 'insensitive' } },
            { summary: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, rows, actions, entityTypes] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, email: true, role: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditLog.findMany({ select: { action: true }, distinct: ['action'], orderBy: { action: 'asc' } }),
    prisma.auditLog.findMany({ select: { entityType: true }, distinct: ['entityType'], orderBy: { entityType: 'asc' } }),
  ]);

  return {
    data: rows,
    filters: {
      actions: actions.map((row) => row.action),
      entityTypes: entityTypes.map((row) => row.entityType),
    },
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}
