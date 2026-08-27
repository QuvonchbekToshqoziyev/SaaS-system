export const APP_CAPABILITIES = {
  DASHBOARD_VIEW: 'dashboard.view',
  ADMINS_MANAGE: 'platform.admins.manage',
  AUDIT_VIEW: 'audit.view',
  MONITORING_VIEW: 'monitoring.view',
  AIRLINES_VIEW: 'airlines.view',
  ORGANIZATIONS_VIEW: 'organizations.view',
  FLIGHTS_VIEW: 'flights.view',
  TOURS_VIEW: 'tours.view',
  SERVICES_VIEW: 'services.view',
  INVENTORY_VIEW: 'inventory.view',
  TRANSACTIONS_VIEW: 'finance.transactions.view',
  KASSA_VIEW: 'finance.kassa.view',
  EMPLOYEES_VIEW: 'employees.view',
  CHAT_VIEW: 'chat.view',
  REPORTS_VIEW: 'reports.view',
  SETTINGS_VIEW: 'settings.view',
} as const;

export type AppCapability = typeof APP_CAPABILITIES[keyof typeof APP_CAPABILITIES];

type CapabilityActor = {
  role?: unknown;
  firmRole?: unknown;
};

const C = APP_CAPABILITIES;
const ALL_CAPABILITIES = Object.values(C);
const ADMIN_CAPABILITIES: AppCapability[] = [
  C.DASHBOARD_VIEW,
  C.ORGANIZATIONS_VIEW,
  C.FLIGHTS_VIEW,
  C.TOURS_VIEW,
  C.SERVICES_VIEW,
  C.INVENTORY_VIEW,
  C.TRANSACTIONS_VIEW,
  C.KASSA_VIEW,
  C.EMPLOYEES_VIEW,
  C.CHAT_VIEW,
  C.REPORTS_VIEW,
  C.SETTINGS_VIEW,
];
const FIRM_ADMIN_CAPABILITIES = [...ADMIN_CAPABILITIES];
const FIRM_MANAGER_CAPABILITIES: AppCapability[] = [
  C.DASHBOARD_VIEW,
  C.FLIGHTS_VIEW,
  C.TOURS_VIEW,
  C.SERVICES_VIEW,
  C.INVENTORY_VIEW,
  C.TRANSACTIONS_VIEW,
  C.KASSA_VIEW,
  C.CHAT_VIEW,
  C.REPORTS_VIEW,
  C.SETTINGS_VIEW,
];

export function resolveAppCapabilities(actor: CapabilityActor): AppCapability[] {
  const role = String(actor.role || '').trim().toUpperCase();
  if (role === 'SUPERADMIN') return [...ALL_CAPABILITIES];
  if (role === 'ADMIN') return [...ADMIN_CAPABILITIES];
  if (role !== 'FIRM') return [];

  const firmRole = String(actor.firmRole || 'MANAGER').trim().toUpperCase();
  if (firmRole === 'FIRM_ADMIN') return [...FIRM_ADMIN_CAPABILITIES];
  if (firmRole === 'KASSIR' || firmRole === 'KASSA' || firmRole === 'CASHIER') {
    return [C.KASSA_VIEW, C.CHAT_VIEW, C.SETTINGS_VIEW];
  }
  if (firmRole === 'OMBOR_MUDIRI' || firmRole === 'OMBORCHI') return [C.INVENTORY_VIEW];
  return [...FIRM_MANAGER_CAPABILITIES];
}
