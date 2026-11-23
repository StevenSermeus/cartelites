# Mobile implementation and verification — 23 November 2026

## Document/export completion wave

Sale tickets now reconcile recent server delivery records and persist each submitted intent before sending, scoped by instance/account. Remount/restart recovery retains its original recipient, document and idempotency key. Uncertain delivery is not cleared by a later pre-send rejection; definite stale-ticket rejection requires explicit current-version selection. This recovery metadata does not simulate a successful delivery. Server version/email history remains explicitly recent, not exhaustive.

Receipt/ticket PDF sharing and gifts CSV use guarded unique temporary directories with account checks around asynchronous platform work. Signed histories display actual version metadata. Gift exports exhaust continuations, reject missing/repeated cursors, and use shop-zone day boundaries, including DST. Existing PDF inputs/renderers remain unchanged.

115 native tests, TypeScript and independent source/regression review pass. Hermes artifact: `/tmp/cartelites-mobile-documents-final`, bundle `index-32bbddd3b229335a8462bdab1d1fa395.hbc`. No new device interaction or real email delivery is claimed: the previously persistent device runner failure was not retried or bypassed.

## Preserved baseline

Expo 58 / React Native 0.88, React Navigation, native controls, API repository, secure sessions, account/instance-scoped drafts, supplier/gift/display operations, consignment agreements/returns/payouts, collections/corrections, and PDF lookup/signing/sharing remain real integrations. No business operation was replaced with simulated state. No PDF renderer was changed.

## Integrated changes

| Capability | Implementation | Evidence |
| --- | --- | --- |
| Navigation | Rachats initial; Rachats/Vendre/Stock/Activité/Plus; Vendre direct selection. Native-stack wraps mounted tabs; buyback contact/card/review, basket/payment/success, contacts, consignments and sales history use native Back/gestures. Resumed buybacks reconstruct prior steps, business values stay in App/draft state | Typecheck, bundle/native build; contact/cards/review native Back preserves values on iOS |
| Stock and sale selection | Fixed quantity controls, selected styling, quantity badge; persistent basket summary including empty state; per-page scroll storage | iOS QA stock 0→1→2→3(max)→0, fixed coordinates; selection/basket Back preserves search and quantities |
| Product photos | ProductPhotos: real authenticated multi-image uploads, explicit cover, removal confirmation and full-resolution gallery. Successful uploads removed from retry queue; each retry retains operation ID | Typecheck/build; live R2 acceptance pending |
| Product metadata | ProductEditor saves description, public/private attributes, variant, serial number and private notes through the canonical stock/product API, with item and product revision guards | Typecheck; native metadata device acceptance remains pending |
| Grading | Database picker/create reused in buyback, supplier, consignment and product edit; stock company filters fetch records; arbitrary names/text grades | Typecheck; live backend pending |
| TCGDex | Shared search, selected-language controls, provider load-more, full printed number retained, manual entry, stale-response guard | Regression test; shared tests owned by lead |
| Branding | Validated light/dark config; selected appearance/name/logo/dark-logo; neutral loading/error/reset; per-instance cache | Shared contrast validation; light/dark branding/logo viewed on iOS; isolated instance switch/reset verified; contrasting shop brands remain unverified |
| Currency/timezone | Config retained; operational money formatters/captions and key history dates use selected shop | Shop-switch regression test |
| PDFs | Original lookup/failure behavior and renderer inputs retained | Existing receipt/document tests |

## Completed checks

- Mobile TypeScript check passes; baseline React return-type incompatibilities fixed without React/Expo upgrades.
- `node --import ./apps/api/node_modules/tsx/dist/loader.mjs --test apps/mobile/tests/*.test.ts`: **36 pass**.
- iOS Hermes export passed (1,154 modules); current source loaded through Metro on simulator (1,276 development modules). Final export directory `/tmp/cartelites-mobile-native-parity`.
- Native Debug build from existing `ios/ProjetMew.xcworkspace`, scheme ProjetMew: **BUILD SUCCEEDED**, temporary derived data `/tmp/cartelites-rebuild-native`, log `/tmp/cartelites-native-signed-build.log`. No prebuild/clean/project regeneration.
- Added required `@react-navigation/native-stack` 7.x and exact `@react-native-community/datetimepicker` 9.2.1 (Expo 58 bundled version); installed native/screens versions retained. Lockfile also includes concurrent web changes.

## Actual simulator outcome

