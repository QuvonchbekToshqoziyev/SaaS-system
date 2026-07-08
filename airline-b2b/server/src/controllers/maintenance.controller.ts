import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import { prisma } from '../db';
import { writeAuditLog } from '../utils/audit';

type AuthUser = {
  userId?: string;
  role?: string;
};

const modelDelegates: Record<string, string> = {
  users: 'user',
  user: 'user',
  firms: 'firm',
  firm: 'firm',
  employees: 'employee',
  employee: 'employee',
  invitations: 'invitation',
  invitation: 'invitation',
  flights: 'flight',
  flight: 'flight',
  tickets: 'ticket',
  ticket: 'ticket',
  currencyRates: 'currencyRate',
  currencyRate: 'currencyRate',
  siteContent: 'siteContent',
  transactions: 'transaction',
  transaction: 'transaction',
  ledgerEntries: 'ledgerEntry',
  ledgerEntry: 'ledgerEntry',
  tourPackages: 'tourPackage',
  tourPackage: 'tourPackage',
  tourPackageSales: 'tourPackageSale',
  tourPackageSale: 'tourPackageSale',
  payments: 'payment',
  payment: 'payment',
  kassaDays: 'kassaDay',
  kassaDay: 'kassaDay',
  saleCancellationRequests: 'saleCancellationRequest',
  saleCancellationRequest: 'saleCancellationRequest',
};

function getAuthUser(req: Request): AuthUser {
  return ((req as any).user || {}) as AuthUser;
}

function requireSuperadmin(req: Request, res: Response): AuthUser | null {
  const authUser = getAuthUser(req);
  if (String(authUser.role || '').toUpperCase() !== 'SUPERADMIN') {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return authUser;
}

function delegateFor(modelName: string) {
  const delegateName = modelDelegates[modelName];
  return delegateName ? (prisma as any)[delegateName] : null;
}

function whereForModel(modelName: string, id: string) {
  return modelName === 'siteContent' ? { key: id } : { id };
}

function cleanPatchData(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const data = { ...(input as Record<string, unknown>) };
  delete data.id;
  delete data.createdAt;
  delete data.updatedAt;
  return data;
}

async function deleteRecordByModel(modelName: string, id: string, actorUserId: string) {
  await prisma.$transaction(async (tx) => {
    switch (modelName) {
      case 'flight':
        await tx.flight.update({
          where: { id },
          data: { status: 'DELETED', deletedAt: new Date(), deletedByUserId: actorUserId },
        });
        return;
      case 'firm':
        await tx.firm.update({
          where: { id },
          data: { status: 'DELETED', deletedAt: new Date(), deletedByUserId: actorUserId },
        });
        return;
      case 'ticket':
        await tx.ticket.update({
          where: { id },
          data: { status: 'DELETED', deletedAt: new Date(), deletedByUserId: actorUserId },
        });
        return;
      case 'tourPackage':
        await tx.tourPackage.update({
          where: { id },
          data: { status: 'DELETED', deletedAt: new Date(), deletedByUserId: actorUserId },
        });
        return;
      case 'employee':
        await tx.employee.update({
          where: { id },
          data: { status: 'DELETED', deletedAt: new Date(), deletedByUserId: actorUserId },
        });
        return;
      case 'user':
        if (id === actorUserId) throw new Error('You cannot delete your own account');
        {
          const user = await tx.user.findUnique({ where: { id }, select: { role: true } });
          if (!user) throw new Error('Record not found');
          if (user.role === Role.SUPERADMIN) {
            const superadminCount = await tx.user.count({
              where: { role: Role.SUPERADMIN, status: { not: 'DELETED' }, deletedAt: null },
            });
            if (superadminCount <= 1) throw new Error('At least one superadmin is required');
          }
        }
        await tx.userFirmAccess.deleteMany({ where: { userId: id } });
        await tx.user.update({
          where: { id },
          data: { status: 'DELETED', deletedAt: new Date(), deletedByUserId: actorUserId },
        });
        return;
      case 'paymentCard':
        await tx.paymentCard.update({
          where: { id },
          data: { status: 'DELETED', deletedAt: new Date(), deletedByUserId: actorUserId },
        });
        return;
      case 'kassaDay':
        throw new Error('Kassa days cannot be deleted. Close or correct them with adjustment records.');
      case 'kassaDesk':
        await tx.kassaDesk.update({
          where: { id },
          data: { status: 'DELETED', deletedAt: new Date(), deletedByUserId: actorUserId },
        });
        return;
      case 'invitation':
        await tx.invitation.update({
          where: { id },
          data: { deletedAt: new Date(), deletedByUserId: actorUserId },
        });
        return;
      case 'transaction':
      case 'ledgerEntry':
      case 'payment':
      case 'tourPackageSale':
      case 'saleCancellationRequest':
      case 'currencyRate':
      case 'siteContent':
        throw new Error(`${modelName} records are retained for audit and migration safety`);
      default: {
        throw new Error('Unsupported model');
      }
    }
  });
}

export const updateRecord = async (req: Request, res: Response) => {
  if (!requireSuperadmin(req, res)) return;

  const modelName = modelDelegates[String(req.params.model || '')];
  const id = String(req.params.id || '').trim();
  if (!modelName || !id) return res.status(400).json({ error: 'Unsupported model or missing id' });

  const data = cleanPatchData(req.body);
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  try {
    if (modelName === 'user' && typeof data.password === 'string' && data.password) {
      if (data.password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      data.password = await bcrypt.hash(data.password, 10);
    }
    const delegate = delegateFor(String(req.params.model || ''));
    if (!delegate?.update) return res.status(400).json({ error: 'Unsupported model' });
    const before = delegate.findUnique ? await delegate.findUnique({ where: whereForModel(modelName, id) }) : null;
    const updated = await delegate.update({ where: whereForModel(modelName, id), data });
    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: modelName,
      entityId: id,
      entityLabel: (updated as any)?.name || (updated as any)?.email || (updated as any)?.flightNumber || id,
      summary: `Updated ${modelName}`,
      before,
      after: updated,
      metadata: { fields: Object.keys(data) },
    });
    return res.json(updated);
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Record not found' });
    return res.status(400).json({ error: err?.message || 'Failed to update record' });
  }
};

export const deleteRecord = async (req: Request, res: Response) => {
  const authUser = requireSuperadmin(req, res);
  if (!authUser) return;

  const modelName = modelDelegates[String(req.params.model || '')];
  const id = String(req.params.id || '').trim();
  const actorUserId = authUser.userId ? String(authUser.userId) : '';
  if (!modelName || !id) return res.status(400).json({ error: 'Unsupported model or missing id' });
  if (!actorUserId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const delegate = delegateFor(String(req.params.model || ''));
    const before = delegate?.findUnique ? await delegate.findUnique({ where: whereForModel(modelName, id) }) : null;
    await deleteRecordByModel(modelName, id, actorUserId);
    await writeAuditLog(req, {
      action: 'SOFT_DELETE',
      entityType: modelName,
      entityId: id,
      entityLabel: before?.name || before?.email || before?.flightNumber || id,
      summary: `Soft deleted ${modelName}`,
      before,
    });
    return res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Record not found' });
    return res.status(400).json({ error: err?.message || 'Failed to delete record' });
  }
};
