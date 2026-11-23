# Web implementation and verification

The existing React/Vite application and business API calls are retained. The mockups informed the interface; no fictional records, simulated payments/signatures or local-storage business ledger were imported.

## Implemented

| Capability | Location | Evidence/status |
|---|---|---|
| Shared configurable light/dark branding, action tint, selection, focus, surfaces | `src/brand.tsx`, `src/style.css`, `vite.config.ts` | Shared resolver; OS/config/user appearance; metadata and branding from shop config. Fixed legacy `--muted` text/background collision. Browser checks remain lead-owned. |
| Actual shadcn Button, Input, Dialog | `src/components/ui`, `components.json`, Tailwind/PostCSS config | Source retrieved from official new-york registry; Radix focus trapping/dismissal; local icon substitution and actionTint customization. Main workspace and buyback use Button/Input. |
| Public complete details/gallery | `src/PublicProductDetail.tsx`, `main.tsx` | Real `operations:publicProduct` subscription; public photo endpoints only; live removal when ineligible; retained listing filters/scroll; focus restored to opener. No private fields requested. |
| Search | `main.tsx`, `PurchaseEditor.tsx` | Shared TCGDex service, selected language, provider pagination; query/language edits invalidate in-flight requests and clear old pages. Existing Riftbound search retained. |
| Editable grading companies | `GradingCompanies.tsx`, `PurchaseEditor`, `ProductEditor`, `ConsignmentsPage` | Real GET/POST/PATCH; inline creation; revision on rename; arbitrary textual grades preserved. Legacy records absent from registry remain selectable. |
| Basket quantities | `main.tsx` | Stable inline minus/count/plus; selected state; supplier maximum; quantity included in sale mutation; editable line totals scale on quantity change. |
| Supplier receipts/invoices | `InventoryOperations.tsx` | Real receipt mutations, new/existing products, quantity/cost/explicit sales tax, hidden new products, separate upload with retained attachment retry key. |
| Gifts/display opening/reversals | `InventoryOperations.tsx` | Real server mutations; donor details/reason/evidence, quantity preview, exact-cost server allocation; history/reversal actions. |
| Receipt/gift history and CSV | `InventoryOperations.tsx` | Paginated real server reads and evidence downloads; complete paginated export with known costs, unknown-cost counts, supplier references and notes; export fails on incomplete/repeated cursors. |
| Existing workflows | Existing pages remain wired | Auth/reset/sessions, contacts, pending buybacks, receipts/signatures, consignment agreements/returns/payouts, sales payment corrections/cancellation, conflict resolution, dashboard/Excel, legal/informational pages preserved. Runtime parity not asserted. |

## Dependencies

Added Radix dialog/slot, class-variance-authority, clsx, tailwind-merge for actual shadcn components, plus Tailwind 3.4.17/PostCSS/autoprefixer to compile their utility classes. Existing React/Vite versions retained. Registry source: https://ui.shadcn.com/r/styles/new-york/button.json, input.json, dialog.json. No PDF renderer or document asset changes.

## Verification

- Web TypeScript check passes (direct TypeScript CLI and pnpm script).
- Production Vite build passes; existing ExcelJS chunk remains large; combined main bundle crosses the advisory 500 kB threshold.
- Ten passing tests in `tests/`: unknown-result retry identity, confirmed mutation preservation after follow-up failures, new operation identities, stale search invalidation, complete pagination, pagination failure, timezone conversions, invalid dates and daylight-saving boundaries.
- Test command: `node --import ./apps/api/node_modules/tsx/dist/loader.mjs --test apps/web/tests/*.test.ts` from repository root. Direct loader avoids sandbox IPC restrictions in the tsx CLI.
- Lead observed public error shell in browser because local API at port 3001 was unavailable. No authenticated real-backend, PDF, R2, full keyboard or two-theme workflow acceptance claimed by this role.

## Remaining acceptance / gaps

- Not a completed full rebuild or normalized-schema migration: UI uses compatibility API and existing Convex operations.
- Unified `/admin/documents` is implemented with real paginated read API, archived-original downloads and explicit email actions. Lists are grouped by document type, not a globally merged chronology; search is explicitly page-only. Historical versions remain available via signature/history routes.
- Full paginated opening history now supports reversals for fully consumed source displays; server enforces no reversal after resulting boosters are used.
- Supplier selection is the existing supplier-name API semantics, not a contact reference; contact normalization requires backend contract work.
- Supplier product selection now uses paginated all-product history including exhausted supplier products. Existing products retain pricing, visibility and tax metadata.
- Display confirmation requires authoritative FIFO preview showing exact total cost and indivisible-cent distribution, with a compatible existing booster target or a new product. Mutation revalidates allocations.
- Gifts CSV now exhausts all pages, includes notes/costs/source references, separates unknown costs, and rejects incomplete exports.
- UI forms support meaningful new flows but require real-development-backend interaction validation and accessibility review, including native dialog focus, 200% text, narrow tables and contrast across all legacy components.
- Informational copy retains baseline buyback percentages. All application money/date formatters consume shop currency/timezone; PDF output unchanged. All brand logos, including the informational page, react to configured light/dark assets. Decorative hero rings/gradients removed.

