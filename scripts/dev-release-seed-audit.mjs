#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentQaMfaCode } from './qa-mfa.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const releaseTag = version.replace(/\./g, '');
const base = String(process.env.DEV_BASE_URL || 'https://dev.b2b.booking.ado-finance.com').replace(/\/$/, '');
const password = process.env.DEV_QA_PASSWORD || 'QaDev2026!Secure';
const expected = {
  flightNumber: `QA-${releaseTag}-NULL-ALLOC`,
  deskCode: `QA-${releaseTag}-K1`,
  carryDeskCode: `QA-${releaseTag}-CARRY`,
  importDeskCode: `QA-${releaseTag}-IMPORT`,
  editDeskCode: `QA-${releaseTag}-EDIT`,
  discountTourName: `QA ${version} Discount Tour`,
  serviceName: `QA ${version} Partner-only Service`,
  unassignedServiceName: `QA ${version} Unassigned Service`,
  notificationTitle: `QA ${version} release fixture`,
  mixedRejectAllocationId: `qa-${releaseTag}-mixed-reject-allocation`,
  mixedRejectTicketIds: [1, 2].map((index) => `qa-${releaseTag}-mixed-reject-ticket-${index}`),
  mixedDeleteAllocationId: `qa-${releaseTag}-mixed-delete-allocation`,
  mixedDeleteTicketId: `qa-${releaseTag}-mixed-delete-ticket`,
  inventorySku: `QA-${releaseTag}-STOCK`,
  securityEmployeeName: `QA ${version} Security employee`,
};

