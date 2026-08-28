# Dev and Production Split

The live production website remains:

```text
https://b2b.booking.ado-finance.com
```

The dev/staging website is configured as a second deployment:

```text
https://dev.b2b.booking.ado-finance.com
```

## Separation

Production uses the existing deploy path:

```text
./deploy.sh
PM2: airline-b2b-server
Port: 5000
Backend: /root/apps/ado-b2b/airline-b2b/server
Webroot: /var/www/b2b.booking.ado-finance.com/html
Nginx: /etc/nginx/sites-available/b2b.booking.ado-finance.com
```

Dev uses the new deploy path:

```text
./deploy-dev.sh
PM2: airline-b2b-dev-server
Port: 5001
Backend: /root/apps/ado-b2b-dev/airline-b2b/server
Webroot: /var/www/dev.b2b.booking.ado-finance.com/html
Nginx: /etc/nginx/sites-available/dev.b2b.booking.ado-finance.com
```

## Required Server Setup

Point DNS for `dev.b2b.booking.ado-finance.com` to `206.189.130.168`.

Create a separate dev database. Do not point dev at the production database.

Before the first dev deploy, create the remote env file:

```bash
ssh root@206.189.130.168
mkdir -p /root/apps/ado-b2b-dev/airline-b2b/server
nano /root/apps/ado-b2b-dev/airline-b2b/server/.env
```

Add at least:

```text
DATABASE_URL=postgresql://user:pass@localhost:5432/airline_b2b_dev?schema=public
```

`deploy-dev.sh` will create `JWT_SECRET` if it is missing and will set:

```text
NODE_ENV=production
PORT=5001
PUBLIC_WEB_ORIGIN=https://dev.b2b.booking.ado-finance.com
CORS_ORIGINS=https://dev.b2b.booking.ado-finance.com
```

## Deploy Commands

Rule: dev can be ahead of prod, but it should never be behind prod. The production deploy script enforces this by running the matching dev deploy first from the same local source tree.

Deploy dev:

```bash
./deploy-dev.sh --schema
```

Deploy prod only after following `FINAL_RELEASE_PLAN.md`:

```bash
./deploy.sh --schema
```

That command first runs:

```bash
./deploy-dev.sh --schema
```

Then it deploys production. For code-only deploys, `./deploy.sh` first runs code-only `./deploy-dev.sh`.

Emergency-only bypass:

```bash
./deploy.sh --skip-dev-sync
```

Use the bypass only when dev infrastructure is unavailable and production must be patched immediately.

For code-only redeploys:

```bash
./deploy-dev.sh
./deploy.sh
```

These are the only supported server deployment paths. Run production deployment
only after an explicit release decision and the checks in `FINAL_RELEASE_PLAN.md`.

## Daily PostgreSQL Backup

The maintained backup command is `scripts/backup-postgres.sh`. It creates a
permission-restricted custom-format dump, verifies that PostgreSQL can read its
catalog, and can encrypt the dump with `BACKUP_ENCRYPTION_PASSPHRASE`. Production
must set `REQUIRE_BACKUP_ENCRYPTION=1`. Use `scripts/test-postgres-restore.sh`
with a dedicated database whose actual name ends in `_restore_test` for a real
encrypted restore test.

Production scheduling is intentionally not installed by application deploys. Add
the daily cron/systemd schedule only during an explicitly approved production
operations change:

```bash
sudo scripts/install-backup-schedule.sh
scripts/pull-latest-backup.sh
scripts/install-local-backup-pull.sh
```

Store `BACKUP_ENCRYPTION_PASSPHRASE` in `/etc/ado-b2b/backup.env` with mode
`600`, not in the application `.env`. The installed systemd service reads that
file while the application process does not.

The server timer keeps two encrypted copies. The local pull verifies SHA-256 and
stores off-server copies under the ignored `.private-backups/` directory. Keep an
off-server copy of both the backup passphrase and chat encryption key; an
encrypted dump is unusable if its passphrase is lost.
