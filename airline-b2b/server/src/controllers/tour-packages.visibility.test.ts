import { describe, expect, it } from 'vitest';
import { TicketLegDirection, TicketProductType } from '@prisma/client';
import { firmTourVisibilityWhere, selectTourSaleLegs } from './tour-packages.controller';

describe('tour visibility contract', () => {
  it('uses owner or buyer relation instead of public availability', () => {
    const firmId = 'firm-1';
    const where = firmTourVisibilityWhere(firmId);
    expect(where.OR).toEqual([{ ownerFirmId: firmId }, { sales: { some: { buyerFirmId: firmId, status: 'CONFIRMED', deletedAt: null } } }]);
    expect(where.OR).not.toContainEqual({ availableQuantity: { gt: 0 }, status: 'ACTIVE' });
  });

  it('selects complete RT pairs when a sold tour is corrected', () => {
    const legs = [
      { id: '1-out', ticketId: '1', direction: TicketLegDirection.OUTBOUND },
      { id: '1-return', ticketId: '1', direction: TicketLegDirection.RETURN },
      { id: '2-out', ticketId: '2', direction: TicketLegDirection.OUTBOUND },
      { id: '2-return', ticketId: '2', direction: TicketLegDirection.RETURN },
    ];
    expect(selectTourSaleLegs(legs, { productType: TicketProductType.ROUND_TRIP, parentTicketCount: 1 }).map((row) => row.id)).toEqual(['1-out', '1-return']);
  });
});
