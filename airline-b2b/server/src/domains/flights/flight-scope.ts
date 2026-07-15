import { Prisma, TicketLegStatus, TicketStatus } from '@prisma/client';

export function activeFlightWhere(): Prisma.FlightWhereInput {
  return {
    deletedAt: null,
    OR: [
      { status: null },
      { status: { notIn: ['DELETED', 'CANCELLED'] } },
    ],
  };
}

export function firmFlightParticipationWhere(firmIds: string[]): Prisma.FlightWhereInput {
  return {
    OR: [
      { ownerFirmId: { in: firmIds } },
      { ownerFirmId: null, airline: { firmId: { in: firmIds } } },
      { ticketLegs: { some: { currentOwnerFirmId: { in: firmIds }, status: { not: TicketLegStatus.DELETED } } } },
      { ticketAllocations: { some: { status: { in: ['PENDING', 'ACCEPTED'] }, OR: [{ fromFirmId: { in: firmIds } }, { toFirmId: { in: firmIds } }] } } },
      { tickets: { some: { legs: { none: {} }, assignedFirmId: { in: firmIds }, deletedAt: null, status: { not: TicketStatus.DELETED } } } },
      { tickets: { some: { legs: { none: {} }, allocationSourceFirmId: { in: firmIds }, status: TicketStatus.PENDING, deletedAt: null } } },
    ],
  };
}
