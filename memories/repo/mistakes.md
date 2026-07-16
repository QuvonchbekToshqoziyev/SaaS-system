# Mistakes Log

## Auth Role Mismatch & Dashboard Blank Page
- **Symptom**: Dashboard and other panels returned a blank page or failed to load correctly for users logging in. 
- **Root cause**: The backend uses an uppercase `Role` enum (`SUPERADMIN`, `ADMIN`, `FIRM`), but the frontend `DashboardLayout.tsx` and `login/page.tsx` were doing a strict equality check (`user.role === 'firm'`). Additionally, when `user` was missing, `DashboardLayout` simply returned `null` instead of triggering a router redirect, causing a blank page.
- **Fix**: 
  1. Updated `DashboardLayout.tsx` and `login/page.tsx` to use case-insensitive checking (`user.role.toLowerCase() === 'firm'`).
  2. Added a `useEffect` inside `DashboardLayout.tsx` to explicitly perform `router.push('/login')` if `!user` and `!isLoading`.
- **Verification step**: Re-ran the Next.js production build (`npm run build`). Confirmed components type-checked correctly and navigation references were resolved.
- **Prevention note**: Always normalize string enums (especially `role` or `status` flags) when crossing the boundary between an Express backend and a Next.js frontend, and ensure unauthenticated layout states correctly fallback via `router.push`.

## Prisma Field Renaming Data Loss Risk
- **Symptom**: Database columns (`departureTime`, `arrivalTime`, `allocatedFirmId`, `price`) would be dropped (causing massive data loss) when applying the new Prisma schema because fields were renamed in the Prisma schema to fix TypeScript errors.
- **Root cause**: The previous agent changed `departureTime` to `departure`, `arrivalTime` to `arrival`, `price` to `basePrice`, and `allocatedFirmId` to `assignedFirmId` in `schema.prisma` without specifying the original column names via the `@map` attribute. Prisma interprets a renamed field without `@map` as dropping the old column and creating a new one.
- **Fix**: Added `@map("departureTime")`, `@map("arrivalTime")`, `@map("price")`, and `@map("allocatedFirmId")` to the respective fields in `airline-b2b/server/prisma/schema.prisma` to map them back to their existing physical database columns.
- **Verification step**: Ran `npx prisma generate && npm run build` successfully, ensuring the codebase types are aligned without redefining the physical columns.
- **Prevention note**: Whenever renaming a field in `schema.prisma` that already exists in a production database, you MUST use the `@map("original_column_name")` attribute to prevent Prisma from dropping the column and losing data.

## Prisma Schema and Ticket Controller Mismatch
- **Symptom**: Ticket allocation/sale/cancellation flows could fail at runtime because raw SQL referenced Prisma model field names (`assignedFirmId`) instead of mapped database column names (`allocatedFirmId`), and sale-cancellation controllers selected/wrote fields missing from `schema.prisma`.
- **Root cause**: The ORM layer used mapped Prisma names (`assignedFirmId`, `basePrice`) while raw SQL still needed physical column names. The `SaleCancellationRequest` model also lagged behind controller behavior for flight, reason, created-by, and decision fields.
- **Fix**: Updated `tickets.controller.ts` raw ticket locks to filter on `"allocatedFirmId"` and alias `"allocatedFirmId"`/`"price"` back to `assignedFirmId`/`basePrice`; expanded `SaleCancellationRequest` relations and fields in `schema.prisma`; updated seed scripts to use current Prisma field names and required transaction summary fields.
- **Verification step**: Ran `npx prisma generate`, `npx prisma validate`, `npm run build`, and a direct `tsc --noEmit` check for the touched Prisma seed scripts.
- **Prevention note**: When using `@map`, keep raw SQL in physical database column names and alias results back to Prisma/API names. After schema changes, regenerate Prisma and type-check scripts outside `src` if they are touched.

