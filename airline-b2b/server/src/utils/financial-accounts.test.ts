import { describe, expect, it } from 'vitest';
import { financialAccountUniqueWhere } from './financial-accounts';

describe('financial account identity', () => {
  it('uses the linked resource unique key before the display name', () => {
    expect(financialAccountUniqueWhere({ firmId: 'firm', name: 'renamed cashbox', currency: 'USD', kassaDeskId: 'desk' }))
      .toEqual({ kassaDeskId_currency: { kassaDeskId: 'desk', currency: 'USD' } });
    expect(financialAccountUniqueWhere({ firmId: 'firm', name: 'renamed card', currency: 'UZS', paymentCardId: 'card' }))
      .toEqual({ paymentCardId_currency: { paymentCardId: 'card', currency: 'UZS' } });
    expect(financialAccountUniqueWhere({ firmId: 'firm', name: 'Main account', currency: 'UZS' }))
      .toEqual({ firmId_name_currency: { firmId: 'firm', name: 'Main account', currency: 'UZS' } });
  });
});
