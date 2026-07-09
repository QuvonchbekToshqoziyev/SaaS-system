import { Request, Response } from 'express';
import { prisma } from '../db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Prisma, Role } from '@prisma/client';
import { writeAuditLog } from '../utils/audit';
import { normalizeFirmUserRole } from '../utils/firm-user-roles';

const adminUserSelect = {
  id: true,
  email: true,
  role: true,
  firmRole: true,
  status: true,
  fullName: true,
  phone: true,
  firmId: true,
  firm: {
    select: {
      id: true,
      name: true,
      kind: true,
      currency: true,
      subscriptionEndsAt: true,
    },
  },
  firmAccesses: {
    select: {
      firmId: true,
      firm: { select: { id: true, name: true, kind: true, currency: true, subscriptionEndsAt: true } },
    },
    orderBy: { firm: { name: 'asc' } },
  },
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.UserSelect;

function normalizeAdminRole(value: unknown): Role {
  const role = String(value || Role.ADMIN).trim().toUpperCase();
  if (role === Role.SUPERADMIN) return Role.SUPERADMIN;
  return Role.ADMIN;
}

function normalizeUserRole(value: unknown, fallback: Role): Role {
  const role = String(value || fallback).trim().toUpperCase();
  if (role === Role.SUPERADMIN) return Role.SUPERADMIN;
  if (role === Role.ADMIN) return Role.ADMIN;
  return Role.FIRM;
}

async function serializeAdminUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: adminUserSelect,
  });
}

async function replaceAdminFirmAccess(userId: string, firmIds: string[]) {
  const uniqueFirmIds = Array.from(new Set(firmIds.map(String).map((id) => id.trim()).filter(Boolean)));
  const firms = uniqueFirmIds.length
    ? await prisma.firm.findMany({ where: { id: { in: uniqueFirmIds } }, select: { id: true } })
    : [];

  if (firms.length !== uniqueFirmIds.length) {
    throw new Error('One or more firms were not found');
  }

  await prisma.userFirmAccess.deleteMany({ where: { userId } });
  if (uniqueFirmIds.length) {
    await prisma.userFirmAccess.createMany({
      data: uniqueFirmIds.map((firmId) => ({ userId, firmId })),
      skipDuplicates: true,
    });
  }
}

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const normalizedEmail = email.trim();
  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || !jwtSecret.trim()) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: normalizedEmail,
        mode: 'insensitive',
      },
      status: { not: 'DELETED' },
      deletedAt: null,
    },
    include: { firm: { select: { kind: true } } },
  });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { userId: user.id, role: user.role, firmRole: user.firmRole, firmId: user.firmId, firmKind: user.firm?.kind || null },
    jwtSecret,
    { expiresIn: '1d' },
  );
  res.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName, phone: user.phone, role: user.role, firmRole: user.firmRole, firmId: user.firmId, firmKind: user.firm?.kind || null } });
};

export const changePassword = async (req: Request, res: Response) => {
  const authUser = (req as any).user as { userId?: string } | undefined;
  const userId = authUser?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid current password' });

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  await writeAuditLog(req, {
    action: 'UPDATE',
    entityType: 'user',
    entityId: userId,
    entityLabel: user.email,
    summary: `Changed password for ${user.email}`,
    metadata: { field: 'password' },
  });
  return res.json({ ok: true });
};