Used T3 device tools and the returned `agent-device` CLI on local iPhone 17 Pro Max / iOS 26.1. Built the existing iOS workspace using Xcode simulator signing (`CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-`), preserving the project's simulator entitlements, and installed separate `dev.wdee.cartelites.dev`. This resolved the earlier unsigned SecureStore and ad-hoc-signature launch failures. No prebuild, clean, project regeneration, production API, or historical mutation.

Connected current source through Metro to `http://localhost:3001` (isolated Convex 3210), selected the instance, loaded its branding/logo, and logged in with the dedicated local QA account. Registration remained closed.

- Rachats opens initially; five tabs render correctly. Light and dark shop palettes checked visually.
- New acquisition selected synthetic contact `QA Réécriture 23 novembre`. French TCGDex `60/106` returned Pikachu (EX Émeraude), Balbuto (Duels au Sommets), and Foretress (Étincelles), retaining legitimate ambiguity. Selected full number retained.
- Renamed the test card `QA Native Pikachu 60/106`, valued €10 at 70% (€7 acquisition). Native Back from cards to contact and forward preserved contact, card, price and rate. Only one top-left Back was present.
- Saved pending acquisition `R-1795437030335`; real original-layout PDF rendered its contact/card/€10/70%/€7 details. No signature was applied.
- Sold two synthetic `QA Display Interface 23 novembre` units at €20 each using €15 cash + €25 transfer. Real archived ticket `VEN-k574nn6rc0s5k3g00sxfze0apd8jshwa` rendered quantity 2, total €40, cash €15, transfer €25, zero outstanding, included VAT €6.94.
- Selection→basket→native Back restored search `QA Display` and quantity 2. After sale, realtime available quantity became 3. Checked 0→1→2→3(max)→2→1→0: plus button remained at `(395,449)`, minus at `(331,449)`, selected styling and persistent summary remained stable, plus disabled at max. Basket left empty; only the two QA units were sold.
- Evaluation identity fields now editable; grading-company creation expands on demand instead of occupying the default estimation form. Quantity accessibility labels include current value.

## Remaining acceptance and gaps

Still require VoiceOver, contrasting-shop branding, deep pagination/scroll restoration, native photo upload/retry/cover, consignment signatures/returns/payouts, and mobile sale correction/cancellation acceptance. Dynamic Type and instance/account isolation were subsequently checked below. Core acquisition, PDF preview, mixed sale, native Back, theme and quantity stability checks above passed; do not infer full-platform acceptance. Existing full-screen native stock/product/PDF modals remain. Dossier, operation, consignment item and document views now push onto the native stack; form edit sections stay inside their owning workflow.

Canonical public/private metadata editing is now integrated. Shop timezone controls operational calendar input, including DST validation, without changing PDF renderer layouts. No production access/deployment or PDF changes.

## Native design parity follow-up

- `purchaseDetail` and `saleDetail` are native routes, separate from mounted history lists. A native dossier host holds nested consignment dossiers, consignment item details, contract documents and purchase operations, while their owning components retain draft state. Back closes only the current level. Record detail reads refresh by ID after mutations, including records outside the current history page.
- `DateField` uses the installed native iOS date wheel / Android dialog. French locale, light/dark text, explicit choose/cancel and optional clear preserve the existing YYYY-MM-DD business contract. Integrated acquisition/sale/collection, supplier/gift/opening, consignment/return/payout, and history-filter dates. PDF semantics unchanged.
- Activity merges eight real paginated sources: purchases, sales, consignments, payouts, consignment events, supplier receipts, gifts and openings. Each source retains its cursor and error, and retries deduplicate by source+ID. Loaded entries sort by operation date. The backend sources have different sort indexes, so the UI explicitly describes loaded records; subsequent pages can insert backdated operations. It does not claim a globally chronological server cursor. Manual refresh resets source cursors.
- Runtime on signed iOS simulator: native purchase dossier → operations → native date choose/cancel → Back; unified Activity loaded all 41 available local records without source errors; exact QA sale opened with cash €15/transfer €25 then Back returned to the feed. Consignment → article → Back → dossier → Back to list verified read-only. No signatures, cancellations or additional business writes in this follow-up.
- The loading path exposed `usePagedData` recreating empty arrays during render, causing a consignment state-update loop. Memoized the current empty result; retest passed. Dossier subscriber snapshots and navigation-ready guards prevent resubscription loops and cleanup errors. Added regression tests for nested entries, subscriber replacement, independent activity cursors/duplicate retries/backdated records, empty intermediate pages and invalid calendar days.
- Native build with date picker: `/tmp/cartelites-native-dates-build.log` BUILD SUCCEEDED; pod install on existing iOS project, no clean/prebuild. Current source passed typecheck, 36 mobile tests and Hermes export. Android native date dialog remains unverified because no Android toolchain/device is available. Local dataset exhausted its source pages; continued-page merge is covered by unit tests, not a claimed large-data device run.

