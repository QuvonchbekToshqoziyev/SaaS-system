import { describe, expect, it } from 'vitest';
import { collectRelatedFirmIds, resolveAccessibleFirmIds } from './access';

describe('tenant-owned firm scope', () => {
  it('does not turn related firms into operational access for a firm user', () => {
    const related = collectRelatedFirmIds('buyer', {
      allocations: [{ fromFirmId: 'air-pilot', toFirmId: 'buyer' }],
    });

    expect(related).toEqual(expect.arrayContaining(['buyer', 'air-pilot']));
    expect(resolveAccessibleFirmIds('FIRM', 'buyer', related)).toEqual(['buyer']);
  });

  it('keeps admin assignments and superadmin global scope explicit', () => {
    expect(resolveAccessibleFirmIds('ADMIN', null, ['firm-a', 'firm-b'])).toEqual(['firm-a', 'firm-b']);
    expect(resolveAccessibleFirmIds('SUPERADMIN', null, ['firm-a'])).toBeUndefined();
  });
});

describe('firm relationship scope', () => {
  it('adds an accepted ticket-allocation counterparty', () => {
    expect(collectRelatedFirmIds('buyer', {
      allocations: [{ fromFirmId: 'air-pilot', toFirmId: 'buyer' }],
    })).toEqual(expect.arrayContaining(['buyer', 'air-pilot']));
  });

  it('does not expose an unrelated airline', () => {
    expect(collectRelatedFirmIds('buyer', {
      connections: [{ airlineFirmId: 'other-airline', firmId: 'another-firm' }],
    })).toEqual(['buyer']);
  });
});
