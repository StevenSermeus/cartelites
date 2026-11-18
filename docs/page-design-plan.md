# App page design and restructuring plan

Prepared from the current working tree on 18 November 2026. This is a design and implementation plan, not a completed UI redesign. Existing uncommitted feature work is included in the assessment and left untouched.

## Recommendation

Organize the seller app around six business areas: **Overview, Stock, Sales, Purchases, Consignments and Clients**, with Exports and Settings as secondary destinations. Give each list its own page, move long record details into dedicated pages, and keep short actions in dialogs or sheets. The most valuable change is separating inventory management from checkout, sales history and conflict resolution.

Keep the interface in French, using the labels below. The public catalogue remains a separate, unauthenticated experience. Preserve the existing financial rules and transaction behavior while moving their UI.

## What exists today

| Current web destination | Current responsibilities | Proposed treatment |
| --- | --- | --- |
| `/convention`; `/` redirects here | Public catalogue, search, filters, pagination, card imagery and prices | Retain and refine |
| `/admin/dashboard` | Financial totals, daily/monthly charts, consignment balances | Retain; improve hierarchy and link metrics to relevant work |
| `/admin/stock` | Inventory search/filtering, pricing, catalogue visibility, basket selection, sales history and conflict resolution | Split into inventory, item details, sales history and conflicts |
| `/admin/sales` | Item search and basket building, plus sales history | Make checkout entry its clear purpose; move history out |
| `/admin/sales/cart` | Basket, editable sale prices and sale confirmation | Retain as checkout page |
| `/admin/clients` | Client creation/edit form and searchable directory | Directory plus client detail and focused editor |
| `/admin/purchases` | New rachat form, client selection, card lookup and valuation | Retain as creation flow |
| `/admin/purchase-history` | Filtered/paginated history, expandable details, dates, validation, cancellation and documents | List plus purchase detail |
| `/admin/consignments` | New deposit, depositor balances/payment recording, dossier history, agreement changes, returns and attachments | Split into dossiers, creation, detail and payouts |
| `/admin/settings` | Personal receipt signatory and shared signup setting | Retain with clearly separated sections |
| Login view within app | Login, registration, reset request and token-based password reset | Give authentication states explicit destinations |
| `/mentions-legales`, `/confidentialite`, `/cookies` | Public legal information | Retain |
| Global header action | Excel workbook export | Add a small explanatory export destination |

Mobile has nine state-selected screens: `clients`, `purchase`, `consignments`, `stock`, `sales`, `saleSummary`, `history`, `salesHistory`, `account`, plus authentication. Its bottom navigation currently exposes seven entries. Consignments already has history/new/payments subviews. Mobile Account currently only manages logout; the web dashboard, signatory settings and Excel export must not be described as existing mobile screens.

## Navigation and visual system

On desktop, use a persistent left navigation with six primary destinations: **Vue d’ensemble**, **Stock**, **Ventes**, **Rachats**, **Dépôts-ventes**, **Clients**. Under Ventes expose **Nouvelle vente**, **Historique** and **Conflits**; under Dépôts expose **Dossiers** and **Reversements**. Put **Exports** and **Paramètres** in the lower utility area. Keep a catalogue link and account/session controls in a compact top bar. Show the basket count beside Nouvelle vente and an unresolved count beside Conflits when available.

Keep creation actions in each list header rather than adding every form to the primary navigation. Use breadcrumbs for records and creation pages. A record's Back action returns to the original list with its search, filters and page intact.

Retain Cartélites' web brand from `branding/brand.ts`: warm canvas `#f7f3eb`, surface `#fffdf8`, brown primary `#795018`, gold accent `#efbd53`, ink `#2c211b`, existing success/danger/warning colors and Inter/system typography. Use gold for emphasis sparingly, not every action. Do not replace the mobile app's existing neutral seller identity with Cartélites automatically: its branding is currently independent.

Use a consistent page frame: breadcrumb, title and primary action; short contextual summary; filters; main content. Desktop lists use aligned columns and a persistent action column; mobile uses compact cards with the same information priority. Detail pages use a wide main column and a narrower financial/status summary. Long editors have a sticky summary and submit area, with enough bottom padding to avoid covering fields. Forms should not fill list pages before users have chosen to create a record.