## Canonical inventory compatibility

InventoryManager accepts nullable historical costs in receipt/gift/lot DTOs. Null and absent costs display/export as “Non renseigné”; genuine zero remains zero. Gift export totals only known active costs and separately counts unknown active costs. A regression test covers null, absent, zero and cancelled gifts. `reversalAvailable:false` on gifts/openings disables reversal and explains that allocation reconciliation is required. This prevents offering an unsupported restoration for incomplete legacy history.

## Final native acceptance and follow-ups

- Unknown purchase costs stay unknown in stock, history, activity, corrections and profitability previews; zero remains a known cost. Missing costs cannot silently become a margin or new PDF valuation. Archived original PDF download/share does not require reconstructing unknown financial inputs. PDF renderers and historical bytes remain unchanged.
- Market prices use the authenticated shared service with source/mode selection, evidence, status/error messages, paging, listing links, and Cardmarket product candidate selection or explicit product URL. No simulated prices. A real GCC auction result was viewed on iOS; provider pagination and external-link device acceptance remain pending.
- Product photo actions preserve unsaved metadata when the refreshed server baseline is unchanged; genuine concurrent metadata changes require explicit conflict reload. This is covered by targeted regression tests; real R2 device acceptance is still outstanding.
- Shop calendar inputs and operational formatting use configured timezone/currency. Reduce Motion is subscribed through AccessibilityInfo and controls transitions, modal animations, swipe behavior and programmatic scrolling. The device CLI exposes no iOS Reduce Motion setting, so the OS toggle was not exercised.
- On iPhone 17 Pro Max / iOS 26.1, accessibility-large text exposed wrapping tab labels and purchase rows compressed by prices. Fixed single-line bounded tab labels with separate quantity badges, measured tab/safe-area clearance for floating actions, and stacked purchase rows at large font scales. Rechecked readable Rachats/Vendre screens; restored the device text setting to large. VoiceOver remains unverified.
- Logout from a nested purchase operations context returned to login. Relogin starts at Rachats with empty basket and no stale detail stack, while the account's contact-only local draft remains available. Instance switch 3001/Convex3210 → 3002/Convex3220 showed neutral branding before loading config, required new login, and did not expose the other instance's draft. Switching back restored its own draft. Both instances use Cartélites branding; this does not prove contrasting palettes.
- Same-instance account isolation passed on canonical API3002/Convex3220. Created a clearly named second QA account via the isolated auth service after asserting the exact Convex URL; registration configuration stayed closed and no email was sent. Original account: one contact-only local draft and one unsubmitted basket unit. Second account: no original local draft, empty basket, root Rachats and unconfigured signatory. Shared business data remained visible by design. Returning to the original account restored exactly its one local draft and kept the basket empty. Device left on original-account Rachats at canonical3002. This check made no purchase/sale/contact mutations. Credentials remain only in private mode-0600 temporary files.
- Native signup availability now reads unauthenticated `/auth/status`, hides registration when closed and provides explicit loading/error/retry without preventing login. Closed registration was verified on both isolated instances; two targeted availability tests pass.
- Ticket email retries preserve the same attempt and original recipient when delivery is unknown. A confirmed failed or explicitly pre-send-rejected attempt can be retried with a fresh ID only after the existing confirmation. Classification uses stable API codes, not localized text. Four targeted retry tests pass; no real email was sent.
- Editable native signature UI now states that users unable to draw should request shop assistance before continuing. Drawing coordinates, validation, saved signatures and PDF layouts are unchanged.
- Final mobile TypeScript check passed. Final iOS Hermes export after all above changes passed: `/tmp/cartelites-mobile-final-signature`, bundle `index-ff13260779fade651a382e9c82caec82.hbc` (3.6 MB), log `/tmp/cartelites-mobile-final-signature-export.log`. Earlier test counts above are historical checkpoints; see the lead's final aggregate for the complete integrated suite. No Android device acceptance: Android SDK Command-line Tools are unavailable at the configured SDK path.

## Native photo acceptance — isolated signed-S3 fixture

Used `device_list`, `device_open` and the returned device CLI on the same signed iOS development app. Original QA account remained connected to canonical API3002/Convex3220. Created only synthetic supplier receipt `n5785k9zz7fghxxhpa95q623118jr34f`, product `p17d8we3bvqymjgybkpyqagjv58jstz1` named “QA Native Photos Correction 23 novembre”, quantity 3, unit cost €5, asking price €12. No historical records were changed and no email was sent.

