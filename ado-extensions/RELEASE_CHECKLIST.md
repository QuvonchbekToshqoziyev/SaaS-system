# Extension release checklist

The base application is sealed. Release only the contents of `ado-extensions/`
and never promote its database into the base database.

## Verify

```bash
npm ci
npm run build
npm test
npm run release-check
npm audit --audit-level=high
node dist/index.js health
npm pack --dry-run
```

For a disposable PostgreSQL instance:

```bash
ADO_EXT_DATABASE_URL='postgresql://...' npm run db:migrate
ADO_EXT_DATABASE_URL='postgresql://...' npm run db:integration-smoke
```

## Promote

1. Run the complete verification sequence against staging.
2. Snapshot/backup the extension database.
3. Apply migrations once, in numeric order.
4. Confirm health JSON reports `ok: true`.
5. Promote the exact tested package and configuration fingerprint.
6. Monitor migration, database, delivery, and tenant-isolation errors.

## Roll back

Application rollback uses the prior tested package. Database rollback restores
the extension database snapshot; do not run destructive reverse migrations in
production. Pause new writes, preserve failed records for audit, restore the
last known-good package/database pair, and rerun the health and smoke checks.
