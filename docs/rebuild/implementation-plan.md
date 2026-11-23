# Rebuild implementation ledger

**Current acceptance:** see [feature-parity.md](feature-parity.md). The wave sections below retain historical results and superseded blockers; do not treat an earlier pending status or test count as the latest result.

## Current completion audit and user grading correction

- User preference applied: implementation and independent review agents use medium reasoning; root orchestration remains high. Two interrupted earlier agent tasks were resumed in fresh medium agents with bounded ownership.
- User-reported web grading discoverability: shared picker exposes `Autre société…` in its select, with focused inline creation and `Ajouter et sélectionner`. Async completion uses the latest callback; parent product save and acquisition/correction review wait for creation. Switching companies preserves grade/certificate/notes. Actual local browser create/save/read passes; QA card restored and company archived (`grading-other-browser-check.json`).
- Filtered-empty contacts/sales now preserve and clearly reset filters, distinct from an empty inventory; sales empty action uses SPA navigation. Product price validation has a linked inline explanation and focusable summary; loading is announced. Independent medium review closed findings.
- Native buyback submission now persists immutable operation/body/photo context before POST, restores the same request after restart and retains confirmed draft tombstones. Exact submitted-draft cleanup and account/instance isolation are covered. A portable production journal plus thin Expo adapter has four real temporary-filesystem fault tests.123 native tests and offline Hermes export `/tmp/cartelites-native-journal-export` pass. Real iOS process-kill behavior remains unverified.
- Native signatory card uses selected shop name. Local password-reset lifecycle covers expiry/replacement/concurrent one-use/session revocation; an opt-in production-route rehearsal against actual local3220 intercepts Brevo in process, denies external requests, and passes. No actual email sent.
- Final integrated suite:489 passed, zero failures, one opt-in local rehearsal skipped by default (separately executed and passed). Seven TypeScript checks, API/web builds and native Hermes export pass. Medium independent review closed concrete findings. No production schema/data/cutover operations.

## Previous document/export completion wave

- Completed actual-code parity audit of document versions, downloads, email retries, pending acquisitions and exports. Web lead, native agent, backend agent and independent reviewer used nonoverlapping ownership.
- Backend/API: exhaustive resource-bound export pages on both models; child-line projections avoid full-history hydration. Mixed-sale origins and payment shares remain exact per line. Local3210/3220 read-only traversal and2000-sale capacity fixture pass. No schema, migration or renderer modification.
- Web: full workbook consumes every resource page, preserves null economics and computes balances from eligible frozen sale lines/payouts. Business dates are civil ISO text in shop timezone. Actual workbook nine-sheet download reconciles61 stock units/163171c cost/5600c depositor due. A second-page503 produces no partial file; explicit retry succeeds.
- Native: guarded unique-directory sharing, full CSV pagination, shop-zone date boundaries, document versions and durable account/instance-bound email recovery.115 native tests, TypeScript and Hermes export pass; independent review passes. Device acceptance remains unavailable.
- Documents: keyed search results do not retain old-filter rows after a read failure. Stale ticket pre-send rejection has explicit release/current-version guidance; genuine earlier uncertainty stays frozen.
- Shared durable web email recovery now spans sale-ticket and Documents surfaces, with server-history reconciliation and account-scoped session recovery metadata.477 integrated tests, seven typechecks, API/web builds and independent source review pass. Final browser recovery after full navigation/reload retains the same ticket/recipient/key across surfaces; a later history503 keeps its form and never reports an old accepted result. All email POSTs were intercepted locally; test state removed. Evidence: `document-browser-check.json`.
- Provider scope clarified by user: remaining tests are local only; do not request or use an external test bucket/recipient. Earlier read-only cloudR2 PDF/image checksums equal supplied backups and Brevo account access returned403; no email sent. Real external upload/delivery remains unverified and is no longer a requested acceptance exercise. No production writes.

