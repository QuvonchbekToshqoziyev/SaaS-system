import { describe, expect, it } from 'vitest';
import { kassaTransactionDisplay, maskCardNumber } from './transaction-display';

describe('kassa transaction display', () => {
  it('returns counterparty, masked card and note for a card income', () => {
    const result = kassaTransactionDisplay({ firmId: 'owner', payerFirmId: 'agent', payerFirm: { id: 'agent', name: 'ABDULLO_AZN' }, paymentMethod: 'card', paymentCard: { ownerName: 'Centrum Visa', cardNumber: '8600123412344821', status: 'ACTIVE' }, metadata: { note: '30 JUN reysi uchun qisman to‘lov' } }, 'IN');
    expect(result).toMatchObject({ directionLabel: 'Kimdan: ABDULLO_AZN', cardDisplayName: 'Centrum Visa • 4821', cardMaskedNumber: '**** **** **** 4821', note: '30 JUN reysi uchun qisman to‘lov' });
  });

  it('does not expose card data for legacy cash rows', () => {
    const result = kassaTransactionDisplay({ paymentMethod: 'cash', metadata: {} }, 'OUT');
    expect(result.cardDisplayName).toBeNull();
    expect(result.note).toBe('');
    expect(maskCardNumber('')).toBe('');
  });
});