Status uses text plus color. Separate stock origin (Rachat/Dépôt), item availability, catalogue visibility and payment state; none is a substitute for another. Use French Belgian date/currency formatting, explicit euro labels, visible keyboard focus and touch targets of at least 44 px. Modals require focus management, a title, Escape/close behavior where appropriate, and focus restoration.

## Page specifications

All new routes below are **proposed**. “Existing capability” means the business action or data exists, not that the proposed route or layout is already implemented. “New presentation” needs UI work but should not change accounting behavior. Record-detail routes need independent loading by identifier; see implementation notes.

### 1. Vue d’ensemble — `/admin/dashboard`

**Purpose:** understand current activity and identify work needing attention.

**Layout/content:** title and day/month chart control at top. First row: received sales, pending collections, purchased-stock gains/losses and consignment commissions, clearly distinguished. A second, quieter group shows purchased totals, legacy unrecorded payment amounts and net margin/commissions. Put actionable queues—pending purchases, pending collections, depositor amounts due and conflicts—beside or immediately below the headline metrics. Place the existing purchase/sale and gain/loss charts below.

**Actions/states:** metric links open filtered lists; quick actions start sale, purchase or deposit. Provide loading, empty-activity and failed-refresh states. Keep totals' scope explicit: do not imply that existing overall totals follow the chart period unless their calculations are changed. Do not label margin as net profit or include pending collections in cash received.

**Basis:** existing metrics/charts; queue aggregation and cross-links are new presentation.

### 2. Stock — `/admin/stock`

**Purpose:** find available inventory and manage its public presentation.

**Layout/content:** count and “Nouvelle vente” action in header; search followed by origin, visibility and grading filters. Rows show thumbnail, name/reference, product type, origin, grade, asking price and public visibility. Open a row for full details. Bulk visibility controls appear in a dedicated selection toolbar, with selected count and clear-selection action.

**Actions/states:** open item, change asking price where permitted, show/hide, add to basket. Use an explicit Add button for selling; reserve checkboxes for visibility selection so the two selections cannot be confused. Preserve the 500-item visibility limit and clear visibility selection when filters change. Handle empty stock, no matching results, unavailable image, stale availability and failed bulk update distinctly. Hidden items remain sellable internally.

**Basis:** existing capability; sales history and conflicts move out of this page.

### 3. Article — `/admin/stock/:itemId`

**Purpose:** inspect one item's identity, provenance and sale readiness.

**Layout/content:** name, origin/status badges and thumbnail; identity/series/language/condition/grading/certificate section; source client and purchase or deposit link; private photos/documents; asking-price panel and visibility control. A deposit displays agreed price, commission and depositor share instead of a fabricated purchase cost.

**Actions/states:** add to basket, save permitted price change, toggle public visibility, open source dossier. Agreement changes go through the deposit workflow. If the item was sold or returned since the list loaded, explain its current state and remove unavailable selling actions. Distinguish inaccessible/missing record from network failure.

**Basis:** new detail presentation of existing information. Do not invent a generic item-edit or item-delete feature.

### 4. Nouvelle vente — keep `/admin/sales`

**Purpose:** build a basket quickly, especially at a stand.

**Layout/content:** large search field and origin filter; short results showing thumbnail, identity, available asking price and Add action. On desktop show a small basket summary beside results; on mobile use a sticky basket count/total button. Already selected rows show “Dans le panier”.

**Actions/states:** search, add/remove, open basket. Show no results, empty inventory and refresh failure without discarding basket inputs. Stock visibility selection never appears here. No sales history below checkout search.

**Basis:** existing capability with simpler composition.

### 5. Panier et confirmation — keep `/admin/sales/cart`

**Purpose:** review articles, sale prices and collection before committing.

**Layout/content:** editable line prices and remove controls on the left; totals and any consignment split on the right. Preserve the existing sale-date behavior on each platform; do not add a buyer-management step to this restructuring. The final confirmation section contains the existing cash, transfer, mixed or pending-payment controls, payment date/reference and total breakdown.

