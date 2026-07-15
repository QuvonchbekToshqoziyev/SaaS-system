# ADO B2B Workflow Documentation

Last updated: 2026-07-08

This document is the durable workflow map for `airline-b2b/`. Keep it updated whenever a page, API route, role permission, data model, financial state transition, deployment script, or operational process changes.

## Maintenance Contract

- Update this file in the same change as any workflow-affecting code change.
- Prefer current code over memory. Verify against:
  - `airline-b2b/client/src/app`
  - `airline-b2b/client/src/components/layout/DashboardLayout.tsx`
  - `airline-b2b/server/src/routes`
  - `airline-b2b/server/src/controllers`
  - `airline-b2b/server/src/services`
  - `airline-b2b/server/prisma/schema.prisma`
- Do not document desired behavior as current behavior. Mark planned behavior explicitly as `Planned`.
- Financial workflows must describe the transaction rows they create or reverse.
- Access-control workflows must name the allowed roles.
- Deployment workflow changes must also be checked against `FINAL_RELEASE_PLAN.md`.
- Business records are retained for migration/audit safety. User-facing deletes should soft-delete/archive records with status metadata instead of physically deleting rows.

## Product Summary

ADO B2B is a private airline operations platform for partner firms, flights, ticket inventory, sales, payments, kassa, tour packages, reports, employees, chat, and audit tracking.

There is no public registration. Users enter through:

- Initial bootstrap superadmin account.
- Admin-created firm invitation/account.
- Superadmin-created admin account.

## Role Model

Roles are stored as Prisma enum values and normalized at frontend/backend boundaries:

- `SUPERADMIN`: full system access, admin management, audit log, explicit correction actions, login page editor, all firms and financial views.
- `ADMIN`: operational role for assigned firms. Can manage flights, tickets, firms within access, payments, reports, kassa operations, employees, and some support workflows.
- `FIRM`: partner firm role. Can see firm-scoped data, confirm allocations, sell assigned tickets, request sale cancellation, create tour packages, sell owned tour packages, add partner firm records, manage employees for its firm, use kassa cash adjustment where allowed, and use chat.

Firm scoping is handled through:

- `User.firmId` for firm users.
- `UserFirmAccess` for admins.
- Firm users can also access partner firms their firm/user created through `Firm.createdByFirmId` or `Firm.createdByUserId`.
- Superadmin has global firm scope.

## Main Navigation

Dashboard navigation is defined in `DashboardLayout.tsx`.

### Task Launcher

The persistent `Yangi operatsiya` action asks what happened in business language
and routes the operator to the existing domain form instead of requiring them to
choose a module. It covers customer payment, tour sale, cash income, firm debt,
ticket sale, and daily kassa closing. Firm roles see only actions they are allowed
to perform; the destination forms retain their normal backend permission checks.

Firm users:

- Dashboard: `/firm`
- Firms: `/firms`
- Flights: `/flights`
- Tours: `/tours`
- Transactions: `/transactions`
- Kassa: `/kassa`
- Employees: `/employees`
- Chat: `/chat`
- Reports: `/reports`
- Settings: `/settings`

Admin and superadmin users:

- Admin Dashboard: `/admin`
- Admins: `/admins` for superadmin only
- Audit Log: `/audit-log` for superadmin only
- Firms: `/firms`
- Flights: `/flights`
- Tours: `/tours`
- Transactions: `/transactions`
- Kassa: `/kassa`
- Employees: `/employees`
- Chat: `/chat`
- Reports: `/reports`
- Settings: `/settings`

## Authentication And Account Flows

### Login

Frontend:

- Page: `/login`
- API: `POST /auth/login`

Flow:

1. User submits email and password.
2. Backend validates credentials with bcrypt.
3. Backend signs JWT with `userId`, `role`, and `firmId`.
4. Frontend stores `token` and normalized `user` in local storage.
5. Firm users redirect to `/firm`.
6. Admin and superadmin users redirect to `/admin`.

Failure states:

- Missing email/password: `400`.
- Invalid credentials: `401`.
- Missing `JWT_SECRET`: `500`.

### Logout

Frontend clears local `token` and `user`, then redirects to `/login`.

### Change Password

Frontend:

- Page: `/settings`
- API: `POST /auth/change-password`

Allowed roles:

- Any authenticated user.

Flow:

1. User enters current password, new password, and confirmation.
2. Backend verifies current password.
3. Backend hashes and saves new password.
4. Audit log records password change without storing the password.

### Admin Account Management

Frontend:

- Page: `/admins`
- API:
  - `GET /auth/admins`
  - `POST /auth/admins`
  - `PATCH /auth/admins/:id`
  - `DELETE /auth/admins/:id`
  - `GET /auth/users`
  - `PATCH /auth/users/:id`
  - `DELETE /auth/users/:id`
  - `PATCH /auth/users/:id/firm-access`

Allowed role:

- `SUPERADMIN`.

Actions:

- Create `ADMIN` or `SUPERADMIN`.
- Assign firm access to admins.
- Edit email, full name, phone, role, password, and firm access.
- Delete admin accounts.

Guards:

- Cannot delete own account.
- Cannot remove own superadmin role.
- Cannot delete or demote the last superadmin.
- Admin list excludes firm accounts.

Audit:

- Create, update, delete, and firm-access changes are logged.

