# ADO B2B Release 1.0.1 System Audit

Audit date: 2026-07-15  
Environment: local validation + `https://dev.b2b.booking.ado-finance.com`  
Production: not changed

## Executive summary

The recurring failures were not independent bugs. The main systemic causes were shared scopes with mixed meanings, duplicated role policy, an endpoint audit that accepted contradictory responses, no client/server contract inventory, untracked release identity, and unsafe production schema automation.

Release `1.0.1` fixes the confirmed authorization leak and establishes repeatable gates. The current dev source passes the complete automated gate.

## Automated coverage and result

- 128/128 mounted Express endpoints have an audit contract.
- 100/100 statically discoverable frontend API calls match a mounted backend route.
- 725/725 live probes passed across unauthenticated, `SUPERADMIN`, `ADMIN`, `FIRM_ADMIN`, `MANAGER`, and `KASSIR` contexts.
- 27/27 live tenant-isolation checks passed for transactions, accounts, employees, notifications, kassa desks, and payment cards.
- 5/5 Playwright critical role flows passed: login, expected/hidden navigation, all role-visible page loads, browser exceptions, and HTTP `5xx` detection.
- 30 backend test files and 92 tests passed.
- Prisma validate/generate, server build, client typecheck, and Next.js production build passed.
- Server runtime dependency audit has 0 vulnerabilities. Client runtime has no high-severity findings.

## Confirmed findings fixed

### Critical — related-firm visibility broadened private data scope

`getAccessibleFirmIds` had been expanded so a confirmed allocation, tour sale, service assignment, transaction, or airline relationship made the counterparty “accessible.” Financial and employee controllers reused that helper, so a directory-visibility fix could expose a related firm's private records.

Resolution:

- `getAccessibleFirmIds`: operational tenant scope only (`FIRM` owns one firm; `ADMIN` has explicit `UserFirmAccess`; `SUPERADMIN` is global).
- `getRelatedFirmIds` and `canViewRelatedFirm`: counterparty directory only.
- Firms list/detail uses related visibility; operational controllers remain narrow.
- Regression tests and live data-isolation checks enforce the distinction.

### High — endpoint audit produced false green results

The previous script accepted `200`, `201`, `400`, `401`, `403`, `404`, or `409` for most requests. A missing endpoint, forbidden allowed role, invalid request, and success could all count as the same pass.

Resolution:

- Public protected probes require exactly `401`.
- Route-denied roles require exactly `403`.
- Allowed reads use endpoint-specific contracts.
- Safe mutation probes reject transport/`5xx` failures.
- Destructive allowed-role probes are explicitly counted as skipped.
- Static audit fails if a route has no contract or a frontend call has no backend route.

### High — route middleware and controller policy drift

Chat settings, interaction reports, services, and firm updates had broader route middleware than their controllers.

Resolution:

- Chat firm settings and interaction reports: `SUPERADMIN` at router and controller.
- Service creation: `FIRM` at router; controller keeps `FIRM_ADMIN|MANAGER` business policy.
- Service edit/delete: `SUPERADMIN|FIRM` at router; controller keeps owner/admin subrole policy.
- Firm update: `SUPERADMIN|FIRM` at router.

### High — runtime dependency advisories

Client audit reported high-severity Axios/form-data and Next.js advisories; server reported a transitive `qs` advisory.

Resolution:

- Axios resolves to `1.18.1`.
- Next.js updated from `16.2.3` to `16.2.10`.
- Server transitive packages updated.
- Release gate now blocks high-severity runtime advisories.

### High — production schema deploy accepted data loss

`deploy.sh --schema` used `prisma db push --accept-data-loss` without a mandatory verified backup, contradicting the release plan.

Resolution:

- Production schema deploy first uploads/runs the PostgreSQL backup helper and verifies the dump.
- Production uses `prisma db push` without `--accept-data-loss`.
- The release audit fails if the destructive production flag is reintroduced.
- Dev remains allowed to use disposable staging schema acceptance.

## Open risks and manual gates

### Medium — migration history is not the source of truth yet

The local database reports 9 migration files as unapplied, and a DB-to-schema diff shows the local DB is behind the current ticket-leg, kassa, tour, Telegram, and transaction schema. The deployed dev DB reported “already in sync” after `db push`, so current dev runtime is healthy, but Prisma migration history cannot yet prove environment parity.

Recommended follow-up: baseline the existing dev/production schemas in `_prisma_migrations`, then move future schema releases from `db push` to reviewed `prisma migrate deploy` migrations.

### Medium — four moderate client transitive advisories remain

They are Next-bundled `postcss` and ExcelJS-bundled `uuid`. `npm audit` currently proposes breaking downgrades (`next@9.3.3` or `exceljs@3.4.0`), so they were not applied automatically. High-severity audit is green.

### Manual — successful destructive/stateful workflows

Nine allowed-role mutation probes are intentionally not run by the generic endpoint audit: chat permission update; kassa open/close/reopen; mark-all notifications; report data-transfer event; login-page content update; Telegram preference update/disconnect. Other mutation endpoints are probed with non-mutating invalid/fake data, not as full successful business transactions.

Before production, manually execute with cleanup:

1. Create flight and RT/OW inventory.
2. Allocate, edit/cancel allocation, approve/reject, and verify both firms.
3. Sell and cancel/refund a ticket, then reconcile transaction and report totals.
4. Create/sell/cancel a tour and verify ticket/service reservation restoration.
5. Create/assign/update/delete a service and verify stock/account effects.
6. Open/close/reopen kassa, cash/card operations, and daily correction rules.
7. Create a kassir employee with login and verify firm-admin/kassir permissions.
8. Exercise invite acceptance, chat permission, Telegram link/preferences, and editable login content.

## Permanent enforcement

- Release identity: `VERSION`, package versions, `CHANGELOG.md`.
- Historical prevention: `memories/repo/mistakes.md`.
- Static contract: `node scripts/api-surface-audit.mjs`.
- Live endpoint/RBAC: `node scripts/dev-endpoint-audit.mjs`.
- Live tenant isolation: `node scripts/dev-data-isolation-audit.mjs`.
- Critical browser flows: `npm --prefix airline-b2b/client run test:e2e`.
- Complete gate: `DEV_AUDIT_CONCURRENCY=8 node scripts/release-audit.mjs --dev`.

Final automated status: `PASS 1.0.1 including live dev`.