**Actions/states:** return to search, remove item, confirm sale. Show exact mixed-payment mismatch near the amounts. A price below a deposit's agreement links to the agreement-change flow and blocks confirmation until valid. Empty basket has a return-to-search action. Concurrent sale failures identify unavailable items and preserve remaining inputs; never report partial success for an atomic batch. Success clears committed lines and links to sales history.

**Basis:** existing transaction and payment editors; new layout. Avoid adding online payment processing or a new persistent order entity.

### 6. Historique des ventes — `/admin/sales/history`

**Purpose:** review sales and manage amounts still to collect.

**Layout/content:** title and Nouvelle vente action; existing payment-state filter prominently placed, with proposed date/search/origin/status filters as follow-up UI work. Rows show date, article, amount, origin, active/cancelled status and payment status. The “À encaisser” view is a filter on this page, not another independent ledger.

**Actions/states:** open sale detail, mark received or correct payment in a focused dialog, cancel with explicit confirmation. Show legacy payment state as “Non renseigné”, never assumed cash. Cancelled rows keep their payment record but are excluded from active totals. Distinguish no sales from no filter matches.

**Basis:** existing history, collection editing and cancellation; dedicated route and extra list filters are new presentation.

### 7. Vente — `/admin/sales/history/:saleId`

**Purpose:** inspect a recorded sale and its payment information.

**Layout/content:** article and transaction date, source reference, price, status, collection details and deposit commission/share where applicable. Place payment action in a side summary and cancellation in a secondary action area. Expose payment correction history only if the read contract supplies it; server-side history alone does not guarantee a ready UI timeline.

**Actions/states:** record/correct received payment, cancel active sale, link to source. A cancelled sale is read-only for unsupported mutations and explains retained payment information. Sale details are currently item-level: do not invent a basket/order receipt grouped by a nonexistent order ID.

**Basis:** new presentation; complete correction timelines may require read-contract additions.

### 8. Conflits de vente — `/admin/sales/conflicts`

**Purpose:** resolve concurrent sale attempts without cluttering inventory.

**Layout/content:** open conflict count; rows with article, attempted amount, date and resolution-note field. Keep “Marquer traité” beside the note, with item/source links where available.

**Actions/states:** inspect, enter note, mark resolved. Show all-clear, save failure and already-resolved-by-another-user states. Do not imply that resolving a conflict creates a sale or moves money.

**Basis:** existing conflict workflow moved from Stock; mobile access should reuse existing conflict capabilities where available.

### 9. Rachats — keep `/admin/purchase-history`

**Purpose:** find acquisitions and validate pending records.

**Layout/content:** Nouveau rachat in header; reference/client search, status and date-range filters; paginated rows with reference, seller, date, card count and status. Pending is a saved filter/segment, not a new data model. Open rows on the purchase detail page instead of expanding long editors.

**Actions/states:** open record, clear filters, start purchase. Preserve existing server pagination and loading/error handling. Empty initial history and empty filtered result need different guidance.

**Basis:** existing capability; row-to-detail navigation is new.

### 10. Nouveau rachat — keep `/admin/purchases`

**Purpose:** capture provenance and price a multi-card purchase.

**Layout/content:** one coherent form with three sections: client/reference/date; articles; review. Reuse current Pokémon/Riftbound lookup and manual-entry support, language/condition/grading fields, valuation/discount and price calculations, and photo controls. Desktop has article editor plus sticky total; mobile presents collapsible article cards with a persistent total and continue/save action.

**Actions/states:** select/create client, add/remove articles, resolve catalogue lookup, save through the existing pending/validation workflow, obtain the existing document. Preserve lookup loading/failure and manual fallback. Show validation at the relevant field and distinguish a saved operation with an attachment failure from a fully failed save.

**Basis:** existing form and business workflow. In-flow client creation should return to the draft; this return behavior is proposed. No autosaved/offline draft feature is assumed.

### 11. Rachat — `/admin/purchase-history/:purchaseId`

**Purpose:** review one purchase and its supporting evidence.