- Opened Stock → QA product → Modifier la fiche → Ajouter des photos → native Galerie. Selected two non-sensitive simulator sample images (flowers and waterfall), returned to the editor and uploaded both through the actual attachment API. Storage was the isolated signed-S3 fixture on port3490; **this does not validate cloud R2 access**.
- Entered an unsaved product-name change before uploading. Both upload completion and subsequent explicit second-photo cover selection preserved the unsaved name and left Save available. API read-back confirmed two WebP attachments and explicit cover `kx74361ewzxvpp988vmdkqs7858jsqb8`.
- Authenticated attachment downloads restored actual bytes: cover `kx74361ewzxvpp988vmdkqs7858jsqb8`, 316672 bytes, SHA-256 `1b235fa725bdeae622acbb6b4d43219641e3893bb817fb812666876662fd96db`; other photo `kx7bywcftxmcqsa7x0g0e515sx8jrxhf`, 717222 bytes, SHA-256 `92adf52d70103c9d71615647f097e475d883776c5d5dd56982455213d4ffbe98`. Both have valid RIFF/WEBP magic.
- Name, variant and serial-number inputs accepted synthetic values. Before saving metadata, `keyboard return` hit the iOS runner main-thread watchdog. A screenshot still showed the intact editor and focused serial field, but coordinate input and one diagnostic retry failed with `RUNNER_BUSY`, `dispatched:no`, diagnostic `mwtdym1t-460164ff`. Stopped UI interaction without resetting another session. The product editor is left with **unsaved metadata**; saved photos remain persisted. Screenshot: `/tmp/cartelites-native-product-edit.png`.
- Metadata save/read-back, public/private property entry, full-screen gallery navigation, removal/retry and native sale correction/cancellation were **not completed in this wave**. No QA sale was created. These remain acceptance gaps, not passing checks. No app source changed, so no redundant typecheck/export was run; the preceding validated export remains current.

## Financial submission recovery — code-only repair

Fixed a concrete duplicate-operation risk: buyback submission generated new purchase/item IDs on every attempt, while sales, inventory operations and payouts derived new IDs after form edits. A lost response could therefore become a second committed operation when the user edited and retried.

- `submittedAttempt.ts` retains the original serialized body (including every operation/item ID, timestamp, quantity and payment), result and attachment context. The request layer guards buyback creation, single/bulk sales, supplier receipts, gifts, display openings, consignment creation and depositor payouts. A later form submit cannot replace an existing attempt, even if its contents changed.
- `FinancialRecovery` provides explicit verification of the original request, explicit release of a definitively rejected first attempt, and completion of confirmed operations. No retry is automatic. A previously unknown result stays unknown after subsequent authentication, rate-limit, missing-record or business-conflict responses; an idempotency conflict never authorizes a new operation ID. Confirmed operations survive upload/refresh errors without sending the business mutation again.
- Ownership is the selected API URL plus authenticated JWT subject. Pending work survives logout/remount in application memory and is invisible to another account or instance. Captured session generations block stale transport/UI completions; requests carry `X-Expected-Account-ID`. JSON decoding is also guarded after its asynchronous boundary, preventing an old 401 from clearing a newer account session. Upload completion uses the same guard.
- Original purchase/consignment item indexes, supplier invoice targets and gift evidence targets remain attached to their confirmed result IDs. Each retained file has a stable upload operation ID and completion flag. Only unfinished original files retry. Supplier/gift forms with already-confirmed records direct the user to recovery rather than silently applying changed attachment fields.
- Global confirmed recovery clears the matching buyback draft or basket and remounts the native navigation/form tree before releasing the operation slot. Supplier, gift, display, deposit and payout local form state therefore cannot submit the recovered original again. Other saved buyback drafts remain. Normal confirmed handlers likewise reset their forms before refresh and surface refresh failure as a read failure, not a failed financial write.
- Frozen summaries show the original date, actual units, sale line totals without multiplying quantities twice, supplier quantities/unit costs, and consignment agreed-price totals. Unknown/unsupported amounts are omitted rather than rendered as zero.
- Independent source review identified and verified repairs to the asynchronous JSON scope boundary and consignment total summary. Added 15 regressions covering lost replies plus edited forms, sticky uncertainty, explicit rejected release, concurrent retry, account/instance isolation, stale scopes/JSON, confirmed refresh failures, reset-before-release, exact file mappings and financial totals. **69 mobile tests pass**, TypeScript passes, `git diff --check` passes. Final Hermes iOS export after the sharing guards below: `/tmp/cartelites-mobile-financial-recovery-share-final`, log `/tmp/cartelites-mobile-financial-recovery-share-final-export.log`.
- Attachment/PDF sharing captures its account scope before download or generation and rechecks after asynchronous byte decoding, platform availability and temporary writes before invoking OS share. Old account work cannot open a new share sheet after logout/switch. PDF temporary directories are unique per share while exported basenames and renderer bytes remain unchanged; cleanup removes only that operation's temporary directory. Attachment temporary files are also unique and cleaned. These adjacent sharing guards passed TypeScript/export and existing scope regressions; no OS-share runtime acceptance was attempted.

