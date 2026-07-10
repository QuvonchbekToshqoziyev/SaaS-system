# Final Release Plan

This is the release gate for `SaaS-system/airline-b2b`. Do not deploy until every required check below passes.

## 0. Scope Lock

- Work only in `/home/quvonchbek/dead/SaaS-system`.
- Do not copy code from `/home/quvonchbek/dead/airline-b2b`; that sibling folder was a mistaken target.
- Preserve unrelated modified files. If a file is already dirty, inspect it before editing.
- Do not commit generated folders: `node_modules`, `.next`, `out`, `dist`.

## 1. Known Release Risks To Fix First

- Prisma schema changes must not drop production columns. Existing renamed fields need `@map(...)`.
- Raw SQL must use physical database column names, not Prisma alias names.
- Role checks must normalize role casing across frontend and backend.
- Login page editor must be `SUPERADMIN` only.
- Kassa, tickets, payments, firms, reports, tours, employees, auth, and invites are financial or access-control surfaces. Treat failures there as release blockers.

## 2. Local Validation Gate

Run from repo root unless a command says otherwise.

```bash
cd airline-b2b/server
npx prisma validate
npx prisma generate
npm test
npm run build
```

```bash
cd airline-b2b/client
npx tsc --noEmit
npm run build
```

Required result:

- All commands exit `0`.
- No TypeScript errors.
- No Prisma validation errors.
- No failing tests.
- No generated build artifacts are accidentally staged.

## 3. Manual Smoke Gate

Start locally:

```bash
./dev.sh
```

Verify:

- Login works for `SUPERADMIN`, `ADMIN`, and `FIRM`.
- Unauthenticated dashboard paths redirect to login.
- Superadmin can open Settings and save login page editor content.
- Admin and firm users cannot save login page editor content.
- Flights list and flight detail load.
- Ticket allocation, sale, and cancellation flows still work.
- Firms page loads and firm currency/subscription fields behave.
- Kassa opens/closes day correctly and blocks invalid payment states.
- Transactions and reports load with the expected role filtering.
- Invite creation and invite accept flow still work.

## 4. Database Migration Gate

Before production schema changes:

```bash
cd airline-b2b/server
npx prisma migrate diff \
  --from-url "$PRODUCTION_DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > /tmp/ado-b2b-release.sql
```

Review `/tmp/ado-b2b-release.sql`.

Block deploy if it contains unexpected:

- `DROP TABLE`
- `DROP COLUMN`
- destructive enum rewrites
- table recreation for financial tables

Expected for the login page editor feature:

- add `SiteContent` table only.

## 5. Production Deploy Gate

Use the root deploy script only after gates 1-4 pass.

Production deploys must never put prod ahead of dev. `./deploy.sh` automatically runs the matching `./deploy-dev.sh` step first, from the same source tree. Dev may be ahead of prod, but prod should not move unless dev has already accepted that code. Use `--skip-dev-sync` only for a true emergency and note it in the release summary.

```bash
./deploy.sh --schema
```

If only code changed and schema is already applied:

```bash
./deploy.sh
```

After deploy:

```bash
./scripts/prod-smoke.sh
```

Also check:

```bash
ssh root@206.189.130.168 "pm2 status && pm2 logs airline-b2b-server --lines 80 --nostream"
```

Required result:

- PM2 app online.
- Backend health check succeeds.
- Website opens at `https://b2b.booking.ado-finance.com`.
- Deep links refresh correctly.
- No fresh fatal errors in PM2 logs.

## 6. Rollback Plan

If frontend fails:

- Redeploy previous `client/out` backup if available, or fix and run `./deploy.sh --frontend-only`.

If backend build fails before PM2 restart:

- Production should still be running the old PM2 process.
- Fix locally, rerun server gate, then `./deploy.sh --backend-only`.

If backend starts but runtime fails:

- Use PM2 logs to identify the failing route.
- Revert only the bad change or restore the previous backend source backup.
- Restart PM2 after restoring.

If schema migration is destructive:

- Stop.
- Create a safe Prisma migration manually.
- Back up production DB before applying.

## 7. Release Done Definition

Release is done only when:

- Local server build, server tests, client typecheck, and client build pass.
- Production deploy completes.
- Production smoke passes.
- Superadmin can use the login page editor.
- Admin/firm cannot use the login page editor save endpoint.
- Kassa and financial pages open without console/API errors.
