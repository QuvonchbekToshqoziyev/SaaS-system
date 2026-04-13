# Roadmap

## Milestone M2 — UX + Privacy/Security Release Candidate (2026-04)

### Goal
Deliver a **production-ready, UX-first** B2B ticket distribution + accounting experience with **strong privacy boundaries** (firm data isolation) and **security hardening** (no insecure defaults), while finishing the “rich” features already required by the spec in [prompt.md](prompt.md).

### Primary outcomes
- **Superadmin/Admin** can run the whole operational flow end-to-end (flights → tickets → allocation → sales → payments → reporting).
- **Firm users** see **only their own** inventory/ledger and cannot access other firms’ data (privacy-by-default).
- Financial numbers are **precise** (no float drift), auditable, and consistent across UI and reports.

### Must-have scope (this milestone)
**UX / feature completeness (spec-aligned)**
- Transactions: full filters (date range, firm, flight, type, currency) + drilldown.
- Flight details: correct metrics + tickets inventory; remove browser confirm prompts.
- Firm dashboard: firm-scoped KPIs (tickets assigned/sold, revenue, debt, paid, balance) + monthly breakdown.

**Privacy / authorization**
- Firm isolation enforced server-side for list/detail endpoints (transactions, reports, tickets, etc.).
- Any admin-only data (e.g., user lists) remains restricted, and firm pages never depend on admin-only endpoints.

**Security hardening**
- No insecure auth defaults (JWT secret must be set; invitations remain one-time, expiring, and hashed-at-rest).
- Input validation for money, enums, IDs, and required payment metadata.
- Safer HTTP defaults (tight CORS, security headers) appropriate for same-origin deployment.

**Financial integrity**
- No JS float math for stored money/exchange-rate computations; store and aggregate DECIMAL precisely.
- Exchange rates are applied consistently and locked per transaction.

### Out of scope (unless explicitly requested)
- New product modules outside the spec (e.g., refunds, chargebacks, complex reconciliation workflows).
- Switching auth to a full cookie-session design (can be a later milestone if desired).

### Definition of done (acceptance checks)
- Firm user cannot access other firms’ data via API even when passing foreign IDs.
- Transactions page filters match the spec in [prompt.md](prompt.md) and are stable under pagination.
- Flight details work for both Admin and Firm roles (firm view does not break due to admin-only calls).
- Payment validation matches the spec (cash vs card required fields).
- Builds pass: `cd airline-b2b/server && npm run build` and `cd airline-b2b/client && npm run build`.