Note:

- `/auth/admins` is the primary admin management surface.
- `/auth/users` supports broader user listing and superadmin user maintenance where used by operations pages.

### Invitation Acceptance

Frontend:

- Page: `/invite` and `/invite/accept`
- API:
  - `POST /invites`
  - `POST /invites/accept`

Invite creation allowed roles:

- `SUPERADMIN`, `ADMIN`.

Current behavior:

- Superadmin can create a new firm and firm login through invitation/account creation.
- Admin can invite firm users only when a target firm is supplied and accessible.
- Non-superadmin cannot create a new firm through `/invites`; direct firm record creation is handled through `POST /firms`.

Invite acceptance flow:

1. Recipient opens invite link with `id` and `token`.
2. Recipient sets password.
3. Backend verifies token hash, expiration, and unused state.
4. Backend creates user and marks invitation used.
5. If invitation has firm subscription date, firm is updated.
6. New user is logged in and routed by role.

## Firm Workflows

Frontend:

- Page: `/firms`
- API:
  - `GET /firms`
  - `POST /firms`
  - `GET /firms/:id`
  - `PATCH /firms/:id`
  - `DELETE /firms/:id`
  - `POST /invites` for superadmin invite/account flow

### List Firms

Allowed roles:

- `SUPERADMIN`, `ADMIN`, `FIRM`.

Scope:

- Superadmin sees all firms.
- Admin sees firms in `UserFirmAccess`.
- Firm sees own firm and firm records created by that firm/user.

List output includes:

- Firm identity and contact data.
- Subscription end date.
- Credit limit and currency.
- Status.
- Financial balance, debt, paid, outstanding, and credit derived from transactions.

### Superadmin Creates Firm With Account Or Invite

Flow:

1. Superadmin opens `/firms`.
2. Enters firm name, email, initial password, responsible person, phone, and subscription days.
3. Frontend calls `POST /invites` with role `FIRM`.
4. Backend creates firm if missing.
5. If initial password is supplied, backend creates firm user immediately and marks invite used.
6. Otherwise backend returns one-time invite link.

Result:

- New firm record.
- Firm user account or invitation.
- Optional invite modal with copy action.

### Admin Or Firm Adds Firm Record

Flow:

1. Admin or firm user opens `/firms`.
2. Enters firm name, responsible person, phone, and subscription days.
3. Frontend calls `POST /firms`.
4. Backend creates an `ACTIVE` firm record only.

Important difference:

- This does not create a login account.
- This does not create an invite link.
- It stores `createdByUserId`, `createdByFirmId`, and `createdByRole`.
- Admin-created firm records get `UserFirmAccess` for the creating admin.
- Firm-created firm records become visible to the creating firm through firm access scope.

Audit:

- Direct firm creation is logged.

### Edit Firm

Allowed roles:

- `SUPERADMIN`: can edit name, contact, phone, subscription end date, credit limit, currency, and status.
- `FIRM`: can edit own firm currency only.
- `ADMIN`: route allows the role, but controller currently only applies superadmin and firm edit paths; admin update attempts without accepted fields are rejected.

Audit:

- Firm updates are logged.

### Archive Firm

Allowed role:

- `SUPERADMIN`.

Flow:

1. Request goes through the firm-specific delete controller.
2. Firm status is set to `DELETED`.
3. `deletedAt` and `deletedByUserId` are stored.
4. Related financial rows remain in place for audit and migration safety.
5. Normal firm lists hide deleted firms.

Audit:

- Soft delete is logged with pre-delete record where available.

## Flight And Ticket Workflows

Frontend:

- Pages:
  - `/flights`
  - `/flights/detail?id=<flightId>`
- API:
  - `GET /flights`
  - `GET /flights/:id`
  - `POST /flights`
  - `PUT /flights/:id`
  - `DELETE /flights/:id`
  - `GET /tickets`
  - `POST /tickets`
  - `POST /tickets/allocate`
  - `POST /tickets/confirm`
  - `POST /tickets/deallocate`
  - `POST /tickets/sell`
  - `POST /tickets/cancel-sale`
  - `GET /tickets/cancel-sale-requests`
  - `POST /tickets/cancel-sale-requests`
  - `POST /tickets/cancel-sale-requests/approve`

### Flight List

Allowed roles:

- Authenticated users.

Scope:

- Firm users see their scoped flight/ticket context through backend filtering.
- Admin/superadmin see broader flight data.

Actions from list:

- Create flight.
- Edit flight number for superadmin.
- Delete/cancel flight for superadmin.
- Open flight detail.
- Open related transactions.
- Open related reports.

### Create Flight And Ticket Inventory

Allowed roles:

- `SUPERADMIN`, `ADMIN`.

Flow:

1. User creates flight with route, flight number, departure, optional arrival, currency, ticket count, and ticket price.
2. Backend creates flight.
3. Ticket inventory is created as `AVAILABLE` with base price and currency.

Guards:

- Cannot create tickets for cancelled flights.
- Ticket quantity must be positive.

### Ticket State Machine

Ticket statuses:

- `AVAILABLE`: unallocated ticket.
- `PENDING`: allocated by admin/superadmin, waiting for firm confirmation.
- `ASSIGNED`: confirmed by firm; payable debt exists.
- `SOLD`: sold to purchaser; sale revenue exists.
- `CANCELLED` and `REFUNDED`: schema states, limited direct UI workflow in current app.

