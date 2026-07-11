import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { prisma } from '../db';
import { canManageFirmWork } from '../utils/firm-user-roles';
import { writeAuditLog } from '../utils/audit';

const auth = (req: Request) => ((req as any).user || {}) as { userId?: string; role?: string; firmId?: string; firmRole?: string };
const role = (req: Request) => String(auth(req).role || '').toUpperCase();
const include = {
  ownerFirm: { select: { id: true, name: true } },
  flight: { select: { id: true, flightNumber: true, route: true, departure: true } },
  assignments: { include: { recipientFirm: { select: { id: true, name: true } }, providerFirm: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' as const } },
};

export async function listServices(req: Request, res: Response) {
  const user = auth(req);
  const where: Prisma.ServiceOfferingWhereInput = { deletedAt: null, status: { not: 'DELETED' } };
  if (role(req) === 'FIRM') {
    if (!user.firmId) return res.status(400).json({ error: 'Firm account is missing firmId' });
    where.OR = [{ ownerFirmId: user.firmId }, { assignments: { some: { recipientFirmId: user.firmId } } }];
  }
  return res.json(await prisma.serviceOffering.findMany({ where, include, orderBy: { createdAt: 'desc' } }));
}

export async function createService(req: Request, res: Response) {
  const user = auth(req);
  if (role(req) !== 'FIRM' || !user.firmId || !canManageFirmWork(user)) return res.status(403).json({ error: 'Only firm admins and managers can create services' });
  const name = String(req.body?.name || '').trim();
  const flightId = String(req.body?.flightId || '').trim();
  const quantity = Math.floor(Number(req.body?.quantity));
  const unitPrice = Number(req.body?.unitPrice);
  const currency = String(req.body?.currency || 'UZS').trim().toUpperCase();
  if (!name || !flightId || quantity <= 0 || unitPrice <= 0 || !/^[A-Z]{3}$/.test(currency)) return res.status(400).json({ error: 'Name, flight, positive count, price and currency are required' });
  const flight = await prisma.flight.findFirst({ where: { id: flightId, deletedAt: null, OR: [{ status: null }, { status: { notIn: ['DELETED', 'CANCELLED'] } }] }, select: { id: true } });
  if (!flight) return res.status(404).json({ error: 'Active flight not found' });
  const created = await prisma.serviceOffering.create({ data: { ownerFirmId: user.firmId, createdByUserId: user.userId, flightId, name, description: String(req.body?.description || '').trim() || undefined, quantity, availableQuantity: quantity, unitPrice, currency }, include });
  await writeAuditLog(req, { action: 'CREATE', entityType: 'serviceOffering', entityId: created.id, entityLabel: created.name, summary: `Created service ${created.name}`, after: created });
  return res.status(201).json(created);
}

export async function assignService(req: Request, res: Response) {
  const user = auth(req);
  if (!['FIRM', 'ADMIN', 'SUPERADMIN'].includes(role(req))) return res.status(403).json({ error: 'Forbidden' });
  if (role(req) === 'FIRM' && !canManageFirmWork(user)) return res.status(403).json({ error: 'Only firm admins and managers can assign services' });
  const offeringId = String(req.params.id || '');
  const recipientFirmId = String(req.body?.recipientFirmId || '');
  const quantity = Math.floor(Number(req.body?.quantity));
  if (!recipientFirmId || quantity <= 0) return res.status(400).json({ error: 'Recipient firm and positive count are required' });
  try {
    const assignment = await prisma.$transaction(async (tx) => {
      const offering = await tx.serviceOffering.findUnique({ where: { id: offeringId } });
      if (!offering || offering.deletedAt || offering.status !== 'ACTIVE') throw new Error('Service not found');
      if (role(req) === 'FIRM' && offering.ownerFirmId !== user.firmId) throw new Error('Only the creator firm can assign this service');
      if (offering.ownerFirmId === recipientFirmId) throw new Error('Recipient must be another firm');
      if (offering.availableQuantity < quantity) throw new Error('Not enough service count available');
      const recipient = await tx.firm.findUnique({ where: { id: recipientFirmId }, select: { id: true } });
      if (!recipient) throw new Error('Recipient firm not found');
      const totalAmount = new Prisma.Decimal(offering.unitPrice).mul(quantity);
      const row = await tx.serviceAssignment.create({ data: { offeringId, providerFirmId: offering.ownerFirmId, recipientFirmId, quantity, unitPrice: offering.unitPrice, totalAmount, currency: offering.currency, notes: String(req.body?.notes || '').trim() || undefined }, include: { offering: true, providerFirm: { select: { id: true, name: true } }, recipientFirm: { select: { id: true, name: true } } } });
      await tx.serviceOffering.update({ where: { id: offeringId }, data: { availableQuantity: { decrement: quantity } } });
      return row;
    });
    await writeAuditLog(req, { action: 'CREATE', entityType: 'serviceAssignment', entityId: assignment.id, summary: `Assigned service ${assignment.offering.name}`, after: assignment });
    return res.status(201).json(assignment);
  } catch (error: any) { return res.status(400).json({ error: error?.message || 'Failed to assign service' }); }
}

export async function updateServiceStatus(req: Request, res: Response) {
  const user = auth(req);
  const status = String(req.body?.status || '').toUpperCase();
  if (!['ASSIGNED', 'IN_PROGRESS', 'FULFILLED', 'CANCELLED'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const row = await prisma.serviceAssignment.findUnique({ where: { id: String(req.params.id) } });
  if (!row) return res.status(404).json({ error: 'Service assignment not found' });
  if (role(req) === 'FIRM' && (row.providerFirmId !== user.firmId || !canManageFirmWork(user))) return res.status(403).json({ error: 'Only the provider firm can update fulfillment' });
  const updated = await prisma.serviceAssignment.update({ where: { id: row.id }, data: { status } });
  await writeAuditLog(req, { action: 'UPDATE', entityType: 'serviceAssignment', entityId: row.id, summary: `Changed service status to ${status}`, before: row, after: updated });
  return res.json(updated);
}