export const listUsers = async (req: Request, res: Response) => {
  const authUser = ((req as any).user || {}) as { role?: string; userId?: string };
  const role = String(authUser.role || '').toUpperCase();
  const users = await prisma.user.findMany({
    where: {
      status: { not: 'DELETED' },
      deletedAt: null,
      ...(role === 'SUPERADMIN' ? {} : { id: authUser.userId }),
    },
    select: {
      id: true,
      email: true,
      role: true,
      firmRole: true,
      status: true,
      fullName: true,
      phone: true,
      firmId: true,
      firm: {
        select: {
          id: true,
          name: true,
          currency: true,
          subscriptionEndsAt: true,
        },
      },
      firmAccesses: {
        select: {
          firmId: true,
          firm: { select: { id: true, name: true, currency: true, subscriptionEndsAt: true } },
        },
        orderBy: { firm: { name: 'asc' } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json(users);
};

export const listAdmins = async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    where: { role: { in: [Role.ADMIN, Role.SUPERADMIN] }, status: { not: 'DELETED' }, deletedAt: null },
    select: adminUserSelect,
    orderBy: [{ role: 'desc' }, { createdAt: 'desc' }],
  });

  return res.json(users);
};

export const createAdmin = async (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const role = normalizeAdminRole(req.body?.role);
  const firmIds: string[] = Array.isArray(req.body?.firmIds) ? req.body.firmIds : [];

  if (!email) return res.status(400).json({ error: 'Email is required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
  if (existing) return res.status(400).json({ error: 'Account already exists for this email' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          fullName: fullName || undefined,
          phone: phone || undefined,
          role,
        },
        select: { id: true },
      });

      if (role === Role.ADMIN && firmIds.length) {
        const uniqueFirmIds = Array.from(new Set(firmIds.map(String).map((id) => id.trim()).filter(Boolean)));
        const firms = uniqueFirmIds.length
          ? await tx.firm.findMany({ where: { id: { in: uniqueFirmIds } }, select: { id: true } })
          : [];
        if (firms.length !== uniqueFirmIds.length) throw new Error('One or more firms were not found');
        await tx.userFirmAccess.createMany({
          data: uniqueFirmIds.map((firmId) => ({ userId: created.id, firmId })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    const createdUser = await serializeAdminUser(user.id);
    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'user',
      entityId: user.id,
      entityLabel: createdUser?.email || email,
      summary: `Created admin ${createdUser?.email || email}`,
      after: createdUser,
    });
    return res.status(201).json(createdUser);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to create admin' });
  }
};

export const updateAdmin = async (req: Request, res: Response) => {
  const authUser = ((req as any).user || {}) as { userId?: string };
  const userId = String(req.params.id || '');
  if (!userId) return res.status(400).json({ error: 'User id is required' });

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: adminUserSelect });
  if (!existing) return res.status(404).json({ error: 'Admin not found' });
  if (existing.role === Role.FIRM) return res.status(400).json({ error: 'Only admin accounts can be edited here' });

  const nextRole = req.body?.role === undefined ? existing.role : normalizeAdminRole(req.body.role);
  if (authUser.userId === userId && nextRole !== Role.SUPERADMIN) {
    return res.status(400).json({ error: 'You cannot remove your own superadmin role' });
  }

  try {
    const data: Prisma.UserUpdateInput = { role: nextRole };
    if (typeof req.body?.email === 'string' && req.body.email.trim()) data.email = req.body.email.trim().toLowerCase();
    if (typeof req.body?.fullName === 'string') data.fullName = req.body.fullName.trim() || null;
    if (typeof req.body?.phone === 'string') data.phone = req.body.phone.trim() || null;
    if (typeof req.body?.password === 'string' && req.body.password) {
      if (req.body.password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      data.password = await bcrypt.hash(req.body.password, 10);
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data });
      if (Array.isArray(req.body?.firmIds)) {
        const firmIds: string[] = nextRole === Role.ADMIN ? req.body.firmIds.map(String) : [];
        const uniqueFirmIds = Array.from(new Set(firmIds.map((id) => id.trim()).filter(Boolean)));
        const firms = uniqueFirmIds.length
          ? await tx.firm.findMany({ where: { id: { in: uniqueFirmIds } }, select: { id: true } })
          : [];
        if (firms.length !== uniqueFirmIds.length) throw new Error('One or more firms were not found');
        await tx.userFirmAccess.deleteMany({ where: { userId } });
        if (uniqueFirmIds.length) {
          await tx.userFirmAccess.createMany({
            data: uniqueFirmIds.map((firmId) => ({ userId, firmId })),
            skipDuplicates: true,
          });
        }
      } else if (nextRole === Role.SUPERADMIN) {
        await tx.userFirmAccess.deleteMany({ where: { userId } });
      }
    });

    const updated = await serializeAdminUser(userId);
    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'user',
      entityId: userId,
      entityLabel: updated?.email || userId,
      summary: `Updated admin ${updated?.email || userId}`,
      before: existing,
      after: updated,
    });
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to update admin' });
  }
};