Baseline: Cartelites origin git@github.com:StevenSermeus/cartelites.git. Initial tracked working tree clean; untracked docs/rebuild-design.md, docs/mockups/, outputs/ retained. PurePoker-specific workflow does not apply.

## Ownership and contract

- Lead: domain shared search/theme, root shop.config.ts, integration, PDF evidence, independent review coordination.
- Backend agent: apps/api and convex; legacy compatibility, grading records, public projections, migration tooling.
- Web agent: apps/web; real shadcn UI, workspace and Convention.
- Mobile agent: apps/mobile; native tabs/navigation, branding isolation, basket interaction.
- Independent reviewer: next wave after implementation; actual diff/tests, no acceptance based on reports.

Contract: existing /api/v1 routes remain compatible. Public config /api/v1/public/shop-config and /api/public/shop-config exposes version and branding only. ThemeTokens and resolveTheme live in packages/domain/src/shopTheme.ts; deployment config in shop.config.ts. Shared searchTcgdex uses explicit query/language/page/pageSize and returns cards/message/hasMore/status; no language fallback. Money remains integer cents, rates basis points. PDF generators stay byte-identical; historical objects are never regenerated.

## Execution gates

1. Audit baseline and backup integrity — in progress, archive verified.
2. Shared contracts and parallel implementation — in progress.
3. Integrated typechecks, tests, builds and independent review — pending.
4. Isolated migration rehearsal and real backend/browser/device journeys — pending environment verification.
5. Cutover — explicitly NOT authorized; requires reconciled restored backup and user authorization.

## Feature parity evidence matrix

Status is evidence, not a declaration that baseline functionality has been exercised.

| Capability | Baseline / intended change | Location | Verification |
|---|---|---|---|
| Authentication, sessions, reset, signatory | Preserve shared shop auth | convex/functions/auth*, apps/api/src/routes/auth.ts | pending |
| Contacts | Preserve CRUD and inline selection | operations.ts, web/main.tsx, mobile/App.tsx | pending |
| Buybacks, drafts, pending, corrections | Preserve; native Rachats root | purchases/editing, mobile drafts | pending |
| Supplier receipts, invoices, FIFO | Preserve quantity/cost provenance; web parity | inventory, stockLedger | pending |
| Grading | Replace enum with editable records; grade text | domain, API, convex, both clients | implementing |
| Products, photos, cover, public/private metadata | Complete details and safe public projection | inventory, catalogue, clients | implementing |
| Gifts, displays, reversals | Preserve exact cost allocation/history | stockLedger, operations | pending |
| Sales baskets / mixed / outstanding / corrections | Preserve allocations and payment ledger | salePayments, operations, clients | pending |
| Cancellations | Restore allocations without deleting history | operations / stockLedger | pending |
| Consignments, signatures, revisions, returns | Preserve gates and ownership | consignmentOperations/documents | pending |
| Depositor balances / partial payouts | Preserve derived collected balance | consignments / salePayments | pending |
| PDF archives / downloads / email | Preserve original bytes and renderers | domain renderers, API receipts/R2/Brevo | archive source verified; render pending |
| Dashboard / Excel / gifts export | Preserve full inventory | readModels, web, mobile | pending |
| Convention / detail / gallery / legal | Safe customer projection; accessible details | web, catalogue API | implementing |
| Branding light/dark / switch isolation | Configurable shared semantic tokens | shop.config.ts, shopTheme.ts, clients | implementing |
| Exact and promo search | One paginated provider service | domain/tcgdexSearch.ts | implementing |
| Migration / idempotent mapping / reconciliation | Isolated tooling, no production operations | backend migration scripts | implementing |
| Realtime / reconnect / conflicts / pagination | Preserve subscriptions and state | packages/realtime, apps | pending |

Required release evidence still includes real backend workflows, two-client oversell/conflict testing, visual/keyboard/mobile accessibility checks, restored R2 original checksums and complete redesigned data model migration. Additive compatibility alone is not a complete rebuild.

## Updated migration scope from user

