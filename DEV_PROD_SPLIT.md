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

Deploy dev:

```bash
./deploy-dev.sh --schema
```

Deploy prod only after following `FINAL_RELEASE_PLAN.md`:

```bash
./deploy.sh --schema
```

For code-only redeploys:

```bash
./deploy-dev.sh
./deploy.sh
```

## Docker Compatibility

Docker is available for local/containerized runs only. It does not replace the current production or dev deployment scripts.

From the app directory:

```bash
cd airline-b2b
docker compose up --build
```

Defaults:

- Client: `http://localhost:3000`
- Server: `http://localhost:5000`
- PostgreSQL host port: `5433`

Keep production deploys on `./deploy.sh` and dev deploys on `./deploy-dev.sh` unless the release plan is intentionally changed.
