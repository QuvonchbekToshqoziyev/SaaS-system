# ADO B2B - Airline Ticket Distribution & Financial Platform

Welcome to the **ADO B2B** platform. This project is a comprehensive, production-ready ERP system designed specifically for airlines and their partner travel agencies (firms). It serves as an **inventory, accounting, and reporting system** with strict financial integrity built-in.

---

## ❓ What is this website?

ADO B2B is a closed-network, invitation-only portal where an airline can distribute flight tickets to wholesale partner agencies. Instead of a standard e-commerce flow, this platform operates on a strict **B2B ledger model**. It tracks how many tickets are allocated to a specific agency, how many have been sold to actual passengers, and exactly how much debt the agency owes to the airline.

### Core Domain Entities
* **Flights & Tickets:** Real-time inventory of available seats.
* **Firms (Agencies):** B2B partners who sell tickets on behalf of the airline.
* **Transactions Ledger:** An immutable record of every financial event (Allocations, Sales, and Payments).
* **Invitations:** Secure, token-based onboarding for new partner agencies.

---

## 💡 Why use this system?

Generic SaaS boilerplates fail at airline accounting because they do not handle the complexities of B2B debt and multi-currency exchange rates. ADO B2B solves this by enforcing:

1. **Debt-First Financial Ledger:**
   * **Allocation:** When a firm is given tickets to sell later, they incur a *payable debt*.
   * **Sale:** When a firm sells a ticket, it generates *revenue*.
   * **Payment:** When the firm remits money to the airline, their *debt is reduced*.
2. **Immutable Transactions:** Once a ticket is sold or a payment is logged, it cannot be altered. Changes must be handled via specific adjustment transactions.
3. **Strict Data Integrity:** Double-selling the same ticket is impossible thanks to PostgreSQL locking and raw database transactions. Exchange rates are snapshotted at the exact time of the transaction to prevent historical data corruption.
4. **Role-Based Access Control (RBAC):** `SUPERADMIN` (the airline) has full visibility over global revenue and liabilities, while `FIRM` users can only view their own ticket allocations, outstanding debt, and sales performance. 

---

## 🛠 How to Use the Platform

Because this is a strict B2B portal, there is **no public sign-up**. Access is strictly by invitation.

### For Airline Administrators (`SUPERADMIN` / `ADMIN`)
1. **Onboarding Firms:** Navigate to the **Firms** menu to generate an invitation link. Send this link to your new agency partner.
2. **Flight Management:** In the **Flights** dashboard, create new flights, define capacities, base pricing, and departure/arrival times.
3. **Allocating Inventory:** Assign chunks of available tickets to specific firms. *Note: this immediately increases that firm's outstanding debt.*
4. **Monitoring Financials:** Use the **Reports** and **Global Dashboard** to track total revenue, outstanding liabilities from all firms, and reconcile payments.

### For Partner Agencies (`FIRM`)
1. **Account Activation:** Click the secure invitation link provided by the airline, set your secure password, and log in.
2. **Inventory Access:** View the tickets allocated to your firm on the dashboard.
3. **Logging Sales:** As you sell tickets to passengers, record the sales in the system. This converts your allocated inventory into realized revenue.
4. **Making Payments:** Record cash or card payments remitted to the airline to clear your outstanding debt balance.

---

## 💻 Tech Stack

This platform is built using modern, enterprise-grade technologies optimized for speed, clarity, and safety:

* **Frontend:** Next.js (App Router, Static Export), Tailwind CSS, `@tanstack/react-query` (Data caching), `zod` & `react-hook-form` (Strict validation).
* **Backend:** Node.js, Express.js.
* **Database:** PostgreSQL with Prisma ORM.
* **Testing:** `vitest` / `supertest` for critical controller and transaction lock validations.
* **Shared Types:** Strict TypeScript configurations bridging the client and server boundaries to eliminate `any` castings and runtime payload errors.

---

## 🚀 Setup & Deployment

For detailed instructions on running this platform locally, seeding the database, or deploying it to a Linux/Nginx VPS environment, please refer to the documentation in:
* [`airline-b2b/setup.md`](./airline-b2b/setup.md)
* Deployment shell scripts are located in the `/scripts` directory.

