# ADO B2B Server Migration Readiness

Date: 2026-08-26

This document prepares a zero-downtime migration for `airline-b2b` without
stopping the current production site.

## Current Live Inventory

- Production domain: `https://b2b.booking.ado-finance.com`
- Dev domain: `https://dev.b2b.booking.ado-finance.com`
- Current server: `206.189.130.168`
- Production backend: `/root/apps/ado-b2b/airline-b2b/server`
- Production webroot: `/var/www/b2b.booking.ado-finance.com/html`
- Production PM2 app: `airline-b2b-server`
- Production backend port: `5000`
- Dev backend: `/root/apps/ado-b2b-dev/airline-b2b/server`
- Dev webroot: `/var/www/dev.b2b.booking.ado-finance.com/html`
- Dev PM2 app: `airline-b2b-dev-server`
- Dev backend port: `5001`
- Nginx production config: `/etc/nginx/sites-available/b2b.booking.ado-finance.com`
- Nginx dev config: `/etc/nginx/sites-available/dev.b2b.booking.ado-finance.com`

Read-only verification on 2026-08-26:

- Public production smoke passed.
- `b2b.booking.ado-finance.com` resolved to `206.189.130.168`.
- `dev.b2b.booking.ado-finance.com` resolved to `206.189.130.168`.
- Remote PM2 apps were online.
- Remote Nginx config test passed.
- Production cert expires `Nov 1 2026 GMT`.
- Dev cert expires `Oct 9 2026 GMT`.
- Host: Ubuntu 24.04.4 LTS, 1 vCPU / 1 GB RAM, 24 GB disk, 2 GB swap.

## Non-Negotiable Rules

- Do not stop or restart the current production app during preparation.
- Do not point DNS at the new server until the new server has passed host-header
  smoke checks by direct IP.
- Do not copy dev QA data to production.
- Do not run `prisma db push --accept-data-loss` on production.
- Do not promote production until the exact source has passed dev verification
  and the user explicitly confirms production cutover.
- Keep the current server alive until DNS propagation and production smoke pass
  from multiple checks.

## Required Runtime Inputs For New Server

Copy these values from the old server securely. Do not commit them.

Production server `.env` keys observed:

- `DATABASE_URL`
- `JWT_SECRET`
- `CHAT_ENCRYPTION_KEY` or existing compatible chat encryption key if present
- `NODE_ENV`
- `PORT`
- `PUBLIC_WEB_ORIGIN`
- `CORS_ORIGINS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- SMTP keys if outbound email is still used
- upload/file limit keys if uploads are still used

The current production env also contains older compatibility keys such as
`CLIENT_URL`, `API_URL`, `SESSION_SECRET`, and `CORS_ORIGIN`. Preserve them on
the first migration pass unless the app has been audited without them.

## Zero-Downtime Migration Sequence

1. Lower DNS TTL before cutover.

   Set low TTL, for example 60 seconds, for:

   - `b2b.booking.ado-finance.com`
   - `dev.b2b.booking.ado-finance.com`

   Do this ahead of the move. Keep records pointing at `206.189.130.168` until
   the new server is ready.

2. Bootstrap the new server.

   Install minimum runtime packages:

   ```bash
   apt-get update
   apt-get install -y nginx postgresql-client rsync curl git nodejs npm certbot python3-certbot-nginx
   npm install -g pm2
   ```

   Create the same directories:

   ```bash
   mkdir -p /root/apps/ado-b2b/airline-b2b/server
   mkdir -p /root/apps/ado-b2b-dev/airline-b2b/server
   mkdir -p /var/www/b2b.booking.ado-finance.com/html
   mkdir -p /var/www/dev.b2b.booking.ado-finance.com/html
   ```

3. Prepare the production database.

   If the database remains external, update only network allowlists and keep
   `DATABASE_URL` stable.

   If the database moves too:

   - Take a fresh production backup with `scripts/backup-postgres.sh`.
   - Restore into the new database.
   - Verify restore with `pg_restore --list` and app business invariants.
   - Plan a short write-free cutover window if writes cannot be replicated.

4. Stage the new server without DNS cutover.

   Use the existing deploy scripts with environment overrides pointed at the new
   IP only after env files are ready there:

   ```bash
   REMOTE_SERVER_IP=<new-ip> ./deploy-dev.sh --schema
   REMOTE_SERVER_IP=<new-ip> ./deploy.sh --dev-verified
   ```

   If DNS still points at the old server, verify the new server with direct IP
   and `Host` headers before changing DNS. Do not treat `--live-only` as a new
   server check until the dev hostname resolves to the new IP, because the audit
   uses the hostname URL.

   ```bash
   curl -I http://<new-ip>/ -H 'Host: b2b.booking.ado-finance.com'
   curl -I http://<new-ip>/api/auth/me -H 'Host: b2b.booking.ado-finance.com'
   ```

5. Verify new server before DNS.

   Required checks:

   - `pm2 status` shows `airline-b2b-server` online.
   - `nginx -t` passes.
   - `/api/` proxy reaches port `5000`.
   - Static deep links work with `Host: b2b.booking.ado-finance.com`.
   - `npm run audit:business-invariants` passes on the production backend.
   - No new fatal PM2 logs.

6. Cut over DNS.

   Change only the DNS A record after the new server passes direct-IP checks.
   Keep the old server running. Watch both:

   ```bash
   getent ahostsv4 b2b.booking.ado-finance.com
   BASE_URL=https://b2b.booking.ado-finance.com ./scripts/prod-smoke.sh
   ```

7. Post-cutover hold.

   Keep old production online until:

   - DNS resolves to the new IP from expected networks.
   - Production smoke passes through the domain.
   - PM2 logs on the new host show no fresh fatal errors.
   - Operators confirm login and critical pages.

## Rollback

Rollback before database writes diverge:

1. Point DNS back to `206.189.130.168`.
2. Keep old PM2 and Nginx untouched.
3. Re-run:

   ```bash
   BASE_URL=https://b2b.booking.ado-finance.com ./scripts/prod-smoke.sh
   ```

Rollback after database writes diverge requires a database-specific plan. Do not
blindly restore an old dump over newer production writes.

## Read-Only Preflight

Run:

```bash
./scripts/migration-preflight.sh
```

Optional new server probe:

```bash
NEW_SERVER_IP=<new-ip> ./scripts/migration-preflight.sh
```

The script is read-only. It performs public smoke, DNS checks, and remote
inventory if credentials are available.
