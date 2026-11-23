# Canonical Convex backend and real restore

2026-11-23. This is an isolated implementation/rehearsal target, **not a cutover**. The active local application on API3001/Convex3210 remains intact. Production was not contacted or deployed.

## Runtime and contracts

`convex/rebuild` is a separate Convex project with the actual redesigned table names and typed IDs. It avoids mixing incompatible canonical and legacy records inside union validators in the existing deployment. There are no organization tables or tenant IDs. Creation/update actors are audit fields.

The target runs on cloud port3220/site port3221 and keeps its own state under `convex/rebuild/.convex/local/default` (ignored, confidential). Start from that directory with its `dev` script; never reuse the legacy `.env.local` or deployment directory.

`schema.ts` defines products separately from physical/quantity stock items, acquisition lines/lots, sale lines and exact allocations, payment correction chains, consignment revisions/terms, document/file/signature links, operation idempotency and source mappings. Historical renderer snapshots remain tagged immutable serialized JSON; archived PDFs remain original R2 object references. Snapshot serialization is an adapter boundary, not a new PDF renderer.

- `transactions.ts`: canonical contacts, supplier/buyback acquisition, pending validation, FIFO sales, mixed payments, corrections, cancellation/restoration and depositor payouts.
- `domain.ts`: authenticated session/actor checks, idempotency, exact-cent FIFO, stock movements and depositor balance calculations. `transaction.ts` exposes the same typed handlers to compatibility adapters inside one Convex transaction.
- `compat.ts`, `operations.ts`, `readModels.ts`: existing Hono/realtime DTO adapters using canonical rows directly. Bulk compatibility sales retain independent cancellation of legacy sale lines, while each sale owns canonical line/allocation/payment records. No shadow legacy tables are written.
- `auth.ts` and `authService.ts`: server-secret protected account operations and persistent sessions. Password resets revoke sessions; every private domain/realtime read checks account version and the session record. Read-only realtime tokens cannot mutate. JWTs carry a custom `sessionJti` because the standard JWT `jti` is not exposed as a Convex identity attribute.
- `inventory.ts`, `workspaceReads.ts`: supplier reception, gifts, display openings, exact reversals, photo links, public/private product fields, and paginated document history.
- `purchaseEditing.ts`: optimistic correction digests, retained removed lines, usage locks, and preservation of historical acquisition cents on metadata-only changes.
- `consignmentOperations.ts`, `signedReceipts.ts`, `consignmentDocuments.ts`, `saleTickets.ts`, `documentStore.ts`, `attachments.ts`: signed revision gating, signed returns, partial payouts/statements, immutable archive references, delivery history and private evidence separation. Existing PDF renderers are reused.
- `reads.ts`: canonical detailed reads and allowlisted public products; public responses exclude costs, acquisition lots, supplier/depositor IDs and private notes.

The Hono process uses `DATA_MODEL=legacy` by default. A separate process can use `DATA_MODEL=canonical` and `CONVEX_URL=http://127.0.0.1:3220`. Canonical startup checks `system:deploymentInfo` and refuses a mismatched deployment. `DATA_MODEL` controls persistent session creation/renewal; both models preserve the existing HTTP routes as canonical adapters are completed. Do not point the normal workspace to this target until all adapters and workflows pass parity.

Local API3002 uses a separate JWT key/secret and origin `http://127.0.0.1:5175`. Keep its cookies separate from the existing localhost application. Its private environment files are in `/tmp/cartelites-canonical-rehearsal`, not version control. Storage uses a separate signed-S3 fixture on `http://127.0.0.1:3490`, reading the copied R2 backup and writing only a temporary overlay. Brevo is unconfigured. This exercises actual AWS-signed upload/download code without cloud object writes or emails. Cloud R2 and Brevo delivery remain unverified.

## Real importer

`apps/api/scripts/migration/import-convex.ts` takes the legacy export JSON, applies the already reviewed normalized transform, orders actual dependencies, and writes through `migrationService:execute`.

The tool accepts only a dedicated HTTP loopback target and explicitly refuses the existing3210/3211 and application ports. The server action also requires `MIGRATION_MODE=isolated-rehearsal`, a separate `MIGRATION_SECRET`, and a loopback Convex URL. This deliberately is not a production importer.

Each transaction inserts up to50 records and binds stable staging IDs to **real Convex IDs** in `legacyMappings`. References are rewritten before insertion and validated by the canonical Convex schema. The dossier/current-revision cycle is completed in a dedicated binding phase; stock operations are blocked while import status is `importing`. Original old-table/old-ID mappings remain alongside the normalized-ID bindings.