## Partial Backend Deploy Build Failure
- **Symptom**: The production server build failed after copying only `schema.prisma`, ticket controller, and seed scripts to the PM2 deployment.
- **Root cause**: The active PM2 server had older controllers that still referenced stale Prisma names (`departureTime`, `allocatedFirmId`, old includes), while the copied schema generated a newer Prisma client.
- **Fix**: Synced the full backend `src`, `prisma`, and server config/package files to `/root/airline-b2b/server`, then ran `npm install`, `npx prisma validate`, `npx prisma generate`, `npx prisma db push`, `npm run build`, and `pm2 restart airline-backend --update-env`.
- **Verification step**: Confirmed the remote build passed, PM2 showed `airline-backend` online, logs showed `Server running` on port 5000, and `curl http://127.0.0.1:5000/flights` returned the expected protected-route `401 No token`.
- **Prevention note**: Deploy schema/controller changes as one coherent backend source tree. Avoid partial production copies when Prisma model names changed across multiple controllers.

## Counterparty Visibility Accidentally Became Tenant Data Access
- **Symptom**: A firm needed to see a confirmed seller/provider/buyer in the Firms panel, but the shared firm-scope helper could also make that related firm's transactions, accounts, notifications, kassa desks, or employees visible.
- **Root cause**: One helper represented two different concepts: directory visibility and authorization to operate tenant-owned data. Callers treated “related firm” as “accessible firm.”
- **Fix**: Kept `getAccessibleFirmIds` narrow (`FIRM` gets only its own firm; `ADMIN` gets explicit `UserFirmAccess`) and added `getRelatedFirmIds`/`canViewRelatedFirm` only for counterparty directory views.
- **Verification step**: Run `access.test.ts`, server tests/build, the API surface audit, and the five-actor dev endpoint audit. For a confirmed counterparty, verify its name appears in Firms while its transactions/accounts/employees/kassa remain inaccessible.
- **Prevention note**: Relationship visibility is not tenant authorization. Never use a directory/counterparty scope in financial, employee, notification, account, or kassa queries.

## Endpoint Audit Accepted Errors as Success
- **Symptom**: The dev audit reported all probes passing even when an allowed page returned `403`, a client called a missing `404` endpoint, or a role could not complete its workflow.
- **Root cause**: The old audit accepted almost any status below `500` (`200/201/400/401/403/404/409`) for nearly every request.
- **Fix**: Added a contract for every mounted endpoint. Protected public probes require exactly `401`; route-denied roles require exactly `403`; allowed reads use endpoint-specific statuses; safe mutations must not produce an unexpected server error. The audit reports skipped destructive probes explicitly.
- **Verification step**: `node scripts/api-surface-audit.mjs` must show equal mounted/contract counts and no unmatched client call. `node scripts/dev-endpoint-audit.mjs` must report zero failures.
- **Prevention note**: Never call an audit green when its expected status set contains contradictory outcomes. Authentication, authorization, validation, not-found, conflict, and success are separate contracts.

## Route Middleware, Controller Roles, and UI Controls Drifted Apart
- **Symptom**: A button was visible but the endpoint returned `403`, or an endpoint allowed a role whose page hid the operation. Firm admin, manager, and kassir behavior repeatedly differed between pages and controllers.
- **Root cause**: Top-level `Role.FIRM` was checked without consistently enforcing `FirmUserRole`, and permissions were duplicated across route middleware, controller branches, and React conditions.
- **Fix**: Centralize business predicates in `firm-user-roles.ts` and permission utilities, then use the same named rule in controller tests and UI gating. Route-level roles remain the outer boundary; firm subroles remain an explicit business contract.
- **Verification step**: For each changed action, test `SUPERADMIN`, `ADMIN`, `FIRM_ADMIN`, `MANAGER`, `KASSIR`, and unauthenticated behavior. A hidden UI control is never accepted as backend protection.
- **Prevention note**: Every permission change is a matrix, not a single `if`. Update server authorization, serialized capability flags, frontend controls, tests, and the endpoint audit together.

## One Backend Filter Was Fixed but Other Consumers Stayed Stale
- **Symptom**: Deleted/unallocated flights disappeared on one page but remained in tours, kassa, transactions, reports, or selectors; a firm saw a flight without owned/allocated inventory.
- **Root cause**: Multiple controllers independently queried flights and duplicated active/ownership predicates.
- **Fix**: Reuse active-flight and participation predicates, and audit every `/flights` consumer whenever ownership or lifecycle rules change.
- **Verification step**: Search backend and frontend flight consumers, then test flights, tours, services, kassa, transactions, reports, and allocation selectors for an unrelated firm and for an allocated firm.
- **Prevention note**: Visibility changes must list all downstream consumers before coding. A list-page fix alone is incomplete.