User explicitly removed cutover from the requested execution. Deliver a correct repeatable reimport package/script for the new model with original PDF bytes, mappings and validation. Do not deploy or cut over. A real snapshot and local R2 copies were supplied; offline checks ran with zero structural errors. Six archived PDF copies match stored hashes; five image attachments decode. Normalized transformation/import package is being implemented in a second backend wave.

## Integration evidence so far

- All workspace typechecks passed after first wave (rerun after final changes).
- Initial combined suite: 151 passed; subsequent focused tests added for migration failure, stock preview, document projection, stale requests and operation retries.
- PDF six-fixture rendered/text/byte comparison passed; original archive checks documented separately.
- TCGDex real provider checks passed exact fractions and promos; missing Japanese promo series reported explicitly.
- Browser Convention light/dark/error states inspected; theme text collision and blue selection repaired. Actual API connection at localhost:3001 refused, so authenticated workflows were not claimed.
- Current native iOS bundle exports; installed simulator app is an old release binary, so it does not verify current UI. Native stack/gallery followup in progress.
- Independent review completed first wave with concrete repairs; next normalized-import review pending.

## Latest verification (supersedes initial pending statuses)

Final combined `pnpm test`: **176 passed, zero failed/skipped**. `pnpm typecheck`: all six workspaces passed. `pnpm build`: API and Vite production build passed; Vite reports bundle-size advice, not an error. Final native Hermes export and Xcode Debug build passed. Original tracked/untracked work preserved; no production deployment or cutover.

| Area | Delivered evidence | Remaining acceptance |
|---|---|---|
| Auth/session/contacts | Existing real integration retained; registration config enforced; auth/session tests pass | Real isolated account journey |
| Buybacks/drafts/receipts | Existing workflows retained, shared search/grading, native stack flow; draft/receipt tests | Authenticated native step/back/signing checks |
| Supplier stock/lots | Web receipts + invoices retry + exhausted product restock; stock/FIFO regressions | Real upload and receive journey |
| Sales/payment/cancellations | Existing transaction model preserved; stable basket controls, concurrency/atomic rollback/payment tests | Real two-client oversell/reconnect test |
| Consignments/returns/payouts | Existing real workflows retained; arbitrary grading; balances/revisions/signature tests | Real signatures, returns, partial payouts |
| Gifts/displays | Web creation/history/reversal/full CSV; exact read-only cost preview shared with mutation | Real workflow and evidence uploads |
| Product images/public catalogue | Multi-photo cover/removal/native gallery; public detail and privacy tests | Real populated public gallery; broader private metadata contract incomplete |
| Documents/email/exports | New paginated unified library and archived-original downloads; real email APIs; Excel retained | Real delivery/download and keyboard acceptance |
| Theme | Shared validated roles, config appearance/logo, currency/timezone, instance clearing; light/dark browser error-shell inspected | Contrasting-shop full visual/device matrix; all component states |
| Search | Shared exact/promo/pagination service; 8 domain regressions and live provider examples | All acquisition interactions against real backend |
| Migration | Typed normalized model, resumable local package, 580 mappings, 1,330 records, reconciled real backup, preserved originals | Real Convex ID binder and normalized runtime adapters still absent |
| PDFs | Six deterministic fixture render/text/byte comparisons; six historical originals hash-verified; five images decode | Retrieval via a deployed normalized backend |
| Native | Real stack routes, native build and JS export; current neutral screen observed | SecureStore entitlement/launch blocked simulator acceptance; some nested panels retained |

Independent review inspected code and real backup, found and rechecked repairs for privacy, retries, search races, configuration and PDF input semantics. The reviewed local reimport package is in `/Users/mew/Backups/cartelites/reimport-2026-11-23-reviewed` with private permissions. **Do not label the entire rebuild complete:** active storage/operations still use the compatible legacy model; normalized runtime integration and real-backend acceptance remain unfinished. The user removed cutover from scope, not the requirement to report these gaps honestly.

## Active completion goal — 23 November, continued

