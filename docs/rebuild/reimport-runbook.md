# Reimport and rollback runbook

Scope: prepare a repeatable restore; the user handles deployment separately. The focused user procedure is [reimport.md](reimport.md). Explicit source/target-bound restore mode is now implemented, in addition to the local rehearsal below. No remote import, deletion, traffic change or regeneration of historical documents was executed by the agent.

## Inputs and verified evidence

- User-supplied Convex ZIP: `/Users/mew/.t3/userdata/attachments/cc7b6aa5-a216-477b-821f-d9bc06280621-9d964cc5-e6c1-4e60-a263-de95b097ac45-zip.zip`. SHA-256 `fc1286a8cf5cd7cdd0ab5b62178839dcefa2d6aa7eca27c0554dfb05ebc8bbb8`.
- Copied R2 files: `/Users/mew/Backups/cartelites/2026-11-23T08-29-53-602Z/r2`.
- Preserved renderer source ZIP: `/Users/mew/Backups/cartelites/2026-11-23T08-35-10Z/pdf-creation-code.zip`. SHA-256 `173603010a6e34761d1037b9ee81ace6a2ceddaae62cc5b4db54a443e004e32e`.
- Current normalized plan digest: `ab9a5396913f130293051ab3c355c449b2aff12f64afe67ffa2712997e288d3c`.
- Final actual Convex rehearsal on loopback3224/site3225:1334records inserted; full replay0inserted/1334replayed; reconciliation errors[]. Safe aggregates in `canonical-reconciliation.json`.

Keep raw exports, password hashes, original signatures and customer information in private directories outside version control. The earlier `reimport-2026-11-23-reviewed` package is an earlier1330record plan and is preserved for audit; regenerate a new directory from current code rather than overwriting it or importing that old plan as the final one.

## Prepare and validate offline

From the repository root:

```sh
python3 scripts/prepare-convex-backup.py /private/snapshot.zip /private/new-reimport-input
node --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/scripts/migration/rehearse.ts /private/new-reimport-input/export.json /private/new-reimport-audit /private/copied-r2
node --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/scripts/migration/import-local.ts /private/new-reimport-input/export.json /private/new-reimport-package --dry-run
node --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/scripts/migration/import-local.ts /private/new-reimport-input/export.json /private/new-reimport-package --init --objects /private/copied-r2
node --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/scripts/migration/import-local.ts /private/new-reimport-input/export.json /private/new-reimport-package
```

Inspect every reported warning, unmapped table/field, missing object and hash mismatch. Unknown historical costs remain null; missing allocations block reversal and are not guessed. ZIP integrity alone does not verify restore: the object copies, typed transform and actual-ID import below are separate checks.

## Rehearse actual Convex IDs

Use a new empty loopback backend with its own state directory and site port. Deploy `convex/rebuild` only to that identified local target. The import service requires `MIGRATION_MODE=isolated-rehearsal`, private `MIGRATION_SECRET`, and a loopback deployment URL. API auth/session secrets and JWT keys must be separate from production. Credentials are supplied through private environment files; never paste them into source or logs.

```sh
node --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/scripts/migration/import-convex.ts /private/new-reimport-input/export.json http://127.0.0.1:3224 --dry-run
node --env-file=/private/rehearsal.env --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/scripts/migration/import-convex.ts /private/new-reimport-input/export.json http://127.0.0.1:3224
node --env-file=/private/rehearsal.env --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/scripts/migration/import-convex.ts /private/new-reimport-input/export.json http://127.0.0.1:3224
```

Use the port of the newly created target, not an occupied QA target. Import rejects changed plans, mismatched source hashes, nonempty uninitialized databases and the active legacy development ports. Each batch persists ID bindings before dependent writes; cycles are bound explicitly. Interrupted imports resume against the exact same source/plan. Reruns verify existing bound records and never duplicate them.

