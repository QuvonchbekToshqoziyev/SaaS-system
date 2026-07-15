import type { AxiosError } from 'axios';

export type ApiErrorResponse = { error?: string };
export type TicketInventoryMetric = { count: number; amounts: Array<{ currency: string; count: number; total: number }> };
export type TicketInventorySummary = {
  received: TicketInventoryMetric;
  soldOrAllocated: TicketInventoryMetric;
  remaining: TicketInventoryMetric & { availableCount: number; reservedForTourCount: number };
  recipients: Array<{ type: 'FIRM' | 'CUSTOMER'; name: string; quantity: number; totalAmount: number; currency: string; status: string }>;
  totalAcquiredTicketCount?: number;
  totalAcquiredCostByCurrency?: TicketInventoryMetric['amounts'];
  pendingAllocationCount?: number;
  pendingAllocationValueByCurrency?: TicketInventoryMetric['amounts'];
  acceptedAllocatedTicketCount?: number;
  acceptedAllocationRevenueByCurrency?: TicketInventoryMetric['amounts'];
  allocatedCostByCurrency?: TicketInventoryMetric['amounts'];
  allocationGrossProfitByCurrency?: TicketInventoryMetric['amounts'];
  directSoldTicketCount?: number;
  directSalesRevenueByCurrency?: TicketInventoryMetric['amounts'];
  reservedForTourCount?: number;
  remainingAvailableTicketCount?: number;
  remainingInventoryCostByCurrency?: TicketInventoryMetric['amounts'];
  paymentsByCurrency?: TicketInventoryMetric['amounts'];
  outstandingDebtByCurrency?: TicketInventoryMetric['amounts'];
  rtOw?: {
    totalParentTickets: number; originalOutboundLegs: number; originalReturnLegs: number; totalSegments: number;
    availableRoundTripCount: number; availableOutboundLegCount: number; availableReturnLegCount: number;
    remainingSellableLegCount: number; outboundOnlyAvailableCount: number; returnOnlyAvailableCount: number;
    partiallyUsedTicketCount: number; fullyUsedTicketCount: number; pendingLegCount: number; assignedLegCount: number;
    reservedLegCount: number; soldLegCount: number; acceptedAllocatedLegCount: number;
  };
};
export type LocalFlight = {
  id?: string; flight_id?: string; flightNumber?: string; route?: string; airlineId?: string | null;
  airline?: { id: string; name: string; code?: string | null; firmId?: string | null } | null;
  departure: string; arrival: string; status?: string; ticketCount?: number; ticketPrice?: number; currency?: string;
  outboundCost?: number; returnCost?: number;
  ownerFirmId?: string | null; ownerFirm?: { id: string; name: string } | null; canEdit?: boolean; canDelete?: boolean;
  total_allocated?: number | string; total_sales?: number | string; total_payments?: number | string;
  inventorySummary?: TicketInventorySummary;
  tripType?: 'ROUND_TRIP' | 'ONE_WAY';
  outboundOrigin?: string | null; outboundDestination?: string | null;
  returnOrigin?: string | null; returnDestination?: string | null;
  returnDeparture?: string | null; returnArrival?: string | null;
};
export type AirlineOption = { id: string; name: string; code?: string | null; firmId?: string | null };

export function getApiErrorMessage(error: unknown): string | undefined {
  return (error as AxiosError<ApiErrorResponse>)?.response?.data?.error;
}

export function isCancelledFlight(status?: string): boolean {
  return String(status || '').trim().toUpperCase() === 'CANCELLED';
}