User explicitly requires the **complete** rewrite (backend, web and mobile), rejects the partial legacy UI, and authorizes creating local test accounts for real runtime checks. Prior passing unit/build checks did not establish design or workflow completion. Current isolated runtime: Vite localhost:5174, Hono localhost:3001, project-local anonymous Convex localhost:3210. No production cutover.

Current work ownership:
- Lead: web application shell/auth, screen integration, real local workflow acceptance, shared/backend integration.
- Web agent: stock and sale-selection/basket components, then remaining transaction UI.
- Mobile agent (temporary web wave): dashboard, acquisition editor/settings/grading/contact picker; return to native completion afterward.
- Independent reviewer: actual UI gaps and final integrated checks; no self-certification.

Completion gates still open:
1. Replace legacy screen structures across all web routes and complete native pushed flows; compare with mockups in light/dark and narrow layouts.
2. Implement active normalized Convex schema/runtime and actual ID-bound reimport (staging files alone are insufficient).
3. Exercise real contact/acquisition/stock/photo/sales/cancellation/consignment/payout/document/export flows using dedicated local test records; test two-client conflicts and session behavior.
4. Repair simulator signing/launch and verify current native app; preserve instance isolation.
5. Independently review repaired integrated code, rerun meaningful tests/builds and PDF checks, reconcile an isolated restored dataset. Keep inaccessible provider checks explicitly open.

## Runtime completion wave — 23 November, midday

This section supersedes the earlier simulator/access blockers; it does **not** declare full completion.

- Web now uses new WorkspaceChrome, AuthenticationPanel, StockWorkspace, SalesWorkspace, ContactsWorkspace, TransactionHistory, PurchaseHistoryWorkspace; guided contact → cards → review buybacks; guided consignment and supplier/gift/opening flows; document table/detail with server-side filters, stable receipt version identification, and recorded delivery attempts. Actual shadcn Dialog/Button/Input primitives retained.
- Fixed runtime findings: hidden mutation feedback, stale unauthenticated state, pre-login grading fetch, independent asking-price versus basket line-total drafts, missing Tailwind transform initialization, inherited dialog buttons, and sticky acquisition total obscuring Add.
- Real local web QA account/contact created. UI created `QA-WEB-REWRITE-20261123` with one `QA Carte Web Réécriture`, value100EUR, buyback70EUR, pending. API POST201 and independent history listing verified. No signing/email performed.
- Native Xcode simulator signing was repaired with normal Xcode signing; SecureStore and real local login now work. Native exact French60/106 search, preserved step/back values, pending QA purchase and original-layout PDF rendering verified by mobile agent; broader workflow checks continue.
- New canonical Convex target is isolated at3220/3221; active local application remains3210. Real import1330records, rerun0inserts/1330replays,82units/1320545known-cost cents,12documents/12signatures/11files reconciled. Fresh runtime ledger checks exercise competing sales, FIFO, mixed payment corrections and cancellation restoration. Hono/canonical adapter parity is still required.
- Current root suite:178tests passed, zero failed/skipped. Full workspace typechecks and API/Vite build passed before latest feedback/CSS edits. Canonical target has separate tests, not included in178 count yet.
- Independent UI review found history/documents/inventory gaps, now implemented and awaiting integrated re-review. Production data/deployment/cutover untouched.

### Additional required market research — user reminder23November

Required integrated pricing panel in web/mobile acquisition/product workflows: Cardmarket listings, eBay.fr and eBay.com (sold transactions preferred and clearly separated from active asking prices), Vinted listings, GCC for graded cards (exact service identification requested). Every comparison must carry source/link, currency, observation date, language/condition, grading company/text grade when available, and actual listing/sale semantics. Do not infer a sold price from an active asking price or silently mix languages, raw/graded cards, currencies or shipping. Provider credentials remain server-side. Implement provider adapters, cache/rate limits and explicit unavailable/access-required states; external search links alone are not completion of in-app listings. No provider subscription/purchase is authorized implicitly. Access research ongoing; feature remains incomplete until live provider validation is recorded.