## Second implementation wave

Added `DocumentsPage.tsx`, `shopFormat.ts`, `lib/cursorPages.ts` and their tests; expanded `InventoryOperations.tsx` using the lead-provided workspace read APIs. Build and typechecks rerun after integration. API remains unavailable locally, so authenticated requests, emails, downloads and R2 uploads have not been exercised against a running backend by this agent.

### Direct Vinted runtime check,23November

Root exercised actual canonical5175 stockdetail→Consulter→Vinted→Pikachu→search:96real direct public listings, asking prices/protectionfee/totalbefore shipping separate. Next displayed page2with96different listings. No horizontal overflow at1280px; Escape closed detail and restored stock-row opener focus. No business mutation in this check. Backend3002 has no paid-provider adapter/configuration.

## Completion-gap implementation and runtime checks

Public catalogue now provides language filtering and global public-safe facets, quantities, chronological recent sorting, enlarged photo navigation, contact and reference-copy actions. `/rachat`, `/depot-vente`, `/boutique` implement separate informational journeys. Independent browser inspection covered390px light/dark, contained enlarged images and Escape focus restoration. Root additionally inspected the actual Boutique screenshot and verified390px document width without horizontal overflow.

Unknown costs are nullable throughout UI/export calculations. Excel includes remaining lot cost and quantity, with explicit failure recovery; real canonical export and injected lot-request failure passed. Unknown purchase costs cannot generate a new unsigned PDF or fabricated correction total, while signed archive access is preserved. See the integration ledger for latest combined test/build evidence and remaining capacity/access limits.

## Interrupted financial submissions and purchase-photo recovery (23 November)

`main.tsx` now freezes purchase and bulk-sale request bodies, operation IDs and purchase receipt/photo context as soon as submission starts. A lost response cannot be replaced by a new ID when basket, payment or purchase fields change. Recovery explicitly replays the original idempotent request; submitted controls remain disabled. Recognized validation/authentication rejections expose a separate action to review and edit the rejected request. Network failures, 5xx responses, timeouts and idempotency conflicts retain the unresolved attempt. HTTP errors retain their existing human-readable `.message` while carrying status/code metadata for this distinction.

`ConsignmentsPage.tsx` applies the same invariant to payouts, agreement edits and deposit creation. A confirmed write is cached before refresh/upload follow-ups, and retrying after a refresh failure does not issue another financial mutation. Deposit creation keeps its submitted item snapshot and removes each successful attachment from the remaining queue. Existing PDF renderer inputs, including the legal configuration import, are unchanged.

Purchase photo uploads now retain committed purchase/item IDs, each original `File`, and one stable upload UUID per file. The separate “Réessayer les photos restantes” action uploads only failures and never recreates the purchase. Failed files remain in memory across internal navigation; a before-unload warning protects pending files and unresolved submissions. Closing/reloading the application still loses browser-memory files: this is not an offline persistent attachment store.

Validation: six new regression tests simulate lost responses after server commit for purchases/sales/payouts, attempted payload edits, confirmed-write refresh failure, explicit rejection versus uncertain failure, and partial photo upload failure with stable retry identity. All 46 current web tests and the web TypeScript check pass. These bounded interruption scenarios were tested with deterministic transports; live browser network interruption/R2 recovery was not exercised in this repair wave. No production action or email send was performed.

Production web build also passed (235 modules). Vite retains its bundle-size advisory for the main and ExcelJS chunks. No source changes were made after handing the stable application to the independent reviewer.

## Account-bound pending recovery (23 November)

The authenticated workspace now mounts under the account ID returned by `/auth/status`. Logout or an account change resets private forms, baskets and detail views through a keyed remount. Pending financial requests and retained photos are stored in account-keyed browser-memory vaults, including purchase/sale recovery and consignment creation/payout recovery. Returning to the originating account restores those attempts; another account receives a separate empty recovery scope. Unresolved work is not silently reassigned or discarded on logout.

The scoped request function exposes an immutable `accountId`, attaches `X-Expected-Account-ID` to private reads/writes, and checks an account generation before transport and before consuming responses. Multipart evidence/photo uploads carry the same expected-account header. Session rejection or account mismatch suspends the old workspace and rechecks identity; a service outage alone does not clear it. Late responses cannot change the new account’s CSRF state or overwrite a later successful recovery. Pending work for inactive accounts still activates the browser’s unload warning. This vault remains memory-only and does not claim reload persistence.

Five account-scope tests verify header ownership, cross-account recovery rejection, retained original files, logout/re-login generation checks, invalid-session versus service-outage behavior, and late-response ordering. Together with the fourteen interrupted-submission tests, all 19 focused tests and the web typecheck passed. Independent same-tab cross-account browser verification is being recorded separately by the lead/reviewer.

