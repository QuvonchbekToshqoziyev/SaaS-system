import { describe, expect, it } from 'vitest';
import { flightDisplayName } from './flight-display';

describe('flightDisplayName', () => {
  it('uses a readable flight name instead of a UUID', () => {
    const id = 'd5ee3de7-fbf8-49d4-ae53-ab4bf9640e24';
    const label = flightDisplayName({ id, flightNumber: 'C6321/23', route: 'TAS–JED–TAS' });
    expect(label).toBe('C6321/23 · TAS–JED–TAS');
    expect(label).not.toContain(id);
    expect(flightDisplayName({ id })).toBe('Reys ma’lumoti mavjud emas');
  });
});