### Canonical inventory verification —23November12:52UTC

`convex/rebuild/functions/inventory.ts` and `workspaceReads.ts` now back supplier receipts, exact FIFO gifts/display openings/reversals, item/lot details, product/grading edits, cover/unlink and paginated workspace reads with canonical records. File unlink intentionally preserves stored originals and shared historical evidence. Unknown costs remain null through allocation and reversal; web inventory labels them as unknown.

Four canonical regression tests passed: exact1001cent/36booster distribution and reversals; idempotent receipt/open/gift requests; future-lot/ownership/read-token/overselling rejection; unknown costs; document DTO privacy and shared file preservation. Real authenticated Hono3002→Convex3220 run (`check-canonical-inventory.ts`) passed receiving5×1001c, opening1display into36boosters, gifting1booster, rejecting used-opening reversal, then restoring gift/opening to5units5005c. Only synthetic QA records changed; no cloud writes. Canonical target is now part of the pnpm workspace and root tests/typechecks.

### Review repairs and integrated progression —23November13:05UTC

- Independent review reproduced three failures: imported gift/opening history omitted runtime fields/movements; multi-lot opening preview averaged unequal costs; metadata-only purchase edit recalculated historical701c into700c. All three repaired with regression coverage. Exact legacy allocations now become canonical movements; remaining opening balances subtract their known net effect. Opening-derived lots retain opening provenance instead of creating duplicate supplier acquisition costs. Incomplete historical allocations are reported and reversal blocked. An actual-ID import regression then reverses an imported gift and opening, recovering2displays/2002c exactly.
- Cost preview now groups per-lot costs:100c+1000c displays opened into10boosters each display10×10c and10×100c, not20×55c. Unknown costs remain unknown in web/mobile labels and CSV.
- Purchase correction now preserves recorded cents when only metadata changes; real web QA edited7.01EUR→14.01EUR intentionally, preserved values on Back, refreshed history and restored keyboard focus. Existing sold-then-cancelled card remained locked.
- Real web sale ticket preparation/download succeeded, archived `VEN-k5705xh7qyh6h6bveef06mxn3d8js5st`; no email sent. Original document versions remain preserved.
- Combined suite199tests and all7workspace typechecks passed before the latest review regressions; latest affected15tests passed; final broad rerun remains due after concurrent implementation.
- Native second wave: real stack purchase/sale/dossier routes, platform date pickers, unified loaded Activity feed; signed iOS build and current simulator interactions verified. Activity source sort orders differ: UI explicitly describes loaded records, and no globally ordered cursor is claimed.
- Local signed-S3 fixture3490 reads copied R2 backup only and writes new objects solely to `/tmp/cartelites-canonical-rehearsal/objects`. Actual existing signer verified PUT/GET exact bytes, conflicting overwrite409, temporary DELETE204. This is fixture integration evidence, **not** a real Cloudflare R2 acceptance claim. API3002 uses it; active API3001 unchanged.
- New frontend5175 targets canonical API3002 for real UI verification; localhost5174 still targets active legacy development data. No production deployment or cutover.
- GCC confirmed by user: https://gradedcardcenter.com/. Price-provider work is now assigned; unavailable credentials must remain explicit acceptance gaps.

### Final integration and market wave —23November

GCC user identification confirmed and live service exercised through authenticated canonical API. Shared market DTO retains original currency, active/sold/currentbid semantics, candidate match evidence and pagination. eBay/Vinted adapters require authorized Soldgraph access; Cardmarket provider contract/access remains unresolved. No subscription or paid request performed. UI integration and independent repairs are in progress.

Fresh3222 restored1334records; rerun0new/1334replayed; reconciliation errors[]. All6historical PDFs downloaded through canonical API byte-identical;6new document types generated and inspected; actual WebSocket update/logout invalidation passed.

