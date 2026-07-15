import { describe, expect, it } from 'vitest';
import { activeFlightWhere, firmFlightParticipationWhere } from './flight-scope';

describe('active flight scope', () => {
  it('keeps legacy active flights whose status is null', () => {
    expect(activeFlightWhere()).toEqual({
      deletedAt: null,
      OR: [{ status: null }, { status: { notIn: ['DELETED', 'CANCELLED'] } }],
    });
  });
});

describe('firm flight participation scope', () => {
  it('uses ownership, live legs, and pending/accepted allocations instead of public flight visibility', () => {
    const where = firmFlightParticipationWhere(['firm-a']);
    expect(where.OR).toContainEqual({ ticketLegs: { some: { currentOwnerFirmId: { in: ['firm-a'] }, status: { not: 'DELETED' } } } });
    expect(where.OR).toContainEqual({ ticketAllocations: { some: { status: { in: ['PENDING', 'ACCEPTED'] }, OR: [{ fromFirmId: { in: ['firm-a'] } }, { toFirmId: { in: ['firm-a'] } }] } } });
    expect(where.OR).not.toContainEqual({ airline: { firmId: { not: null } } });
  });
});
