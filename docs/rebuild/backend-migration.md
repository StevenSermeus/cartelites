# Offline normalized reimport package

Historical offline-stage evidence. Current actual-ID import/runtime and final1334record rehearsal are documented in `canonical-backend.md`, `canonical-reconciliation.json` and `reimport-runbook.md`; earlier limitations below are retained as dated audit context.

Updated 2026-11-23. The user's revised scope is **no cutover**: prepare data and original PDFs for reimport. No network import, schema deployment or production mutation is performed by these scripts.

## Files and commands

- `apps/api/scripts/migration/model.ts`: strict Zod/TypeScript record contracts for every table in the proposed model, including typed acquisition and link references, nullable unknown costs, textual grades and immutable tagged PDF input snapshots.
- `normalize.ts`: deterministic legacy-to-normalized transformation, explicit one-to-many ID mappings, reference checks, allocation/payment checks and before/after reconciliations. Each physical legacy item retains its own product/item identity; owners and conditions are never merged. Full originals and unknown fields remain in a private legacy vault and audit history.
- `import-local.ts`: isolated local staging importer. It validates all records, writes atomic fsynced checkpoints, resumes at the last committed batch, verifies prior record hashes before resume, and refuses a changed source or plan. Repeating the import does not duplicate records. It can copy original archived PDFs/images byte-for-byte into a private package with checksum manifest.
- `rehearse.ts`: earlier conservative lossless audit and backup object verifier, retained for independent comparisons.

Run from `apps/api`, using a private output directory **outside the repository**:

```
node --import tsx scripts/migration/import-local.ts /private/export.json /private/reimport --dry-run
node --import tsx scripts/migration/import-local.ts /private/export.json /private/reimport --init --objects /private/copied-r2
node --import tsx scripts/migration/import-local.ts /private/export.json /private/reimport
```

The third command resumes/rechecks an existing initialized stage. `--init` creates the explicit local-stage marker; scripts do not accept a remote database URL. The JSON input maps table names to arrays of legacy documents. Database-export ZIP/JSONL extraction is a separate preparatory step.

Output:

- `state.json`: typed normalized records and per-record hashes, source/plan digest and checkpoint cursor.
- `legacy-vault.json`: all original records including authentication hashes, personal data, unknown fields and immutable snapshots. Treat this file and the entire package as confidential.
- `manifest.json`: record counts, comparisons, warnings, unmapped legacy tables and completion state.
- `objects/`: original object keys and bytes, without regeneration or filename rewriting.
- `object-manifest.json`: byte checksums and whether each matches an existing historical baseline hash.

Output directories/files are created with private permissions. A process lock prevents overlapping imports; after an actual process crash, inspect the stopped process and remove only the stale `.import-lock` directory before resuming. Atomic checkpoint files are never trusted without validating every previously committed record/hash. An interrupted object-copy step can be rerun; no database transactions or emails occur.

## Real-backup rehearsal evidence

The user supplied an extracted export at `/tmp/cartelites-rehearsal/export.json` and the copied R2 directory `/Users/mew/Backups/cartelites/2026-11-23T08-29-53-602Z/r2`. Corrected, independently reviewed private outputs are preserved at `/Users/mew/Backups/cartelites/reimport-2026-11-23-reviewed`; they were not committed or printed.

The normalized local import completed with **1,330 records**, including 84 products, 84 physical stock items, 84 lots, 83 purchase lines, 12 historical documents, 12 signatures and 580 explicit old/new mappings. A second import retained the same record count and plan digest. Quantity reconciles at **82 physical available units before and after**. Known acquisition cost reconciles at **1,320,545 cents**. Structural/reference and before/after comparison checks report zero errors.

Eleven existing stored files were copied: **six archived signed PDFs matched their stored SHA-256 baselines**; five images were restored and checksummed but lack historical hash fields, so their baseline integrity is explicitly unverified. Twelve document records include six prepared/unsigned records without archived object keys; no PDF was invented or regenerated for them.

This export contains no sales, payment corrections, payouts or display openings. Those transforms are covered by synthetic fixtures, not claimed as real-data acceptance. Tests cover unknown costs, independent physical ownership, supplier FIFO allocations, mixed-payment correction chains, cancelled allocations/payment reversal, partial depositor payouts, source/tamper rejection, checkpoint resume, rerun idempotency and original-byte PDF copying/corruption rejection.

## Deliberate limitations and review gates

The package is a **normalized local staging format**, not a deployed Convex database. Stable migration IDs are not valid Convex document IDs. Before a future network reimport, a reviewed importer must allocate real Convex IDs, persist the binding transactionally in `legacyMappings`, rewrite all typed references, enforce account/session transition policy, and reconcile the resulting deployment. No target deployment has been configured or contacted.

The active application still uses its compatible legacy tables and operations. Switching runtime queries/mutations to these normalized tables remains required work; this package does not silently claim that integration is complete.

Legacy state has known limits that are recorded explicitly:

- Existing individual purchase/consignment items receive distinct provenance lots; supplier FIFO lots and exact allocation costs are retained.
- Historical stock movements were not stored comprehensively. The package creates exact **opening-balance movements**, preserves historical operations/allocations, and marks imported lots `openingBalanceOnly`. It does not fabricate a historical movement ledger.
- The real legacy consignment has no frozen structured contract terms. Its original signed/document snapshots remain authoritative and the revision is marked `legacy-unknown`.
- A legacy consignment sale has no reliable explicit revision ID; its frozen commission/depositor amounts are retained, its current revision association is warned for review.
- Existing stateless JWT sessions cannot be reconstructed from revoked-JWT rows. Original revocations/session versions are retained; session cutover is not implemented.
- Legacy configuration settings, stock visibility operation receipts and purchase edit snapshots are retained in the private vault and audit history rather than silently interpreted as new product state.
- Legacy sale batches remain independently cancellable sale records, with original basket membership retained in audit records and document links.

`networkImported` and `cutoverReady` remain false. No production cutover is part of the current request.
