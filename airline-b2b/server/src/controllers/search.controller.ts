import { Request, Response } from 'express';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';

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

export const globalSearch = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  const q = String(req.query.q || '').trim();

  if (q.length < 2) {
    return res.json({ query: q, firms: [], flights: [], transactions: [] });
  }

  const firmScopeId = role === 'FIRM'
    ? (authUser.firmId ? String(authUser.firmId) : undefined)
    : undefined;

  if (role === 'FIRM' && !firmScopeId) {
    return res.status(400).json({ error: 'Firm account is missing firmId' });
  }

  const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';

  const firmWhere: Prisma.FirmWhereInput = {
    name: { contains: q, mode: 'insensitive' },
    ...(firmScopeId ? { id: firmScopeId } : {}),
  };

  const flightWhere: Prisma.FlightWhereInput = {
    OR: [
      { flightNumber: { contains: q, mode: 'insensitive' } },
      { route: { contains: q, mode: 'insensitive' } },
    ],
  };

  const txWhere: Prisma.TransactionWhereInput = {
    ...(firmScopeId ? { firmId: firmScopeId } : {}),
    OR: [
      { id: { contains: q, mode: 'insensitive' } },
      { firm: { name: { contains: q, mode: 'insensitive' } } },
      { flight: { flightNumber: { contains: q, mode: 'insensitive' } } },
    ],
  };

  const [firms, flights, transactions] = await Promise.all([
    isAdmin || firmScopeId
      ? prisma.firm.findMany({
          where: firmWhere,
          take: 6,
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    prisma.flight.findMany({
      where: flightWhere,
      take: 6,
      orderBy: { departure: 'desc' },
      select: { id: true, flightNumber: true, route: true },
    }),
    prisma.transaction.findMany({
      where: txWhere,
      take: 6,
      orderBy: { createdAt: 'desc' },
      include: { firm: { select: { name: true } }, flight: { select: { flightNumber: true } }, ledgerEntries: true },
    }),
  ]);

  res.json({
    query: q,
    firms: firms.map((f) => ({
      id: f.id,
      name: f.name,
      href: isAdmin ? `/transactions?firmId=${encodeURIComponent(f.id)}` : `/firm`,
    })),
    flights: flights.map((f) => ({
      id: f.id,
      flightNumber: f.flightNumber,
      route: f.route,
      href: `/flights/detail?id=${f.id}`,
    })),
    transactions: transactions.map((t) => {
      const baseAmount = t.ledgerEntries.reduce((a, e) => a + Number(e.amount || 0), 0);
      return {
        id: t.id,
        type: t.type,
        firmName: t.firm?.name || null,
        flightNumber: t.flight?.flightNumber || null,
        baseAmount,
        href: `/transactions/detail?id=${t.id}`,
      };
    }),
  });
};
