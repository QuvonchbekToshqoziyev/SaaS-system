# Changelog

All releases use [Semantic Versioning](https://semver.org/):

- `PATCH` (`1.0.1`): backward-compatible bug fix, permission correction, or regression guard.
- `MINOR` (`1.1.0`): backward-compatible feature or workflow expansion.
- `MAJOR` (`2.0.0`): breaking API, data, or workflow change.

Every update must have a version, a changelog entry, and a passing release audit before deployment.

## [1.0.4] - 2026-07-15

### Added

- Every dev deployment now runs an idempotent QA seed tied to the current release version.
- Added 1.0.4 fixtures for an allocated null-status flight, its single allocation payable, a no-login expired-firm kassa desk, a historical closed kassa day, and a partner-owned service isolation case.
- Added a live dev seed audit that verifies the fixture through source-firm, allocated-firm, and superadmin API views.
- Stabilized the 721-probe live endpoint audit for the small dev host by lowering default concurrency and retrying transport interruptions once without retrying HTTP failures.

### Safety

- The QA seed requires explicit dev-deploy opt-in and refuses any database URL other than the dedicated `airline_b2b_dev` database.
- The release audit fails when `VERSION` and the release fixture version differ, forcing each future update to include fitting dev test data.

## [1.0.3] - 2026-07-15

### Added

- Added a partial PostgreSQL unique index that enforces one active confirmed payable per ticket allocation for every firm.
- Added a post-deploy business-invariant audit that blocks a backend release when an accepted allocation has a missing, duplicate, or wrong-total payable.
- Added recurring release guards for shared flight lifecycle scope, kassa desk visibility, service owner isolation, tenant cache reset, and allocation transaction cardinality.
- Extended live tenant isolation auditing to purchased services.

### Changed

- All flight, report, service, tour, and ticket allocation consumers now reuse the shared active-flight predicate.
- Authentication identity changes clear the full React Query cache so data cannot carry between firms or roles.

## [1.0.2] - 2026-07-15

### Fixed

- Allowed authorized kassa users to open or reopen any business date independently, including past dates, without later sessions blocking the operation.
- Kept active kassa desks visible in superadmin monitoring even when the firm has no active login or its subscription has ended; desk labels now lead with the desk code and name.
- Unified the active-flight predicate so legacy flights with a null status remain available in flights, tour creation, and service validation when the firm owns allocated inventory.
- Scoped purchased service inventory to its owner firm and isolated actor-specific React Query caches for flights, firms, employees, and admins.
- Enforced one payable transaction per ticket allocation and added an audited, idempotent repair for legacy per-ticket transaction rows.

### Verification

- Added regression coverage for nullable flight status, firm service isolation, kassa desk visibility, historical kassa operation, and allocation-level payable creation.

## [1.0.1] - 2026-07-15

### Fixed

- Separated related-firm directory visibility from tenant-owned operational access. A confirmed business relationship may expose a counterparty name, but no longer grants access to that firm's accounts, transactions, notifications, employees, or kassa data.
- Aligned route middleware with controller policy for superadmin chat settings/interactions, firm-only service creation, service edit/delete, and firm updates.
- Made production schema deploy fail closed: verified PostgreSQL backup first, and no automatic `--accept-data-loss`.
- Cleared runtime high-severity dependency advisories by updating Axios resolution, Next.js to `16.2.10`, and server transitive packages; remaining client advisories are moderate transitive `postcss`/`uuid` findings whose automated fixes are breaking downgrades.

### Added

- Complete contract inventory for all 128 mounted API endpoints and five QA actors.
- Static client/server API-path drift audit covering 100 frontend API calls.
- Strict dev authentication, route-RBAC, safe controller, and read-endpoint probes.
- Live tenant-data isolation checks for firm admin, manager, kassir, and assigned admin scopes.
- Playwright smoke coverage for five-role login, navigation visibility, critical page loading, browser errors, and API `5xx` responses.
- Repeatable release audit, version consistency check, and expanded recurring-mistakes checklist.

## [1.0.0] - 2026-07-15

- Named baseline release for the existing ADO B2B flights, ticket inventory, allocations, tours, services, firms, kassa, transactions, reports, employees, chat, and notification workflows.
