
# ADO B2B — Airline Ticket Distribution & Financial ERP

ADO B2B is a **closed-network airline distribution and financial control system** designed for strict B2B operations between airlines and partner agencies (firms).

This is not an e-commerce platform.
It is a **ledger-driven inventory + accounting system** with enforceable financial correctness.

---

# 🎯 System Purpose

ADO B2B solves a specific problem:

> Airlines distribute ticket inventory to agencies *before payment*, creating financial exposure.

This system enforces:

* **Controlled inventory distribution**
* **Precise debt tracking**
* **Audit-safe financial accounting**
* **Flight-level settlement**

---

# ⚠️ Core Principle

> Every action is a **financial event**.
> Every financial event produces **balanced ledger entries**.

If it cannot be represented in accounting → it does not exist in the system.

---

# 🧱 Architecture Overview

## Domains

1. **Inventory (Flights & Tickets)**
2. **Firms (Agencies)**
3. **Accounting (Double-Entry Ledger)**
4. **Transactions (Business Events)**
5. **Payments & Reconciliation**
6. **Settlement & Reporting**

---

# 🧾 Accounting Model (Non-Negotiable)

The system uses **double-entry accounting**.

## Chart of Accounts (Minimal)

* Accounts Receivable (per firm)
* Cash / Bank
* Ticket Inventory
* Revenue
* Cost of Goods Sold (COGS)
* Adjustments / Refunds

---

## Event → Ledger Mapping

| Event      | Debit                   | Credit              |
| ---------- | ----------------------- | ------------------- |
| Allocation | Accounts Receivable     | Ticket Inventory    |
| Sale       | Cost of Goods Sold      | Ticket Inventory    |
| Sale       | Accounts Receivable     | Revenue             |
| Payment    | Cash / Bank             | Accounts Receivable |
| Refund     | Revenue                 | Accounts Receivable |
| Refund     | Ticket Inventory / Loss | Cost of Goods Sold  |

✔ Always balanced
✔ Always immutable

---

# 🧩 Core Entities

## Flight

* id
* route
* departure_time
* settlement_status (`OPEN`, `CLOSED`)
* currency

---

## Ticket

* id (unique seat or unit)
* flight_id
* status:

  * `AVAILABLE`
  * `ALLOCATED`
  * `SOLD`
  * `CANCELLED`
  * `REFUNDED`
* base_price
* allocated_firm_id

---

## Firm

* id
* name
* credit_limit
* currency
* status

---

## Transaction (Business Layer)

* id
* type:

  * `ALLOCATION`
  * `SALE`
  * `PAYMENT`
  * `REFUND`
  * `ADJUSTMENT`
* firm_id
* flight_id
* metadata (JSON)
* idempotency_key (unique)

---

## LedgerEntry (Accounting Layer)

* id
* transaction_id
* debit_account
* credit_account
* amount
* currency
* exchange_rate_snapshot
* created_at

---

## Payment

* id
* firm_id
* amount
* method (`CASH`, `CARD`, `BANK_TRANSFER`)
* reference
* status
* reconciliation_status

---

# 📦 Inventory Lifecycle

```
AVAILABLE → ALLOCATED → SOLD
                     ↘
                   CANCELLED → REFUNDED
```

Rules:

* No double-selling (DB locks enforced)
* Allocation reduces available inventory
* Sale locks ticket permanently
* Refund creates reversal entries (never deletes)

---

# 💰 Financial Logic

## Allocation

* Firm receives ticket inventory
* System creates receivable

→ Firm now **owes airline**

---

## Sale

* Ticket sold to end customer
* Revenue recognized
* Inventory consumed

---

## Payment

* Firm pays airline
* Receivable reduced

---

## Refund / Cancellation

* Reverses revenue
* Adjusts receivable
* Returns or voids inventory

---

# 💱 Multi-Currency Handling

* Each transaction stores:

  * currency
  * exchange_rate_snapshot
* No retroactive recalculation allowed
* Reports use:

  * historical rates (default)
  * optional normalized currency view

---

# 🔐 Data Integrity Guarantees

* PostgreSQL transactions (ACID)

* Row-level locking:

  ```sql
  SELECT ... FOR UPDATE
  ```

* Isolation level:

  * `REPEATABLE READ` (minimum)
  * `SERIALIZABLE` (recommended for payments)

* Idempotency keys for:

  * Payments
  * Sales
  * External integrations

---

# 🧮 Settlement System (Critical)

Each flight has a financial lifecycle.

## States

* `OPEN` → active operations
* `CLOSING` → reconciliation phase
* `CLOSED` → locked (no mutations allowed)

## Settlement Includes

* Total allocated value
* Total sold revenue
* Total payments received
* Outstanding receivables
* Discrepancies

After closing:

* Data becomes **read-only**
* Adjustments require **new transactions only**

---

# 📊 Reporting (Required)

## Flight-Level

* Tickets allocated / sold / remaining
* Revenue
* Receivable
* Cash collected
* Profit / loss

---

## Firm-Level

* Current debt
* Credit utilization
* Payment history
* Profit margin

---

## Global Dashboard

* Total receivables
* Cash flow
* Inventory utilization
* Revenue trends

---

# 🧑‍💼 Roles & Permissions (RBAC)

## SUPERADMIN (Airline Owner)

* Full system control
* Global financial visibility
* Settlement authority

## ADMIN

* Flight management
* Ticket allocation
* Reporting access

## FIRM

* View own inventory
* Log sales
* Record payments
* View debt and reports

---

# 🔗 Invitation System

* Token-based onboarding
* Expiration enforced
* Single-use links
* Firm creation tied to invitation

---

# 💳 Payment & Reconciliation

## Supported

* Cash
* Card
* Bank transfer

## Features

* Partial payments
* Overpayment tracking (credit balance)
* Reconciliation status:

  * `PENDING`
  * `MATCHED`
  * `FAILED`

---

# 🔁 Adjustments System

No direct edits allowed.

Corrections are handled via:

* Adjustment transactions
* Reversal entries
* Audit trail preserved

---

# 🧪 Testing Strategy

* Unit tests for:

  * ledger balancing
  * transaction flows

* Integration tests:

  * concurrent ticket sales
  * payment idempotency

* Critical:

  * race condition validation

---

# 🚀 Tech Stack

* **Frontend:** Next.js (App Router), Tailwind, React Query, Zod
* **Backend:** Node.js, Express
* **Database:** PostgreSQL
* **ORM:** Prisma
* **Testing:** Vitest, Supertest
* **Language:** TypeScript (strict mode, no `any`)

---

# 🧠 Non-Obvious Constraints

* No delete operations on financial data
* No update after transaction commit
* All financial state derived from ledger (not mutable fields)
* Reports must be reproducible from ledger alone

---

# 🧩 What This System Is NOT

* Not a booking engine
* Not a payment gateway
* Not a customer-facing app

---

# 🏁 Final Statement

ADO B2B is a **controlled financial environment**, not a CRUD app.

If implemented correctly:

* Every number is explainable
* Every action is auditable
* Every discrepancy is traceable

If not:

* The system becomes unreliable immediately

---