## Employee Record and Login Account Were Created Separately
- **Symptom**: A firm admin created a kassir employee but could not give that employee working login credentials, or an employee existed without a matching user account.
- **Root cause**: HR records and authentication accounts were separate operations without one validated transaction or consistent firm-role mapping.
- **Fix**: Create the employee and optional login atomically, normalize the email, reject duplicates, hash the password, and map employee role to `FirmUserRole` in one service transaction.
- **Verification step**: Test rollback on duplicate email, successful kassir login, firm scoping, and firm-admin-only credential creation.
- **Prevention note**: Workflows spanning multiple tables must be atomic and tested from the user's final outcome, not only from the first record creation.

## Updates Had No Release Identity
- **Symptom**: Many deployed fixes accumulated without a reliable name, changelog, or reproducible list of checks, making regressions difficult to trace.
- **Root cause**: Client/server versions stayed at a generic value and deployment notes were not tied to a release gate.
- **Fix**: `VERSION`, both package files/lockfiles, and `CHANGELOG.md` now use SemVer. Release `1.0.0` is the named baseline; the audit/scope correction is `1.0.1`.
- **Verification step**: Run `node scripts/release-audit.mjs`; it fails on version drift, missing changelog entries, endpoint/client mismatch, Prisma errors, tests, TypeScript, or builds. Use `--dev` before production.
- **Prevention note**: Every update, including a small bug fix, gets a version and changelog entry before deploy: patch for fixes, minor for compatible features, major for breaking changes.

## Mandatory Cross-Surface Checklist for Every Change

Before closing any update, record and verify:

1. Named release and changelog entry.
2. Database model, migration, mapped physical column names, raw SQL, seed data, and generated Prisma client.
3. Route mount, middleware role, controller firm/subrole rule, and tenant scope.
4. Every frontend caller, control visibility, query parameter, response shape, loading/empty/error state, and Uzbek label.
5. Related consumers of the same entity (especially flights, firms, tickets, transactions, kassa, reports, tours, and services).
6. Unauthenticated, `SUPERADMIN`, `ADMIN`, `FIRM_ADMIN`, `MANAGER`, and `KASSIR` outcomes.
7. Unit/integration regression test, `api-surface-audit`, full release audit, dev deployment, and live five-actor audit.
8. Manual critical workflow for destructive or stateful operations that automation deliberately skips.

## Nullable Status Was Treated as Inactive in One Workflow
- **Symptom**: A firm could see an allocated flight in the tour picker but creating the tour returned `Faol reys topilmadi`.
- **Root cause**: The picker explicitly included legacy flights whose status is `NULL`, while create/update used `status: { notIn: [...] }`; SQL does not treat `NULL` as matching `NOT IN`.
- **Fix**: Added one shared active-flight predicate that explicitly includes `status: null` and reused it in flights, tours, and service validation.
- **Verification step**: Assert the shared predicate contains the null branch and test picker plus POST with a legacy null-status flight.
- **Prevention note**: Prisma `not`/`notIn` is not a substitute for an explicit nullable-state policy. List and mutation validation must use the same predicate.

## Kassa Monitoring Reused Login Eligibility Rules
- **Symptom**: An active K-01 desk was absent from monitoring when its firm had no active `FIRM` login or its subscription date had passed.
- **Root cause**: The desk query mixed operational inventory visibility with interactive login eligibility and required an active firm user plus current subscription.
- **Fix**: Scope desk visibility by active/non-deleted desk and authorized firm IDs; keep subscription enforcement in authentication, and show desk code/name independently from assigned cashier.
- **Verification step**: Test that an active desk remains in superadmin scope without a firm login, while firm users still cannot cross tenant scope.
- **Prevention note**: Monitoring an entity and authenticating an operator are different policies. Do not embed login eligibility into inventory queries.

## Tenant-Scoped React Query Cache Was Shared Between Users
- **Symptom**: After changing accounts, flights or firms could briefly show the previous user's data or omit the current user's allocated data.
- **Root cause**: Query keys such as `['flights']` and `['firms']` did not include actor identity, while cached data remained fresh across logout/login.
- **Fix**: Added user identity to tenant-scoped query keys; broad invalidation prefixes still refresh every actor variant.
- **Verification step**: Log in as two different firms in sequence and verify each scoped list is fetched again.
- **Prevention note**: Every client cache containing tenant-scoped data must be keyed by actor or cleared atomically on identity change.

