# ADO B2B Airline Platform

ADO B2B is a private airline operations website for managing partner firms, flights, ticket inventory, sales, payments, and financial reports.

There is no public registration. The system starts with one real `SUPERADMIN` account. Every firm user must be invited from inside the website.

## First-Time Setup

Create the database schema, then bootstrap the real superadmin account:

```bash
cd airline-b2b/server
npm install
npx prisma generate --schema=prisma/schema.prisma
npx prisma db push --schema=prisma/schema.prisma
npm run bootstrap:superadmin
```

The bootstrap clears demo/application data and creates only one `SUPERADMIN`.

Initial login:

- Email: `admin@ado-finance.com`
- Password: `12345678`

After the first login, open `Settings` and change the password before using the system for real work. The bootstrap does not create test firms, sample flights, tickets, transactions, or demo users.

For local development from the repository root:

```bash
./dev.sh
```

The script starts the backend, frontend, and local proxy. It prints the website URL and the initial superadmin login.

## Website Login

1. Open the website URL.
2. Sign in with `admin@ado-finance.com` and `12345678`.
3. Open `Settings` and change the password.
4. After login, superadmin/admin users are sent to the admin dashboard. Firm users are sent to the firm dashboard.

## Admin Workflow

### Create Partner Firms

1. Open `Firms`.
2. Create a firm invitation with the partner agency email and firm name.
3. Copy the invitation link and send it to the partner privately.
4. The partner opens the link, sets their own password, and becomes a `FIRM` user.

### Create Flights and Tickets

1. Open `Flights`.
2. Add the flight route, flight number, departure/arrival times, currency, and ticket information.
3. Review the generated inventory before allocating tickets to firms.

### Allocate Tickets

1. Open a flight detail page.
2. Select available tickets.
3. Allocate them to a firm.
4. The firm can now see those tickets in its account, and the allocation is reflected in the ledger.

### Record Payments

1. Open `Kassa` or the relevant payment screen.
2. Record firm payments with the correct method, amount, and reference.
3. Use reports and transactions to reconcile the firm balance.

### Review Reports

Use `Reports` to monitor:

- flight sales and ticket status
- firm debt and payments
- transaction history
- superadmin-only admin/firm interaction reporting

## Firm Workflow

1. Open the invitation link from the airline.
2. Set a secure password.
3. Log in to the website.
4. Review allocated tickets and balances.
5. Record ticket sales when passengers buy tickets.
6. Track payments and outstanding debt from the dashboard, reports, and transaction pages.

Firm users can only see their own firm data.

## Roles

- `SUPERADMIN`: full system access, global reporting, user/firm oversight.
- `ADMIN`: operational access for flights, firms, allocations, payments, and reports.
- `FIRM`: restricted partner access for that firm only.

## Important Rules

- Treat `12345678` as an initial setup password only. Change it from `Settings` immediately after first login.
- Do not create users manually in the database unless you are recovering access.
- Create firm users through website invitations.
- Keep real production credentials in environment variables or a secure secret manager.
- Treat ticket allocation, sales, and payments as financial records; use correction flows instead of editing database rows directly.

## Useful Commands

```bash
# Start local development
./dev.sh

# Stop local development servers
./dev.sh --stop

# Bootstrap/reset to only the real superadmin
cd airline-b2b/server
npm run bootstrap:superadmin

# Run backend tests
cd airline-b2b/server
npm test
```