**Layout/content:** reference, client, date and status at top; article list and acquisition amounts; document section; date correction form. Put pending-validation actions in a prominent status panel. Show uploaded item photos and purchase-level supporting documents in clearly named groups.

**Actions/states:** validate pending purchase into stock, cancel a pending purchase, correct date, download receipt and attachments. Do not offer cancellation of active purchases unless the existing rules explicitly support it. Missing signatory information points to Settings before document generation. Document-generation/download failures should leave the record usable.

**Basis:** existing expandable-history actions moved to a record page.

### 12. Dossiers de dépôt — keep `/admin/consignments`

**Purpose:** find entrusted goods and their agreements.

**Layout/content:** Nouveau dépôt primary action and Reversements secondary link; search by depositor/reference/article; compact rows with reference, depositor, date, optional due date and article counts. Availability summaries are derived from item states, not invented dossier statuses.

**Actions/states:** open dossier, start deposit, go to balances. Optional overdue highlighting is a derived UI aid and must not automatically return items or alter agreements. Show no deposits and no search matches separately.

**Basis:** existing dossier history, reorganized.

### 13. Nouveau dépôt — `/admin/consignments/new`

**Purpose:** agree terms for entrusted articles.

**Layout/content:** depositor selection, reference/date/optional due date and notes; article editor supporting card, sealed product and other; agreed retail price, commission rate and immediately visible depositor share; photos/documents. Preserve sealed product and 30% defaults. Sticky review summary shows article count and agreed terms.

**Actions/states:** create client and return, add/remove article, save dossier, download deposit receipt. Separate saved-dossier success from upload/PDF failure to prevent duplicate creation on retry. Validate dates, amounts and commission without treating a deposit as a purchase.

**Basis:** existing collapsed creation form promoted to a full page.

### 14. Dossier de dépôt — `/admin/consignments/:consignmentId`

**Purpose:** manage a deposit's articles through sale or return.

**Layout/content:** depositor and agreement header; notes/deadline and receipt action; article table with available/sold/returned state, agreed price, commission/share, documents, agreement and return history. A summary links to the depositor's balance, explicitly across all their dossiers.

**Actions/states:** download receipt, add photo/document, change an available article's agreement in a dialog requiring authorization note, confirm return of an unsold article. Show prior/new terms in the agreement dialog. Sold/returned rows retain evidence and hide unsupported actions. Handle another user changing availability before mutation.

**Basis:** existing deposit history actions, split into a focused record view.

### 15. Reversements — `/admin/consignments/payouts`

**Purpose:** see who is owed money and record completed payments.

**Layout/content:** total positive balance and depositor count; existing due/settled/regularization/all filters; depositor rows showing eligible earned share, paid total and remaining balance. Mark regularizations distinctly. Row links open a depositor ledger.

**Actions/states:** “Enregistrer un versement” opens the existing amount/date/method/reference form, prefilled with balance but allowing partial payment. Confirmation explicitly records money already paid; it does not send a bank transfer. Recheck balance at commit, reject overpayment, and show no sums due as a valid state.

**Basis:** existing balance/payment panel moved out of the deposit page.

### 16. Compte déposant — `/admin/consignments/payouts/:sellerId`

**Purpose:** explain one depositor's balance across dossiers.

**Layout/content:** identity and due/paid/regularization summary; eligible sale shares and a separate payment history; links to dossiers and sale details. Explicitly distinguish pending customer collections from eligible proceeds. Payments are depositor-level, not allocated to individual articles.

**Actions/states:** record full/partial payout when balance is positive, inspect originating sales and prior payments. A negative balance is a regularization, not a negative payment form. Show zero balance without hiding history.

**Basis:** new combined view of existing balances, deposit sales and payments. Additional joins/read support may be needed. Do not add payout reversal/deletion or claim an article is individually paid.

### 17. Clients — keep `/admin/clients`

**Purpose:** find a person before starting a transaction.

**Layout/content:** Nouveau client action; name/email/phone/address search; compact paginated directory. Keep contact information legible without showing the full create form above results.

**Actions/states:** open client, create client. Show empty directory and no results separately. This directory represents source sellers/depositors; it is not evidence of a fully implemented CRM for retail buyers.