export const deleteAdmin = async (req: Request, res: Response) => {
  const authUser = ((req as any).user || {}) as { userId?: string };
  const userId = String(req.params.id || '');
  const actorUserId = authUser.userId ? String(authUser.userId) : '';
  if (!userId) return res.status(400).json({ error: 'User id is required' });
  if (!actorUserId) return res.status(401).json({ error: 'Unauthorized' });
  if (actorUserId === userId) return res.status(400).json({ error: 'You cannot delete your own account' });

  try {
    const existing = await prisma.user.findUnique({ where: { id: userId }, select: adminUserSelect });
    if (!existing || existing.status === 'DELETED' || existing.deletedAt) return res.status(404).json({ error: 'Admin not found' });
    if (existing.role === Role.FIRM) return res.status(400).json({ error: 'Only admin accounts can be deleted here' });

    if (existing.role === Role.SUPERADMIN) {
      const superadminCount = await prisma.user.count({ where: { role: Role.SUPERADMIN, status: { not: 'DELETED' }, deletedAt: null } });
      if (superadminCount <= 1) return res.status(400).json({ error: 'At least one superadmin is required' });
    }

    const deleted = await prisma.$transaction(async (tx) => {
      await tx.userFirmAccess.deleteMany({ where: { userId } });
      return tx.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          deletedByUserId: actorUserId,
          deleteReason: typeof req.body?.reason === 'string' ? req.body.reason.trim() || null : null,
        },
        select: adminUserSelect,
      });
    });
    await writeAuditLog(req, {
      action: 'SOFT_DELETE',
      entityType: 'user',
      entityId: userId,
      entityLabel: existing.email,
      summary: `Soft deleted admin ${existing.email}`,
      before: existing,
      after: deleted,
    });
    return res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Admin not found' });
    return res.status(400).json({ error: err?.message || 'Failed to delete admin' });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  const authUser = ((req as any).user || {}) as { userId?: string };
  const userId = String(req.params.id || '');
  if (!userId) return res.status(400).json({ error: 'User id is required' });

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: adminUserSelect });
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const nextRole = req.body?.role === undefined ? existing.role : normalizeUserRole(req.body.role, existing.role);
  if (authUser.userId === userId && nextRole !== Role.SUPERADMIN) {
    return res.status(400).json({ error: 'You cannot remove your own superadmin role' });
  }

  if (existing.role === Role.SUPERADMIN && nextRole !== Role.SUPERADMIN) {
    const superadminCount = await prisma.user.count({ where: { role: Role.SUPERADMIN, status: { not: 'DELETED' }, deletedAt: null } });
    if (superadminCount <= 1) return res.status(400).json({ error: 'At least one superadmin is required' });
  }

  try {
    const data: Prisma.UserUpdateInput = { role: nextRole };
    if (typeof req.body?.email === 'string' && req.body.email.trim()) data.email = req.body.email.trim().toLowerCase();
    if (typeof req.body?.fullName === 'string') data.fullName = req.body.fullName.trim() || null;
    if (typeof req.body?.phone === 'string') data.phone = req.body.phone.trim() || null;
    if (nextRole === Role.FIRM) {
      data.firmRole = normalizeFirmUserRole(req.body?.firmRole ?? existing.firmRole);
    }
    if (typeof req.body?.password === 'string' && req.body.password) {
      if (req.body.password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      data.password = await bcrypt.hash(req.body.password, 10);
    }

    if (req.body?.firmId !== undefined) {
      const firmId = typeof req.body.firmId === 'string' && req.body.firmId.trim() ? req.body.firmId.trim() : null;
      if (firmId) {
        const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { id: true } });
        if (!firm) return res.status(404).json({ error: 'Firm not found' });
      }
      data.firm = firmId ? { connect: { id: firmId } } : { disconnect: true };
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data });

      if (Array.isArray(req.body?.firmIds)) {
        const firmIds: string[] = nextRole === Role.ADMIN ? req.body.firmIds.map(String) : [];
        const uniqueFirmIds: string[] = Array.from(new Set(firmIds.map((id: string) => id.trim()).filter(Boolean)));
        const firms = uniqueFirmIds.length
          ? await tx.firm.findMany({ where: { id: { in: uniqueFirmIds } }, select: { id: true } })
          : [];
        if (firms.length !== uniqueFirmIds.length) throw new Error('One or more firms were not found');
        await tx.userFirmAccess.deleteMany({ where: { userId } });
        if (uniqueFirmIds.length) {
          await tx.userFirmAccess.createMany({
            data: uniqueFirmIds.map((firmId) => ({ userId, firmId })),
            skipDuplicates: true,
          });
        }
      } else if (nextRole !== Role.ADMIN) {
        await tx.userFirmAccess.deleteMany({ where: { userId } });
      }
    });

    const updated = await prisma.user.findUnique({
      where: { id: userId },
      select: adminUserSelect,
    });
    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'user',
      entityId: userId,
      entityLabel: updated?.email || userId,
      summary: `Updated user ${updated?.email || userId}`,
      before: existing,
      after: updated,
    });
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to update user' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  const authUser = ((req as any).user || {}) as { userId?: string };
  const userId = String(req.params.id || '');
  const actorUserId = authUser.userId ? String(authUser.userId) : '';

  if (!userId) return res.status(400).json({ error: 'User id is required' });
  if (!actorUserId) return res.status(401).json({ error: 'Unauthorized' });
  if (actorUserId === userId) return res.status(400).json({ error: 'You cannot delete your own account' });

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: adminUserSelect });
  if (!existing) return res.status(404).json({ error: 'User not found' });

  if (existing.role === Role.SUPERADMIN) {
    const superadminCount = await prisma.user.count({
      where: { role: Role.SUPERADMIN, status: { not: 'DELETED' }, deletedAt: null },
    });
    if (superadminCount <= 1) return res.status(400).json({ error: 'At least one superadmin is required' });
  }

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      await tx.userFirmAccess.deleteMany({ where: { userId } });
      return tx.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          deletedByUserId: actorUserId,
          deleteReason: typeof req.body?.reason === 'string' ? req.body.reason.trim() || null : null,
        },
        select: adminUserSelect,
      });
    });
    await writeAuditLog(req, {
      action: 'SOFT_DELETE',
      entityType: 'user',
      entityId: userId,
      entityLabel: existing.email,
      summary: `Soft deleted user ${existing.email}`,
      before: existing,
      after: deleted,
    });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to delete user' });
  }
};