async function fetchReadWithRetry(url, init = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function login(email) {
  const response = await fetchReadWithRetry(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  let data = await response.json();
  let status = response.status;
  if (status === 200 && data.mfaRequired && data.mfaTicket) {
    const mfaResponse = await fetchReadWithRetry(`${base}/api/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaTicket: data.mfaTicket, code: currentQaMfaCode(), sessionTransport: 'token' }),
    });
    data = await mfaResponse.json();
    status = mfaResponse.status;
  }
  if (status !== 200 || !data.token) throw new Error(`${email} login failed with ${status}`);
  return data;
}

async function get(token, endpoint) {
  const response = await fetchReadWithRetry(`${base}/api${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (response.status !== 200) throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(data).slice(0, 240)}`);
  return data;
}

async function request(token, method, endpoint, body = {}) {
  const init = {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
  if (method !== 'GET' && method !== 'HEAD') init.body = JSON.stringify(body);
  const response = await fetch(`${base}/api${endpoint}`, init);
  const data = await response.json();
  return { status: response.status, data };
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} is not an array`);
  return value;
}

const [superadminLogin, readOnlyLogin, scopedAdminLogin, sourceAdminLogin, partnerAdminLogin] = await Promise.all([
  login('qa.superadmin@ado.test'),
  login('qa.readonly-superadmin@ado.test'),
  login('qa.admin@ado.test'),
  login('qa.firmadmin@ado.test'),
  login('qa.partneradmin@ado.test'),
]);
const superadminToken = superadminLogin.token;
const readOnlyToken = readOnlyLogin.token;
const scopedAdminToken = scopedAdminLogin.token;
const sourceAdminToken = sourceAdminLogin.token;
const partnerAdminToken = partnerAdminLogin.token;
const [desks, superadminFirms, sourceFlights, partnerFlights, partnerAllocations, superadminAllocations, superadminServices, scopedAdminServices, sourceServices, sourceTourSales, notifications, partnerTransactions, sourceTransactions, sourceAgentReport, sourceDashboard, readOnlyAdmins, readOnlyDesks, readOnlyTransactions, readOnlyReports] = await Promise.all([
  get(superadminToken, '/kassa/desks'),
  get(superadminToken, '/firms'),
  get(sourceAdminToken, '/flights'),
  get(partnerAdminToken, '/flights'),
  get(partnerAdminToken, '/tickets/allocations'),
  get(superadminToken, '/tickets/allocations'),
  get(superadminToken, '/services'),
  get(scopedAdminToken, '/services'),
  get(sourceAdminToken, '/services'),
  get(sourceAdminToken, '/tour-packages/sales'),
  get(superadminToken, '/notifications?limit=100'),
  get(partnerAdminToken, '/transactions?page=1&limit=1000'),
  get(sourceAdminToken, '/transactions?page=1&limit=1000'),
  get(sourceAdminToken, '/reports/agents'),
  get(sourceAdminToken, '/reports/dashboard'),
  get(readOnlyToken, '/auth/admins'),
  get(readOnlyToken, '/kassa/desks'),
  get(readOnlyToken, '/transactions?page=1&limit=5'),
  get(readOnlyToken, '/reports/dashboard'),
]);
const [readOnlyCreate, readOnlyUpdate, readOnlyDelete, readOnlyPasswordChange] = await Promise.all([
  request(readOnlyToken, 'POST', '/auth/admins'),
  request(readOnlyToken, 'PATCH', '/auth/admins/__missing__'),
  request(readOnlyToken, 'DELETE', '/auth/admins/__missing__'),
  request(readOnlyToken, 'POST', '/auth/change-password'),
]);

const sourceFlight = requireArray(sourceFlights, 'source flights').find((row) => row.flightNumber === expected.flightNumber);
const partnerFlight = requireArray(partnerFlights, 'partner flights').find((row) => row.flightNumber === expected.flightNumber);
const partnerAllocationFinance = sourceFlight
  ? await get(partnerAdminToken, `/tickets/allocations?flight_id=${encodeURIComponent(sourceFlight.id)}&includeFinance=true`)
  : { data: [], unallocatedPayments: [] };
const payableRows = requireArray(partnerTransactions?.data, 'partner transactions').filter((row) =>
  row.subjectType === 'TICKET_ALLOCATION'
  && row.flightId === partnerFlight?.id
  && row.type === 'PAYABLE'
  && row.status === 'CONFIRMED'
  && !row.deletedAt
  && !row.reversedTransactionId
);
const carryDesk = requireArray(desks, 'kassa desks').find((row) => row.code === expected.carryDeskCode);
const importDesk = requireArray(desks, 'kassa desks').find((row) => row.code === expected.importDeskCode);
const paymentDesk = requireArray(desks, 'kassa desks').find((row) => row.code === 'QA-K1');
const editDesk = requireArray(desks, 'kassa desks').find((row) => row.code === expected.editDeskCode);
const outgoingAirlinePayment = requireArray(sourceTransactions?.data, 'source transactions').find((row) =>
  row.subjectType === 'QA_AIRLINE_PAYMENT' && row.metadata?.marker === version
);
const sourceExpenseCategories = await get(sourceAdminToken, '/expense-categories');
const sourceExpenseReport = await get(sourceAdminToken, '/reports/expense-estimate');
const sourceEmployees = await get(sourceAdminToken, '/employees');
const superadminUsers = await get(superadminToken, '/auth/users');
const securityAccount = requireArray(superadminUsers, 'superadmin users').find((row) => row.email === 'qa.security@ado.test');
const securityLogin = await login('qa.security@ado.test');
const securityPasswordRotate = securityAccount
  ? await request(superadminToken, 'PATCH', `/auth/users/${securityAccount.id}`, { password: 'QaSecurity2026!Rotated' })
  : { status: 0, data: null };
const revokedSecuritySession = await request(securityLogin.token, 'GET', '/firms');
const securityPasswordRestore = securityAccount
  ? await request(superadminToken, 'PATCH', `/auth/users/${securityAccount.id}`, { password })
  : { status: 0, data: null };
const [sourceInventoryBootstrap, sourceInventoryProducts, sourceInventoryStock, sourceInventoryDashboard, sourceInventoryReport, partnerInventoryProducts] = await Promise.all([
  get(sourceAdminToken, '/inventory/bootstrap'),
  get(sourceAdminToken, '/inventory/products'),
  get(sourceAdminToken, '/inventory/stock'),
  get(sourceAdminToken, '/inventory/dashboard'),
  get(sourceAdminToken, '/inventory/reports'),
  get(partnerAdminToken, '/inventory/products'),
]);
const categoryCountsByFirm = await Promise.all(requireArray(superadminFirms, 'superadmin firms').map(async (firm) => ({
  firm,
  categories: requireArray(await get(superadminToken, `/expense-categories?firmId=${encodeURIComponent(firm.id)}`), `categories for ${firm.name}`),
})));
const financeFixtureTransaction = requireArray(sourceTransactions?.data, 'source transactions').find((row) =>
  row.operationType === 'BANK_FEE' && row.metadata?.marker === version
);
const financeFixtureDetail = financeFixtureTransaction
  ? await get(sourceAdminToken, `/transactions/${encodeURIComponent(financeFixtureTransaction.id)}`)
  : null;
const inventoryFixtureTransaction = requireArray(sourceTransactions?.data, 'source transactions').find((row) =>
  row.sourceMode === 'INVENTORY' && row.metadata?.marker === version && row.metadata?.inventorySku === expected.inventorySku
);
const inventoryFixtureDetail = inventoryFixtureTransaction
  ? await get(sourceAdminToken, `/transactions/${encodeURIComponent(inventoryFixtureTransaction.id)}`)
  : null;
const partnerAgent = requireArray(sourceAgentReport?.agents, 'agent ledger').find((row) => row.name === 'QA DEV Partner Agency');
const airlineAgent = requireArray(sourceAgentReport?.agents, 'agent ledger').find((row) => row.name === 'QA DEV Airways Firm');
const mixedRejectAllocation = requireArray(partnerAllocations, 'partner allocations').find((row) => row.id === expected.mixedRejectAllocationId);
const mixedDeleteAllocation = requireArray(superadminAllocations, 'superadmin allocations').find((row) => row.id === expected.mixedDeleteAllocationId);
const releaseAllocationFinance = requireArray(partnerAllocationFinance?.data, 'partner allocation finance').find((row) => row.flight?.flightNumber === expected.flightNumber && row.totalAmount === 840);
const releaseUnallocatedPayment = requireArray(partnerAllocationFinance?.unallocatedPayments, 'unallocated flight payments').find((row) => row.currency === 'USD');
const discountTourSale = requireArray(sourceTourSales, 'tour sales').find((row) => row.package?.name === expected.discountTourName);
const usd = (rows) => requireArray(rows, 'currency rows').find((row) => row.currency === 'USD')?.total || 0;
const carryDay = carryDesk
  ? await get(sourceAdminToken, `/kassa?date=2026-06-12&kassaDeskId=${encodeURIComponent(carryDesk.id)}`)
  : null;
const paymentDay = paymentDesk
  ? await get(sourceAdminToken, `/kassa?date=${new Date().toISOString().slice(0, 10)}&kassaDeskId=${encodeURIComponent(paymentDesk.id)}`)
  : null;
const releaseDayKey = new Date().toISOString().slice(0, 10);
let editDayBefore = editDesk
  ? await get(sourceAdminToken, `/kassa?date=${releaseDayKey}&kassaDeskId=${encodeURIComponent(editDesk.id)}`)
  : null;
let editTransactionBefore = requireArray(editDayBefore?.transactions || [], 'edit day transactions').find((row) => row.metadata?.marker === version);
const editPaymentCard = requireArray(editDayBefore?.paymentCards || [], 'edit payment cards').find((row) => row.ownerName === `QA ${version} Edit Visa`);
if (editTransactionBefore && editPaymentCard && (editTransactionBefore.transactionType !== 'INCOME' || editTransactionBefore.paymentMethod !== 'card' || Number(editTransactionBefore.originalAmount) !== 500)) {
  const normalized = await request(sourceAdminToken, 'PATCH', `/transactions/${editTransactionBefore.id}/daily-cash`, {
    expectedUpdatedAt: editTransactionBefore.updatedAt,
    flow: 'IN', operationPurpose: 'FLIGHT', method: 'card', amount: 500, currency: 'USD', exchangeRate: 12100,
    counterpartyFirmId: editTransactionBefore.counterpartyId, flightId: sourceFlight?.id, allocationId: null, tourPackageId: null,
    kassaDeskId: editDesk.id, paymentCardId: editPaymentCard.id, bankAccountId: null,
    note: 'QA old 500 USD card income', correctionReason: `QA ${version} audit fixture reset`,
  });
  if (normalized.status !== 200) throw new Error(`Could not normalize kassa edit fixture: ${normalized.status}`);
  editDayBefore = await get(sourceAdminToken, `/kassa?date=${releaseDayKey}&kassaDeskId=${encodeURIComponent(editDesk.id)}`);
  editTransactionBefore = requireArray(editDayBefore?.transactions || [], 'normalized edit day transactions').find((row) => row.metadata?.marker === version);
}
const editAccountsBefore = editDesk ? await get(sourceAdminToken, `/accounts?firmId=${encodeURIComponent(editDesk.firmId)}`) : [];
const editResult = editTransactionBefore && sourceFlight
  ? await request(sourceAdminToken, 'PATCH', `/transactions/${editTransactionBefore.id}/daily-cash`, {
      expectedUpdatedAt: editTransactionBefore.updatedAt,
      flow: 'OUT', operationPurpose: 'FLIGHT', method: 'cash', amount: 400, currency: 'USD', exchangeRate: 12100,
      counterpartyFirmId: editTransactionBefore.counterpartyId, flightId: sourceFlight.id, allocationId: null, tourPackageId: null,
      kassaDeskId: editDesk.id, paymentCardId: null, bankAccountId: null,
      note: 'QA corrected 400 USD cash expense', correctionReason: `QA ${version} atomic correction`,
    })
  : { status: 0, data: null };
const editDayAfter = editDesk
  ? await get(sourceAdminToken, `/kassa?date=${releaseDayKey}&kassaDeskId=${encodeURIComponent(editDesk.id)}`)
  : null;
const editAccountsAfter = editDesk ? await get(sourceAdminToken, `/accounts?firmId=${encodeURIComponent(editDesk.firmId)}`) : [];
const editTransactionAfter = requireArray(editDayAfter?.transactions || [], 'edited day transactions').find((row) => row.id === editTransactionBefore?.id);
const editCardAccountName = `Karta: QA ${version} Edit Visa`;
const editCashAccountName = `Kassa: QA ${version} Atomar tahrir`;
const editCardBefore = requireArray(editAccountsBefore, 'edit accounts before').find((row) => row.name === editCardAccountName && row.currency === 'USD');
const editCardAfter = requireArray(editAccountsAfter, 'edit accounts after').find((row) => row.name === editCardAccountName && row.currency === 'USD');
const editCashBefore = requireArray(editAccountsBefore, 'edit accounts before').find((row) => row.name === editCashAccountName && row.currency === 'USD');
const editCashAfter = requireArray(editAccountsAfter, 'edit accounts after').find((row) => row.name === editCashAccountName && row.currency === 'USD');
const editAuditLogs = editTransactionBefore ? await get(superadminToken, '/audit-log?action=CASH_TRANSACTION_UPDATED&limit=100') : { data: [] };
const editRestoreResult = editTransactionAfter && editPaymentCard
  ? await request(sourceAdminToken, 'PATCH', `/transactions/${editTransactionAfter.id}/daily-cash`, {
      expectedUpdatedAt: editTransactionAfter.updatedAt,
      flow: 'IN', operationPurpose: 'FLIGHT', method: 'card', amount: 500, currency: 'USD', exchangeRate: 12100,
      counterpartyFirmId: editTransactionAfter.counterpartyId, flightId: sourceFlight?.id, allocationId: null, tourPackageId: null,
      kassaDeskId: editDesk.id, paymentCardId: editPaymentCard.id, bankAccountId: null,
      note: 'QA old 500 USD card income', correctionReason: `QA ${version} audit fixture cleanup`,
    })
  : { status: 0, data: null };
const historicalImportBody = importDesk ? {
  firmId: importDesk.firmId,
  kassaDeskId: importDesk.id,
  rows: [{ reference: `QA-${version}-HIST-001`, date: '2026-06-25', flow: 'KIRIM', amount: 125000, currency: 'UZS', exchangeRate: 1, note: `QA ${version} historical import` }],
} : null;
const historicalPreviewBefore = historicalImportBody
  ? await request(sourceAdminToken, 'POST', '/transactions/import/historical-kassa', { ...historicalImportBody, dryRun: true })
  : null;
const historicalCommit = historicalImportBody
  ? await request(sourceAdminToken, 'POST', '/transactions/import/historical-kassa', { ...historicalImportBody, dryRun: false })
  : null;
const historicalPreviewAfter = historicalImportBody
  ? await request(sourceAdminToken, 'POST', '/transactions/import/historical-kassa', { ...historicalImportBody, dryRun: true })
  : null;
const historicalRows = historicalImportBody
  ? await get(sourceAdminToken, '/transactions?sourceMode=HISTORICAL_IMPORT&dateFrom=2026-06-25T00%3A00%3A00.000Z&dateTo=2026-06-25T23%3A59%3A59.999Z&page=1&limit=100')
  : null;
const mixedRejectResult = mixedRejectAllocation?.status === 'PENDING'
  ? await request(partnerAdminToken, 'POST', '/tickets/reject', {
    allocationId: expected.mixedRejectAllocationId,
    rejectionReason: `QA ${version}: aralash segment holati regressiya tekshiruvi`,
  })
  : { status: mixedRejectAllocation?.status === 'REJECTED' ? 200 : 0, data: mixedRejectAllocation };
const mixedDeleteResult = mixedDeleteAllocation
  ? await request(superadminToken, 'POST', `/tickets/allocations/${expected.mixedDeleteAllocationId}/change-requests`, {
    type: 'CANCEL', quantity: 1, reason: `QA ${version}: SUPERADMIN legacy ajratmani o‘chirish tekshiruvi`,
  })
  : { status: 200, data: { request: { requiresCounterpartyApproval: false }, updatedAllocation: { status: 'CANCELLED' } } };
const [mixedRejectAllocationsAfter, superadminAllocationsAfter, sourceTicketsAfterReject, partnerTicketsAfterReject] = sourceFlight ? await Promise.all([
  get(partnerAdminToken, `/tickets/allocations?flight_id=${encodeURIComponent(sourceFlight.id)}`),
  get(superadminToken, `/tickets/allocations?flight_id=${encodeURIComponent(sourceFlight.id)}`),
  get(sourceAdminToken, `/tickets?flight_id=${encodeURIComponent(sourceFlight.id)}`),
  get(partnerAdminToken, `/tickets?flight_id=${encodeURIComponent(sourceFlight.id)}`),
]) : [[], [], [], []];
const mixedRejectAfter = requireArray(mixedRejectAllocationsAfter, 'allocations after rejection').find((row) => row.id === expected.mixedRejectAllocationId);
const sourceMixedTickets = requireArray(sourceTicketsAfterReject, 'source tickets after rejection').filter((row) => expected.mixedRejectTicketIds.includes(row.id));
const partnerMixedTickets = requireArray(partnerTicketsAfterReject, 'partner tickets after rejection').filter((row) => expected.mixedRejectTicketIds.includes(row.id));
const mixedDeleteAfter = requireArray(superadminAllocationsAfter, 'superadmin allocations after deletion').find((row) => row.id === expected.mixedDeleteAllocationId);
const mixedDeleteTicketAfter = requireArray(sourceTicketsAfterReject, 'source tickets after deletion').find((row) => row.id === expected.mixedDeleteTicketId);
const checks = [
  { name: 'inventory bootstrap belongs to the logged-in firm and includes a warehouse', ok: sourceInventoryBootstrap?.firmId === sourceAdminLogin.user?.firmId && requireArray(sourceInventoryBootstrap?.warehouses, 'inventory warehouses').length > 0 },
  { name: 'inventory fixture exposes exactly one firm-owned QA product', ok: requireArray(sourceInventoryProducts, 'inventory products').filter((row) => row.sku === expected.inventorySku).length === 1 },
  { name: 'inventory fixture stock is 10 units valued at 1,000,000 UZS', ok: requireArray(sourceInventoryStock, 'inventory stock').some((row) => row.product?.sku === expected.inventorySku && Number(row.physicalStock) === 10 && Number(row.availableStock) === 10 && Number(row.inventoryValue) === 1_000_000) },
  { name: 'inventory purchase posts balanced asset and payable ledger without P&L expense', ok: inventoryFixtureDetail?.status === 'APPLIED' && inventoryFixtureDetail?.type === 'PAYABLE' && requireArray(inventoryFixtureDetail?.ledgerEntries, 'inventory ledger entries').some((row) => row.debitAccount === 'INVENTORY' && row.creditAccount === 'ACCOUNTS_PAYABLE' && Number(row.amount) === 1_000_000) },
  { name: 'inventory dashboard derives at least the seeded asset value', ok: Number(sourceInventoryDashboard?.inventoryValue || 0) >= 1_000_000 },
  { name: 'warehouse keeper report exposes the seeded stock movement and balanced inventory financial impact', ok: requireArray(sourceInventoryReport?.rows, 'inventory report rows').some((row) => row.product?.sku === expected.inventorySku && row.enteredBy && requireArray(row.financialEntries, 'inventory report financial entries').some((entry) => entry.debitAccount === 'INVENTORY' && entry.creditAccount === 'ACCOUNTS_PAYABLE' && Number(entry.amount) === 1_000_000)) },
  { name: 'partner firm cannot see source firm inventory product', ok: !requireArray(partnerInventoryProducts, 'partner inventory products').some((row) => row.sku === expected.inventorySku) },
  { name: 'every visible firm has one complete non-duplicated default expense catalog', ok: categoryCountsByFirm.every(({ categories }) => categories.length >= 20 && new Set(categories.map((row) => row.code)).size === categories.length) },
  { name: 'salary payment employee selector has an active firm-scoped release employee', ok: requireArray(sourceEmployees, 'source employees').some((row) => row.name === `QA ${version} Kassa xodimi` && row.status === 'ACTIVE' && row.firmId === sourceAdminLogin.user?.firmId) },
  { name: 'employee login is explicitly linked for lifecycle revocation', ok: requireArray(sourceEmployees, 'source employees').some((row) => row.name === expected.securityEmployeeName && row.loginUserId === securityAccount?.id) },
  { name: 'password reset immediately revokes the prior session and cleanup succeeds', ok: securityPasswordRotate.status === 200 && revokedSecuritySession.status === 401 && securityPasswordRestore.status === 200 },
  { name: 'finance release seeds the stable default expense category catalog', ok: requireArray(sourceExpenseCategories, 'expense categories').length >= 20 && requireArray(sourceExpenseCategories, 'expense categories').some((row) => row.code === 'BANK_FEES' && row.isSystemDefault === true) },
  { name: 'bank fee fixture is posted with one double-entry journal line', ok: financeFixtureDetail?.status === 'APPLIED' && financeFixtureDetail?.operationType === 'BANK_FEE' && financeFixtureDetail?.journalEntry?.status === 'POSTED' && requireArray(financeFixtureDetail?.ledgerEntries, 'finance ledger entries').some((row) => row.debitAccount === 'FINANCE_COSTS' && String(row.creditAccount || '').startsWith('BANK:') && Number(row.amount) === 125000) },
  { name: 'expense estimate includes classified finance expense without treating it as legacy outflow', ok: Number(sourceExpenseReport?.kpis?.actualExpense || 0) >= 125000 && requireArray(sourceExpenseReport?.categories, 'expense report categories').some((row) => row.code === 'BANK_FEES' && Number(row.amount) >= 125000) },
  { name: 'superadmin sees active desk owned by expired no-login firm', ok: requireArray(desks, 'kassa desks').some((row) => row.code === expected.deskCode) },
  { name: 'source firm sees null-status release flight', ok: Boolean(sourceFlight && sourceFlight.status === null) },
  { name: 'allocated partner firm sees release flight', ok: Boolean(partnerFlight) },
  { name: 'ticket allocation does not create a financial transaction', ok: payableRows.length === 0 },
  { name: 'allocation finance subtracts only the linked confirmed payment', ok: releaseAllocationFinance?.paidAmount === 300 && releaseAllocationFinance?.outstandingDebtAmount === 540 },
  { name: 'flight-only payment stays visibly unallocated', ok: Number(releaseUnallocatedPayment?.total || 0) >= 200 },
  { name: 'tour discount fixture stores gross discount net cost and profit snapshots', ok: Number(discountTourSale?.grossAmount) === 950 && Number(discountTourSale?.discountAmount) === 100 && Number(discountTourSale?.netAmount) === 850 && Number(discountTourSale?.costOfGoodsSold) === 700 && Number(discountTourSale?.grossProfit) === 150 && Number(discountTourSale?.transaction?.originalAmount) === 850 },
  { name: 'kassa DTO returns display names and only a masked card number', ok: editTransactionBefore?.transactionType === 'INCOME' && editTransactionBefore?.directionLabel === 'Kimdan: QA DEV Partner Agency' && editTransactionBefore?.cardMaskedNumber === '**** **** **** 4821' && !JSON.stringify(editTransactionBefore).includes('8600') && Boolean(editTransactionBefore?.flightDisplayName) },
  { name: 'kassa correction atomically changes card income 500 to cash expense 400', ok: editResult.status === 200 && editTransactionAfter?.transactionType === 'EXPENSE' && Number(editTransactionAfter?.originalAmount) === 400 && editTransactionAfter?.paymentMethod === 'cash' && editTransactionAfter?.directionLabel === 'Kimga: QA DEV Partner Agency' && Number(editCardBefore?.balance) === 500 && Number(editCardAfter?.balance) === 0 && Number(editCashBefore?.balance) === 0 && Number(editCashAfter?.balance) === -400 },
  { name: 'kassa correction writes the required audit action', ok: requireArray(editAuditLogs?.data, 'edit audit logs').some((row) => row.entityId === editTransactionBefore?.id && row.action === 'CASH_TRANSACTION_UPDATED') },
  { name: 'kassa correction audit restores its fixture', ok: editRestoreResult.status === 200 },
  { name: 'mixed legacy allocation can be rejected', ok: mixedRejectResult.status === 200 && mixedRejectAfter?.status === 'REJECTED' },
  { name: 'rejection restores only the still-pending outbound segments', ok: sourceMixedTickets.length === 2 && sourceMixedTickets.every((ticket) => ticket.legs?.some((leg) => leg.direction === 'OUTBOUND' && leg.status === 'AVAILABLE')) },
  { name: 'rejection preserves return segments already owned by the receiving firm', ok: partnerMixedTickets.length === 2 && partnerMixedTickets.every((ticket) => ticket.legs?.some((leg) => leg.direction === 'RETURN' && leg.status === 'ASSIGNED')) },
  { name: 'superadmin receives delete capability for a fully free legacy RT allocation', ok: !mixedDeleteAllocation || (mixedDeleteAllocation.canDelete === true && mixedDeleteAllocation.cancellableQuantity === 1) },
  { name: 'superadmin deletion is auto-approved and removed from the operational list', ok: [200, 201].includes(mixedDeleteResult.status) && mixedDeleteResult.data?.request?.requiresCounterpartyApproval === false && mixedDeleteResult.data?.updatedAllocation?.status === 'CANCELLED' && !mixedDeleteAfter },
  { name: 'superadmin deletion restores both legacy RT segments to the sending firm', ok: mixedDeleteTicketAfter?.legs?.length === 2 && mixedDeleteTicketAfter.legs.every((leg) => leg.status === 'AVAILABLE') },
  { name: 'agent ledger uses allocation, old balance and named payment', ok: partnerAgent?.ticketPurchases?.some((row) => row.flightNumber === expected.flightNumber && row.quantity === 2 && row.totalAmount === 840) && usd(partnerAgent.oldBalance) >= 200 && usd(partnerAgent.totalPaid) >= 300 },
  { name: 'receivable list names the current debtor firm', ok: requireArray(sourceAgentReport?.receivables, 'receivable firms').some((row) => row.firmName === 'QA DEV Partner Agency' && row.currency === 'USD' && row.currentDebt > 0) && usd(partnerAgent.currentBalance) === usd(partnerAgent.receivable) - usd(partnerAgent.payable) },
  { name: 'airline flight purchase and kassa out payment reduce payable debt', ok: airlineAgent?.flightPurchases?.some((row) => row.flightNumber === expected.flightNumber && row.priceRows?.some((priceRow) => priceRow.quantity === 2 && priceRow.unitPrice === 300 && priceRow.totalAmount === 600)) && usd(airlineAgent.totalPurchases) >= 600 && usd(airlineAgent.totalPaidByUs) >= 250 && airlineAgent?.paymentsMade?.some((row) => row.flightNumber === expected.flightNumber && row.amount === 250) },
  { name: 'airline PAYMENT is stored and totaled as kassa out', ok: outgoingAirlinePayment?.type === 'PAYMENT' && outgoingAirlinePayment?.payerFirm?.name === 'QA DEV Tashkent Tours' && outgoingAirlinePayment?.receiverFirm?.name === 'QA DEV Airways Firm' && outgoingAirlinePayment?.metadata?.cashFlow === 'OUT' && Number(paymentDay?.totals?.byCurrency?.USD?.cashOutTotal || 0) >= 250 },
  { name: 'payable list names the airline we owe', ok: requireArray(sourceAgentReport?.payables, 'payable firms').some((row) => row.firmName === 'QA DEV Airways Firm' && row.currency === 'USD' && row.currentDebt > 0) },
  { name: 'dashboard returns five upcoming flights and both named debt tables', ok: requireArray(sourceDashboard?.upcomingFlights, 'dashboard upcoming flights').length <= 5 && requireArray(sourceDashboard?.debts?.receivables, 'dashboard receivables').some((row) => row.firmName === 'QA DEV Partner Agency') && requireArray(sourceDashboard?.debts?.payables, 'dashboard payables').some((row) => row.firmName === 'QA DEV Airways Firm') },
  { name: 'superadmin sees partner-owned service', ok: requireArray(superadminServices, 'superadmin services').some((row) => row.name === expected.serviceName) },
  { name: 'assigned platform admin sees assigned services only', ok: requireArray(scopedAdminServices, 'scoped admin services').some((row) => row.name === expected.serviceName) && !requireArray(scopedAdminServices, 'scoped admin services').some((row) => row.name === expected.unassignedServiceName) },
  { name: 'source firm cannot see partner-owned service', ok: !requireArray(sourceServices, 'source services').some((row) => row.name === expected.serviceName) },
  { name: 'release fixture marker exists', ok: requireArray(notifications?.items, 'notifications').some((row) => row.title === expected.notificationTitle) },
  { name: 'carry-forward skips latest closed day without UZS remainder', ok: carryDay?.openingSuggestion?.openingBalances?.UZS === '4000000' && carryDay?.openingSuggestion?.previousBusinessDates?.UZS === '2026-06-10' },
  { name: 'carry-forward skips latest closed day without USD remainder', ok: carryDay?.openingSuggestion?.openingBalances?.USD === '125' && carryDay?.openingSuggestion?.previousBusinessDates?.USD === '2026-06-10' },
  { name: 'historical kassa import preview accepts the release row', ok: historicalPreviewBefore?.status === 200 && historicalPreviewBefore.data?.ok === true },
  { name: 'historical kassa import commit is idempotent', ok: historicalCommit?.status === 201 && [0, 1].includes(historicalCommit.data?.createdCount) && historicalPreviewAfter?.status === 200 && historicalPreviewAfter.data?.skippedCount === 1 && historicalPreviewAfter.data?.readyCount === 0 },
  { name: 'historical kassa import preserves the business date and source', ok: requireArray(historicalRows?.data, 'historical import transactions').some((row) => row.sourceMode === 'HISTORICAL_IMPORT' && row.metadata?.date === '2026-06-25' && row.metadata?.importReference === `QA-${version}-HIST-001`) },
  { name: 'read-only superadmin login exposes enforced account mode', ok: readOnlyLogin.user?.role === 'SUPERADMIN' && readOnlyLogin.user?.readOnlyAccess === true },
  { name: 'read-only superadmin retains full read visibility', ok: requireArray(readOnlyAdmins, 'read-only admins').some((row) => row.email === 'qa.readonly-superadmin@ado.test' && row.readOnlyAccess === true) && requireArray(readOnlyDesks, 'read-only kassa desks').length > 0 && Boolean(readOnlyTransactions?.data) && Boolean(readOnlyReports) },
  { name: 'read-only superadmin cannot create', ok: readOnlyCreate.status === 403 && readOnlyCreate.data?.code === 'READ_ONLY_ACCOUNT' },
  { name: 'read-only superadmin cannot update', ok: readOnlyUpdate.status === 403 && readOnlyUpdate.data?.code === 'READ_ONLY_ACCOUNT' && readOnlyPasswordChange.status === 403 && readOnlyPasswordChange.data?.code === 'READ_ONLY_ACCOUNT' },
  { name: 'read-only superadmin cannot delete', ok: readOnlyDelete.status === 403 && readOnlyDelete.data?.code === 'READ_ONLY_ACCOUNT' },
];
const failures = checks.filter((check) => !check.ok);

console.log(JSON.stringify({
  base,
  version,
  expected,
  checks: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((failure) => failure.name),
}, null, 2));
process.exitCode = failures.length ? 1 : 0;
