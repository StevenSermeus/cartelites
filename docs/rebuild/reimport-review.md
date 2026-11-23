# Independent reimport extension review

Reviewed 2026-11-23. Review only; no source changes, remote/provider requests, deployments, browser/device work, or contact with the local 3224 rehearsal. Repository origin is `StevenSermeus/cartelites`, so the supplied PurePoker-only orchestration instructions do not apply. No on-disk AGENTS.md was found in the ancestor locations or under apps/convex/docs. Existing dirty baseline was preserved.

## Findings

### P2 — Existing activity checkpoint can silently skip restored history

Location: `convex/rebuild/functions/migrationService.ts:36`; related `migration.ts:19` empty-target check and `convex/shared/itemActivity.ts:60-68`.

The new restore dispatcher calls `itemActivity:rebuild` with `{}`. An otherwise empty target may already contain a completed `itemActivityBuilds` checkpoint (e.g. maintenance was run before import). `begin` checks normalized business tables, not this auxiliary table, so it accepts that target. Migration inserts bypass activity projection. After completion, the rebuild immediately returns `complete:true` from the old checkpoint without visiting any imported business records. Restore therefore reports successful activity completion while the imported history is absent. A partially advanced old checkpoint can similarly skip earlier phases.

Reproduced offline using a temporary copy of migrationRestore.test.ts with only a preexisting `{name:'v1',phase:0,cursor:null,complete:true,processed:0}` checkpoint added before the existing import scenario. All import/reconciliation/document checks reached the activity assertion, which failed with `true !== false` on the first rebuild call. No source test was edited.

Suggested repair: at the first successful begin of a new migration, atomically reject or reset preexisting projection state. Do not restart on every rebuild chunk or on every resumed begin, which would defeat interruption recovery. Add coverage for completed and partially advanced checkpoints predating the migration.

### P2 — Documented pnpm invocation with --env-file fails in the installed launcher

Location: `apps/api/scripts/migration/import-convex.ts:75-83` (option and help), `package.json` data:reimport alias.

The documented `pnpm data:reimport export.json --env-file private.env --restore --dry-run` exits 9 before the importer starts on this machine. The installed standalone pnpm 9.15.4 executable reports `<absolute existing private.env>: not found`. This was reproduced with real temporary fixture/env files under both /tmp and the OS temporary directory. `pnpm run data:reimport`, `--env-file=...`, and an added `--` also failed. Direct `node --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/scripts/migration/import-convex.ts ...` with the exact same files succeeded, used the env-file target, remained offline, and wrote the report with mode 0600.

This is an observed launcher compatibility issue, not a failure in loadEnvFile itself. Use a non-Node-reserved CLI option name or document and verify a working direct Node invocation for env-file use. `pnpm data:reimport --help` itself passes.

### P3 — New tests fail a focused strict TypeScript check

Locations: `apps/api/tests/convexImport.test.ts:42,63-67`, `convex/rebuild/tests/migrationRestore.test.ts:44`; result typing originates in `import-convex.ts:50,72`.

Six diagnostics: the mocked `_ref` parameter has implicit any; networkImported is inferred as boolean rather than a literal discriminant, so the runtime guard does not narrow accesses to replayed/inserted/activity (four errors); `assert.throws` receives undefined where this Node type definition requires AssertPredicate. Runtime tests pass, and the normal canonical backend typecheck excludes tests. Give the result a discriminated type/literal tags, type the mock argument, and use a supported assert.throws overload.

## Verification evidence

- PASS: 22 focused tests via `node --import ./apps/api/node_modules/tsx/dist/loader.mjs --test apps/api/tests/convexImport.test.ts apps/api/tests/normalizedMigration.test.ts apps/api/tests/migration.test.ts convex/rebuild/tests/migrationRestore.test.ts convex/rebuild/tests/migrationRepair.test.ts`.
- PASS: four additional `convex/rebuild/tests/itemActivity.test.ts` tests with the same loader.
- PASS: `pnpm --filter @tcg-marge/canonical-backend typecheck`.
- FAIL: focused strict check, six diagnostics described above: `./apps/api/node_modules/.bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node --typeRoots ./apps/api/node_modules/@types apps/api/scripts/migration/import-convex.ts apps/api/tests/convexImport.test.ts convex/rebuild/tests/migrationRestore.test.ts`.
- PASS: alias help; direct Node CLI offline restore preview, env-file target loading, JSON report and 0600 permission check. FAIL: pnpm env-file invocation as above.
- FAIL as expected: extra offline stale-checkpoint reproduction, demonstrating the P2 activity finding. Temporary reproduction: `/tmp/tcg-reimport-review-repro.test.ts`.

## Reviewed behavior that holds

Client validation/normalization/planning and requested local object checks precede the first network request. Dry-run returns before client creation. Real restore requires explicit mode, expected digest and a sufficiently long secret. Remote URLs are rejected in default rehearsal mode. Canonical schema/model is queried before actions; redirect following is disabled. The server authenticates before dispatch and enforces configured restore mode, its own target origin, expected batch/source digest, and secret strength. Source binding is an operator/authentication boundary, not independent server recomputation of the entire source export.

Business-table nonempty targets are refused. Batch replay checks hashes and surviving ID bindings, and mismatched plans are refused. References are topologically ordered and rewritten, deferred consignment links are checked, and opaque document/signature snapshots are retained. The existing happy-path restore test exercises actual action/mutation code and verifies original object keys, checksums, document IDs, snapshots and signature data are unchanged across replay/activity rebuilding. New restore activity calls are bounded and resume their cursor when the checkpoint belongs to this import; the stale-checkpoint exception is above.

No upload or PDF regeneration exists in this path. Reports explicitly say to retain the current R2 bucket and original keys. Local backup validation refuses missing/mismatched files and escaping paths/symlinks; files without historical hashes are honestly counted as unverified rather than claimed checksum-verified. This does not prove continued remote R2 availability, which was intentionally not tested. Reports use exclusive creation and mode 0600. No deployment automation was introduced in the reviewed path.

## Root repairs and verification after review

The lead addressed the findings directly; these repairs were not a second independent review:

- First-import `migration:begin` now rejects existing `itemActivity`, `itemActivityBuilds` or `itemActivityJobs` before creating a run. It preserves that state rather than deleting it. An existing matching import returns before this guard, so its own partially rebuilt index remains resumable. Added completed/partial preexisting-checkpoint regressions and an own-checkpoint resume assertion.
- Replaced the pnpm-conflicting option with `--config`. Private configuration explicitly overrides inherited migration variables and clears omitted ones. The actual pnpm command passed offline and against isolated3224; a subprocess test verifies target selection, no credential leakage, offline output and0600 reporting.
- Added literal discriminants, typed the mock reference and corrected the assertion overload. The exact focused strict TypeScript command from the review now passes.

Final full repository suite:509 tests,508 passed,0 failures,1 existing opt-in auth rehearsal skipped. Local3224 explicit restore replay:0inserted/1334replayed, reconciliation errors[], activity complete385 processed;11backup objects checked,6historical hashes verified. This is loopback evidence, not a remote import. Its temporary restore mode was disabled afterward. Details: `reimport-restore-local-check.json`.
