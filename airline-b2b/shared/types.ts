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
  type: 'SALE' | 'PAYMENT' | 'PAYABLE' | 'ADJUSTMENT';
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