## Legacy Bulk Allocation Created One Transaction Per Ticket
- **Symptom**: One bulk ticket allocation appeared as several payable transactions.
- **Root cause**: The legacy allocation path wrote a payable inside a per-ticket loop; the new segment path writes once per allocation, but old rows remained in production.
- **Fix**: Keep payable creation at allocation level and consolidate safe legacy groups with a dry-run-first, audited, idempotent repair. Linked ledger/payment/reversal groups are rejected rather than changed.
- **Verification step**: Assert one create call for the full allocation total, run repair dry-run, apply after backup, then verify zero duplicate active allocation groups.
- **Prevention note**: Financial documents must have an explicit business identity (`subjectType` + `subjectId`) and a tested cardinality invariant.

## Production Schema Deploy Silently Accepted Data Loss
- **Symptom**: `deploy.sh --schema` could apply a destructive Prisma diff automatically even though the release plan required stopping for review.
- **Root cause**: Production and dev both used `prisma db push --accept-data-loss`, and production schema work had no mandatory verified database backup in the deploy path.
- **Fix**: Production now runs the PostgreSQL backup helper first and uses `prisma db push` without destructive acceptance. Dev may still accept schema resets because it is disposable staging data.
- **Verification step**: `scripts/release-audit.mjs` fails if production deploy reintroduces `db push --accept-data-loss`. A schema deploy must print a verified backup path before Prisma runs.
- **Prevention note**: Production data-loss flags are never convenience defaults. Any destructive diff requires an explicit reviewed migration, current backup, and rollback plan.

## Regression Tests Existed but the Database Still Allowed Invalid Cardinality
- **Symptom**: Application code created one payable per allocation, but another controller, retry, or future code path could still insert multiple active payables for the same allocation.
- **Root cause**: The one-allocation/one-payable rule was only an application convention and unit test, not a database invariant or deploy gate.
- **Fix**: Added a partial unique PostgreSQL index for active confirmed allocation payables and a post-deploy audit that checks missing, duplicate, and wrong-total allocation transactions.
- **Verification step**: Every dev/prod backend deploy runs `npm run audit:business-invariants`; `scripts/regression-guard-audit.mjs` verifies that the migration and audit remain wired into both deploy scripts.
- **Prevention note**: Critical financial cardinality belongs in the database first, then in application tests and release automation.

## Dev Releases Had No Update-Specific Test Data
- **Symptom**: Endpoint, role, and build audits passed, but operators could not reliably reproduce the exact business flow changed by a release on the dev website.
- **Root cause**: The shared QA seed was optional, was not tied to `VERSION`, and was not part of dev deployment or the live release gate.
- **Fix**: Every dev deploy now runs an idempotent versioned fixture. The seed refuses non-dev databases, and `--dev` release auditing verifies the fixture through the API.
- **Verification step**: Deploy the same release seed twice, confirm no duplicate business documents, then run `node scripts/release-audit.mjs --dev` and require the release-seed audit to pass.
- **Prevention note**: Every release must update `RELEASE_FIXTURE_VERSION` and add the smallest fitting data scenario for the changed workflow; production deploy must never invoke the seed directly.

## Live Endpoint Audit Overloaded the Dev Transport
- **Symptom**: 718-720 of 721 probes passed, while random endpoints failed with `fetch failed` or `AbortError`; backend logs showed those requests later completed in milliseconds with expected statuses.
- **Root cause**: Sixteen concurrent HTTPS probes and a 15-second client timeout were too aggressive for the small shared dev host, producing transport queue failures rather than endpoint failures.
- **Fix**: Reduced default audit concurrency to eight, raised the per-attempt timeout to 30 seconds, and added one retry only when transport throws. HTTP responses are never retried or reclassified.
- **Verification step**: Run `node scripts/dev-endpoint-audit.mjs` and require all 721 probes to pass; inspect PM2 error logs if any retry still fails.
- **Prevention note**: Load-style concurrency is not correctness auditing. Keep endpoint audit pressure within the staging host capacity and preserve real HTTP failures exactly.
