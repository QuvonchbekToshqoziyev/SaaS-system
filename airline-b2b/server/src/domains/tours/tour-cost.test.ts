import { calculateTourCosts, conversionMultiplier, parseTourServices } from './tour-cost';
import { describe, expect, it } from 'vitest';

describe('tour package cost and service validation', () => {
  it('calculates the 10-ticket, VISA and Hotel example correctly', () => {
    expect(calculateTourCosts(670, [100, 200], 10)).toEqual({ ticketCostPerTour: 670, serviceCostPerTour: 300, unitTourCost: 970, totalTourCost: 9700 });
  });

  it('uses unit cost rather than quantity/default one', () => {
    expect(calculateTourCosts(0, [100], 10).totalTourCost).toBe(1000);
  });

  it('rejects duplicate services and missing quantities', () => {
    expect(() => parseTourServices([{ serviceId: 'visa', quantityPerTour: 1 }, { serviceId: 'visa', quantityPerTour: 2 }])).toThrow('allaqachon');
    expect(() => parseTourServices([{ serviceId: 'visa', quantityPerTour: 0 }])).toThrow('musbat');
  });

  it('never silently defaults a cross-currency rate to one', () => {
    expect(conversionMultiplier('USD', 'UZS', 12500)).toBe(12500);
    expect(conversionMultiplier('UZS', 'USD', 12500)).toBeCloseTo(0.00008);
    expect(() => conversionMultiplier('USD', 'UZS', 0)).toThrow('kursini');
  });
});
