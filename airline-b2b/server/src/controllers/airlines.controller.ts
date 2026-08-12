import { Request, Response } from 'express';
import { prisma } from '../db';
import { writeAuditLog } from '../utils/audit';
import { createFirmNotification } from '../utils/notifications';
import { backfillExternalAirlineFirms } from '../services/external-airline-firms';

function normalizeCode(value: unknown): string | undefined {
  const code = String(value || '').trim().toUpperCase();
  return code || undefined;
}

export const listAirlines = async (req: Request, res: Response) => {
  await backfillExternalAirlineFirms();
  const authUser = ((req as any).user || {}) as { role?: string; firmId?: string | null };
  const role = String(authUser.role || '').toUpperCase();
  const firmId = authUser.firmId ? String(authUser.firmId) : '';
  const connectedAirlineFirmIds = role === 'FIRM' && firmId
    ? (await prisma.airlineFirmConnection.findMany({
        where: { firmId, status: 'ACTIVE' },
        select: { airlineFirmId: true },
      })).map((row) => row.airlineFirmId)
    : undefined;

  const rows = await prisma.airline.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      ...(role === 'FIRM' ? { OR: [{ firmId: null }, { firmId: { in: connectedAirlineFirmIds || [] } }] } : {}),
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      code: true,
      firmId: true,
      firm: {
        select: {
          id: true,
          name: true,
          kind: true,
          currency: true,
          users: {
            where: { status: { not: 'DELETED' }, deletedAt: null },
            select: { id: true, email: true, fullName: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return res.json(rows);
};

export const createAirline = async (req: Request, res: Response) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const code = normalizeCode(req.body?.code);
  const currency = typeof req.body?.currency === 'string' ? req.body.currency.trim().toUpperCase() : 'USD';

  if (!name) return res.status(400).json({ error: 'Airline name is required' });

  try {
    const row = await prisma.$transaction(async (tx) => {
      const existingFirm = await tx.firm.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, kind: 'AIRLINE' },
        select: { id: true },
      });
      const firm = existingFirm || await tx.firm.create({
        data: { name, kind: 'AIRLINE', status: 'ACTIVE', currency: currency || 'USD' },
        select: { id: true },
      });
      if (existingFirm) {
        await tx.firm.update({
          where: { id: existingFirm.id },
          data: {
            status: 'ACTIVE',
            deletedAt: null,
            ...(currency ? { currency } : {}),
          },
        });
      }

      return tx.airline.upsert({
        where: { name },
        update: { code, firmId: firm.id, status: 'ACTIVE', deletedAt: null },
        create: { name, code, firmId: firm.id, status: 'ACTIVE' },
        select: { id: true, name: true, code: true, firmId: true, firm: { select: { id: true, name: true, kind: true, currency: true } }, status: true, createdAt: true, updatedAt: true },
      });
    });
    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'airline',
      entityId: row.id,
      entityLabel: row.name,
      summary: `Created listed airline profile ${row.name}`,
      after: row,
    });
    return res.status(201).json(row);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to create airline' });
  }
};

export const listAirlineFirmConnections = async (_req: Request, res: Response) => {
  const rows = await prisma.airlineFirmConnection.findMany({
    include: {
      airlineFirm: { select: { id: true, name: true, kind: true, currency: true } },
      firm: { select: { id: true, name: true, kind: true, currency: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(rows);
};

export const upsertAirlineFirmConnection = async (req: Request, res: Response) => {
  const authUser = ((req as any).user || {}) as { userId?: string; role?: string };
  const role = String(authUser.role || '').toUpperCase();
  if (role !== 'SUPERADMIN') return res.status(403).json({ error: 'Forbidden' });

  const airlineFirmId = String(req.body?.airlineFirmId || '').trim();
  const firmId = String(req.body?.firmId || '').trim();
  const status = String(req.body?.status || 'ACTIVE').trim().toUpperCase() === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : undefined;
  if (!airlineFirmId || !firmId) return res.status(400).json({ error: 'airlineFirmId and firmId are required' });
  if (airlineFirmId === firmId) return res.status(400).json({ error: 'Airline and firm must be different' });

  try {
    const row = await prisma.$transaction(async (tx) => {
      const [airlineFirm, firm] = await Promise.all([
        tx.firm.findUnique({ where: { id: airlineFirmId }, select: { id: true, name: true, kind: true } }),
        tx.firm.findUnique({ where: { id: firmId }, select: { id: true, name: true, kind: true } }),
      ]);
      if (!airlineFirm || airlineFirm.kind !== 'AIRLINE') throw new Error('Airline firm not found');
      if (!firm || firm.kind === 'AIRLINE') throw new Error('Target firm not found');

      const connection = await tx.airlineFirmConnection.upsert({
        where: { airlineFirmId_firmId: { airlineFirmId, firmId } },
        update: { status, notes },
        create: {
          airlineFirmId,
          firmId,
          status,
          notes,
          createdByUserId: authUser.userId ? String(authUser.userId) : undefined,
        },
        include: {
          airlineFirm: { select: { id: true, name: true, kind: true, currency: true } },
          firm: { select: { id: true, name: true, kind: true, currency: true } },
        },
      });

      if (status === 'ACTIVE') {
        await createFirmNotification(tx, firmId, {
          title: 'Airline connected',
          body: `${airlineFirm.name} is now connected to your firm for ticket allocations.`,
          type: 'AIRLINE_CONNECTION',
          entityType: 'airlineFirmConnection',
          entityId: connection.id,
          metadata: { airlineFirmId, airlineName: airlineFirm.name },
        });
        await createFirmNotification(tx, airlineFirmId, {
          title: 'Firm connected',
          body: `${firm.name} is now connected for ticket allocations.`,
          type: 'AIRLINE_CONNECTION',
          entityType: 'airlineFirmConnection',
          entityId: connection.id,
          metadata: { firmId, firmName: firm.name },
        });
      }

      return connection;
    });

    await writeAuditLog(req, {
      action: 'UPSERT',
      entityType: 'airlineFirmConnection',
      entityId: row.id,
      entityLabel: `${row.airlineFirm.name} -> ${row.firm.name}`,
      summary: `Connected airline ${row.airlineFirm.name} with firm ${row.firm.name}`,
      after: row,
    });

    return res.json(row);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to save airline-firm connection' });
  }
};