Independent reviewer found paid request identity duplication, completed-job poll exhaustion, legacy cross-workflow revision omission, and missing canonical event projection. Repairs and targeted regressions now implemented, independent recheck pending. Cookie-based paid research additionally requires allowed Origin and custom application header.

### User market-provider constraint supersedes paid-provider wave

User explicitly rejected paidproviders and separately running services. Soldgraph code/configuration removed. Integrated direct retrieval now uses GCC publicJSON, MIT-adapted Vinted RSC parser, and Cheerio1.2.0 for eBay/Cardmarket. Vinted single-trading-card category verified96results on each of two realpages. eBay/Cardmarket directHTTP403/challenges remain truthful operational blockers despite parserimplementation. No paidrequests, proxyservice or daemon. Finalmigrationplan ab9a5396913f130293051ab3c355c449b2aff12f64afe67ffa2712997e288d3c rehearsed fresh3224 twice with1334insertions then0, errors[].

## Completion-gap audit follow-up

Completed another bounded implementation/review wave after the initial integrated delivery. Fixed public catalogue facets/language/recency/gallery and information routes, financial unknown-cost propagation and exact stock export valuations, canonical linked/history pagination, native calendar/session isolation and Reduce Motion. Evidence and remaining acceptance are recorded in `feature-parity.md`, `pagination-checks.json` and the latest section of `independent-review.md`. Combined validation:281 tests, seven typechecks, API/web builds and final native Hermes export pass. No schema migration or production cutover was performed in this wave.

## Security, capacity and native acceptance follow-up

Fixed direct legacy Convex session revocation/version enforcement, transient auth-store outage handling, deterministic media retry preservation, uncertain email retry identity and shop-timezone business guards. Public catalogue projection now avoids private hydration and delays photos until pagination; exact aggregate scan limits remain disclosed. Native logout/instance switching and accessibility-large text were exercised; resulting layout and closed-registration issues were repaired. Independent review rechecked actual browser retries with isolated fault injection and23 focused tests.

Combined315tests, all seven typechecks, API/web builds and current native Hermes export passed. Safe aggregate runtime evidence is retained in `catalogue-capacity-check.json` and `business-calendar-check.json`. Migration and PDF baseline evidence remain unchanged; no production import, schema deployment, cutover or email send. See `feature-parity.md` for current acceptance rather than earlier wave counts.

The last same-instance different-account device check passed: second QA account saw no prior account draft, basket, detail or signatory; returning to the original account restored only its draft. Final signature assistance text is present on web/native; web build and mobile typecheck/Hermes export rerun successfully. Original device account and text size restored.

## Financial retry, public configuration and capacity repair wave

Independent audit identified duplicate financial-write risk after lost responses, dropped partial buyback photos and hardcoded social/legal operator data. Those surfaces were repaired with immutable submission recovery, retained photo queues and versioned public configuration. Follow-up review reproduced a later-error downgrade of uncertain attempts, then cross-account recovery; both received targeted state/authorization fixes. Server same-account/mismatch checks passed against the isolated backend. Dashboard one-snapshot batching preserves ledger totals and avoids per-record query fan-out; remaining large-history limits remain documented.

Native photo upload/cover/download checks passed against the isolated signed-S3 fixture; persistent device `RUNNER_BUSY` stopped further metadata/correction UI checks without claiming success. Full suite343tests, seven typechecks and API/web builds passed before a final narrow stale-upload callback guard. Independent final browser/account review continues; see the current acceptance ledger.

## Financial recovery wave — integrated verification closure

Completed immutable account-bound recovery on web inventory/financial forms and native financial creation paths, including retained evidence uploads, frozen summaries, stale JSON/upload/share guards, and reset-before-release of confirmed native forms. Independent browser account-switch and fault-injection checks passed; the final native sharing source recheck passed. No concrete finding remains in this bounded review.

