import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { prisma } from '../db';
import { canManageFirmWork, isFirmAdminLike } from '../utils/firm-user-roles';
import { writeAuditLog } from '../utils/audit';
import { activeFlightWhere, firmFlightParticipationWhere } from '../domains/flights/flight-scope';
import { softDeleteTransaction } from '../utils/transaction-visibility';
import { getAccessibleFirmIds } from '../utils/access';

const auth = (req: Request) => ((req as any).user || {}) as { userId?: string; role?: string; firmId?: string; firmRole?: string };
const role = (req: Request) => String(auth(req).role || '').toUpperCase();
export const isPurchasedServiceInputValid = (input: { name: string; providerName: string; quantity: number; unitPrice: number; currency: string; paymentStatus: string }) =>
  Boolean(input.name && input.providerName && input.quantity > 0 && input.unitPrice > 0 && ['USD', 'UZS'].includes(input.currency) && ['DEBT', 'PAID'].includes(input.paymentStatus));
export const canEditFirmService = (user: ReturnType<typeof auth>, ownerFirmId: string) =>
  isFirmAdminLike(user) && (roleFromUser(user) === 'SUPERADMIN' || user.firmId === ownerFirmId);
const roleFromUser = (user: ReturnType<typeof auth>) => String(user.role || '').toUpperCase();
export const firmServiceVisibilityWhere = (firmId: string): Prisma.ServiceOfferingWhereInput => ({
  ownerFirmId: firmId,
});
export const adminServiceVisibilityWhere = (firmIds: string[]): Prisma.ServiceOfferingWhereInput => ({
  ownerFirmId: { in: firmIds },
});
const include = {
  ownerFirm: { select: { id: true, name: true } },
  providerFirm: { select: { id: true, name: true } },
  flight: { select: { id: true, flightNumber: true, route: true, departure: true } },
  assignments: { include: { recipientFirm: { select: { id: true, name: true } }, providerFirm: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' as const } },
};

export async function listServices(req: Request, res: Response) {
  const user = auth(req);
  const where: Prisma.ServiceOfferingWhereInput = { deletedAt: null, status: { not: 'DELETED' } };
  if (role(req) === 'FIRM') {
    if (!user.firmId) return res.status(400).json({ error: 'Firm account is missing firmId' });
    where.AND = [{ OR: [firmServiceVisibilityWhere(user.firmId), { assignments: { some: { recipientFirmId: user.firmId, status: { not: 'CANCELLED' } } } }] }];
  } else if (role(req) === 'ADMIN') {
    const firmIds = await getAccessibleFirmIds(user);
    where.AND = [adminServiceVisibilityWhere(firmIds || [])];
  }
  return res.json(await prisma.serviceOffering.findMany({ where, include, orderBy: { createdAt: 'desc' } }));
}

export async function createService(req: Request, res: Response) {
  const user = auth(req);
  if (role(req) !== 'FIRM' || !user.firmId || !canManageFirmWork(user)) return res.status(403).json({ error: 'Only firm admins and managers can create services' });
  const name = String(req.body?.name || '').trim();
  const flightId = String(req.body?.flightId || '').trim() || undefined;
  const providerFirmId = String(req.body?.providerFirmId || '').trim() || undefined;
  const providerName = String(req.body?.providerName || '').trim();
  const quantity = Math.floor(Number(req.body?.quantity));
  const unitPrice = Number(req.body?.unitPrice);
  const currency = String(req.body?.currency || 'UZS').trim().toUpperCase();
  const paymentStatus = String(req.body?.paymentStatus || 'DEBT').trim().toUpperCase();
  if (!isPurchasedServiceInputValid({ name, providerName, quantity, unitPrice, currency, paymentStatus })) {
    return res.status(400).json({ error: 'Service, provider, positive count, USD/UZS price and payment status are required' });
  }
  const [flight, providerFirm] = await Promise.all([
    flightId ? prisma.flight.findFirst({ where: { id: flightId, AND: [activeFlightWhere(), firmFlightParticipationWhere([user.firmId])] }, select: { id: true } }) : null,
    providerFirmId ? prisma.firm.findFirst({ where: { id: providerFirmId, deletedAt: null, status: { not: 'DELETED' } }, select: { id: true, name: true } }) : null,
  ]);
  if (flightId && !flight) return res.status(404).json({ error: 'Active flight not found' });
  if (providerFirmId && !providerFirm) return res.status(404).json({ error: 'Provider firm not found' });
  if (providerFirmId === user.firmId) return res.status(400).json({ error: 'Provider must be another firm' });
  const created = await prisma.serviceOffering.create({
    data: { ownerFirmId: user.firmId!, providerFirmId, providerName: providerFirm?.name || providerName, createdByUserId: user.userId, flightId, name, description: String(req.body?.description || '').trim() || undefined, quantity, availableQuantity: quantity, unitPrice, currency, paymentStatus },
    include,
  });
  await writeAuditLog(req, { action: 'CREATE', entityType: 'serviceOffering', entityId: created.id, entityLabel: created.name, summary: `Recorded purchased service ${created.name} from ${created.providerName}`, after: created });
  return res.status(201).json(created);
}

export async function updateService(req: Request, res: Response) {
  const user = auth(req);
  const existing = await prisma.serviceOffering.findFirst({ where: { id: String(req.params.id), deletedAt: null, status: { not: 'DELETED' } } });
  if (!existing) return res.status(404).json({ error: 'Service not found' });
  if (!canEditFirmService(user, existing.ownerFirmId)) return res.status(403).json({ error: 'Only superadmin or the owning firm admin can edit this service' });

  const name = String(req.body?.name || '').trim();
  const flightId = String(req.body?.flightId || '').trim() || undefined;
  const providerFirmId = String(req.body?.providerFirmId || '').trim() || undefined;
  const providerName = String(req.body?.providerName || '').trim();
  const quantity = Math.floor(Number(req.body?.quantity));
  const unitPrice = Number(req.body?.unitPrice);
  const currency = String(req.body?.currency || 'UZS').trim().toUpperCase();
  const paymentStatus = String(req.body?.paymentStatus || 'DEBT').trim().toUpperCase();
  if (!isPurchasedServiceInputValid({ name, providerName, quantity, unitPrice, currency, paymentStatus })) {
    return res.status(400).json({ error: 'Service, provider, positive count, USD/UZS price and payment status are required' });
  }
  const [flight, providerFirm] = await Promise.all([
    flightId ? prisma.flight.findFirst({ where: { id: flightId, AND: [activeFlightWhere(), firmFlightParticipationWhere([existing.ownerFirmId])] }, select: { id: true } }) : null,
    providerFirmId ? prisma.firm.findFirst({ where: { id: providerFirmId, deletedAt: null, status: { not: 'DELETED' } }, select: { id: true, name: true } }) : null,
  ]);
  if (flightId && !flight) return res.status(404).json({ error: 'Active flight not found' });
  if (providerFirmId && !providerFirm) return res.status(404).json({ error: 'Provider firm not found' });
  if (providerFirmId === existing.ownerFirmId) return res.status(400).json({ error: 'Provider must be another firm' });
  const committedQuantity = existing.quantity - existing.availableQuantity;
  if (quantity < committedQuantity) return res.status(409).json({ error: `Service count cannot be below ${committedQuantity}; that quantity is assigned, reserved, or consumed` });

  const updated = await prisma.serviceOffering.update({
    where: { id: existing.id },
    data: { providerFirmId, providerName: providerFirm?.name || providerName, flightId, name, description: String(req.body?.description || '').trim() || null, quantity, availableQuantity: quantity - committedQuantity, unitPrice, currency, paymentStatus },
    include,
  });
  await writeAuditLog(req, { action: 'UPDATE', entityType: 'serviceOffering', entityId: updated.id, entityLabel: updated.name, summary: `Updated purchased service ${updated.name}`, before: existing, after: updated });
  return res.json(updated);
}

export async function deleteService(req: Request, res: Response) {
  const user = auth(req);
  const existing = await prisma.serviceOffering.findFirst({ where: { id: String(req.params.id), deletedAt: null, status: { not: 'DELETED' } } });
  if (!existing) return res.status(404).json({ error: 'Service not found' });
  if (!canEditFirmService(user, existing.ownerFirmId)) return res.status(403).json({ error: 'Only superadmin or the owning firm admin can delete this service' });
  if (await prisma.serviceAssignment.count({ where: { offeringId: existing.id } })) return res.status(409).json({ error: 'A service with assignments cannot be deleted' });

  await prisma.$transaction(async (tx) => {
    const deletedAt = new Date();
    await tx.serviceOffering.update({ where: { id: existing.id }, data: { status: 'DELETED', deletedAt } });
    if (existing.transactionId) await softDeleteTransaction(tx, existing.transactionId, deletedAt);
  });
  await writeAuditLog(req, { action: 'DELETE', entityType: 'serviceOffering', entityId: existing.id, entityLabel: existing.name, summary: `Deleted purchased service ${existing.name}`, before: existing });
  return res.json({ ok: true });
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
