import { describe, expect, it, vi } from 'vitest';
import { ensureExternalAirlineFirm } from './external-airline-firms';

describe('external airline firm', () => {
  it('creates an AIRLINE firm and connects every firm that owns its flights', async () => {
    const tx = {
      firm: { upsert: vi.fn().mockResolvedValue({}) },
      airline: { update: vi.fn().mockResolvedValue({}) },
      airlineFirmConnection: { upsert: vi.fn().mockResolvedValue({}) },
    } as any;

    await ensureExternalAirlineFirm(tx, {
      id: 'iyun', name: 'IYUN REYSI', ownerFirmIds: ['firm-a', 'firm-a', 'firm-b'], createdByUserId: 'user-a', currency: 'UZS',
    });

    expect(tx.firm.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'airline-iyun' },
      create: expect.objectContaining({ name: 'IYUN REYSI', kind: 'AIRLINE', createdByFirmId: 'firm-a', currency: 'UZS' }),
    }));
    expect(tx.airline.update).toHaveBeenCalledWith({ where: { id: 'iyun' }, data: { firmId: 'airline-iyun' } });
    expect(tx.airlineFirmConnection.upsert).toHaveBeenCalledTimes(2);
  });
});