**Basis:** existing directory separated from its editor.

### 18. Fiche client — `/admin/clients/:sellerId`

**Purpose:** view contact details and related source transactions.

**Layout/content:** name and edit action; email/phone/address; linked purchases, deposit dossiers and depositor balance. New purchase/deposit actions preselect this person.

**Actions/states:** edit in a compact dialog/sheet; start a related transaction; open records. New-client creation uses the same form from the directory or a transaction picker. Preserve draft return context after creating a client. Missing related records must not be presented as zero if a query failed.

**Basis:** contact editing exists; combined relationship view, preselection and return context are new presentation/read composition. No client deletion, merge or bulk messaging is proposed.

### 19. Exports — `/admin/exports`

**Purpose:** make the existing workbook understandable and easy to obtain.

**Layout/content:** short description of scope; one export card listing current sheets: Achats, Ventes, Stock, Dépôts, Commissions, Reversements, Soldes déposants, Clients and Export metadata. State purchased-stock versus consignment separation. Primary action: “Télécharger Excel”.

**Actions/states:** export with progress and retry error. Retain current dataset scope and formulas; no date selector unless it is actually implemented end to end. Do not imply that a workbook download is an accounting submission or that commissions already have a calculated tax regime.

**Basis:** existing header export in a dedicated presentation. Keep web-only initially; mobile can link to web if needed.

### 20. Paramètres — keep `/admin/settings`

**Purpose:** maintain the receipt signatory and shared signup preference.

**Layout/content:** two cards, “Mon signataire” and “Création de compte”. First contains current first name, last name and capacity with its own Save. Second explains the server-wide signup setting and current state. Session logout belongs in account controls.

**Actions/states:** save signatory, change signup setting, logout. Independent loading/error/save confirmation per section. Explain that signatory identity is account-specific and signup is shared. Do not invent user roles, invitation management, company settings or an electronic signature capture feature.

**Basis:** existing web settings; mobile parity is optional additional UI, not an existing feature.

### 21. Authentication — proposed `/login`, `/register`, `/forgot-password`, `/reset-password`

**Purpose:** keep account tasks outside the operational shell.

**Layout/content:** small centered card with brand, clear task title and only relevant fields. Login links to reset and, when enabled, registration. Reset request has email only; reset completion has the new-password field and token state. Keep existing password requirements.

**Actions/states:** submit relevant action; show busy, invalid credentials, generic reset-request confirmation, invalid/expired token and disabled signup states. Preserve existing reset links during route migration; retain a safe internal destination through login. Mobile can keep native auth screens and web reset-link completion initially.

**Basis:** existing auth operations; explicit routes and navigation are new. No account-management features beyond implemented capabilities.

### 22. Catalogue public — keep `/convention`

**Purpose:** let visitors explore visible stock.

**Layout/content:** Cartélites identity and compact introduction, search and current filters, responsive image-led card grid, price and identity/grade information, pagination and legal footer. Filters collapse into a mobile sheet; search remains visible. Preserve the current public field allowlist and availability/visibility rules.

**Actions/states:** filter, reset filters, paginate, use existing contact destination. Show image fallback, no matching items and server unavailable with retry. No private provenance, seller details, purchase costs or attachments. No checkout, reservation or payment action: these capabilities are not implemented for visitors. A separate public product-detail route is optional future work, not necessary for this restructuring.

**Basis:** existing public catalogue, visual refinement only.

### 23. Public information — existing three legal routes

**Purpose:** provide the current legal, privacy and cookie information.

**Layout/content:** common public header, narrow readable text column, semantic headings, existing contact links and footer. Keep these three pages separate and reachable without login.

**Actions/states:** return to catalogue and contact. Preserve explicit unfilled-information placeholders until actual business information is supplied; a redesign does not establish legal completeness.

**Basis:** existing pages. This plan does not change or certify their legal content.

## Mobile arrangement

**Photo capture requirement:** allow taking a photo directly with the native camera, choosing an existing photo from the gallery, or importing a supporting file. Include permission refusal, preview/retake/confirm/cancel, upload progress and retry without duplicating a saved operation. The current purchase flow selects image files through DocumentPicker; native capture is required implementation work, not an already delivered capability.

