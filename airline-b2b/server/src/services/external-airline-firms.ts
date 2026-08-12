import type { Prisma } from '@prisma/client';
import { prisma } from '../db';

type ExternalAirline = {
  id: string;
  name: string;
  ownerFirmIds: string[];
  createdByUserId?: string;
  currency?: string;
};

export async function ensureExternalAirlineFirm(tx: Prisma.TransactionClient, airline: ExternalAirline) {
  const ownerFirmIds = [...new Set(airline.ownerFirmIds.filter(Boolean))];
  const airlineFirmId = `airline-${airline.id}`;

  await tx.firm.upsert({
    where: { id: airlineFirmId },
    update: { name: airline.name, kind: 'AIRLINE', status: 'ACTIVE', deletedAt: null },
    create: {
      id: airlineFirmId,
      name: airline.name,
      kind: 'AIRLINE',
      status: 'ACTIVE',
      currency: airline.currency || 'USD',
      createdByUserId: airline.createdByUserId,
      createdByFirmId: ownerFirmIds[0],
      createdByRole: ownerFirmIds.length ? 'FIRM' : undefined,
    },
  });
  await tx.airline.update({ where: { id: airline.id }, data: { firmId: airlineFirmId } });
  for (const firmId of ownerFirmIds) {
    await tx.airlineFirmConnection.upsert({
      where: { airlineFirmId_firmId: { airlineFirmId, firmId } },
      update: { status: 'ACTIVE' },
      create: { airlineFirmId, firmId, status: 'ACTIVE', createdByUserId: airline.createdByUserId },
    });
  }
  return airlineFirmId;
}

export async function backfillExternalAirlineFirms() {
  const airlines = await prisma.airline.findMany({
    where: { firmId: null, status: 'ACTIVE', deletedAt: null, flights: { some: { ownerFirmId: { not: null } } } },
    select: {
      id: true,
      name: true,
      flights: { where: { ownerFirmId: { not: null } }, select: { ownerFirmId: true, currency: true } },
    },
  });
  for (const airline of airlines) {
    await prisma.$transaction((tx) => ensureExternalAirlineFirm(tx, {
      id: airline.id,
      name: airline.name,
      ownerFirmIds: airline.flights.map((flight) => flight.ownerFirmId).filter((id): id is string => Boolean(id)),
      currency: airline.flights[0]?.currency,
    }));
  }
}