Final combined suite:369 tests passed, zero failures/skips (`/tmp/cartelites-recovery-integrated-final.log`); all seven workspace typechecks, API/web production builds and native Hermes export passed. Native final artifact: `/tmp/cartelites-mobile-financial-recovery-share-final`. Recovery remains in-memory, and new native panel/OS-share runtime acceptance remains pending after persistent `RUNNER_BUSY`. Actual legacy3001 authentication/status and5174 CORS checks passed.

Continue from the explicit gaps in `feature-parity.md`: native metadata/correction/recovery interactions after device access is restored, Android/accessibility matrix, real cloud R2/Brevo access, live eBay/Cardmarket availability, and remaining large-history acceptance. No production authorization is implied. Historical plan entries above describe their respective revisions and are superseded by the current acceptance ledger.


## Correction recovery and stock traceability — integrated review closure

Completed web/native correction recovery, account-bound cancellation/return retries, native scene scroll preservation, and stock lots/activity. Added authenticated, derived item activity with bounded pagination/rebuild and explicit incomplete history. Retained legacy cancellation operation bindings prevent key reuse after no-op retries. Canonical numbered purchase-history contract, truthful refresh completion and legacy lot valuation defects found during real verification were repaired. Convention foreground tokens now pass actual default/alternate light/dark contrast checks.

Independent review inspected code and real browser behavior, closing opening provenance and corrected acquisition-date findings. New date corrections preserve source timestamps and add zero-quantity item audits. Actual isolated QA stock mutations/replays/reversals and corrected dates reconciled; intercepted financial correction tests made no business writes. Reimport3224 replayed1334/inserted0 with no reconciliation errors. Evidence is linked from `feature-parity.md`.

Final410 tests, seven typechecks, API/web builds and final native Hermes export passed (`/tmp/cartelites-mobile-stock-traceability-final`). Native device acceptance remains unavailable after prior persistent RUNNER_BUSY; no fresh device pass is claimed. Cloud R2/Brevo, live eBay/Cardmarket, native/accessibility/Android and large-history gaps remain. Goal remains active; no production cutover or import authorized.


## Filtered histories and payment revisions — integration wave

Re-read explicit history/accessibility requirements and inspected current sources. Independent review identified missing sale payment audit history and an invalid receipt-signing return route. Implemented shared shallow history/payment revision contracts, authenticated paginated reads on both backends, server-filtered native Activity, native sales filters, web sale origin filter and web/native payment revision sections. Repaired stale current/reversed state after concurrent pagination, first collection's prior pending status, and mixed-origin basket matching. Source query fan-out is bounded without inventing partial totals.

Actual isolated pending→cash→mixed correction→cancellation restored stock/cost and preserved revision snapshots/timestamps. Native DTO reads passed all eight categories and payment pages. Browser keyboard/layout measurements repaired the responsive basket dock jump; no sale was submitted by those browser tests.432 tests, seven typechecks, API/web builds and native Hermes export `/tmp/cartelites-mobile-history` passed. Current evidence/remaining platform/provider/cloud/capacity acceptance stays in `feature-parity.md`; no production import/cutover authorized.


## Reconnection, real browser contention and native gap closure

Audited remaining explicit acceptance requirements and repaired verified web auth/realtime outage regressions. Implemented native supplier/consignment previous-step navigation, Plus grading maintenance, stable quantity controls, actionable retained-basket conflict feedback and selected-contact retry. Aligned grading filter length with editable dictionary names and fixed definite unavailable-at-date classification while preserving uncertainty.

Actual two-tab final-unit race returned one201/one409 and authoritative one allocation; cancellation restored1/101 cents. Real application WebSocket reconnect and automatic gift/reversal updates preserved search/basket; read-only auth503 fault/retry preserved the verified workspace. Excluded/cancelled the initial HMR-interrupted attempt. Browser probes restored and owned tabs closed. Evidence and final independent review are linked in `feature-parity.md`.

Final452 integrated tests, seven typechecks, API/web builds and Hermes export `/tmp/cartelites-mobile-reconnect-final` passed. No PDF/schema/production changes this wave. Remaining gates are native device/accessibility/Android acceptance, real cloudR2/Brevo, direct blocked marketplace access and documented large-history limits; goal remains active.

