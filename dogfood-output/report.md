# Dev endpoint and UI audit

Date: 2026-07-11

Target: `https://dev.b2b.booking.ado-finance.com`

Production was not seeded, deployed, or queried by this audit.

## Dev dataset

The idempotent seed in `airline-b2b/server/prisma/seed-dev-qa.ts` creates:

- superadmin, admin, firm admin, manager, and two separate kassir users;
- tour agency, partner agency, airline, and service-provider firms;
- one flight with 30 tickets;
- two kassa desks and one firm-wide payment card;
- USD and UZS balances plus a firm USD rate;
- bank income, kassa sale, tour package, purchased visa service, employee,
  airline connection, and notification records.

All QA records use the `QA DEV` prefix and the seed can safely be run again.

## Grouped runtime result

The repeatable matrix is `scripts/dev-endpoint-audit.mjs`.

| Group | Checks | Failed |
| --- | ---: | ---: |
| Authentication and public content | 7 | 0 |
| Core: firms, flights, tickets, transactions, accounts | 25 | 0 |
| Kassa | 24 | 0 |
| Commercial: tours and services | 20 | 0 |
| Employees | 5 | 0 |
| Chat and notifications | 20 | 0 |
| Reports | 75 | 0 |
| Search | 5 | 0 |
| Admin control and role scope | 8 | 0 |
| Non-destructive write validation probes | 21 | 0 |
| UI routes | 20 | 0 |
| **Total** | **230** | **0** |

The probes cover five authenticated roles. Expected validation and permission
responses (`400`, `401`, `403`, `404`, and `409`) count as correct only when the
server does not return a `5xx` response. The route source contains 120 Express
method declarations; the runtime matrix exercises every major route family,
while destructive update/delete variants are checked through source/build and
must not be run against seeded records merely to increase a check counter.

## Three requested review dimensions

### 1. Logical errors

No new cross-module logical failure was reproduced with the seeded scenario.
Role-specific `403` responses occurred for firm chat settings and interaction
reports; these match their restricted controller behavior. Superadmin/admin
firm reports return `400` without an explicit firm selection, which is expected
for an unscoped global user.

The dataset is specifically prepared for follow-up manual checks of kassa desk
history isolation, shared plastic cards, USD/UZS separation, service-provider
entry, firm-admin edits, and role visibility.

### 2. Code errors

- Backend TypeScript build: passed.
- Frontend TypeScript check: passed.
- Frontend production/static build: passed; all declared application pages generated.
- Runtime matrix: no `5xx` responses.
- Dev PM2 error log: empty after the matrix.

### 3. UI component setup

- All 20 explicit application page URLs returned HTML or the expected redirect.
- Next.js successfully generated every declared application page.
- API-backed page families are represented in the endpoint matrix.

Visual browser automation is not available in this environment. Therefore this
audit verifies route availability, compilation, and API/component wiring, but
does not claim pixel-level layout, responsive, focus, or click-flow validation.

## Re-run

```bash
cd /home/quvonchbek/dead/SaaS-system
node scripts/dev-endpoint-audit.mjs
```

Seed on the dev server only:

```bash
cd /root/apps/ado-b2b-dev/airline-b2b/server
npx ts-node prisma/seed-dev-qa.ts
```