**Updated requirement:** the native mobile application is independent of every store. First launch asks for the instance API URL, validates connectivity/compatibility, saves the URL persistently on the device, then presents that instance's login. Reload the saved URL after app restart and retain it after logout. Expose **Plus → Instance connectée** to inspect/change it. Changing instance requires confirmation, clears the prior session and transient business state, and requires authentication against the new instance; never reuse an old origin's token. This is now a required mobile flow, not optional future configuration. See `design/mobile-design-and-states.md` and `design/mobile-mockups.html`.

The web mockup must display the real store logo from the existing branding assets, not a text-only approximation. The native mobile shell must not embed that logo, name, palette or a fixed store API URL. Any previews of the instance's public website remain explicitly separate web destinations.

Use five bottom destinations: **Stock**, **Vendre**, **Rachats**, **Dépôts**, **Plus**. Stock remains the default landing screen. Each destination owns a navigation stack, so record details have a natural Back action.

| Tab | Stack contents |
| --- | --- |
| Stock | Inventory → item; visibility selection is an explicit mode |
| Vendre | Search → basket/confirmation; history and conflicts available from the section header/menu |
| Rachats | History → purchase detail; Nouveau rachat primary action → creation flow |
| Dépôts | Dossiers / Reversements segmented destinations → detail; Nouveau dépôt action |
| Plus | Clients, Compte and public/legal links; web dashboard/export link if useful |

Replace long multi-purpose mobile screens with lists and detail screens. Short editors—client contact, payment collection, payout, agreement change—use full-height sheets when the keyboard is involved. Keep sticky actions above the keyboard and safe area. Use existing native attachment/photo selection. Do not add a native dashboard or signatory editor as a prerequisite for the main restructure; those are separate parity decisions.

Preserve forms and basket in memory across relevant navigation, especially when creating a client. Do not add durable local business caches, an offline queue or a claim that unsaved drafts survive app restart. After network errors, do not show saved/sold/paid success until the server confirms it.

## Route migration and data boundaries

Retain current web paths for the first pass: `/admin/purchases` continues to mean new purchase, `/admin/purchase-history` remains the list, and `/admin/sales` remains sale creation. This avoids silently repurposing existing links. Add specific routes such as `new`, `history`, `cart` and `payouts` before dynamic `:id` matching. Add explicit unknown-route handling instead of the current fallback to dashboard.

The route map above contains **23 page specifications**, with shared variants for auth/legal pages and short action dialogs. It does not require 23 sidebar links. New-client and edit-client remain dialogs/sheets rather than separate full pages; filtered pending lists remain filters rather than duplicate screens.

Split `apps/web/src/main.tsx` into an app shell/router, route pages, domain hooks/repository calls and reusable components. Split `ConsignmentsPage.tsx` into list, create, detail and payout views. Split `apps/mobile/App.tsx` into navigation stacks and screen modules. Reuse `ClientPicker`, `PurchaseEditor`, payment editors, visibility toolbar and PDF helpers before redesigning their internals. Domain and Convex remain responsible for business invariants.

Existing API routes mostly return collections. A proposed detail URL must load correctly after refresh, without depending on a previously visited list. Load a record through an authorized identifier-based read query; do not fetch the entire collection to find one record. Missing versus failed fetch must remain distinct. For scale, add authorized detail/read queries for stock items, purchases, sales and depositors as needed. Existing server pagination for purchase history must remain server-based. Do not assume a record is missing merely because it is absent from one history page or the available-stock endpoint after sale. Sold/returned item inspection should resolve through its source/sale record or an appropriate detail query.

Scope errors, busy flags, filters and price drafts to their page/action. Separate inventory asking-price edits from checkout sale-price edits, which currently share state. Maintain basket across internal page changes; page navigation alone must not issue mutations. Preserve idempotency keys and transaction retries when extracting handlers. Upload retries after a committed create must not create another purchase or deposit.

## Delivery order and acceptance criteria

