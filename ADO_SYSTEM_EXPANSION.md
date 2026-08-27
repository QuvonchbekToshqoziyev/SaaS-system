# ADO-SYSTEM Expansion Baseline

Status: Phase 0 audited; Phase 1 remains in progress.

This document maps the current airline-focused product to the broader ADO-SYSTEM
ERP plan. It is intentionally limited to implemented behavior. A future module
must not appear in navigation until its API, persistence, tenant checks, audit
trail, and tests exist.

## Current Gap Matrix

| Phase | Status | Current evidence | Main gap |
| --- | --- | --- | --- |
| 0. Audit and plan | Implemented | This matrix, the architecture decision below, `WORKFLOW_DOCUMENTATION.md`, and the release gates | Re-audit after each completed vertical slice |
| 1. Platform foundation | Partial | `Firm` tenant boundary, `User` and firm subroles, canonical sessions, admin MFA, server-side tenant checks, soft deletion, audit log, responsive shell | Branch/department scopes, configurable role permissions, optimistic concurrency across all mutable business records |
| 2. Financial core | Partial | Financial accounts, kassa/bank movements, expense controls, `JournalEntry`/`LedgerEntry`, reversal flows, dashboard/report aggregation | BHMS 21 master and working charts, fiscal periods, account-backed journal lines, receivable/payable lifecycle and full approval workflow |
| 3. Warehouse and branches | Partial | Products, warehouses, batches, inventory documents/movements, stock protection, accounting effects | First-class branches, branch scope enforcement, inventory counts, serial numbers and branch consolidation |
| 4. Employees, payroll and tax | Partial | Tenant-scoped employee register and salary-related cash operations | Attendance, leave, versioned payroll rules, effective-dated tax rules and filings |
| 5. Management, documents and notifications | Partial | Financial reports, audit log, notifications, chat and monitoring | Budgets beyond expenses, statements, approval documents, risk rules and announcement acknowledgements |
| 6. AI and integrations | Not started | Telegram notification adapter only | Permission-aware AI tools and explicitly configured external adapters |

## ADR-001: Treat `Firm` As The Current Organization Tenant

### Context

Production business data already uses `firmId` across flights, tickets,
transactions, kassa, inventory, employees, services, chat, reports, and access
rules. Renaming that table and every foreign key would create migration risk
without adding tenant isolation.

### Decision

- `Firm` remains the physical Prisma model and production tenant key.
- In ADO-SYSTEM product language, a `Firm` is an organization/business tenant.
- New general-business modules must use the same `firmId` boundary until a
  separately reviewed compatibility migration introduces an API alias.
- Airline, agency, and contractor behavior remains a business capability or
  organization kind, not a separate tenant architecture.
- Platform `SUPERADMIN` access across organizations remains exceptional and
  auditable; normal organization users stay restricted to their firm scope.

### Consequences

- Existing flight and booking data remains untouched.
- General ERP modules can be added incrementally on the same tenant boundary.
- The database name `Firm` and product term "organization" will coexist for a
  while; new code must document which meaning it exposes at API/UI boundaries.

## First Foundation Slice

Navigation capabilities are now calculated by the server from the canonical
platform role and firm role and returned with login/session users. The client
uses these capabilities to show only implemented modules. During a rolling
deployment, the client falls back to the previous role matrix only when an old
backend response has no capability list.

Capabilities do not replace authorization. Every API and service keeps its own
role, tenant, lifecycle, and mutation checks.

## Next Vertical Slices

1. Add first-class branches and departments, then enforce their scopes in one
   existing workflow before introducing branch-manager roles.
2. Add the versioned BHMS 21 master chart and tenant working chart, verified
   against the supplied official catalog before journal posting uses account IDs.
3. Migrate one kassa/bank operation from string ledger labels to balanced,
   account-backed journal lines with preview, posting, reversal, and audit.

Production deployment is outside this baseline. The exact source must pass the
local release audit, dev deployment, live audit, backup review, and explicit
production approval described in `FINAL_RELEASE_PLAN.md`.