State transitions:

- `AVAILABLE -> PENDING`: admin/superadmin allocation.
- `PENDING -> ASSIGNED`: firm confirms allocation; creates payable debt.
- `PENDING|ASSIGNED -> AVAILABLE`: admin/superadmin deallocates; assigned tickets create debt reversal.
- `ASSIGNED -> SOLD`: firm/admin/superadmin sells ticket; creates sale transaction.
- `SOLD -> ASSIGNED`: admin cancels sale or approves firm cancellation request; creates negative sale reversal.

### Allocate Tickets

Allowed roles:

- `SUPERADMIN`, `ADMIN`.

Modes:

- Single ticket allocation by `ticketId`.
- Batch allocation by `flightId` and `quantity`.

Flow:

1. User selects firm, ticket or quantity, and optional allocation price.
2. Backend locks available tickets.
3. Ticket status becomes `PENDING`.
4. `assignedFirmId` is set.
5. Optional override price updates ticket base price.

Guards:

- Flight must exist and not be cancelled.
- Firm must exist.
- Ticket must be `AVAILABLE`.
- Batch allocation fails if not enough tickets are available.

### Confirm Allocation

Allowed role:

- `FIRM`.

Modes:

- Single ticket confirmation by `ticketId`.
- Batch confirmation by `flightId` and `quantity`.

Flow:

1. Firm confirms pending allocation.
2. Backend validates ticket belongs to firm.
3. Ticket status becomes `ASSIGNED`.
4. Backend creates `Transaction` with type `PAYABLE`.
5. Transaction keeps the ticket currency as the original currency and stores exchange rate `1`.

Financial effect:

- Firm debt increases by the ticket amount in its original currency.

### Deallocate Tickets

Allowed roles:

- `SUPERADMIN`, `ADMIN`.

Modes:

- Single ticket deallocation by `ticketId`.
- Batch deallocation by `flightId`, `firmId`, and `quantity`.

Flow:

1. Backend locks allocated tickets.
2. Tickets return to `AVAILABLE`.
3. `assignedFirmId` is cleared.
4. If a ticket was `ASSIGNED`, backend creates negative `PAYABLE` transaction to reverse debt.

Guards:

- Sold tickets cannot be deallocated.
- Assigned deallocation requires an existing payable transaction.

### Sell Tickets

Allowed roles:

- `SUPERADMIN`, `ADMIN`, `FIRM`.

Modes:

- Single ticket sale by `ticketId`.
- Batch sale by `flightId`, `firmId`, and `quantity`.

Flow:

1. User enters sale price, sale currency, and purchaser info.
2. Backend validates purchaser name and ID number.
3. Ticket must be `ASSIGNED`.
4. Ticket becomes `SOLD`.
5. Sold price, sold currency, and purchaser info are stored.
6. Backend creates `SALE` transaction.

Financial effect:

- Firm revenue increases by sale amount in the selected sale currency.

### Admin Sale Cancellation

Allowed roles:

- `SUPERADMIN`, `ADMIN`.

Flow:

1. Admin submits ticket ID to `POST /tickets/cancel-sale`.
2. Ticket must be `SOLD`.
3. Backend finds latest positive `SALE` transaction.
4. Backend creates negative `SALE` transaction.
5. Ticket returns to `ASSIGNED`.
6. Sold fields and purchaser info are cleared.

### Firm Sale Cancellation Request

Allowed role:

- `FIRM`.

Flow:

1. Firm submits sold ticket and reason.
2. Backend validates ticket belongs to firm and is `SOLD`.
3. Backend prevents duplicate pending request for same ticket.
4. Backend creates `SaleCancellationRequest` with status `PENDING`.

### Approve Sale Cancellation Request

Allowed roles:

- `SUPERADMIN`, `ADMIN`.

Current API name:

- `POST /tickets/cancel-sale-requests/approve`

Flow:

1. Admin provides request ID and decision reason.
2. Request must be `PENDING`.
3. Ticket must still be `SOLD` and assigned to request firm.
4. Backend creates negative `SALE` transaction.
5. Ticket returns to `ASSIGNED`.
6. Request becomes `APPROVED`.

Note:

- Current route handles approval. A separate rejection endpoint is not present in the route map.

### Ticket Corrections

Tickets are not patched or deleted through a generic record endpoint. Allocation,
deallocation, sale cancellation, and cancellation-request approval are explicit
domain actions that preserve their linked financial effects and audit history.

## Transaction Workflows

Frontend:

- Pages:
  - `/transactions`
  - `/transactions/detail?id=<transactionId>`
- API:
  - `GET /transactions`
  - `GET /transactions/:id`
  - `POST /transactions`
  - `POST /transactions/cash`
  - `POST /transactions/account`
  - `PATCH /transactions/:id/daily-cash`
  - `DELETE /transactions/:id/daily-cash`
  - `DELETE /transactions/:id`
  - `POST /payments`

### List Transactions

Allowed roles:

- Authenticated users.

Scope:

- Superadmin sees all.
- Admin sees transactions involving accessible firms.
- Firm sees transactions involving its firm and created partner firm scope.

Filters:

- Date range.
- Firm.
- Flight.
- Type.
- Currency.
- Pagination.

### Directed Firm-To-Firm Transaction