Independent browser follow-up passed real same-tab QA login/logout A → B → A. Account B saw neither account A’s pending email/recipient nor payout recovery; returning to A restored both with unchanged payload, operation key and expected-account header. Four financial/email attempts were intercepted, so this checked application/account behavior without sending email or committing business mutations. Final narrow guards also recheck the account after asynchronous upload-error JSON parsing and before generated PDF download side effects. All 19 focused account/submission tests and web typecheck passed again afterward.

### Inventory recovery extension

`InventoryOperations.tsx` now uses the same account-bound submission primitive through `lib/inventoryRecovery.ts` for supplier receipts, gifts, display openings and reversals. Its account-keyed memory vault retains the frozen request and its kind, evidence `File`, stable upload UUID and confirmed target ID. Unknown results freeze form/tabs and expose explicit same-operation recovery. Confirmed writes are cached before attachment or refresh follow-ups; neither failure creates another stock movement. A new operation is blocked while confirmed evidence remains pending, and a reversal receives its own explicit operation identity after the preceding movement is closed.

Seven added tests cover all four movement paths after a lost response, confirmed-write refresh retry, evidence failure with original file/target/UUID, account remount isolation, and separation of reversal identity from creation. Combined inventory/account/submission tests: 26 passed; web typecheck passed. Live R2 failure recovery was not exercised by this agent; the independent reviewer is checking an intercepted browser retry without business writes.

Inventory browser follow-up independently passed against real QA stock with every write intercepted: a lost gift response froze the form/tabs; recovery reused the exact body, key and account header; a synthetic acknowledgement followed by a lost evidence response blocked a new operation; evidence-only retry reused the UUID, target, filename and account header without another gift POST. No actual gift, upload or other business mutation was performed.

Recovery panels now show human-readable summaries derived only from saved request bodies/context: original purchase reference/contact/count/cost, sale quantity/line-total/date, payout amount/reference, and inventory kind/quantity/supplier/reference where present. Four tests ensure the summaries ignore later editable values, preserve unknown costs and do not multiply sales line totals twice. Multipart 401 responses also suspend/recheck the account boundary while retaining the original pending work. Final focused account/submission/inventory/summary suite: 30 passed; web typecheck passed.


## Correction recovery and live stock history

Payment correction, cancellation, purchase correction, return preparation and statements now retain frozen account-bound operations across uncertain responses and component reopening. Confirmed writes are separated from history/PDF read retries. Independent browser checks intercepted financial writes and verified identical retries, frozen forms and read-only refresh after acknowledgement. A real canonical purchase-history contract mismatch and premature refresh-success message were repaired and retested.

`StockTraceability.tsx` shows paged lots and live authenticated item movements with exact costs, provenance and explicit unknown/incomplete history. Actual QA gift/replay/reversal was observed in the stock detail; light/dark inspection and Escape focus restoration passed. Convention action foregrounds were corrected and checked in both default and alternate palettes. Evidence: `stock-activity-runtime-check.json`, `correction-recovery-browser-check.json`, `convention-theme-check.json`, and `independent-review.md`.

Final integrated410 tests, seven typechecks and Vite production build passed; the existing bundle-size advisory remains. Browser fault injection did not send payments, signatures or email. Latest native checks are recorded separately.


## Sale payment revisions and responsive basket acceptance

`SalePaymentHistory.tsx` subscribes to authenticated `operations:salePaymentHistory`, with per-sale cursor ownership and captured-account checks. Sale detail shows earlier amounts/reference/receipt date, correction date and known author; missing legacy values stay explicit. Cancellation labels do not imply a banking refund. Origin filtering on sale history now includes mixed baskets. Receipt signing's return route is `/admin/purchase-history`.

Real browser keyboard checks passed quantity changes, invalid-payment error focus, pending-payment confirmation focus wrapping and Escape restoration. Search and quantity survive review→selection. At390px the basket dock previously changed99→78px on selection; the two-row layout stays90px empty/one/max/removed. Item row positions/heights stay identical;320px has no horizontal overflow. See `sales-interaction-check.json`. No confirmation mutation was sent. Web typecheck and production build pass within the432-test integrated validation.


## Session outage and concurrent-sale acceptance

Removed redundant startup status handling that turned any rejection into logout. Status parsing requires valid explicit authentication fields; verified workspace identity survives503/network/malformed responses with retry. The outer boundary's availability error is now visible inside the existing workspace, preserving forms rather than remounting them. Scoped actual session rejection still clears identity.

Actual two-tab QA last-unit sale: both client-validated original POSTs were forwarded to local3002/3220, one201 and one409, with the losing basket preserved. The winning sale was cancelled and exact stock/cost restored. Real WebSocket close/reopen, subsequent automatic gift/reversal updates, and session503→retry recovery all preserved search/basket. `reconnect-browser-check.json` distinguishes the excluded HMR-interrupted attempt, real mutations, read-only injected failures and final cleanup. No payment provider or email was invoked. Final452-test suite, web typecheck and production build pass.