| Phase | Deliverable | Acceptance |
| --- | --- | --- |
| 1. Shell and route structure | Desktop navigation, mobile five-tab stacks, auth/unknown routes, page module extraction | Existing destinations/actions still work; browser Back and reload work; no abandoned client-creation draft |
| 2. Sales and inventory | Separate inventory, checkout, history, conflicts and their detail views | Hidden items sell internally; visibility selections never modify basket; concurrent batch sale remains atomic; mixed payments reconcile exactly |
| 3. Purchases and clients | Directory/editor separation, purchase list/detail, improved purchase composition | Pending validation adds stock once; document/date controls preserved; search and server pagination preserved |
| 4. Consignments | Dossier/create/detail, payout list and depositor ledger | Below-agreement sale blocked; authorization history retained; returns remove availability; partial payouts and negative regularizations behave correctly |
| 5. Polish and utilities | Dashboard hierarchy, export page, settings/public/auth consistency and responsive/accessibility work | Clear financial scope; public data stays public-only; keyboard and mobile keyboard/safe-area flows usable |

During implementation, run the repository's relevant type checks, backend/API tests and web build, then targeted navigation and form checks. Existing tests cover stock visibility, sale payments, consignments, receipts/signatory, public catalogue, Riftbound and purchase pagination; preserve their guarantees. Add routing/state coverage where the restructuring introduces meaningful risk. This planning task has not run functional tests or visually inspected a live deployment.

The redesign is complete when every existing action has a clear home, list pages no longer contain unrelated workflows, direct links and Back navigation work, draft context survives necessary navigation, and financial results match the existing behavior. Persisted filters, full audit timelines, native dashboard/export parity, online public ordering, new roles and offline support are not prerequisites and must not enter the work implicitly.

## Source basis

- `apps/web/src/main.tsx`: current web routing, public catalogue, clients, purchase/sale/stock workflows, export and auth.
- `apps/web/src/ConsignmentsPage.tsx`, `DashboardPage.tsx`, `SettingsPage.tsx`, `LegalPages.tsx`: existing specialized pages.
- `apps/mobile/App.tsx`, `src/screens/StockScreen.tsx`, `ConsignmentScreen.tsx`, `AuthScreen.tsx`: mobile screen composition and parity limits.
- `apps/api/src/routes/operations.ts`, `consignments.ts`, `auth.ts`: current operation/read boundaries.
- `branding/brand.ts`, `apps/web/src/style.css`: established visual tokens.
- `README.md`, `GUIDE-AGENTS-IA.md`: architecture, current business rules and documentation-task scope.


## Exigence transversale — recherche et pagination (retour utilisateur)

- Tous les champs de choix de client ou déposant sont des champs de recherche paginés, sans chargement de la liste complète : nom, email, téléphone, référence ; minimum deux caractères ; coordonnées et identifiant pour distinguer les homonymes ; confirmation explicite et changement de client.
- Prévoir chargement, aucun résultat, échec/réessai et sélection confirmée sans perdre le formulaire en cours. Conserver le contexte après création d’un client.
- Toute collection potentiellement volumineuse est paginée côté serveur : clients, stock, ventes, rachats, dépôts, reversements, conflits, catalogue, résultats de recherche et historiques/documents/articles liés à une fiche. Aucune hypothèse de tout afficher ou de tout charger d’un coup.
- Proposition : 10 résultats par page pour les sélecteurs, 25/50 pour les listes, aucune option « Tout ». Recherche temporisée (~300 ms), filtres et tri côté serveur, tri stable, réponses obsolètes ignorées et limites imposées par le serveur.
- Retour à la première page après modification des critères ; Précédent/Suivant ; plage courante ; total uniquement si disponible. Pagination par curseurs admise avec navigation cohérente, sans faux total ni numéro de dernière page inventé.
- Détails chargés par identifiant, agrégats calculés côté serveur et sélections de masse explicitement bornées. Le prototype utilise de petits jeux fictifs uniquement pour démontrer les contrôles ; il ne valide pas la capacité actuelle des API.
- Critère de recette : avec plusieurs milliers de clients et d’opérations, vérifier que le nombre d’enregistrements transférés et rendus reste borné par la taille de page, et que recherche, changement de page et retour d’une fiche conservent le contexte attendu.
