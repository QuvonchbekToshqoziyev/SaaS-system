# Changelog

All releases use [Semantic Versioning](https://semver.org/):

- `PATCH` (`1.0.1`): backward-compatible bug fix, permission correction, or regression guard.
- `MINOR` (`1.1.0`): backward-compatible feature or workflow expansion.
- `MAJOR` (`2.0.0`): breaking API, data, or workflow change.

Every update must have a version, a changelog entry, and a passing release audit before deployment.

## [1.3.3] - 2026-07-18

### Fixed

- Platform adminlari xizmat inventarida faqat o‘ziga biriktirilgan firmalarning yozuvlarini ko‘radi; boshqa yoki faqat aloqador firmaning xizmatlari endi chiqmaydi.
- Adminlar ekranida `ADMIN` platforma roli ekani va firma administratori `FIRM_ADMIN` sifatida Firmalar bo‘limidan yaratilishi aniq ko‘rsatildi.

### Verification

- Release fixture biriktirilgan platforma admini uchun ruxsatli va ruxsatsiz firma xizmatlarini alohida tekshiradi.

## [1.3.2] - 2026-07-18

### Fixed

- Kassa `To‘lov qo‘shish` formasidagi airline/firma tanlovi `Kimga (to‘lov oluvchi)` sifatida yoziladi; kassa firmasi to‘lovchi bo‘lib, naqd yoki karta qoldig‘i kamayadi.
- `PAYMENT` kassa jami endi to‘lovchi va oluvchi firmaga qarab kirim/chiqimni ajratadi; mijozdan kelgan to‘lov kirim bo‘lib qoladi.
- Chiquvchi to‘lov operatsion kassa/karta hisobiga `sourceAccountId`, kiruvchi to‘lov esa `destinationAccountId` bilan bog‘lanadi.

### Verification

- Regression testi kassa firmasidan airline’ga to‘lovni `OUT`, mijozdan kassa firmasiga to‘lovni `IN` deb tasdiqlaydi.
- Dev release fixture airline uchun reysli `PAYMENT` yozuvini va USD kassa chiqim summasini live API orqali tekshiradi.

## [1.3.1] - 2026-07-18

### Fixed

- Kassa kirim/chiqim formasida backendda allaqachon qo‘llangan ixtiyoriy reys tanlovi ko‘rinadigan qilindi.
- Agent va Debitor/Kreditor hisobotlari `PAYMENT` bilan birga nomlangan `KASSA_IN/KASSA_OUT` to‘lovlarini ham qarzdan ayiradi va ikki yo‘nalishdagi to‘lov tafsilotlarini ko‘rsatadi.
- Firmaga tegishli reys inventari tannarxi airline oldidagi xarid qarzi sifatida, xizmat xaridi va assignmentlari esa tegishli kreditor/debitor sifatida hisoblanadi.
- Bosh sahifa transaction-only yig‘indilar o‘rniga bir xil agent ledger raqamlarini ishlatadi va eng yaqin 5 reys, eng katta debitorlar hamda kreditorlarni ko‘rsatadi.

### Verification

- Ledger regression testi reys va xizmat xaridi, kiruvchi kassa to‘lovi va chiquvchi kassa to‘lovining joriy qarzga ta’sirini tekshiradi.
- Dev release fixture airline xaridi va reysga bog‘langan `KASSA_OUT` to‘lovini API orqali tekshiradi.

## [1.3.0] - 2026-07-18

### Added

- Added a named `Kimdan (to‘lovchi)` firm selector to Kassa payments and persist the selected payer/receiver pair without expanding tenant access.
- Added an Agent ledger matching the operator spreadsheet: old balance, total tickets, total tours, sales, payments, real balance, and click-through flight/ticket/tour purchase details.
- Added named current receivable and payable tables so firms that owe us and firms we owe are shown separately with their current debt per currency.
- Added edit and delete controls for sold tours; corrections atomically update the linked sale, financial transaction, ticket legs, service reservations, package stock, and audit log.

### Verification

- Added unit coverage for agent balance math and complete RT-pair selection during sold-tour corrections.
- Added a versioned dev fixture with an accepted allocation, prior balance, and named agent payment for live report verification.
- Prisma validation/generation, 103 server tests, backend build, frontend typecheck, and production frontend build pass locally.

## [1.2.3] - 2026-07-17

### Fixed

- Kassa cash movements now accept a firm shown in the counterparty selector without granting access to that firm's private accounts, desks, employees, or transactions.
- Kept the operating-firm and kassa-desk checks tenant-scoped; only the selected counterparty reference uses the existing related-firm visibility rule.

### Verification

- Reproduced the previous `403 Counterparty is not accessible` response with a real related firm on dev.
- Extended the five-role kassa workflow audit to create a cash row with a related counterparty, verify the saved counterparty ID, soft-delete the row, and confirm it immediately disappears.
- Serialized the five-role browser smoke in CI and allowed slow post-audit authentication to settle without weakening its API 5xx or application-error assertions.

## [1.2.2] - 2026-07-17

### Fixed

- Removed the permanently open Tour sale form from every table row; the table now shows one clear `Sotish` button and opens a spacious sale dialog only for the selected package.
- `Bekor qilish`, the close button, and the dialog backdrop now discard the sale draft and return to the regular Tour table without writing data.
- Buyer, quantity, price, and USD exchange-rate controls use the responsive operation grid inside the dialog, so labels and fields cannot overlap in the table's right-hand columns.

### Verification

- Browser-verified at 1440px and 390px that table rows contain no sale inputs, the dialog opens, Confirm starts disabled, and Cancel/close remove the dialog.
- Separately verified that `Xizmat qo‘shish` opens its form and its own Cancel button restores the regular Tours screen.
- The release gate retries transient npm advisory transport failures while still failing persistent vulnerability results.

## [1.2.1] - 2026-07-17

### Fixed

- Rebuilt the add and edit forms in Transactions, Tours, and Services around a reusable 12-column operation layout: names, firms and flights receive wide fields, numeric controls stay compact, and notes/details use full-width multi-line areas.
- Corrected the mobile grid priority bug that compressed quantity, currency, status, previews, text areas, and action buttons into narrow slivers instead of full-width phone controls.
- Transaction account, payment, and cash work areas now use intentional collapsible sections; tour service selection and selling use labeled multi-row layouts instead of crowded one-line table controls.
- Enlarged service edit/delete controls and tour row actions to accessible action-button sizes without changing their permissions or business behavior.

### Verification

- Captured and inspected the actual create forms at 1440px and 390px, including Services, Tours, and Transactions payment entry.
- Added release guards for the shared operation-form primitive, the high-specificity mobile override, and full-width long-text fields in all three panels.

## [1.2.0] - 2026-07-17

### Changed

- Rebuilt the shared UI foundation as an aviation operations desk with flight-deck navy, runway blue, signal amber, stronger status colors, clearer surface hierarchy, and a restrained route-grid signature.
- Replaced the mixed display/body typography with operational headings, a highly readable interface face, and tabular mono-spaced financial values.
- Increased form controls to 44–48px, widened adaptive form columns, protected long select values, and made mobile fields and action footers fit without clipped text.
- Reworked the dashboard shell, navigation, cards, tables, Kassa panels, financial accounts, metrics, and action buttons around reusable semantic styles instead of page-specific glass treatments.

### Accessibility

- Added a keyboard skip link, visible shared focus treatment, reduced-motion behavior, touch-action handling, clearer field labels, semantic section elements, and stable image dimensions.
- Verified the redesigned Kassa, transactions, tours, flights, and dashboard surfaces in dark and light themes at desktop and 390px mobile widths.

### Verification

- Added recurring guards for the design tokens, responsive control grid, reduced-motion support, semantic shell, and section-card primitives.
- The changed frontend passes targeted ESLint and the full production Next.js build/typecheck.

## [1.1.3] - 2026-07-17

### Fixed

- Create, edit, import, payment, Kassa, ticket-allocation, ticket-sale, tour, service, chat, password, and access drafts now expose explicit Cancel and Confirm controls.
- Cancel clears or restores the current draft even when its required fields are incomplete; Confirm stays disabled until native field constraints and the relevant business rules both pass.
- Kassa and ticket operations now validate positive amounts, valid currencies and exchange rates, matching cards, required firms/desks/dates, inventory limits, and audit reasons before allowing confirmation.
- Ticket deallocation copy now reflects the allocation policy: inventory returns without creating an allocation transaction.

### Verification

- Added release guards requiring the shared validity-aware action controls on every main mutation surface and explicit validity guards for allocation, single-ticket sale, and batch sale confirmations.
- The changed UI passes targeted ESLint with zero errors and the full production Next.js build/typecheck.

## [1.1.2] - 2026-07-17

### Fixed

- Round-trip tour reservation and ticket allocation no longer use PostgreSQL's reserved `RETURNING` keyword as a raw-SQL alias.
- Agency-owned ticket inventory can be allocated firm-to-firm without an unrelated airline-connection error; the connection requirement remains enforced when the airline firm allocates its own origin inventory.

### Verification

- The release guard rejects the reserved SQL alias and requires the allocation controller to use the shared airline-owner connection policy.

## [1.1.1] - 2026-07-17

### Recovered

- Restored genuine manually entered Kassa and payment transactions from the verified pre-incident production backup while excluding every automatic ticket-allocation and service-inventory transaction.

### Safety

- Transaction and daily-cash deletion now only sets `status=DELETED` and `deletedAt`; transaction rows, ledger links, payment allocations, and business-document links are never physically deleted.
- Deleting a service also soft-deletes its historical transaction without destroying either record or their relationship.
- Financial reporting ignores payment allocations whose payment transaction is soft-deleted.
- The release gate now fails if runtime server code contains `transaction.delete()` or `transaction.deleteMany()`.

### Verification

- Added a focused soft-delete regression test and retained the live create-read-delete-read Kassa check, which requires a deleted row to disappear from all visible results.

## [1.1.0] - 2026-07-17

### Added

- Kassa operators can download a desk-bound Uzbek Excel template and upload up to 500 historical cash income/expense rows with their original business dates.
- The Kassa panel previews every row before writing and reports invalid dates, amounts, currencies, exchange rates, duplicate IDs, and closed or missing Kassa days.

### Safety

- Every imported row has a firm-and-desk-scoped idempotency key, so uploading the same completed template again does not create duplicate transactions.
- A batch with any invalid row writes nothing; imported rows are ordinary auditable Kassa adjustments and never create ticket-allocation, tour, or service transactions.
- The template is bound to the selected firm and Kassa desk, tenant scope is enforced again on the server, and read-only superadmins do not see the import control.

### Verification

- Added parser tests and a versioned dev fixture that validates preview, commit, preserved historical date/source, and idempotent re-upload through the live API.

## [1.0.8] - 2026-07-17

### Fixed

- A closed Kassa day no longer displays a delete action that the server must reject; the panel now tells the operator to reopen that exact day before changing its financial records.
- Successfully deleted Kassa income/expense rows disappear immediately from the day transaction list and its recalculated totals.

### Verification

- Added a live create-read-delete-read Kassa workflow check that requires the new row to appear before deletion and be absent immediately afterward.

## [1.0.7] - 2026-07-17

### Added

- Superadmins can create another superadmin as a strictly read-only account. It keeps the same cross-platform visibility but cannot create, update, delete, change passwords, or trigger any other mutation.
- The Admins panel shows and manages the read-only flag, while read-only operators see a persistent view-only banner and no global operation launcher.

### Safety

- Mutation authorization checks the account's current database flag on every non-read request, so an older login token cannot bypass a newly applied restriction.
- The platform refuses to demote, delete, or make read-only the final writable superadmin.
- Added a dev release fixture that verifies read access across admins, Kassa, transactions, and reports, plus enforced 403 responses for create, update, password-change, and delete attempts.

## [1.0.6] - 2026-07-17

### Fixed

- Kassa opening now carries each currency from the latest earlier business day that has a usable remainder, skipping closed days whose remainder is missing; a true first day starts at zero.
- Superadmin, assigned admin, firm admin, manager, and assigned kassir can open, close, and reopen past Kassa days without unexpected 403 responses.
- Kassirs are strictly limited to their assigned active desk across Kassa sessions, payments, transactions, cards, and history.
- Kassa history is now tenant- and desk-scoped, historical card balances exclude future payments, and daily cash corrections work on the selected open past day.
- Payment-card removal again supports the card creator while retaining superadmin and owning firm-admin access; deleted cards and transactions remain hidden.

### Verification

- Added a five-role live Kassa workflow audit covering panel access, past-day open/close/reopen, history isolation, carry-forward fallback, and the intentional wrong-desk denial.

## [1.0.5] - 2026-07-17

### Fixed

- Ticket allocations, allocation corrections, service inventory creation, and service-to-tour reservations no longer create financial transactions or inflate reports.
- Existing allocation/service setup rows are excluded from Transactions, Kassa, account balances, search, dashboards, and every report; deleted transactions are consistently excluded from all of those surfaces.
- Platform admins, firm admins, managers, and assigned kassirs now have matching client/server kassa operation rights instead of receiving unexpected 403 responses.
- A service added from the Tours page is immediately available and selected as a tour component, with the current flight preselected when possible.

### Safety

- Added a non-destructive migration that soft-deletes legacy inventory-only transaction rows while preserving their audit history.
- Replaced the old allocation-payable invariant with a deployment audit that requires zero active inventory-only financial rows.

## [1.0.4] - 2026-07-15

### Added

- Every dev deployment now runs an idempotent QA seed tied to the current release version.
- Added 1.0.4 fixtures for an allocated null-status flight, its single allocation payable, a no-login expired-firm kassa desk, a historical closed kassa day, and a partner-owned service isolation case.
- Added a live dev seed audit that verifies the fixture through source-firm, allocated-firm, and superadmin API views.
- Stabilized the 721-probe live endpoint audit for the small dev host by lowering default concurrency and retrying transport interruptions once without retrying HTTP failures.

### Safety

- The QA seed requires explicit dev-deploy opt-in and refuses any database URL other than the dedicated `airline_b2b_dev` database.
- The release audit fails when `VERSION` and the release fixture version differ, forcing each future update to include fitting dev test data.

## [1.0.3] - 2026-07-15

### Added

- Added a partial PostgreSQL unique index that enforces one active confirmed payable per ticket allocation for every firm.
- Added a post-deploy business-invariant audit that blocks a backend release when an accepted allocation has a missing, duplicate, or wrong-total payable.
- Added recurring release guards for shared flight lifecycle scope, kassa desk visibility, service owner isolation, tenant cache reset, and allocation transaction cardinality.
- Extended live tenant isolation auditing to purchased services.

### Changed

- All flight, report, service, tour, and ticket allocation consumers now reuse the shared active-flight predicate.
- Authentication identity changes clear the full React Query cache so data cannot carry between firms or roles.

## [1.0.2] - 2026-07-15

### Fixed

- Allowed authorized kassa users to open or reopen any business date independently, including past dates, without later sessions blocking the operation.
- Kept active kassa desks visible in superadmin monitoring even when the firm has no active login or its subscription has ended; desk labels now lead with the desk code and name.
- Unified the active-flight predicate so legacy flights with a null status remain available in flights, tour creation, and service validation when the firm owns allocated inventory.
- Scoped purchased service inventory to its owner firm and isolated actor-specific React Query caches for flights, firms, employees, and admins.
- Enforced one payable transaction per ticket allocation and added an audited, idempotent repair for legacy per-ticket transaction rows.

### Verification

- Added regression coverage for nullable flight status, firm service isolation, kassa desk visibility, historical kassa operation, and allocation-level payable creation.

## [1.0.1] - 2026-07-15

### Fixed

- Separated related-firm directory visibility from tenant-owned operational access. A confirmed business relationship may expose a counterparty name, but no longer grants access to that firm's accounts, transactions, notifications, employees, or kassa data.
- Aligned route middleware with controller policy for superadmin chat settings/interactions, firm-only service creation, service edit/delete, and firm updates.
- Made production schema deploy fail closed: verified PostgreSQL backup first, and no automatic `--accept-data-loss`.
- Cleared runtime high-severity dependency advisories by updating Axios resolution, Next.js to `16.2.10`, and server transitive packages; remaining client advisories are moderate transitive `postcss`/`uuid` findings whose automated fixes are breaking downgrades.

### Added

- Complete contract inventory for all 128 mounted API endpoints and five QA actors.
- Static client/server API-path drift audit covering 100 frontend API calls.
- Strict dev authentication, route-RBAC, safe controller, and read-endpoint probes.
- Live tenant-data isolation checks for firm admin, manager, kassir, and assigned admin scopes.
- Playwright smoke coverage for five-role login, navigation visibility, critical page loading, browser errors, and API `5xx` responses.
- Repeatable release audit, version consistency check, and expanded recurring-mistakes checklist.

## [1.0.0] - 2026-07-15

- Named baseline release for the existing ADO B2B flights, ticket inventory, allocations, tours, services, firms, kassa, transactions, reports, employees, chat, and notification workflows.
