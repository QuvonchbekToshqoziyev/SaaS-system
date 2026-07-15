import { describe, expect, it } from 'vitest';
import { firmTourVisibilityWhere } from './tour-packages.controller';

describe('tour visibility contract', () => {
  it('uses owner or buyer relation instead of public availability', () => {
    const firmId = 'firm-1';
    const where = firmTourVisibilityWhere(firmId);
    expect(where.OR).toEqual([{ ownerFirmId: firmId }, { sales: { some: { buyerFirmId: firmId } } }]);
    expect(where.OR).not.toContainEqual({ availableQuantity: { gt: 0 }, status: 'ACTIVE' });
  });
});
