import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { activeFlightWhere } from '../../domains/flights/flight-scope';
import { visibleTransactionWhere } from '../../utils/transaction-visibility';

type MoneyRow = { currency: string; total: number };

type LedgerAllocation = {
  id: string;
  fromFirmId: string;
  toFirmId: string;
  currency: string;
  totalAmount: unknown;
  parentTicketCount: number;
  createdAt: Date;
  flight: { id: string; flightNumber: string; route: string; departure: Date };
  fromFirm: { id: string; name: string };
  toFirm: { id: string; name: string };
  priceRows: Array<{ quantity: number; unitPrice: unknown; totalAmount: unknown }>;
};

type LedgerTourSale = {
  id: string;
  sellerFirmId: string;
  buyerFirmId: string;
  quantity: number;
  unitPrice: unknown;
  currency: string;
  totalAmount: unknown;
  createdAt: Date;
  sellerFirm: { id: string; name: string };
  buyerFirm: { id: string; name: string };
  package: {
    id: string;
    name: string;
    flight: { id: string; flightNumber: string; route: string; departure: Date } | null;
  };
};

type LedgerFlightPurchase = {
  id: string;
  ownerFirmId: string;
  ownerFirm: { id: string; name: string };
  airlineFirm: { id: string; name: string };
  flightNumber: string;
  route: string;
  departure: Date;
  createdAt: Date;
  currency: string;
  tickets: Array<{ originPrice: unknown }>;
};

type LedgerServiceOffering = {
  id: string;
  ownerFirmId: string;
  ownerFirm: { id: string; name: string };
  providerFirmId: string;
  providerFirm: { id: string; name: string };
  name: string;
  quantity: number;
  unitPrice: unknown;
  currency: string;
  paymentStatus: string;
  createdAt: Date;
  flight: { id: string; flightNumber: string; route: string; departure: Date } | null;
};

type LedgerServiceAssignment = {
  id: string;
  providerFirmId: string;
  providerFirm: { id: string; name: string };
  recipientFirmId: string;
  recipientFirm: { id: string; name: string };
  quantity: number;
  unitPrice: unknown;
  totalAmount: unknown;
  currency: string;
  status: string;
  createdAt: Date;
  offering: {
    id: string;
    name: string;
    flight: { id: string; flightNumber: string; route: string; departure: Date } | null;
  };
};

type LedgerTransaction = {
  id: string;
  type: string;
  payerFirmId: string | null;
  receiverFirmId: string | null;
  originalAmount: unknown;
  currency: string;
  direction: string | null;
  sourceMode: string;
  status: string;
  paymentMethod?: string | null;
  reversedTransactionId: string | null;
  metadata: unknown;
  createdAt: Date;
  payerFirm: { id: string; name: string } | null;
  receiverFirm: { id: string; name: string } | null;
  flight?: { id: string; flightNumber: string; route: string; departure: Date } | null;
};

type AgentAccumulator = {
  id: string;
  name: string;
  oldBalance: Map<string, number>;
  sales: Map<string, number>;
  purchases: Map<string, number>;
  received: Map<string, number>;
  sent: Map<string, number>;
  ticketCount: number;
  purchasedTicketCount: number;
  tourCount: number;
  ticketPurchases: Array<Record<string, unknown>>;
  tourPurchases: Array<Record<string, unknown>>;
  flightPurchases: Array<Record<string, unknown>>;
  servicePurchases: Array<Record<string, unknown>>;
  serviceSales: Array<Record<string, unknown>>;
  paymentsReceived: Array<Record<string, unknown>>;
  paymentsMade: Array<Record<string, unknown>>;
};

