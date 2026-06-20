export type DashboardNotification = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  urgent: boolean;
  href: string;
  category: 'debt' | 'pending' | 'payment' | 'flight';
};

export type DashboardActivity = {
  id: string;
  title: string;
  subtitle: string;
  createdAt: string;
  href: string;
  type: 'transaction' | 'ticket' | 'invite';
};

export type DashboardTodo = {
  key: string;
  label: string;
  count: number;
  amount?: number;
  href: string;
};

export function buildFirmTodos(
  pendingTotal: number,
  dueCount: number,
  totalOutstanding: number,
): DashboardTodo[] {
  const todos: DashboardTodo[] = [];
  if (pendingTotal > 0) {
    todos.push({
      key: 'pending_allocations',
      label: 'Confirm pending allocations',
      count: pendingTotal,
      href: '/flights',
    });
  }
  if (dueCount > 0 || totalOutstanding > 0) {
    todos.push({
      key: 'due_payments',
      label: 'Make payments (outstanding balance)',
      count: dueCount,
      amount: totalOutstanding,
      href: '/transactions?openPayment=1',
    });
  }
  return todos;
}

export function buildAdminTodos(
  pendingTotal: number,
  dueCount: number,
  totalOutstanding: number,
): DashboardTodo[] {
  const todos: DashboardTodo[] = [];
  if (pendingTotal > 0) {
    todos.push({
      key: 'pending_allocations',
      label: 'Pending firm confirmations',
      count: pendingTotal,
      href: '/flights',
    });
  }
  if (dueCount > 0 || totalOutstanding > 0) {
    todos.push({
      key: 'due_payments',
      label: 'Firms with outstanding balance',
      count: dueCount,
      amount: totalOutstanding,
      href: '/transactions?type=payment',
    });
  }
  return todos;
}

export function buildNotifications(params: {
  totalOutstanding: number;
  pendingTotal: number;
  isFirm: boolean;
}): DashboardNotification[] {
  const { totalOutstanding, pendingTotal, isFirm } = params;
  const now = new Date().toISOString();
  const items: DashboardNotification[] = [];

  if (totalOutstanding > 0) {
    items.push({
      id: 'outstanding-balance',
      title: isFirm ? 'Outstanding balance due' : 'Firms have outstanding debt',
      message: `${totalOutstanding.toFixed(0)} UZS remaining`,
      createdAt: now,
      urgent: true,
      href: isFirm ? '/transactions?openPayment=1' : '/transactions?type=payment',
      category: 'debt',
    });
  }

  if (pendingTotal > 0) {
    items.push({
      id: 'pending-allocations',
      title: isFirm ? 'Tickets awaiting confirmation' : 'Allocations awaiting firm confirmation',
      message: `${pendingTotal} ticket(s) pending`,
      createdAt: now,
      urgent: false,
      href: '/flights',
      category: 'pending',
    });
  }

  return items;
}

export function buildActivityFromTransactions(
  transactions: Array<{
    id: string;
    type: string;
    createdAt: Date;
    baseAmount?: number;
    firm?: { name?: string | null } | null;
    flight?: { flightNumber?: string | null } | null;
  }>,
): DashboardActivity[] {
  return transactions.slice(0, 12).map((tx) => ({
    id: tx.id,
    title: `${tx.type} — ${tx.firm?.name || 'Unknown firm'}`,
    subtitle: tx.flight?.flightNumber
      ? `Flight ${tx.flight.flightNumber}${tx.baseAmount ? ` · ${tx.baseAmount.toFixed(0)} UZS` : ''}`
      : (tx.baseAmount ? `${tx.baseAmount.toFixed(0)} UZS` : ''),
    createdAt: tx.createdAt.toISOString(),
    href: `/transactions/detail?id=${tx.id}`,
    type: 'transaction' as const,
  }));
}

export function formatActivityTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
