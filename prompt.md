You are a senior full-stack engineer and system architect.

Your task: build a production-ready MVP for a **B2B airline ticket distribution and financial management platform**.

This system is NOT a simple CRUD app. It is an **inventory + accounting + reporting system with strict financial integrity**.

---

# 1. TECH STACK (STRICT)

* Frontend: Next.js (App Router)
* Backend: Node.js (Express or NestJS)
* Database: PostgreSQL
* ORM: Prisma
* Auth: JWT
* Styling: Tailwind CSS

---

# 2. ACCESS CONTROL (INVITATION-ONLY)

No public signup.

## Invitations Table

* id
* email
* firm_id
* role (superadmin | admin | firm)
* token (hashed)
* expires_at
* used_at
* created_by

## Flow

1. Admin generates invite → system returns link
2. Admin sends manually
3. User opens link:

   * validate token (exists, not expired, not used)
4. User sets password
5. Account created
6. Token marked used

## Security

* Token ≥ 32 bytes random
* Store hashed token
* Expiry: 48h
* One-time use

---

# 3. ROLES

* superadmin → full control
* admin → operational control
* firm → limited access (own data only)

---

# 4. CORE DOMAIN

Entities:

* Users
* Firms
* Flights
* Tickets
* Transactions
* CurrencyRates
* Invitations

---

# 5. TICKET SYSTEM

Each ticket:

* id
* flight_id
* price
* currency
* status (available | assigned | sold)
* assigned_firm_id

Rules:

* Ticket belongs to only one firm
* Sold tickets immutable
* Prevent double selling using DB transactions

---

# 6. FINANCIAL MODEL (DEBT-FIRST)

CRITICAL:

* Allocation = firm incurs debt
* Sale = firm earns revenue
* Payment = reduces debt
* Profit = revenue − debt

---

# 7. FINANCIAL EVENTS

## Allocation

Create transaction:

* type: payable
* increases debt

## Sale

Create transaction:

* type: sale
* increases revenue

## Payment

Create transaction:

* type: payment
* reduces debt

---

# 8. MULTI-CURRENCY SYSTEM

## CurrencyRates

* id
* base_currency
* target_currency
* rate (DECIMAL, high precision)
* recorded_at
* source

## Rule

Each transaction MUST store:

* original_amount
* currency
* exchange_rate (locked at time)
* base_amount

NEVER recalculate old transactions.

---

# 9. TRANSACTIONS TABLE

* id
* firm_id
* flight_id
* ticket_id (optional)
* type (sale | payable | payment | adjustment)
* original_amount
* currency
* exchange_rate
* base_amount
* payment_method (nullable)
* metadata (JSON)
* created_at

---

# 10. PAYMENT METHODS (STRICT VALIDATION)

Supported:

* cash
* card

## Rules

### Cash

* requires:

  * amount
  * date
* optional:

  * note

### Card

* requires:

  * amount
  * transaction_reference (REQUIRED)
  * payment_provider (e.g. Visa, MasterCard)
* must NOT be empty

## Validation

* Reject payment if required fields missing
* Store details in metadata JSON
* All payments must map to firm and flight

---

# 11. TRANSACTIONS PAGE

Create dedicated page:

## Features

* full transaction list
* filters:

  * date range
  * firm
  * flight
  * type
  * currency

## Columns

* date
* firm
* flight
* type
* original_amount
* currency
* exchange_rate
* base_amount
* payment_method
* reference

---

# 12. FLIGHT-BASED ACCOUNTING (CORE)

All transactions MUST include flight_id.

---

# 13. FLIGHT DASHBOARD

Each flight has detailed page:

## Metrics

* total tickets
* allocated tickets
* sold tickets
* unsold tickets
* total debt (payable)
* total revenue (sales)
* total payments
* outstanding debt
* profit (revenue - debt)

---

## Sections

### Ticket Table

* all tickets
* status

### Financial Summary

* debt
* revenue
* paid
* outstanding
* profit

### Firm Breakdown

* per firm:

  * tickets
  * sold
  * debt
  * payments
  * balance

---

# 14. GLOBAL DASHBOARDS

## Admin

* total revenue
* total debt
* total payments
* outstanding liabilities
* revenue over time
* liabilities over time

## Firm

* tickets assigned
* tickets sold
* total revenue
* total debt
* total paid
* current balance

---

# 15. REPORTING SYSTEM

## Required Reports

### Per Flight

* revenue
* debt
* profit
* outstanding

### Monthly

* totals grouped by month

### Per Firm

* performance breakdown

## Requirements

* use SQL aggregation
* optimize with indexes
* no recalculation from frontend

---

# 16. DATA INTEGRITY

* Use DECIMAL, not float
* Use DB transactions for:

  * selling tickets
  * allocating tickets
  * payments
* Prevent race conditions
* Ensure totals reconcile

---

# 17. API DESIGN

Auth:

* POST /auth/login

Invites:

* POST /invites
* POST /invites/accept

Tickets:

* POST /tickets
* GET /tickets

Allocation:

* POST /allocate

Sales:

* POST /sell

Payments:

* POST /payments

Transactions:

* GET /transactions

Reports:

* GET /reports/flight
* GET /reports/monthly

---

# 18. FRONTEND

Pages:

* Login
* Invite accept
* Admin dashboard
* Firm dashboard
* Flights list
* Flight details
* Transactions page

Requirements:

* role-based access
* clean tables
* filters

---

# 19. PROJECT STRUCTURE

* /server
* /client

Clear separation of concerns.

---

# 20. OUTPUT ORDER (MANDATORY)

1. Prisma schema
2. Backend implementation
3. Frontend pages
4. Setup instructions
5. Seed data

---

# 21. CONSTRAINTS

* Do NOT skip logic
* Do NOT simplify financial system
* Do NOT leave TODOs
* Code must run

---

# 22. QUALITY BAR

This will be shown to a real company.

Priorities:

* correctness > speed
* financial integrity > UI
* clarity > cleverness

---

Start now.