const number = (value: unknown) => {
  const parsed = Number(value == null ? 0 : String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const currency = (value: unknown) => String(value || 'UZS').trim().toUpperCase() || 'UZS';

function add(map: Map<string, number>, code: string, value: number) {
  map.set(code, (map.get(code) || 0) + value);
}

function rows(map: Map<string, number>, includeZero = false): MoneyRow[] {
  return Array.from(map.entries())
    .filter(([, total]) => includeZero || Math.abs(total) > 0.000001)
    .map(([code, total]) => ({ currency: code, total: Number(total.toFixed(4)) }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function quantity(allocation: LedgerAllocation) {
  return allocation.parentTicketCount
    || allocation.priceRows.reduce((sum, row) => sum + Math.max(0, Number(row.quantity || 0)), 0);
}

export function summarizeAgentLedger(input: {
  ownerFirm: { id: string; name: string };
  allocations: LedgerAllocation[];
  tourSales: LedgerTourSale[];
  flightPurchases?: LedgerFlightPurchase[];
  serviceOfferings?: LedgerServiceOffering[];
  serviceAssignments?: LedgerServiceAssignment[];
  transactions: LedgerTransaction[];
}) {
  const ownerFirmId = input.ownerFirm.id;
  const agents = new Map<string, AgentAccumulator>();
  const ensure = (firm: { id: string; name: string } | null | undefined) => {
    if (!firm || firm.id === ownerFirmId) return null;
    const current = agents.get(firm.id);
    if (current) return current;
    const created: AgentAccumulator = {
      id: firm.id,
      name: firm.name,
      oldBalance: new Map(),
      sales: new Map(),
      purchases: new Map(),
      received: new Map(),
      sent: new Map(),
      ticketCount: 0,
      purchasedTicketCount: 0,
      tourCount: 0,
      ticketPurchases: [],
      tourPurchases: [],
      flightPurchases: [],
      servicePurchases: [],
      serviceSales: [],
      paymentsReceived: [],
      paymentsMade: [],
    };
    agents.set(firm.id, created);
    return created;
  };

  for (const allocation of input.allocations) {
    if (allocation.fromFirmId !== ownerFirmId && allocation.toFirmId !== ownerFirmId) continue;
    const outgoing = allocation.fromFirmId === ownerFirmId;
    const agent = ensure(outgoing ? allocation.toFirm : allocation.fromFirm);
    if (!agent) continue;
    const code = currency(allocation.currency);
    const total = number(allocation.totalAmount);
    const count = quantity(allocation);
    add(outgoing ? agent.sales : agent.purchases, code, total);
    if (outgoing) {
      agent.ticketCount += count;
      agent.ticketPurchases.push({
        id: allocation.id,
        flightId: allocation.flight.id,
        flightNumber: allocation.flight.flightNumber,
        route: allocation.flight.route,
        departure: allocation.flight.departure,
        quantity: count,
        priceRows: allocation.priceRows.map((row) => ({ quantity: row.quantity, unitPrice: number(row.unitPrice), totalAmount: number(row.totalAmount) || row.quantity * number(row.unitPrice) })),
        totalAmount: total,
        currency: code,
        createdAt: allocation.createdAt,
      });
    } else {
      agent.purchasedTicketCount += count;
      agent.flightPurchases.push({
        id: allocation.id,
        sourceType: 'ALLOCATION',
        flightId: allocation.flight.id,
        flightNumber: allocation.flight.flightNumber,
        route: allocation.flight.route,
        departure: allocation.flight.departure,
        quantity: count,
        priceRows: allocation.priceRows.map((row) => ({ quantity: row.quantity, unitPrice: number(row.unitPrice), totalAmount: number(row.totalAmount) || row.quantity * number(row.unitPrice) })),
        totalAmount: total,
        currency: code,
        createdAt: allocation.createdAt,
      });
    }
  }

  for (const sale of input.tourSales) {
    if (sale.sellerFirmId !== ownerFirmId && sale.buyerFirmId !== ownerFirmId) continue;
    const outgoing = sale.sellerFirmId === ownerFirmId;
    const agent = ensure(outgoing ? sale.buyerFirm : sale.sellerFirm);
    if (!agent) continue;
    const code = currency(sale.currency);
    const total = number(sale.totalAmount);
    add(outgoing ? agent.sales : agent.purchases, code, total);
    if (outgoing) {
      agent.tourCount += sale.quantity;
      agent.tourPurchases.push({
        id: sale.id,
        packageId: sale.package.id,
        packageName: sale.package.name,
        flightId: sale.package.flight?.id || null,
        flightNumber: sale.package.flight?.flightNumber || null,
        route: sale.package.flight?.route || null,
        departure: sale.package.flight?.departure || null,
        quantity: sale.quantity,
        unitPrice: number(sale.unitPrice),
        totalAmount: total,
        currency: code,
        createdAt: sale.createdAt,
      });
    }
  }

  for (const flight of input.flightPurchases || []) {
    const providerFirmId = flight.airlineFirm.id;
    if (providerFirmId === flight.ownerFirmId || (providerFirmId !== ownerFirmId && flight.ownerFirmId !== ownerFirmId)) continue;
    const outgoing = providerFirmId === ownerFirmId;
    const agent = ensure(outgoing ? flight.ownerFirm : flight.airlineFirm);
    if (!agent) continue;
    const code = currency(flight.currency);
    const total = flight.tickets.reduce((sum, ticket) => sum + number(ticket.originPrice), 0);
    const priceCounts = new Map<number, number>();
    for (const ticket of flight.tickets) {
      const price = number(ticket.originPrice);
      priceCounts.set(price, (priceCounts.get(price) || 0) + 1);
    }
    add(outgoing ? agent.sales : agent.purchases, code, total);
    const detail = {
      id: flight.id,
      sourceType: 'FLIGHT_INVENTORY',
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      route: flight.route,
      departure: flight.departure,
      quantity: flight.tickets.length,
      priceRows: Array.from(priceCounts.entries()).map(([unitPrice, count]) => ({ quantity: count, unitPrice, totalAmount: count * unitPrice })),
      totalAmount: total,
      currency: code,
      createdAt: flight.createdAt,
    };
    if (outgoing) {
      agent.ticketCount += flight.tickets.length;
      agent.ticketPurchases.push(detail);
    } else {
      agent.purchasedTicketCount += flight.tickets.length;
      agent.flightPurchases.push(detail);
    }
  }

  for (const service of input.serviceOfferings || []) {
    if (service.providerFirmId !== ownerFirmId && service.ownerFirmId !== ownerFirmId) continue;
    const outgoing = service.providerFirmId === ownerFirmId;
    const agent = ensure(outgoing ? service.ownerFirm : service.providerFirm);
    if (!agent) continue;
    const code = currency(service.currency);
    const total = service.quantity * number(service.unitPrice);
    add(outgoing ? agent.sales : agent.purchases, code, total);
    const detail = {
      id: service.id,
      sourceType: 'PURCHASED_SERVICE',
      serviceName: service.name,
      flightId: service.flight?.id || null,
      flightNumber: service.flight?.flightNumber || null,
      route: service.flight?.route || null,
      quantity: service.quantity,
      unitPrice: number(service.unitPrice),
      totalAmount: total,
      currency: code,
      paymentStatus: service.paymentStatus,
      createdAt: service.createdAt,
    };
    (outgoing ? agent.serviceSales : agent.servicePurchases).push(detail);
    if (service.paymentStatus === 'PAID') {
      add(outgoing ? agent.received : agent.sent, code, total);
    }
  }

  for (const assignment of input.serviceAssignments || []) {
    if (assignment.providerFirmId !== ownerFirmId && assignment.recipientFirmId !== ownerFirmId) continue;
    const outgoing = assignment.providerFirmId === ownerFirmId;
    const agent = ensure(outgoing ? assignment.recipientFirm : assignment.providerFirm);
    if (!agent) continue;
    const code = currency(assignment.currency);
    const total = number(assignment.totalAmount);
    add(outgoing ? agent.sales : agent.purchases, code, total);
    const detail = {
      id: assignment.id,
      sourceType: 'SERVICE_ASSIGNMENT',
      serviceName: assignment.offering.name,
      flightId: assignment.offering.flight?.id || null,
      flightNumber: assignment.offering.flight?.flightNumber || null,
      route: assignment.offering.flight?.route || null,
      quantity: assignment.quantity,
      unitPrice: number(assignment.unitPrice),
      totalAmount: total,
      currency: code,
      status: assignment.status,
      createdAt: assignment.createdAt,
    };
    (outgoing ? agent.serviceSales : agent.servicePurchases).push(detail);
  }

  const reversedIds = new Set(input.transactions.map((row) => row.reversedTransactionId).filter((id): id is string => Boolean(id)));
  for (const transaction of input.transactions) {
    if (transaction.status !== 'CONFIRMED' || transaction.sourceMode === 'REVERSAL' || transaction.reversedTransactionId || reversedIds.has(transaction.id)) continue;
    const payerIsOwner = transaction.payerFirmId === ownerFirmId;
    const receiverIsOwner = transaction.receiverFirmId === ownerFirmId;
    if (payerIsOwner === receiverIsOwner) continue;
    const agent = ensure(payerIsOwner ? transaction.receiverFirm : transaction.payerFirm);
    if (!agent) continue;
    const code = currency(transaction.currency);
    const total = number(transaction.originalAmount);
    const isPayment = transaction.type === 'PAYMENT'
      || (transaction.type === 'ADJUSTMENT' && ['KASSA_IN', 'KASSA_OUT'].includes(String(transaction.direction || '')));
    if (isPayment) {
      const received = receiverIsOwner;
      add(received ? agent.received : agent.sent, code, total);
      const detail = {
        id: transaction.id,
        amount: total,
        currency: code,
        direction: transaction.direction,
        sourceMode: transaction.sourceMode,
        paymentMethod: transaction.paymentMethod,
        flightId: transaction.flight?.id || null,
        flightNumber: transaction.flight?.flightNumber || null,
        route: transaction.flight?.route || null,
        createdAt: transaction.createdAt,
      };
      (received ? agent.paymentsReceived : agent.paymentsMade).push(detail);
      continue;
    }
    if (transaction.type !== 'PAYABLE') continue;
    const metadata = transaction.metadata && typeof transaction.metadata === 'object' && !Array.isArray(transaction.metadata)
      ? transaction.metadata as Record<string, unknown>
      : {};
    if (transaction.direction === 'OPENING_BALANCE' || metadata.source === 'manual_prior_balance') {
      add(agent.oldBalance, code, receiverIsOwner ? total : -total);
    } else {
      add(receiverIsOwner ? agent.sales : agent.purchases, code, total);
    }
  }

  const receivableTotals = new Map<string, number>();
  const payableTotals = new Map<string, number>();
  const receivables: Array<Record<string, unknown>> = [];
  const payables: Array<Record<string, unknown>> = [];
  const result = Array.from(agents.values()).map((agent) => {
    const codes = new Set([
      ...agent.oldBalance.keys(), ...agent.sales.keys(), ...agent.purchases.keys(),
      ...agent.received.keys(), ...agent.sent.keys(),
    ]);
    const balance = new Map<string, number>();
    const receivable = new Map<string, number>();
    const payable = new Map<string, number>();
    for (const code of codes) {
      const old = agent.oldBalance.get(code) || 0;
      const sold = agent.sales.get(code) || 0;
      const bought = agent.purchases.get(code) || 0;
      const paid = agent.received.get(code) || 0;
      const paymentsMade = agent.sent.get(code) || 0;
      const current = old + sold - bought - paid + paymentsMade;
      balance.set(code, current);
      if (current > 0) {
        receivable.set(code, current);
        add(receivableTotals, code, current);
        receivables.push({ firmId: agent.id, firmName: agent.name, currency: code, charged: Math.max(0, old) + sold, paid, currentDebt: current });
      } else if (current < 0) {
        payable.set(code, -current);
        add(payableTotals, code, -current);
        payables.push({ firmId: agent.id, firmName: agent.name, currency: code, charged: Math.max(0, -old) + bought, paid: paymentsMade, currentDebt: -current });
      }
    }
    return {
      id: agent.id,
      name: agent.name,
      oldBalance: rows(agent.oldBalance),
      ticketCount: agent.ticketCount,
      purchasedTicketCount: agent.purchasedTicketCount,
      tourCount: agent.tourCount,
      totalSales: rows(agent.sales),
      totalPurchases: rows(agent.purchases),
      totalPaid: rows(agent.received),
      totalPaidByUs: rows(agent.sent),
      currentBalance: rows(balance),
      receivable: rows(receivable),
      payable: rows(payable),
      ticketPurchases: agent.ticketPurchases,
      tourPurchases: agent.tourPurchases,
      flightPurchases: agent.flightPurchases,
      servicePurchases: agent.servicePurchases,
      serviceSales: agent.serviceSales,
      paymentsReceived: agent.paymentsReceived,
      paymentsMade: agent.paymentsMade,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return {
    ownerFirm: input.ownerFirm,
    agents: result,
    receivableTotals: rows(receivableTotals),
    payableTotals: rows(payableTotals),
    receivables: receivables.sort((a, b) => number(b.currentDebt) - number(a.currentDebt)),
    payables: payables.sort((a, b) => number(b.currentDebt) - number(a.currentDebt)),
  };
}

export async function buildAgentLedgerReports(rawOwnerFirmIds: string[]) {
  const ownerFirmIds = Array.from(new Set(rawOwnerFirmIds.filter(Boolean)));
  if (!ownerFirmIds.length) return [];
  const relationWhere = { OR: [{ payerFirmId: { in: ownerFirmIds } }, { receiverFirmId: { in: ownerFirmIds } }] } satisfies Prisma.TransactionWhereInput;
  const [ownerFirms, allocations, tourSales, flights, serviceOfferings, serviceAssignments, transactions] = await Promise.all([
    prisma.firm.findMany({ where: { id: { in: ownerFirmIds } }, select: { id: true, name: true } }),
    prisma.ticketAllocation.findMany({
      where: { status: 'ACCEPTED', OR: [{ fromFirmId: { in: ownerFirmIds } }, { toFirmId: { in: ownerFirmIds } }] },
      select: {
        id: true, fromFirmId: true, toFirmId: true, currency: true, totalAmount: true, parentTicketCount: true, createdAt: true,
        flight: { select: { id: true, flightNumber: true, route: true, departure: true } },
        fromFirm: { select: { id: true, name: true } }, toFirm: { select: { id: true, name: true } },
        priceRows: { orderBy: { position: 'asc' }, select: { quantity: true, unitPrice: true, totalAmount: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tourPackageSale.findMany({
      where: { status: 'CONFIRMED', deletedAt: null, OR: [{ sellerFirmId: { in: ownerFirmIds } }, { buyerFirmId: { in: ownerFirmIds } }] },
      select: {
        id: true, sellerFirmId: true, buyerFirmId: true, quantity: true, unitPrice: true, currency: true, totalAmount: true, createdAt: true,
        sellerFirm: { select: { id: true, name: true } }, buyerFirm: { select: { id: true, name: true } },
        package: { select: { id: true, name: true, flight: { select: { id: true, flightNumber: true, route: true, departure: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.flight.findMany({
      where: {
        AND: [
          activeFlightWhere(),
          { ownerFirmId: { not: null } },
          { airline: { firmId: { not: null } } },
          { OR: [{ ownerFirmId: { in: ownerFirmIds } }, { airline: { firmId: { in: ownerFirmIds } } }] },
        ],
      },
      select: {
        id: true, ownerFirmId: true, flightNumber: true, route: true, departure: true, createdAt: true, currency: true,
        ownerFirm: { select: { id: true, name: true } },
        airline: { select: { firm: { select: { id: true, name: true } } } },
        tickets: { where: { deletedAt: null, status: { not: 'DELETED' } }, select: { originPrice: true } },
      },
      orderBy: { departure: 'desc' },
    }),
    prisma.serviceOffering.findMany({
      where: {
        deletedAt: null, status: { not: 'DELETED' }, providerFirmId: { not: null },
        OR: [{ ownerFirmId: { in: ownerFirmIds } }, { providerFirmId: { in: ownerFirmIds } }],
      },
      select: {
        id: true, ownerFirmId: true, providerFirmId: true, name: true, quantity: true, unitPrice: true,
        currency: true, paymentStatus: true, createdAt: true,
        ownerFirm: { select: { id: true, name: true } }, providerFirm: { select: { id: true, name: true } },
        flight: { select: { id: true, flightNumber: true, route: true, departure: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.serviceAssignment.findMany({
      where: {
        status: { not: 'CANCELLED' },
        OR: [{ providerFirmId: { in: ownerFirmIds } }, { recipientFirmId: { in: ownerFirmIds } }],
      },
      select: {
        id: true, providerFirmId: true, recipientFirmId: true, quantity: true, unitPrice: true,
        totalAmount: true, currency: true, status: true, createdAt: true,
        providerFirm: { select: { id: true, name: true } }, recipientFirm: { select: { id: true, name: true } },
        offering: { select: { id: true, name: true, flight: { select: { id: true, flightNumber: true, route: true, departure: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.transaction.findMany({
      where: visibleTransactionWhere({
        ...relationWhere,
        type: { in: ['PAYMENT', 'PAYABLE', 'ADJUSTMENT'] },
      }),
      select: {
        id: true, type: true, payerFirmId: true, receiverFirmId: true, originalAmount: true, currency: true,
        direction: true, sourceMode: true, status: true, paymentMethod: true, reversedTransactionId: true, metadata: true, createdAt: true,
        payerFirm: { select: { id: true, name: true } }, receiverFirm: { select: { id: true, name: true } },
        flight: { select: { id: true, flightNumber: true, route: true, departure: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const flightPurchases: LedgerFlightPurchase[] = flights.flatMap((flight) => flight.ownerFirmId && flight.ownerFirm && flight.airline?.firm
    ? [{ ...flight, ownerFirmId: flight.ownerFirmId, ownerFirm: flight.ownerFirm, airlineFirm: flight.airline.firm }]
    : []);
  const purchasedServices: LedgerServiceOffering[] = serviceOfferings.flatMap((service) => service.providerFirmId && service.providerFirm
    ? [{ ...service, providerFirmId: service.providerFirmId, providerFirm: service.providerFirm }]
    : []);
  return ownerFirms.map((ownerFirm) => summarizeAgentLedger({
    ownerFirm,
    allocations,
    tourSales,
    flightPurchases,
    serviceOfferings: purchasedServices,
    serviceAssignments,
    transactions,
  }));
}

export async function buildAgentLedgerReport(ownerFirmId: string) {
  const [report] = await buildAgentLedgerReports([ownerFirmId]);
  if (!report) throw new Error('Firm not found');
  return report;
}