## Series filter follow-up — 23 November 2026

In progress: add game + exact series/extension selection to stock, sales selection and Convention on web and native stock/sales. Backend filters combine with existing search/grading/visibility and preserve authoritative continuation. Public facets must use eligible public stock only; staff options must cover all available stock rather than the current page. Existing OpenRift variant suffixes group under their extension without modifying stored metadata. Shared contract: `tcg?: 'all'|'pokemon'|'riftbound'|'other'`, `series?: string` (empty = all); public result adds `series: string[]`; authenticated `readModels:stockSeries({tcg?})` returns `string[]`. No schema migration or provider calls required. Verification and independent review pending. Acquisition catalogue search scope awaiting user's optional clarification.

User confirmed Stock, sale selection and Convention; additionally requested free-entry completion for manually entered series. Integrated backend + web + native changes are in place. `stockSeries` supports an authenticated `includeUnavailable` boolean for historical names; public options remain available/public-only. Completion is wired to buyback, product editing/correction and consignment fields; new values remain allowed. Series validation accepts300 characters, matching product metadata. Root local checks passed on3220 and3210; the latter, used by localhost5174, has both Pokémon and Riftbound names. Complete tests exposed a public legacy DTO regression (unspecified non-card game changed to `other`); restored the historical output semantics while keeping filter classification separate. Independent medium review in progress. No external provider calls or data writes beyond temporary auth sessions.


Series follow-up completed in source and local backend acceptance. Medium implementation delegates owned backend and native; root owned shared/web/integration; separate medium reviewer inspected actual changes and ran20 focused tests plus five affected app/backend typechecks, with no actionable finding (`series-filter-review.md`). Full suite:498 total,497 passed,0 failed,1 existing opt-in auth test skipped; all seven workspace typechecks, API/Vite builds and iOS Hermes export passed. Existing Vite chunk-size advisory remains. Real current API3001 traversed Pokémon3series/4items and Riftbound1series/1item; canonical3002/3220 reconciled all19available items, public facets and historical completion. Both anonymous and authenticated boundaries verified. Evidence: `series-filter-local-check.json`, `series-filter-running-check.json`, `series-filter-legacy-local-check.json`, `series-filter-legacy-running-check.json`. Reproduce canonical acceptance with `node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/check-series-local.mts --running`; it asserts the known local rehearsal target and blocks external transport. API3002 was restarted with its same loopback-only rehearsal env and Node watch so the newly added route is live. No schema changes, provider changes, PDF changes or business data writes. New UI control interactions were not exercised in browser/device this wave; prior RUNNER_BUSY remains the native acceptance limitation. Exact series dictionaries scan recorded products/eligible stock and inherit Convex query limits at very large volumes.


## Explicit reimport command — 23 November 2026

User narrowed the request to reimport only; deployment files/automation remain out of scope. Root extends `import-convex.ts` with `--restore`, source-digest confirmation, canonical schema preflight, local object-backup validation and CLI alias `pnpm data:reimport`; medium backend agent owns target/source policy and bounded post-import activity rebuilding. R2 bytes remain in the existing bucket under unchanged keys; no renderer changes or file overwrites. Independent medium review and local3224 replay acceptance in progress. User guide: `reimport.md`.


Explicit reimport verification complete: private-config `--config` CLI tested through pnpm, source ZIP normalized and11local objects checked, real isolated3224 restore replay0inserted/1334replayed/errors[]/activitycomplete385processed. Local restore mode disabled afterward. Independent medium review identified preexisting activity checkpoint skipping, pnpm reserved-flag incompatibility and strict test typing; lead repaired all three with regressions. Final full suite508pass/0fail/1existing optional auth skip, workspace typechecks and focused strict CLI/test check passed. No remote import, R2 operation, deployment automation change, data deletion or PDF generation. Source and keys preserved; reusable command documented in `reimport.md`.
