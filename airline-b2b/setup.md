# Setup & Deployment Instructions

## Live Deployment Status
* **Backend:** Deployed to Ubuntu remote server (`206.189.130.168`), running under PM2 (`airline-backend` on port `5000`). Database is seeded locally in `airline_db`.
* **Frontend:** Built via Next.js `output: export` and served by Nginx from a static webroot (example: `/var/www/airline-b2b/html`).

## Requirements
* Node.js v18+
* PostgreSQL DB running locally or remotely

## Steps for Local Development

### 1. Database Setup
Ensure PostgreSQL is running.
Create a database named `airline_db`.

### 2. Backend Setup
1. Open terminal in `/server` directory:
   ```bash
   cd ./airline-b2b/server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set your `.env` file with `DATABASE_URL` and `JWT_SECRET`:
   ```bash
   DATABASE_URL="postgresql://user:pass@localhost:5432/airline_db?schema=public"
   # REQUIRED: the API will refuse to start if missing
   JWT_SECRET="your-super-secret"
   # Used for absolute invite links returned by POST /invites
   # (set this to your real website domain in production)
   PUBLIC_WEB_ORIGIN="https://your-domain.com"

   # Optional: explicit CORS allow-list for cross-origin frontend setups
   # (comma-separated origins; useful if your frontend runs on a different host/port)
   # CORS_ORIGINS="http://localhost:3000,https://your-domain.com"

   # Optional (testing/debug): structured logger level
   # LOG_LEVEL="debug"

   # Optional (testing): log every request/action performed by admins & firms
   # LOG_ACTIONS="1"

   # Optional (testing/debug): persist the in-app error registry to disk
   # (enables tracking OPEN/RESOLVED errors across restarts)
   # ERROR_REGISTRY_PATH="./error-registry.json"
   ```
4. Push Prisma schema:
   ```bash
   npx prisma db push
   ```
5. (Optional) Run the seed script:
   ```bash
   npx ts-node prisma/seed.ts
   ```
6. (Optional) Populate multiple firm accounts (non-destructive):
   ```bash
   # Defaults: FIRMS_COUNT=5, FIRMS_PASSWORD=firm123
   npm run seed:firms

   # Example: create 20 firms, starting from firm1@airline.com
   FIRMS_COUNT=20 FIRMS_START_INDEX=1 npm run seed:firms
   ```
7. Start the backend DEV server:
   ```bash
   npm run start:dev
   ```

### 3. Frontend Setup
1. Open terminal in `/client` directory:
   ```bash
   cd ./airline-b2b/client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env.local` to point to the backend API:
   ```bash
   NEXT_PUBLIC_API_URL=http://localhost:5000
   ```
4. Start Next.js development server:
   ```bash
   npm run dev
   ```

## Included Seed Data
* **Superadmin**: `email: admin@airline.com` | `password: superadmin123`
* **Test Firm**: `email: agency@airline.com` | `password: firm123`

When using `npm run seed:firms`, additional firm users are created:
- `firm1@airline.com`, `firm2@airline.com`, ... (password comes from `FIRMS_PASSWORD`, default `firm123`)

## Production notes (static export)
When adding new pages (e.g. `/firms`, `/settings`), production must be updated by deploying the latest `client/out/` folder to the Nginx webroot.

Quick verification:
- Run `./scripts/prod-smoke.sh` from the repo root.

Production tester (recommended):
- Smoke (non-mutating): `node scripts/prod-tester.mjs`
- Strict (checks admin auth + `/auth/users`): `node scripts/prod-tester.mjs --strict`
- Invite E2E (mutating): `node scripts/prod-tester.mjs --invite-flow` (or `node scripts/prod-invite-flow.mjs`)
   - To avoid creating a new firm/user each run, set `FIRM_EMAIL` + `FIRM_PASSWORD` once and reuse that account.
   - Set `FORCE_NEW_FIRM_USER=1` if you explicitly want a fresh invite accept.

Deploy (recommended):
- `cd airline-b2b/client && npm run build`
- `./scripts/deploy-client-out.sh`

Backend deploy (recommended):
- Ensure production has a `JWT_SECRET` (required; the API will refuse to start if missing):
   - `bash ./scripts/remote-set-jwt-secret.sh`
- Deploy and restart PM2:
   - `bash ./scripts/deploy-backend.sh`
    - If you changed Prisma schema and see missing-column errors in prod, run once with:
       - `RUN_PRISMA_DB_PUSH=1 bash ./scripts/deploy-backend.sh`

Server-side Nginx check (deep links):
- Find the active site config:
   - `sudo nginx -T | sed -n '/server_name quvonchbek.me/,/}/p'`
- Ensure the site `location /` uses:
   - `try_files $uri $uri/ $uri/index.html =404;`
- Reload:
   - `sudo nginx -t && sudo systemctl reload nginx`

Remote diagnosis helper (recommended):
- `./scripts/remote-nginx-diagnose.sh`
   - Prompts for SSH password (does not echo it)
   - Prints the active server block, the `root`, the `try_files`, and checks if `firms/index.html` exists under the webroot

Remote deep-link fix (recommended):
- `./scripts/remote-nginx-fix-deeplinks.sh`
   - Prompts for SSH password (does not echo it)
   - Finds the active Nginx config file for `quvonchbek.me`
   - Creates a timestamped backup
   - Ensures `location /` uses: `try_files $uri $uri/ $uri/index.html =404;`
   - Runs `nginx -t` and reloads Nginx

If deep links return 404 or redirect to login unexpectedly, verify Nginx uses:
- `try_files $uri $uri/ $uri/index.html =404;`
