import { describe, expect, it } from 'vitest';
import { allocationDirection, canManageFlightInventory, normalizeCurrency, parseAllocationRows, parsePositiveDecimal, parsePositiveInt, parsePurchaserInfo, requiresAirlineConnectionForAllocation, requiresAllocationApproval, restoredTicketState, validateAllocationRejectionReason } from './ticket-input';

describe('ticket input policy', () => {
  it('accepts valid business values and rejects invalid ones', () => {
    expect(parsePositiveInt('3')).toBe(3);
    expect(parsePositiveInt(0)).toBeNull();
    expect(parsePositiveDecimal('12.50')?.toString()).toBe('12.5');
    expect(parsePositiveDecimal('-1')).toBeNull();
    expect(normalizeCurrency(' usd ')).toBe('USD');
    expect(parseAllocationRows([{ count: 2, price: '10.25' }, { count: 0, price: 3 }])).toHaveLength(1);
    expect(parsePurchaserInfo({ name: ' Ali ', id: 'AA1', phone: ' 90 ' })).toEqual({ name: 'Ali', idNumber: 'AA1', phone: '90' });
  });

  it('lets the airline owner manage unassigned origin stock', () => {
    expect(canManageFlightInventory('agency-owner', 'agency-owner', 'airline-firm', 0)).toBe(true);
    expect(canManageFlightInventory('airline-firm', null, 'airline-firm', 0)).toBe(true);
    expect(canManageFlightInventory('agency-firm', 'agency-owner', 'airline-firm', 2)).toBe(true);
    expect(canManageFlightInventory('other-firm', 'agency-owner', 'airline-firm', 0)).toBe(false);
  });

  it('requires an airline connection only for the first allocation', () => {
    expect(requiresAirlineConnectionForAllocation(true)).toBe(true);
    expect(requiresAirlineConnectionForAllocation(false)).toBe(false);
  });

  it('requires approval only when the receiving firm has an active platform user', () => {
    expect(requiresAllocationApproval(0, 0)).toBe(false);
    expect(requiresAllocationApproval(1, 0)).toBe(true);
    expect(requiresAllocationApproval(0, 1)).toBe(true);
  });

  it('keeps firm-to-firm allocation provenance and restores rejected inventory', () => {
    expect(allocationDirection('AIRLINE')).toBe('AIRLINE_TO_FIRM');
    expect(allocationDirection('AGENCY')).toBe('FIRM_TO_FIRM');
    expect(restoredTicketState('source-firm')).toEqual({ status: 'ASSIGNED', assignedFirmId: 'source-firm' });
    expect(restoredTicketState(null)).toEqual({ status: 'AVAILABLE', assignedFirmId: null });
  });

  it('requires a trimmed rejection reason between 5 and 500 characters', () => {
    expect(validateAllocationRejectionReason('  Narx yuqori  ')).toBe('Narx yuqori');
    expect(() => validateAllocationRejectionReason('   ')).toThrow('Ajratmani rad etish sababini yozing.');
    expect(() => validateAllocationRejectionReason('x'.repeat(501))).toThrow('500 belgidan');
  });
});