Source/plan digests are fixed when a new empty target is initialized. Retries compare existing per-record hashes and verify the bound record still exists. A changed source, duplicate identity with changed content, missing reference, nonempty uninitialized target or mismatching totals fails closed. Convex normalizes object key ordering in transport, so the original serialized source string is hashed and compared structurally with its decoded payload. The importer never treats a key-order change as changed historical data.

Server reconciliation compares all table counts, stock/lot quantities, known/unknown acquisition costs, active sales/payments, depositor entitlements/payouts and document/file/signature counts. It checks every item quantity against its remaining lots and requires every dossier to have its current revision. Completion occurs only after reconciliation succeeds. A retry after subsequent new business writes intentionally fails source reconciliation: migration is not a synchronization mechanism.

Run from `apps/api`, with secrets supplied through a private environment file:

```
node --import tsx scripts/migration/import-convex.ts /private/export.json http://127.0.0.1:3220 --dry-run
node --env-file=/private/rehearsal.env --import tsx scripts/migration/import-convex.ts /private/export.json http://127.0.0.1:3220
```

No script deploys a schema remotely, deletes an existing deployment, renames R2 keys, regenerates an archived PDF or sends an email.

## Evidence

`canonical-reconciliation.json` contains safe aggregate results. The final plan restored **1,334 normalized records** plus real-ID bindings:84products,84stock items,84lots,83purchase lines,12documents,12signatures and580original old/new mappings. Stock remained82units; known acquisition cost remained1,320,545cents. Reconciliation found zero errors. The initial3220 rehearsal resumed after a transport-hash defect was corrected. The final plan, including known cancelled-sale stock history and indexed imported consignment-event references, was imported into a fresh3224 target:1,334 inserted on first import, then **zero** inserted and1,334 replayed on a complete rerun. Both final reconciliations returned zero errors.

The canonical file table resolved11restored objects from the provided copied R2 directory. Six signed PDFs matched stored historical SHA-256 hashes; five images have no historical baseline hash and are not claimed baseline-verified. No original bytes changed.

Real authenticated calls against Convex3220 exercised exact FIFO costs, mixed collection, correction chains, replay, simultaneous overselling attempts and exact cancellation restoration. Two simultaneous sales competing for the last unit produced exactly one success. Private anonymous reads failed and public DTOs excluded private financial fields.

Real HTTP requests against Hono3002 exercised login/session creation, six existing read endpoints, contact creation, pending buyback validation, mixed-payment bulk sale, sale cancellation/restored stock, realtime access, read-only mutation rejection, logout and subsequent denial of both HTTP and realtime credentials. An actual WebSocket subscription received a subsequent contact change, then received `INVALID_SESSION` immediately after logout revoked the shared session. These are backend workflow checks; they are not a claim that the web/mobile UI has been exercised against this target yet.

Fresh backends3222/site3223 and3224/site3225 preserve successive rehearsal results. The final plan uses3224, with private state and deployment credentials under `/tmp/cartelites-canonical-rehearsal/fresh3224`; it binds only loopback. The earlier3220 QA import received one narrowly scoped, previewed and idempotent audit index-pointer repair so its historical consignment event opens the mapped stock item. The historical event payload and business records were retained. `migration:repairLocalConsignmentEventPointers` is internal, restricted to rehearsal mode and exact loopback3220; it refuses other environments. See the latest reconciliation artifact for the final plan digest and counts.

`check-canonical-documents.ts` exercised six PDF types through Hono3002, actual Convex records and the signed-S3 fixture: signed purchase, signed consignment, sale ticket, statement, partial payout and signed return. Archive/signature replay retained exact bytes. All six historical signed PDFs were downloaded through the new API and matched both their recorded SHA-256 and backup bytes. The six new PDFs were rendered with Poppler and visually inspected. Actual multipart image upload, optimization, public thumbnails, cover selection and private evidence denial also passed. `canonical-document-checks.json` records safe evidence.

Run meaningful regression tests with the canonical package's `test` and `typecheck` scripts. `check-canonical-runtime.ts` and `check-canonical-api.ts` perform repeatable real-server checks using explicitly prefixed synthetic records, which remain in the isolated target for inspection.

## Outstanding parity

Independent integrated review, complete web/mobile interaction checks, real cloud R2/Brevo credentials remain acceptance requirements. The canonical backend now implements the inventory, corrections, consignment, document and media adapters above, with actual local workflow evidence; this does not itself certify every interface or provider. Do not switch the primary application solely because backend checks pass.


## Reimport extension, 23 November 2026

The earlier loopback-only statement describes the original rehearsal interface. `pnpm data:reimport --restore` now supports an explicitly configured target with matching source digest and temporary secret; both client and service enforce that boundary. Default rehearsal mode remains loopback-only. The executable user procedure is `reimport.md`; independent findings/repairs and local acceptance are recorded in `reimport-review.md` and `reimport-restore-local-check.json`. No remote execution occurred. Deployment automation remains outside this change.
