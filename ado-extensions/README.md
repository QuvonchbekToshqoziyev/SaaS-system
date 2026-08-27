# ADO Extensions

This package is the extension ecosystem for the sealed ADO B2B project.

`airline-b2b/` is treated as an immutable base. The extension host only reads
its public metadata and source shape; it does not import its runtime, modify its
files, run migrations, or write to its database.

## Design

- `BaseProjectReader` provides a read-only snapshot of the base version,
  package versions, mounted route paths, and Prisma model names.
- `ExtensionRegistry` loads independent extension modules and gives each module
  the same immutable snapshot.
- Every extension publishes a manifest with its version, supported base range,
  and capabilities. The registry rejects incompatible extensions before their
  initialization code runs.
- Extensions are isolated packages. They may expose commands, routes, jobs, or
  UI metadata, but they cannot mutate the base project through this contract.
- AI is deliberately absent from the host contract and example extension.
- `bhms21-accounting` contains versioned BHMS 21 metadata and deterministic
  normal-balance/posting validation. The extension ships the named account
  rows from the supplied official chart as a versioned data artifact. It does
  not mutate the base accounting tables.
- `accounting/journal-engine` provides the production posting boundary:
  integer minor-unit arithmetic, balanced double-entry validation, immutable
  `POSTED` entries, tenant-scoped idempotency, one-time reversals, closed-period
  protection, account-balance reporting, and a PostgreSQL repository.
- `documents/document-service` provides tenant-isolated document metadata,
  immutable storage versions, SHA-256 integrity metadata, and a bounded
  draft/review/approval/rejection/archive workflow. File bytes remain in an
  external storage adapter; the extension stores only validated references.
- `tax/tax-service` provides effective-dated, source-traceable tax rules and
  deterministic basis-point calculations. Legal rates are configuration data,
  not hard-coded application behavior.
- `payroll/payroll-service` provides tenant-scoped payroll calculations with
  validated deductions and a one-way calculated/approved/posted lifecycle.
  Employee data is supplied through a future read-only base adapter; no base
  employee table is modified.
- `notifications/notification-service` provides a tenant-scoped outbox with
  idempotency, explicit delivery states, and a three-attempt retry ceiling.
  Channel adapters are intentionally separate from the outbox.
- `reporting/reporting-service` provides read-only trial-balance, caller-defined
  profit/loss projections, and CSV export over journal balances. Reports do not
  maintain a second financial ledger.

## Run

```bash
cd ado-extensions
npm install
npm run build
npm run snapshot
node dist/index.js health
npm test
```

Apply the extension-owned migrations before constructing `PgJournalRepository`:

```bash
ADO_EXT_DATABASE_URL='postgresql://...' npm run db:migrate
npm run db:integration-smoke
```

CI runs the build, test suite, and high-severity dependency audit for changes
under this directory. Copy `.env.example` for local database configuration;
the extension database must remain separate from the sealed base database.

Use [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) for staging and production
promotion. The automated boundary checks are available as `npm run
release-check`; security assumptions are documented in [SECURITY.md](./SECURITY.md).

The command refuses to run without `ADO_EXT_DATABASE_URL`; the sealed base
`DATABASE_URL` is never used. The repository never writes to the sealed base
schema.

The direct `node dist/index.js health` command exits non-zero if the base is
version-incompatible or any registered extension fails initialization. Its
stdout is pure JSON for a process health check and includes each extension
manifest and result.

Set `ADO_BASE_PROJECT_PATH` only when the sealed base is located elsewhere.

## Extension boundary

An extension should depend on stable facts and explicit adapters, not on private
controller or Prisma implementation details. A future database/API adapter can
be added here without reopening the sealed base repository.