Allowed roles:

- `SUPERADMIN`, `ADMIN`.

API:

- `POST /transactions`

Types allowed:

- `SALE`, `PAYMENT`, `REFUND`, `ADJUSTMENT`, `PAYABLE`.

Flow:

1. User selects payer firm, receiver firm, optional flight, type, amount, currency, and note.
2. Backend validates firms, flight, amount, and currency.
3. Backend keeps the transaction in the selected original currency and does not require exchange-rate conversion.
4. Backend creates transaction with direction `FIRM_TO_FIRM`.

Audit:

- Transaction creation is logged.

### Manual Kassa Cash/Card Transaction

Allowed roles:

- `SUPERADMIN`, `ADMIN`, `FIRM`.

API:

- `POST /transactions/cash`

Flow:

1. User chooses flow `IN` or `OUT`, firm, amount, currency, date, method, optional card, optional flight, and note.
2. Firm users are forced to their own firm.
3. Backend validates kassa is open for business date.
4. Backend validates card status and card currency for card movement.
5. Backend creates `ADJUSTMENT` transaction in the selected original currency.

Direction:

- `KASSA_IN` for inflow.
- `KASSA_OUT` for outflow.

Financial effect:

- Inflow increases kassa totals.
- Outflow decreases kassa totals.

Audit:

- Transaction creation is logged.

### Payment Recording

Allowed roles:

- `SUPERADMIN`, `ADMIN`.

API:

- `POST /payments`

Flow:

1. User selects firm, amount, currency, method, metadata date, optional flight, and optional card.
2. Backend validates firm access.
3. Cash payments require date in metadata.
4. Card payments require active card with matching currency.
5. Backend requires kassa to be open for payment date.
6. Backend creates `PAYMENT` transaction with direction `FIRM_TO_PLATFORM` in the selected original currency.

Currency behavior:

- Payment forms default to the selected firm's default currency.
- Card payments default to and require the selected card currency.
- Payments and manual kassa movements do not require exchange rates.
- Reports and transaction tables should show the original amount and currency for these flows.

Financial effect:

- Firm paid amount increases.
- Outstanding debt decreases in reports.

### Payment Corrections

Payments are immutable after creation. A correction must use a dedicated reversal
or adjustment action; no generic payment PATCH or DELETE route is exposed.

### Transaction Detail

Frontend:

- `/transactions/detail?id=<transactionId>`

Flow:

1. Frontend loads `GET /transactions/:id`.
2. Backend enforces firm scope.
3. Page shows firm, flight, ticket, payer/receiver, amounts, method, metadata, and timestamps.

### Transaction Corrections

Daily-cash rows have explicit update/delete actions with ownership checks and a
required correction reason for non-creators. Other supported transaction removal
uses the transaction-specific delete controller and audit trail; arbitrary field
patching is not exposed.

## Kassa Workflows

Frontend:

- Page: `/kassa`
- API:
  - `GET /kassa`
  - `GET /kassa/history`
  - `GET /kassa/cards`
  - `POST /kassa/cards`
  - `POST /kassa/open`
  - `POST /kassa/close`
  - `POST /kassa/reopen`
  - `POST /transactions/cash`
  - `POST /payments`

### View Kassa Day

Allowed roles:

- Authenticated users.

Scope:

- Superadmin sees all.
- Admin sees accessible firms.
- Firm sees scoped firm data.

Output:

- Business date.
- Kassa status: `NOT_OPEN`, `OPEN`, or `CLOSED`.
- Opening/closing balances.
- Expected cash and variance.
- Daily cash/card in/out totals.
- Payment count, sale total, payable total, transaction count.
- Card summaries and transactions.

### Open Kassa

Allowed roles:

- `SUPERADMIN`, `ADMIN`.

Flow:

1. User selects business date and opening cash balance.
2. Backend creates a `KassaDay` row if the date does not already exist.
3. Existing open day is rejected.
4. Existing closed day is not opened through this route.

Audit:

- Kassa open is logged.

### Close Kassa

Allowed roles:

- `SUPERADMIN`, `ADMIN`.

Flow:

1. User enters physical cash count and optional notes.
2. Backend computes expected cash from opening balance plus cash transactions.
3. Backend stores closing balance, expected cash, and variance.
4. Day status becomes `CLOSED`.

Audit:

- Kassa close is logged.

### Reopen Kassa

Allowed role:

- `SUPERADMIN`.

API:

- `POST /kassa/reopen`

Flow:

1. Superadmin selects a closed business date and optional reason.
2. Backend requires an existing closed `KassaDay`.
3. Day status changes back to `OPEN`.
4. Close-only fields are cleared: `closedAt`, `closedByUserId`, `closingBalance`, `expectedCash`, and `variance`.
5. Reopen reason is appended to kassa notes.
6. Existing transactions remain unchanged.

Audit:

- Kassa reopen is logged.

### Open Kassa

Allowed roles:

- `SUPERADMIN`, `ADMIN`.

Flow:

1. User selects business date and opening balance.
2. Backend validates no existing open/closed day for date.
3. Backend creates `KassaDay` with status `OPEN`.

Guards:

- Cannot reopen closed day.
- Cannot open same date twice.
- Opening balance cannot be negative.

Audit:

- Kassa open is logged.

### Close Kassa

Allowed roles:

- `SUPERADMIN`, `ADMIN`.

Flow:

1. User enters closing balance and optional notes.
2. Backend loads day transactions.
3. Backend computes expected cash: opening balance plus cash total.
4. Backend computes variance: closing balance minus expected cash.
5. Backend updates day to `CLOSED`.

Guards:

- Day must exist and be open.
- Closing balance cannot be negative.

Audit:

- Kassa close is logged.

### Payment Cards

Allowed roles:

- List: authenticated, scoped.
- Create: `SUPERADMIN`, `ADMIN`.

Flow:

1. User creates card with owner, number, currency, optional firm.
2. Backend validates currency is `UZS` or `USD`.
3. Admin must have access to selected firm.
4. Card is `ACTIVE`.

Audit:

- Card creation is logged.

## Tour Package Workflows

Frontend:

- Page: `/tours`
- API:
  - `GET /tour-packages`
  - `GET /tour-packages/firms`
  - `GET /tour-packages/sales`
  - `POST /tour-packages`
  - `POST /tour-packages/:id/sell`

### List Tour Packages

Allowed roles:

- Authenticated users.

Scope:

- Firm users see packages they own and active packages with available quantity.
- Admin/superadmin see packages according to route/controller behavior.

### Create Tour Package

Allowed role:

- `FIRM`.

Flow:

1. Firm selects allocated flight, package name, destination, quantity, ticket price, service price, currency, and optional notes.
2. Backend verifies firm owns at least one ticket allocated for the flight.
3. Unit price must equal ticket price plus service price.
4. Backend creates package with `quantity` and `availableQuantity`.

Audit:

- Package creation is logged.

### Sell Tour Package

Allowed roles:

- `SUPERADMIN`, `ADMIN`, `FIRM`.

Rules:

- Firm seller must own the package.
- Admin must have access to owner firm.
- Buyer and seller firms must differ.
- Package must be active and have enough available quantity.

Flow:

1. User chooses buyer firm, quantity, optional unit price override, exchange rate, and notes.
2. Backend creates `SALE` transaction with direction `FIRM_TO_FIRM`.
3. Backend creates `TourPackageSale`.
4. Backend decrements package `availableQuantity`.

Audit:

- Tour package sale is logged.

### Tour Package Corrections

Packages and sales are not patched or deleted through generic record routes.
Corrections that must restore inventory or reverse a linked transaction require a
dedicated domain action before they are exposed.

## Employee Workflows

Frontend:

- Page: `/employees`
- API:
  - `GET /employees`
  - `POST /employees`
  - `PATCH /employees/:id`
  - `DELETE /employees/:id`
  - `GET /auth/users`
  - `PATCH /auth/users/:id/firm-access`

Allowed roles:

- `SUPERADMIN`, `ADMIN`, `FIRM`.

Purpose:

- Employee records are operational tracking records for staff roles, salaries, firm ownership, and status.
- An employee does not need a website login account.
- Website access is managed separately through `User` accounts and admin firm access.
- Some key users use the website to manage and track other employees and business activity.

### List Employees

Scope:

- Superadmin sees all.
- Admin sees accessible firms and system-wide employees where allowed.
- Firm sees employees for scoped firm.

### Create Employee

Flow:

1. User enters name, role, salary, currency, firm, and status.
2. Firm users are forced to their own firm.
3. Non-superadmin must provide a firm.
4. Backend creates employee.

Audit:

- Employee creation is logged.

### Edit Employee Role Or Details

Flow:

1. User edits name, role, salary, currency, status, and optionally firm.
2. Backend checks firm access.
3. Firm users cannot move employee to another firm.
4. Backend updates employee.

Audit:

- Employee update is logged, including role edits.

### Archive Employee

Flow:

1. Backend verifies scope.
2. System-wide employees can be deleted only by superadmin.
3. Backend sets employee status to `DELETED` and stores deletion metadata.
4. Normal employee lists hide deleted employees.

Audit:

- Employee soft deletion is logged.

### Admin Firm Access From Employees Page

Allowed role:

- `SUPERADMIN`.

Flow:

1. Page loads admin users through `GET /auth/users`.
2. Superadmin toggles firm access for an admin.
3. Frontend calls `PATCH /auth/users/:id/firm-access`.
4. Backend replaces admin firm access list.

Audit:

- Firm access update is logged.

## Reports Workflows

Frontend:

- Page: `/reports`
- API:
  - `GET /reports/flight`
  - `GET /reports/firm`
  - `GET /reports/payments`
  - `GET /reports/transactions`
  - `GET /reports/interactions`
  - `GET /reports/monthly`
  - `GET /reports/calendar`
  - `GET /reports/dashboard`

### Flight Report

Inputs:

- Optional `flightId`.

Output:

- Flight metadata.
- Revenue, debt, paid, profit, outstanding.
- Ticket totals.
- Firm breakdown by tickets, debt, revenue, paid, outstanding, profit.

Firm scope:

- Firm users are restricted to own firm.

### Firm Report

Inputs:

- `firmId` for admin/superadmin.
- Firm users are forced to own firm.
- Optional date range.

Output:

- Debt, revenue, paid, outstanding, balance, credit, profit.
- Ticket totals.
- Transactions by type.
- Payments by method.
- Flight-level breakdown.

### Payments Report

Inputs:

- Firm, flight, currency, method, date range.

Output:

- Payment count and base amount total.
- Breakdown by payment method.
- Breakdown by currency.

### Transactions Report

Inputs:

- Firm, flight, type, currency, date range.

Output:

- Transaction count and base amount total.
- Breakdown by type.
- Breakdown by currency.

### Interactions Report

Allowed role:

- `SUPERADMIN`.

Purpose:

- Shows admin/superadmin interactions with firms based on invites and created transactions.

Output:

- Invites sent.
- Allocation/payable activity.
- Payments.
- Sales.
- Adjustments.

### Dashboard, Monthly, Calendar Reports

Purpose:

- Feed dashboard and calendar views with aggregate operational/financial activity.

## Settings Workflows

Frontend:

- Page: `/settings`
- API:
  - `POST /auth/change-password`
  - `GET /firms/:id`
  - `GET /firms`
  - `PATCH /firms/:id`
  - `GET /site-content/login-page`
  - `PUT /site-content/login-page`

### Theme And Language

Frontend-only:

- Theme stored in local storage.
- Language stored in local storage through `LanguageContext`.

### Password Change

See Authentication section.

### Default Firm Currency

Allowed roles:

- `SUPERADMIN`: can select any listed firm.
- `FIRM`: can update own firm currency.

Flow:

1. User selects firm/currency.
2. Frontend calls `PATCH /firms/:id`.
3. Backend applies allowed firm update path.

### Login Page Content Editor

Allowed role:

- `SUPERADMIN`.

Flow:

1. Superadmin loads current content with `GET /site-content/login-page`.
2. Edits localized text and placeholders.
3. Saves with `PUT /site-content/login-page`.
4. Login page uses updated content.

Audit:

- Site content update is logged.

Guard:

- Admin and firm users cannot save login page content.

## Chat Workflows

Frontend:

- Page: `/chat`
- API:
  - `GET /chat/conversations`
  - `POST /chat/conversations`
  - `GET /chat/users`
  - `GET /chat/firm-settings`
  - `PUT /chat/firm-settings`
  - `GET /chat/conversations/:conversationId/messages`
  - `POST /chat/conversations/:conversationId/messages`
  - `POST /chat/conversations/:conversationId/read`
  - `PATCH /chat/messages/:messageId`
  - `DELETE /chat/messages/:messageId`

Chat types:

- `PERSONAL`
- `DEPARTMENT`
- `BRANCH`
- `COMPANY`
- `SUPPORT`
- `AI`

Default conversations:

- Company chat `ADO-FINANCE`.
- Private AI Assistant chat for each user.
- Firm support chat for firm users.
- Firm branch chat for firm users.
- Accounting department chat for admins and superadmins.

### Create Conversation

Allowed roles:

- `SUPERADMIN`, `ADMIN`, `FIRM`.

Rules:

- Personal chat requires exactly two people.
- Branch/support require firm.
- Company/department creation is admin-only.
- AI chat is created automatically.
- Firm users can create chats with users in their own firm.
- Firm users can create chats with users in another customer firm only when superadmin enabled that firm-to-firm chat pair.

### Support Messages

Frontend:

- `/chat` has two sections for superadmin: `Messages` and `Settings`.
- Messages section includes support filters:
  - All.
  - To ADO-Superadmin: firm-originated support messages sent into ADO support.
  - To customer admins: support replies sent by ADO superadmin/customer admins.

Behavior:

- Firm support conversations are auto-created as `SUPPORT` chats per firm.
- Superadmin can see all support conversations.
- Admin sees support conversations for accessible firms.
- Firm users see their own firm's support conversation.

### Firm-To-Firm Chat Settings

Allowed role:

- `SUPERADMIN`.

API:

- `GET /chat/firm-settings`
- `PUT /chat/firm-settings`

Flow:

1. Superadmin opens `/chat` and selects `Settings`.
2. Superadmin selects two customer firms.
3. Saving enabled opens direct personal chat discovery/creation between users of those firms.
4. Saving disabled closes firm-to-firm personal chat discovery, creation, and firm-user access for that pair.
5. Existing messages remain as historical data for audit/retention, but closed firm pairs cannot continue that direct chat.

Audit:

- Firm-to-firm chat open/close is logged as `chatFirmPermission`.

### Send Message

Message kinds:

- `TEXT`
- `EMOJI`
- `FILE`
- `IMAGE`
- `PDF`
- `EXCEL`
- `VOICE`

Flow:

1. User opens conversation.
2. Frontend marks read.
3. User sends content and optional attachment metadata.
4. Backend enforces conversation access.
5. Backend creates message and updates conversation timestamp.
6. AI chat creates a placeholder assistant reply.

### Message Actions

Supported actions:

- Search messages.
- Reply.
- Forward.
- Edit own messages.
- Delete own messages.
- Admin/superadmin can delete messages.
- Read status via participant `lastReadAt`.

Current limitation:

- File/image/PDF/Excel/voice are stored as metadata/caption; binary file storage is not implemented.
- Typing/online are UI-level affordances, not socket-backed presence.

## Audit Log Workflow

Frontend:

- Page: `/audit-log`
- API:
  - `GET /audit-log`

Allowed role:

- `SUPERADMIN`.

Purpose:

- Show who changed or deleted important data.

Filters:

- Search.
- Action.
- Entity type.
- Pagination.

Logged actions include:

- Admin/user create, update, delete, firm-access changes.
- Password change.
- Firm create, update, delete.
- Employee create, update, delete.
- Transaction create, update, delete.
- Kassa open/close.
- Payment card create.
- Tour package create, sale, update, delete.
- Site content update.
- Maintenance update/delete.

Sensitive data handling:

- Audit helper redacts keys matching password, token, or secret.

## Error Logs Workflow

API:

- `GET /logs/errors`
- `POST /logs/errors/:id/resolve`

Purpose:

- List backend error registry entries.
- Mark errors as resolved.

Access:

- Routes are mounted under `/logs`; check route middleware before exposing in UI.

## Correction Workflow

API:

- Generic model-based maintenance routes are intentionally not exposed.

Behavior:

- Every correction route is tied to one domain action and its permission rules.
- Financial corrections preserve history through reversal, adjustment, cancellation,
  or a reasoned domain-specific soft delete.
- Arbitrary Prisma model names and arbitrary request-body fields are never accepted.
- Correction actions record the actor, reason, before/after state, and linked records
  where applicable.
- Same-day cash edits and removals require a correction reason even when the
  original creator performs the action.

## Financial Trust And Reconciliation

- Kassa displays inherited opening balance, daily cash/card movement by currency,
  expected/current balance, closing balance, and the users who opened and closed
  the session.
- Daily reconciliation can be exported to CSV/Excel or printed with signature
  lines for the cashier and reviewer.
- Transaction lists and exports show who entered each record.
- Audit Log includes a one-click `Kechadan beri o‘zgarishlar` filter and presents
  common actions/entities in operator-facing Uzbek rather than database names.
- PostgreSQL backup and disposable restore-test commands are maintained under
  `scripts/`; production scheduling requires explicit operations approval.

## Currency Rate Workflow

API:

- `GET /currency-rates`
- `POST /currency-rates`

Currency rates are immutable snapshots. Incorrect rates are superseded by a new
rate rather than edited or deleted.

## Data Templates And Exports

Settings provides downloadable Uzbek templates for firms, employees,
transactions, and tour packages. Users can download one formatted Excel workbook
with four sheets or a separate UTF-8 CSV template for each dataset.

The Firms, Employees, Transactions, and Tours pages export their currently loaded
rows as CSV or Excel. CSV downloads include a UTF-8 byte-order mark for Excel
compatibility, and text values that begin like spreadsheet formulas are escaped.

Allowed roles:

- List: authenticated users.
- Create: `SUPERADMIN`, `ADMIN`.
- Edit/delete: `SUPERADMIN`.

Usage:

- Ticket confirmation/sale and tour package flows may use rates where the current flow needs normalized accounting.
- Payments, directed manual transactions, and manual kassa movements keep the selected original currency and do not require exchange rates.

## Search Workflow

API:

- `GET /search`

Purpose:

- Global search endpoint for app-wide lookup.

## Data Model Map

Primary models:

- `User`: login identity, role, firm binding, admin firm access, audit/log relations.
- `Firm`: partner company, financial scope, created-by metadata.
- `UserFirmAccess`: admin access to firms.
- `Employee`: firm/system employee role and salary record.
- `Invitation`: one-time invite token and account bootstrap data.
- `Flight`: route, flight number, departure/arrival, settlement status.
- `Ticket`: flight ticket inventory and sale state.
- `CurrencyRate`: exchange rates.
- `SiteContent`: editable site/login content.
- `Transaction`: financial ledger-facing business event.
- `PaymentCard`: card account for card payments/movements.
- `TourPackage`: firm-owned package.
- `TourPackageSale`: package sale record.
- `LedgerEntry`: debit/credit accounting entry.
- `Payment`: older payment model retained in schema; current payment workflow primarily creates `Transaction`.
- `KassaDay`: daily kassa open/close record.
- `SaleCancellationRequest`: firm request to reverse a sale.
- `ChatConversation`, `ChatParticipant`, `ChatMessage`: messenger data.
- `ChatFirmPermission`: superadmin-managed firm pair access for customer firm-to-firm chat.
- `AuditLog`: durable audit trail.

Key enums:

- `Role`: `SUPERADMIN`, `ADMIN`, `FIRM`
- `TicketStatus`: `AVAILABLE`, `PENDING`, `ASSIGNED`, `ALLOCATED`, `SOLD`, `CANCELLED`, `REFUNDED`
- `TransactionType`: `ALLOCATION`, `SALE`, `PAYMENT`, `REFUND`, `ADJUSTMENT`, `PAYABLE`
- `KassaStatus`: `OPEN`, `CLOSED`
- `FirmStatus`: `ACTIVE`, `SUSPENDED`
- `PaymentMethod`: `CASH`, `CARD`, `BANK_TRANSFER`
- `ChatType`, `ChatMessageKind`

## Financial Invariants