Limits: no further device actions were attempted after the persistent `RUNNER_BUSY` boundary, so the new recovery panel has source/test/export evidence but no simulator acceptance. Retained attempts are **memory-only**, not durable across process termination; the UI explicitly asks users to resolve them before closing the app. This repair covers the creation paths listed above; it does not claim a new comprehensive retry audit of every legacy correction, cancellation, signature or return mutation. No backend, PDF renderer, production record or external service was changed in this wave.


## Correction recovery, navigation and stock traceability

Native payment correction, cancellation, purchase editing and return preparation now retain immutable account/instance-bound submissions after uncertain responses. Cancellation has explicit native confirmation. Confirmed writes update known state before follow-up reads; async response and document sharing guard the captured account scope.

Each scene owns its scroll position; hidden paginated scenes retain same-account/instance data while details open. Stock detail now displays exact acquisition lots and live authenticated paginated activity, including nullable legacy values, opening provenance and incomplete/indexing state. Duplicate old lot rendering was removed. The opening provenance regression covers legacy lots that carry both receipt and opening IDs.

Real isolated HTTP/Convex subscription DTO checks passed, as did the complete integrated suite and mobile TypeScript. Final iOS Hermes export: `/tmp/cartelites-mobile-stock-traceability-final`. These latest navigation, correction and traceability changes were source/test/export verified, not accepted on device: the previous persistent RUNNER_BUSY condition prevented further device work. No Android/VoiceOver/OS Reduce Motion acceptance is inferred.


## Filtered Activity and payment revision history

Added source-aware Activity search/date/status/origin/payment/event-kind filters and server cursor pages. Native sales history has corresponding search/shop-date/status/origin/collection filters. Invalid date ranges cannot silently broaden the query. Activity rows use explicit business dates or unknown labels; recording order is disclosed separately, and the merged overview describes loaded pages only. Shallow purchase/sale previews fetch complete details before opening. Query/account generations reject late results.

Sale detail shows paginated before/after payment snapshots with actor/correction/receipt dates. The authoritative currentEntryId retires a stale current row even when a concurrent correction is on another page; cancellation preserves superseded history. Unknown/zero values remain distinct. Independent source/regression review passed.

All93 native tests, TypeScript and Hermes export pass (`/tmp/cartelites-mobile-history`, `index-6ee67417cc631d92f0aa0ef30c73769b.hbc`). Read-only realAPI3002 checks passed all eight Activity categories and filtered continuations. The new QA sale's size-one history retained reversed latest, superseded older and initial pending snapshots using native merge helpers. No device actions or business writes were performed by the native agent. New-screen visual/accessibility acceptance still needs device access.


## Back navigation, grading utility and actionable recovery

Supplier and consignment wizard headers and platform Back now return to the previous step while preserving entered values. Explicit Close remains separate; the supplier footer no longer duplicates backward navigation. New native grading maintenance under Plus supports creation, rename, archive/reactivate, expectedRevision conflicts and optional metadata preservation; inline/stock pickers refresh after changes. A synthetic grading record completed the real local lifecycle and was left archived.

Stock/Vendre share stable quantity controls with always-mounted44-point actions, reserved label/digit geometry and Dynamic Type enabled. Selected-contact read failures retain the original ID and offer retry/change. Sale conflict feedback inspects current stock for every frozen basket line in bounded batches, links the affected line back to review and allows a new request only after definite rejection. It does not fabricate a persisted conflict for an atomic bulk-sale refusal or silently retry a sale. The shared realtime recovery and unavailable-at-date classifier fixes are included.

106 native tests, typecheck, independent source/regression review and final Hermes export pass: `/tmp/cartelites-mobile-reconnect-final`, `index-b69ae2ccf5fb0e8c6cf0fbb5268085d0.hbc`. Real read-only current-stock/contact checks passed. A persisted conflict-detail fixture and all new native visual interactions remain unverified. The existing RUNNER_BUSY condition was not retried or worked around.