export const setUserFirmAccess = async (req: Request, res: Response) => {
  const userId = String(req.params.id || '');
  const firmIds: string[] = Array.isArray(req.body?.firmIds) ? req.body.firmIds.map(String) : [];

  if (!userId) return res.status(400).json({ error: 'User id is required' });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true, deletedAt: true } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.status === 'DELETED' || user.deletedAt) return res.status(400).json({ error: 'Deleted users cannot receive firm access' });
  if (user.role !== 'ADMIN') return res.status(400).json({ error: 'Access can only be assigned to admins' });

  try {
    const before = await prisma.user.findUnique({ where: { id: userId }, select: adminUserSelect });
    await replaceAdminFirmAccess(userId, firmIds);
    const updated = await prisma.user.findUnique({
      where: { id: userId },
      select: adminUserSelect,
    });
    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'userFirmAccess',
      entityId: userId,
      entityLabel: updated?.email || userId,
      summary: `Updated firm access for ${updated?.email || userId}`,
      before,
      after: updated,
      metadata: { firmIds },
    });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to update access' });
  }

  const updated = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      firmRole: true,
      status: true,
      fullName: true,
      phone: true,
      firmId: true,
      firmAccesses: {
        select: {
          firmId: true,
          firm: { select: { id: true, name: true, currency: true, subscriptionEndsAt: true } },
        },
        orderBy: { firm: { name: 'asc' } },
      },
    },
  });

  return res.json(updated);
};
