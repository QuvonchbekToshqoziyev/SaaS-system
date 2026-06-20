export type Flight = {
  id: string;
  flight_id?: string;
  flightNumber: string | null;
  departure: string;
  arrival: string;
  status: string;
  ticketCount?: number;
  ticketPrice?: number;
  currency?: string;
  total_allocated?: number | string;
  total_sales?: number | string;
  total_payments?: number | string;
};

export type Firm = {
  id: string;
  name: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type Transaction = {
  id: string;
  firmId?: string;
  flightId?: string;
  ticketId?: string;
  createdByUserId?: string;
  type: 'SALE' | 'PAYMENT' | 'PAYABLE' | 'ALLOCATION' | 'REFUND' | 'ADJUSTMENT';
  originalAmount: number | string;
  currency: string;
  exchangeRate: number | string;
  baseAmount: number | string;
  paymentMethod?: string;
  createdAt: string;
  firm?: Firm;
  flight?: Flight;
};

export type ApiErrorResponse = {
  error?: string;
};

export type KassaStatus = 'NOT_OPEN' | 'OPEN' | 'CLOSED';

export type KassaDay = {
  id: string;
  businessDate: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt?: string | null;
  openedBy?: { id: string; email: string };
  closedBy?: { id: string; email: string } | null;
  openingBalance: string;
  closingBalance?: string | null;
  expectedCash?: string | null;
  variance?: string | null;
  notes?: string | null;
};

export type KassaDuePayment = {
  firmId: string;
  firmName: string | null;
  flightId: string;
  flightNumber: string | null;
  departure: string | null;
  debt: number;
  paid: number;
  outstanding: number;
};

export type KassaDaySummary = {
  businessDate: string;
  status: KassaStatus;
  kassa: KassaDay | null;
  totals: {
    cashTotal: number;
    cardTotal: number;
    paymentCount: number;
    saleTotal: number;
    payableTotal: number;
    transactionCount: number;
    expectedCash: number | null;
  };
  transactions: Transaction[];
  duePayments: KassaDuePayment[];
};
