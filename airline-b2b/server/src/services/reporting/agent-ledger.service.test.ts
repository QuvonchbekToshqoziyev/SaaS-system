import { describe, expect, it } from 'vitest';
import { summarizeAgentLedger } from './agent-ledger.service';

describe('agent ledger report', () => {
  it('combines opening balance, ticket/tour sales and named payments without inventing allocation transactions', () => {
    const result = summarizeAgentLedger({
      ownerFirm: { id: 'owner', name: 'AIR PILOT' },
      allocations: [{
        id: 'allocation', fromFirmId: 'owner', toFirmId: 'agent', currency: 'USD', totalAmount: 3000,
        parentTicketCount: 0, createdAt: new Date('2026-07-01'),
        flight: { id: 'flight', flightNumber: 'C6321', route: 'TAS-JED-TAS', departure: new Date('2026-08-01') },
        fromFirm: { id: 'owner', name: 'AIR PILOT' }, toFirm: { id: 'agent', name: 'HILOL' },
        priceRows: [{ quantity: 3, unitPrice: 1000, totalAmount: 3000 }],
      }],
      tourSales: [{
        id: 'tour-sale', sellerFirmId: 'owner', buyerFirmId: 'agent', quantity: 2, unitPrice: 500,
        currency: 'USD', totalAmount: 1000, createdAt: new Date('2026-07-02'),
        sellerFirm: { id: 'owner', name: 'AIR PILOT' }, buyerFirm: { id: 'agent', name: 'HILOL' },
        package: { id: 'tour', name: 'JED TOUR', flight: { id: 'flight', flightNumber: 'C6321', route: 'TAS-JED-TAS', departure: new Date('2026-08-01') } },
      }],
      transactions: [
        { id: 'opening', type: 'PAYABLE', payerFirmId: 'agent', receiverFirmId: 'owner', originalAmount: 200, currency: 'USD', direction: 'OPENING_BALANCE', sourceMode: 'MANUAL_BANK', status: 'CONFIRMED', reversedTransactionId: null, metadata: { source: 'manual_prior_balance' }, createdAt: new Date(), payerFirm: { id: 'agent', name: 'HILOL' }, receiverFirm: { id: 'owner', name: 'AIR PILOT' } },
        { id: 'payment', type: 'PAYMENT', payerFirmId: 'agent', receiverFirmId: 'owner', originalAmount: 700, currency: 'USD', direction: 'FIRM_TO_FIRM', sourceMode: 'MANUAL_CASH', status: 'CONFIRMED', reversedTransactionId: null, metadata: {}, createdAt: new Date(), payerFirm: { id: 'agent', name: 'HILOL' }, receiverFirm: { id: 'owner', name: 'AIR PILOT' } },
      ],
    });

    expect(result.agents[0]).toMatchObject({ name: 'HILOL', ticketCount: 3, tourCount: 2 });
    expect(result.agents[0].oldBalance).toEqual([{ currency: 'USD', total: 200 }]);
    expect(result.agents[0].totalSales).toEqual([{ currency: 'USD', total: 4000 }]);
    expect(result.agents[0].totalPaid).toEqual([{ currency: 'USD', total: 700 }]);
    expect(result.agents[0].currentBalance).toEqual([{ currency: 'USD', total: 3500 }]);
    expect(result.receivables).toEqual([expect.objectContaining({ firmName: 'HILOL', currency: 'USD', currentDebt: 3500 })]);
  });

  it('subtracts named kassa payments and includes flight and service purchase debts', () => {
    const owner = { id: 'owner', name: 'AIR PILOT' };
    const supplier = { id: 'supplier', name: 'Centrum Air' };
    const agent = { id: 'agent', name: 'HILOL' };
    const result = summarizeAgentLedger({
      ownerFirm: owner,
      allocations: [],
      tourSales: [],
      flightPurchases: [{
        id: 'flight', ownerFirmId: owner.id, ownerFirm: owner, airlineFirm: supplier,
        flightNumber: 'C6321', route: 'TAS-JED-TAS', departure: new Date('2026-08-01'),
        createdAt: new Date('2026-07-01'), currency: 'USD',
        tickets: [{ originPrice: 500 }, { originPrice: 500 }],
      }],
      serviceOfferings: [{
        id: 'service-buy', ownerFirmId: owner.id, ownerFirm: owner, providerFirmId: supplier.id, providerFirm: supplier,
        name: 'Transfer', quantity: 2, unitPrice: 100, currency: 'USD', paymentStatus: 'DEBT',
        createdAt: new Date('2026-07-02'), flight: null,
      }],
      serviceAssignments: [{
        id: 'service-sale', providerFirmId: owner.id, providerFirm: owner, recipientFirmId: agent.id, recipientFirm: agent,
        quantity: 3, unitPrice: 100, totalAmount: 300, currency: 'USD', status: 'ASSIGNED',
        createdAt: new Date('2026-07-03'), offering: { id: 'offering', name: 'Visa', flight: null },
      }],
      transactions: [
        { id: 'paid-supplier', type: 'ADJUSTMENT', payerFirmId: owner.id, receiverFirmId: supplier.id, originalAmount: 400, currency: 'USD', direction: 'KASSA_OUT', sourceMode: 'MANUAL_CASH', status: 'CONFIRMED', reversedTransactionId: null, metadata: {}, createdAt: new Date('2026-07-04'), payerFirm: owner, receiverFirm: supplier },
        { id: 'received-agent', type: 'ADJUSTMENT', payerFirmId: agent.id, receiverFirmId: owner.id, originalAmount: 100, currency: 'USD', direction: 'KASSA_IN', sourceMode: 'MANUAL_CASH', status: 'CONFIRMED', reversedTransactionId: null, metadata: {}, createdAt: new Date('2026-07-05'), payerFirm: agent, receiverFirm: owner },
      ],
    });

    const centrum = result.agents.find((row) => row.name === 'Centrum Air');
    const hilol = result.agents.find((row) => row.name === 'HILOL');
    expect(centrum).toMatchObject({
      purchasedTicketCount: 2,
      totalPurchases: [{ currency: 'USD', total: 1200 }],
      totalPaidByUs: [{ currency: 'USD', total: 400 }],
      payable: [{ currency: 'USD', total: 800 }],
    });
    expect(centrum?.flightPurchases).toHaveLength(1);
    expect(centrum?.servicePurchases).toHaveLength(1);
    expect(hilol).toMatchObject({
      totalSales: [{ currency: 'USD', total: 300 }],
      totalPaid: [{ currency: 'USD', total: 100 }],
      receivable: [{ currency: 'USD', total: 200 }],
    });
    expect(result.payables).toEqual([expect.objectContaining({ firmName: 'Centrum Air', currentDebt: 800 })]);
    expect(result.receivables).toEqual([expect.objectContaining({ firmName: 'HILOL', currentDebt: 200 })]);
  });
});