- Transaction `originalAmount` and `currency` are the source of truth for what was paid or recorded.
- Payments, directed manual transactions, and manual kassa movements are not force-converted by exchange rates; for these flows `baseAmount` mirrors the original amount and `exchangeRate` is `1`.
- Some ticket/tour accounting flows may still use `baseAmount` for normalized internal accounting where explicitly implemented.
- Firm debt comes from payable/debt transaction types.
- Firm paid total comes from `PAYMENT`.
- Firm revenue comes from `SALE`.
- Outstanding is debt minus paid.
- Balance is paid minus debt.
- Ticket confirmation creates debt.
- Ticket sale creates revenue.
- Deallocation of assigned ticket creates negative debt.
- Sale cancellation creates negative sale.
- Kassa cash/card totals are computed from transactions, not entered manually.
- Cash/card movement requires open kassa date when using payment or manual kassa transaction flows.
- Financial rows are not physically deleted through generic maintenance. Corrections use explicit domain actions such as reversals, adjustments, closure/cancellation, or reasoned soft deletion where the domain permits it.

## Architecture Principles From Historical Specs

### Incremental Feature Boundaries

Large pages and controllers are reduced incrementally when they are changed; they
are not rewritten wholesale. Pure input policy and query logic lives under
`server/src/domains/<feature>/`, with focused tests. Frontend data contracts,
formatters, URL parsing, and other stable view logic live under
`client/src/features/<feature>/`. Controllers keep HTTP orchestration, services
keep database transactions, and pages keep React state until a complete form or
table can be moved without duplicating business behavior.

The removed draft/spec/roadmap docs repeated several principles that remain useful. Treat these as product direction, but verify exact current behavior against code before changing production logic.

- Correctness and financial integrity outrank UI convenience.
- Ticket inventory must not be double-sold.
- Financial records should be corrected through reversal or adjustment workflows rather than database edits.
- Exchange rates must be captured on the transaction that uses them.
- Firm data isolation is a privacy and release requirement, not only a UI filter.
- Reports should be explainable from stored transactions and ledger-facing data.
- Invitation links are private, single-use, expiring onboarding paths.
- Security-sensitive defaults, especially auth secrets and first-login passwords, must be replaced before real production use.
- Kassa, tickets, payments, firms, reports, tours, employees, auth, and invites are release-blocking surfaces.

## Deployment Workflows

### Local Validation Gate

Backend:

```bash
cd airline-b2b/server
npx prisma validate
npx prisma generate
npm test
npm run build
```

Frontend:

```bash
cd airline-b2b/client
npx tsc --noEmit
npm run build
```

### Production Deploy

Script:

```bash
./deploy.sh --schema
```

Use `--schema` when Prisma schema changed.

Production target:

- URL: `https://b2b.booking.ado-finance.com`
- PM2 app: `airline-b2b-server`
- Backend port: `5000`
- Backend dir: `/root/apps/ado-b2b/airline-b2b/server`
- Webroot: `/var/www/b2b.booking.ado-finance.com/html`

Post-deploy checks:

```bash
./scripts/prod-smoke.sh
ssh root@206.189.130.168 "pm2 status && pm2 logs airline-b2b-server --lines 80 --nostream"
```

### Dev/Staging Deploy

Script:

```bash
./deploy-dev.sh --schema
```

Dev target:

- URL: `https://dev.b2b.booking.ado-finance.com`
- PM2 app: `airline-b2b-dev-server`
- Backend port: `5001`
- Backend dir: `/root/apps/ado-b2b-dev/airline-b2b/server`
- Webroot: `/var/www/dev.b2b.booking.ado-finance.com/html`

Known operational note:

- If DNS for `dev.b2b.booking.ado-finance.com` is not configured, certbot cannot issue SSL and the deploy script leaves an HTTP bootstrap nginx config active.

### Schema Change Gate

Before production schema changes:

1. Run Prisma validation and generation.
2. Produce migration diff against production DB.
3. Block deploy if diff contains unexpected:
   - `DROP TABLE`
   - `DROP COLUMN`
   - destructive enum rewrites
   - table recreation for financial tables
4. Additive nullable columns, new tables, and indexes are generally safe after review.

## Manual Smoke Checklist

Use after significant changes and before release:

- Login works for `SUPERADMIN`, `ADMIN`, and `FIRM`.
- Unauthenticated dashboard routes redirect to login.
- Superadmin can open Settings and save login page content.
- Admin/firm cannot save login page content.
- Admin management works for create/edit/delete and firm access.
- Audit log opens for superadmin and rejects other roles.
- Firms page loads for superadmin/admin/firm.
- Superadmin firm invite/account flow works.
- Admin direct firm create works.
- Firm direct partner firm create works.
- Flights list loads.
- Flight detail loads.
- Ticket allocation works.
- Firm allocation confirmation works.
- Ticket sale works.
- Firm sale cancellation request works.
- Admin sale cancellation approval works.
- Kassa opens and closes day correctly.
- Kassa blocks cash/card movement when date is not open.
- Payment recording works for cash and card.
- Transactions list/detail load with role filtering.
- Reports load with role filtering.
- Tours list/create/sell works.
- Employees list/create/edit/delete works.
- Chat conversations/messages load.
- Production smoke passes.
- PM2 apps are online with no fresh fatal logs.

## Update Checklist For Future Changes

When adding or changing a workflow:

1. Update the relevant section in this file.
2. Update role/access notes.
3. Update API endpoint list if routes changed.
4. Update financial effects if transactions changed.
5. Update audit behavior if an action becomes auditable.
6. Update data model map if Prisma schema changed.
7. Update deployment notes if scripts, domains, PM2 names, ports, or schema gates changed.
8. Run relevant validation commands.