Acceptance requires quantities, original/remaining costs, allocation/restoration movements, active sales, collection/payment correction chains, depositor entitlement/payouts and all document/file/signature counts to reconcile. Source snapshot contains no sales/payouts/display openings, so corresponding invariants are additionally tested with synthetic records. Run the replay before introducing QA business writes; this importer is a restore tool, not a live synchronization service.

## Restore objects and exercise workflows

Object keys and document references stay unchanged. Restore/copy original bytes into an isolated bucket or the signed-S3 loopback fixture; never regenerate archived signed PDFs. New QA uploads must use a separate overlay. The existing fixture refuses overwriting backup originals. Six archived PDFs matched both recorded SHA-256 and download bytes through canonical API; five images decode but have no historical hashes to establish pre-backup authenticity.

Run API with `DATA_MODEL=canonical`, the isolated Convex URL, its own secrets, origin and storage endpoint. Startup validates the backend model. Exercise `check-canonical-runtime.ts`, `check-canonical-api.ts`, `check-canonical-inventory.ts` and `check-canonical-documents.ts` only against their guarded local targets. They create clearly marked QA business records. Compare newly rendered PDFs to baseline fixtures with deterministic metadata, text and rendered pages. Real cloud R2/Brevo delivery remains a separate unavailable-access acceptance check.

Imported accounts retain recorded password hashes and session versions. Old stateless JWT sessions are not manufactured as new canonical sessions; users authenticate again against the new API secrets. No historical signed identity is rewritten when an account signs in.

## Rollback without data loss

For rehearsal failure, stop only the affected local API/backend. Keep the input ZIP/R2 copy, failed target state, logs and mapping evidence. Do not clear source backups or the existing legacy/QA deployments. Correct the transform and repeat in a newly named empty target if its plan changed; use resume only for the identical plan. Default rehearsal mode still refuses remote import. The separate explicit `--restore` mode is guarded on both client and server by the configured target and source digest; see `reimport.md`.

A future production move requires explicit authorization, a newly verified backup, a write freeze, final delta policy, successful independent acceptance and the reviewed explicit restore procedure described in `reimport.md`. Keep the previous application/schema/database and R2 originals available. Do not simply switch back after accepting new writes: first reconcile/export those writes so no sales, allocations, signatures or collections disappear. None of that production execution is part of this delivery.

## Rebuild the disposable item activity projection

`itemActivity`, `itemActivityBuilds` and `itemActivityJobs` are derived read indexes, not stock or financial ledgers. The original export remains in the private legacy vault. Rebuild from the restored source records after the canonical import is complete; the canonical maintenance function refuses an import still in progress. Do not import old projection IDs as authoritative inventory history.

```sh
node --env-file=/private/isolated-self-hosted.env --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/scripts/migration/rebuild-item-activity.ts http://127.0.0.1:3224
```

The private file must contain matching `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY`. The script rejects remote targets. Each internal mutation scans at most 20 source records and persists its cursor atomically. Rerunning resumes an interrupted rebuild or returns the completed checkpoint. `--restart` recomputes deterministic effects and prunes stale source effects without changing any business record, allocation, payment or document. It is suitable after an intentional offline source repair, not as a second stock ledger.

Queries use the item/date index and native opaque Convex cursors, at most 50 effects per page. They explicitly return `historyStatus: indexing` until rebuild and queued repairs finish, `incomplete` for unknown historical dates/quantities or imported opening balances, otherwise `complete`. A completed index does not claim full historical evidence where the source lacks it. Canonical effects are per movement/lot; multiple allocations from one sale are separate effects. Never sum a null quantity as a known zero.

Current writes update projection effects within the source transaction. An exceptional legacy purchase with more than 50 items enqueues a durable internal repair in 50-item chunks rather than rejecting the original validation. While queued, activity coverage is `indexing`. No background daemon or external service is needed. Historical cancellation dates are recovered only from known source evidence; replaying an old cancellation never manufactures its timestamp.
