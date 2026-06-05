

# ADO B2B — SYSTEM SPEC (LLM-OPTIMIZED)

## 0. Objective

Build a **B2B airline ticket distribution system with strict financial accounting**.

System must guarantee:

* No inconsistent financial state
* No double-selling
* Full auditability
* Deterministic reports from ledger only

---

## 1. Core Invariants (MUST NEVER BE VIOLATED)

1. Every financial event produces **balanced double-entry ledger entries**
2. Ledger entries are **immutable**
3. No delete operations on financial data
4. Ticket cannot be sold more than once
5. All balances must be derivable from ledger (no stored totals)
6. Each transaction must be **idempotent**
7. Exchange rate is **snapshotted at transaction time**
8. Closed flights must reject mutations

---

## 2. System Domains

* Inventory (Flights, Tickets)
* Firms (Agencies)
* Transactions (Business events)
* Ledger (Accounting layer)
* Payments
* Settlement
* Reporting

---

## 3. Data Models (Strict Contract)

### Flight

```
id: string
route: string
departure_time: datetime
currency: string
settlement_status: ENUM(OPEN, CLOSING, CLOSED)
created_at
```

---

### Ticket

```
id: string
flight_id: string
status: ENUM(AVAILABLE, ALLOCATED, SOLD, CANCELLED, REFUNDED)
base_price: decimal
allocated_firm_id: string | null
created_at
```

---

### Firm

```
id: string
name: string
credit_limit: decimal
currency: string
status: ENUM(ACTIVE, SUSPENDED)
created_at
```

---

### Transaction (Business Event)

```
id: string
type: ENUM(ALLOCATION, SALE, PAYMENT, REFUND, ADJUSTMENT)
firm_id: string
flight_id: string | null
idempotency_key: string UNIQUE
metadata: JSON
created_at
```

---

### LedgerEntry (Accounting Layer)

```
id: string
transaction_id: string
debit_account: string
credit_account: string
amount: decimal
currency: string
exchange_rate_snapshot: decimal
created_at
```

---

### Payment

```
id: string
firm_id: string
amount: decimal
method: ENUM(CASH, CARD, BANK_TRANSFER)
reference: string
status: ENUM(PENDING, CONFIRMED, FAILED)
reconciliation_status: ENUM(PENDING, MATCHED, FAILED)
created_at
```

---

## 4. Chart of Accounts (Minimum Required)

```
ACCOUNTS_RECEIVABLE
CASH
BANK
TICKET_INVENTORY
REVENUE
COGS
REFUND_ADJUSTMENT
```

---

## 5. Ticket Lifecycle (State Machine)

```
AVAILABLE → ALLOCATED → SOLD
                     ↘
                   CANCELLED → REFUNDED
```

Rules:

* Only AVAILABLE tickets can be allocated
* Only ALLOCATED tickets can be sold
* SOLD tickets cannot revert without REFUND transaction
* State transitions must occur inside DB transaction

---

## 6. Business Logic (Deterministic)

### 6.1 Allocation

Input:

* firm_id
* ticket_ids[]

Process:

* Lock tickets (`SELECT FOR UPDATE`)
* Ensure status = AVAILABLE
* Update → ALLOCATED
* Assign firm_id

Ledger:

* DR ACCOUNTS_RECEIVABLE
* CR TICKET_INVENTORY

---

### 6.2 Sale

Input:

* firm_id
* ticket_id
* sale_price

Process:

* Lock ticket
* Ensure status = ALLOCATED and belongs to firm
* Update → SOLD

Ledger:
1.

* DR COGS
* CR TICKET_INVENTORY

2.

* DR ACCOUNTS_RECEIVABLE
* CR REVENUE

---

### 6.3 Payment

Input:

* firm_id
* amount
* method

Process:

* Create payment record

Ledger:

* DR CASH/BANK
* CR ACCOUNTS_RECEIVABLE

---

### 6.4 Refund

Input:

* ticket_id

Process:

* Lock ticket
* Ensure status = SOLD
* Update → REFUNDED or CANCELLED

Ledger:
1.

* DR REVENUE
* CR ACCOUNTS_RECEIVABLE

2.

* DR REFUND_ADJUSTMENT or INVENTORY
* CR COGS

---

### 6.5 Adjustment

Used for:

* manual corrections
* rounding differences

Must:

* produce balanced ledger entries

---

## 7. Concurrency & Consistency

* Use DB transactions for ALL business operations
* Use:

```
SELECT ... FOR UPDATE
```

* Isolation:

  * Minimum: REPEATABLE READ
  * Preferred: SERIALIZABLE (payments, sales)

* Prevent:

  * double allocation
  * double sale

---

## 8. Idempotency

Each transaction must include:

```
idempotency_key UNIQUE
```

If duplicate:

* return existing result
* DO NOT reprocess

Applies to:

* payments
* sales
* external integrations

---

## 9. Settlement System

Each flight must support closing.

### States

```
OPEN → CLOSING → CLOSED
```

### Rules

* CLOSED = no mutations allowed
* Only adjustments allowed post-close

### Settlement Calculation

* total_allocated_value
* total_sales
* total_payments
* outstanding_receivables

---

## 10. Reporting (Derived Only)

DO NOT store aggregates.

Compute from ledger.

### Required Reports

#### Flight

* allocated tickets
* sold tickets
* revenue
* receivables
* payments

#### Firm

* total debt
* payment history
* credit usage

#### Global

* total receivables
* total cash
* revenue trends

---

## 11. Multi-Currency

Each ledger entry must store:

```
currency
exchange_rate_snapshot
```

Rules:

* No recalculation of past transactions
* Reports may normalize using stored rates

---

## 12. RBAC

Roles:

### SUPERADMIN

* full access
* settlement control

### ADMIN

* manage flights
* allocate tickets

### FIRM

* view own data only
* log sales
* record payments

---

## 13. Invitation System

* token-based
* single-use
* expiration enforced

---

## 14. Prohibited Operations

* DELETE on:

  * transactions
  * ledger entries
  * payments

* UPDATE on:

  * ledger entries

* Direct balance mutation

---

## 15. Required Validations

* firm credit limit check before allocation
* ticket ownership check before sale
* flight must be OPEN
* amount > 0 for all financial operations

---

## 16. Testing Requirements

Must include:

1. Concurrent ticket sale test
2. Idempotent payment test
3. Ledger balance validation test
4. Refund correctness test
5. Settlement lock test

---

## 17. Expected Implementation Behavior

AI must:

* Use strict TypeScript (no `any`)
* Use transactions for all critical operations
* Keep business logic in service layer
* Separate:

  * controllers
  * services
  * repositories

---

## 18. Output Expectations (for AI)

When implementing:

1. Generate full DB schema
2. Implement services with transaction safety
3. Enforce all invariants in code
4. Provide tests for critical flows
5. Do not simplify accounting logic

---

## FINAL CONSTRAINT

If any implementation step violates:

* double-entry accounting
* immutability
* idempotency

→ implementation is INVALID

---
