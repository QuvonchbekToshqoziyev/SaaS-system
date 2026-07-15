import { describe, expect, it } from 'vitest';
import { KassaStatus } from '@prisma/client';
import { activeKassaDeskWhere, resolveKassaDayStatus, resolveKassaFirmScope, resolveMonitoringFirmScope } from './kassa.service';

describe('kassa monitoring tenant scope', () => {
  it('rejects a firm user requesting another firm', () => {
    expect(() => resolveMonitoringFirmScope('FIRM', 'firm-a', ['firm-a'], 'firm-b')).toThrow('Forbidden');
  });

  it('keeps firm admin aggregation inside the authenticated firm', () => {
    expect(resolveKassaFirmScope('FIRM', 'firm-a', ['firm-a', 'air-pilot'])).toEqual(['firm-a']);
    expect(resolveMonitoringFirmScope('FIRM', 'firm-a', ['firm-a'])).toEqual(['firm-a']);
  });

  it('allows superadmin to select one firm or aggregate all firms', () => {
    expect(resolveMonitoringFirmScope('SUPERADMIN', null, undefined, 'firm-b')).toEqual(['firm-b']);
    expect(resolveMonitoringFirmScope('SUPERADMIN', null, undefined)).toBeUndefined();
  });

  it('lists active desks in scope even when the firm has no login user', () => {
    expect(activeKassaDeskWhere(['firm-a'])).toEqual({
      status: 'ACTIVE',
      deletedAt: null,
      firmId: { in: ['firm-a'] },
    });
  });

  it('never borrows another desk status for the selected desk', () => {
    expect(resolveKassaDayStatus(true, null, [KassaStatus.OPEN])).toBe('NOT_OPEN');
    expect(resolveKassaDayStatus(true, KassaStatus.CLOSED, [KassaStatus.OPEN])).toBe(KassaStatus.CLOSED);
    expect(resolveKassaDayStatus(false, null, [KassaStatus.OPEN])).toBe(KassaStatus.OPEN);
  });
});
