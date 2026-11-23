# Backend rebuild audit and evidence

2026-11-23. Historical first-wave audit. The later canonical implementation and real isolated restore supersede the runtime gaps listed here: see `canonical-backend.md` and `feature-parity.md`. No production migration occurred.

## Baseline and protected behavior

The existing Convex deployment is already shop-wide: `ownerId` identifies the actor and does not define a tenancy boundary. No organizations table exists. Existing `accounts`, JWT revocation/session versions, reset tokens, shared contacts (`sellers`), pending purchases, supplier receipts/lots, consignment agreements/returns/payouts, FIFO sales/allocations, mixed payment corrections, gifts/display openings/reversals, document signatures and email states remain active. No table was removed or renamed. Existing renderers and receipt identity generator were left intact.

| Capability | Existing implementation | Change | Verification |
|---|---|---|---|
| Authentication, account/session/reset | auth, authService; API auth middleware | retained | existing tests pass |
| Shared contacts/purchases and corrections | operations, purchaseEditing | grading accepts custom company names | existing tests pass |
| Supplier FIFO, gifts, displays, reversal | inventory, stockLedger | grading accepts custom company names | existing tests pass |
| Sales, mixed collections, cancellations | operations, salePayments | retained | existing tests pass |
| Consignment contracts/signatures/returns/payouts | consignmentOperations, signedReceipts | grading accepts custom company names | existing tests pass |
| Company dictionary | previously closed enums | gradingCompanies records + auth CRUD with revision and normalized uniqueness | new rebuild tests pass |
| Convention detail/gallery | previously cover-only | allowlisted publicProduct DTO and authenticated-service photo-key resolution | new privacy/eligibility tests pass |
| PDF/archive/email | signedReceipts, saleTickets, consignmentDocuments | unchanged | existing tests pass; visual/checksum verification lead-owned |
| Public branding | absent | generated public allowlist + two public route aliases | generation and typecheck |
| Full redesigned ledger/schema | legacy combined items/sales still authoritative | NOT migrated | blocked for release, not claimed complete |

## API contracts

- `GET /api/public/shop-config` and `GET /api/v1/public/shop-config`: root configuration's explicit `publicShopConfig` allowlist. Generate with `pnpm --filter @tcg-marge/api shop:config`; dev/build do this automatically. No legal details or server credentials are included.
- `GET /api/v1/grading-companies`: authenticated array of records, including archived records for historical selection. `POST` accepts name, optional abbreviation/HTTPS website; `PATCH /:id` also requires matching `expectedRevision` and permits `archived`. Historical item name snapshots remain stable when company records are renamed. No dictionary auto-seeding from production has been performed.
- `GET /api/v1/catalogue/:itemId`: eligible product, description, public grading/certificate, price, available quantity, photo IDs with cover first. No costs, actor, depositor, object keys, grading notes or evidence metadata.
- `GET /api/v1/catalogue/:itemId/photos/:photoId`: eligible item-owned image only, excluding purchase/supplier/gift evidence. Cover endpoint is retained. Every image request checks current visibility and availability, with no-store response.

## Validation

`node --import tsx --test tests/*.test.ts` passed 65 Convex tests and 46 API tests. The `tsx` CLI itself cannot bind its IPC socket inside this sandbox; the equivalent Node loader invocation works. Tests use convex-test/injected API transport; they are not real development deployment evidence. No deployment was performed. Backend and API typechecks are separately run by integration.

Remaining required work includes normalized tables and runtime migration adapters, full import/resume into isolated Convex, migration of company references instead of historical text-only snapshots, comprehensive bounded server pagination (public listing still collects available items), and real service/device integration verification.

Registration policy now comes from generated server-only configuration. Closed blocks all registration including bootstrap; temporarily set configuration open and redeploy for initial account creation. Legacy settings UI changes receive REGISTRATION_CONFIG_MANAGED (409); root config is authoritative. API sends policy via service-authenticated action and Convex enforces it transactionally. Registration regression test passed, bringing Convex coverage to 66 tests (65-suite run plus added passing policy test).

## Second-wave migration update

The former lossless-envelope-only rehearsal now has a separate strict normalized model and local checkpoint importer (`model.ts`, `normalize.ts`, `import-local.ts`). Real-backup offline conversion/package checks are recorded in `backend-migration.md`; prior statements that no real backup was available refer only to the first wave. Runtime legacy tables remain authoritative. No live Convex import/cutover has been performed or requested.
