import { Request, Response } from 'express';
import { prisma } from '../db';

type AuthUser = {
  userId?: string;
  role?: string;
  firmId?: string | null;
};

function getAuthUser(req: Request): AuthUser {
  return ((req as any).user || {}) as AuthUser;
}

export const listFirms = async (req: Request, res: Response) => {
  const firms = await prisma.firm.findMany({
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { name: 'asc' },
  });

  return res.json(firms);
};

export const getFirmById = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const id = String(req.params.id || '');

  if (!id) return res.status(400).json({ error: 'Firm id is required' });

  if (String(authUser.role || '').toUpperCase() === 'FIRM') {
    if (!authUser.firmId || String(authUser.firmId) !== id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  const firm = await prisma.firm.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      users: {
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!firm) return res.status(404).json({ error: 'Firm not found' });

  return res.json(firm);
};
