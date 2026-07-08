import { describe, expect, it } from 'vitest';
import {
  assertActiveKassaDesk,
  assertKassaDeskForFirmSelection,
  assertKassaDeskForFirmSetSelection,
} from './kassa-desk-policy';

describe('kassa desk policy', () => {
  it('requires active non-deleted desks', () => {
    expect(() => assertActiveKassaDesk(null)).toThrow('Kassa desk not found');
    expect(() => assertActiveKassaDesk({ id: 'desk-1', firmId: 'firm-1', status: 'INACTIVE' })).toThrow('Kassa desk is not active');
    expect(() => assertActiveKassaDesk({ id: 'desk-1', firmId: 'firm-1', status: 'ACTIVE', deletedAt: new Date() })).toThrow('Kassa desk is not active');
    expect(() => assertActiveKassaDesk({ id: 'desk-1', firmId: 'firm-1', status: 'ACTIVE' })).not.toThrow();
  });

  it('requires selecting a desk when a firm has active desks', () => {
    expect(() => assertKassaDeskForFirmSelection(null, 'firm-1', 1)).toThrow('Kassa desk is required for this firm');
    expect(() => assertKassaDeskForFirmSelection(null, 'firm-1', 0)).not.toThrow();
  });

  it('rejects desks from another firm', () => {
    expect(() => assertKassaDeskForFirmSelection({ id: 'desk-2', firmId: 'firm-2', status: 'ACTIVE' }, 'firm-1', 1))
      .toThrow('Kassa desk must belong to the selected firm');
  });

  it('allows directed transactions only for desks belonging to a transaction firm', () => {
    expect(() => assertKassaDeskForFirmSetSelection({ id: 'desk-1', firmId: 'firm-1', status: 'ACTIVE' }, ['firm-1', 'firm-2'], undefined, 0))
      .not.toThrow();
    expect(() => assertKassaDeskForFirmSetSelection({ id: 'desk-3', firmId: 'firm-3', status: 'ACTIVE' }, ['firm-1', 'firm-2'], undefined, 0))
      .toThrow('Kassa desk must belong to one of the transaction firms');
  });
});
