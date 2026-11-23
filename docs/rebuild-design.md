# Cartélites rebuild design

23 November 2026 · Working design for the web workspace, public website, and iPhone app.

Rebuild the interface around stock, transactions, and documents while preserving the business rules and historical records. The web uses shadcn/ui with a restrained Apple-inspired appearance and colors drawn from the shop’s logo. The iPhone app uses native navigation, typography, controls, and gestures. Existing PDF layouts and archived originals remain unchanged.

This document supersedes the interface direction in the earlier `docs/design/` proposals. It does not replace the existing application, deploy a schema, or authorize production cutover. The feature baseline comes from the current repository and the product discussion; runtime acceptance remains part of implementation.

## Decisions already agreed

- One deployment serves one shop. There is no organization table or organization ID on business records.
- Shop identity, legal details, branding, currency, timezone, and registration policy live in a versioned configuration file. Primary, secondary, accent, surface, text, and status colors are configurable per shop in light and dark palettes. No theme database table is needed. Secrets remain environment variables. Configuration changes require redeployment.
- Accounts share shop business data. `createdBy` and `updatedBy` record responsibility, not ownership boundaries.
- Grading companies are editable records; adding one does not require a code change. Grade values are text, including decimal grades and labels such as `Authentic`.
- Keep TCGDex. Implement one shared search service for web and mobile, including promo numbering.
- Do not mirror the external catalogue in `catalogueSets` or `catalogueCards` tables. Use temporary response caching and configuration aliases; store selected metadata on products.
- Keep the current PDF generators, branding assets, and rendering inputs compatible. Historical signed originals must never be replaced by regenerated files.
- Redesign the complete web and mobile experience, not just colors or individual screens.
- Web implementation uses shadcn/ui. Native app implementation follows Apple design conventions rather than rendering the web interface in a phone frame.

## Proposed implementation boundaries

Retain Convex, the shared API, R2, and Brevo for the initial rebuild. A provider change is outside this design. Retain React Native/Expo unless a separate native technology decision is made. Build shared contracts, money calculations, search parsing, and PDF input mapping; keep platform-specific presentation separate.

The navigation, tokens, table structure, release order, and parity improvements below are proposals. The mockups illustrate the visual direction with fictional data; they do not imply all workflows are implemented or that illustrated catalogue records were verified against TCGDex.

Business operations require connectivity. Local iPhone buyback drafts remain explicitly device-local. Do not promise offline sales, cross-device draft synchronization, online checkout, card payments, bank transfers, or complete accounting/tax filing.

## Product structure

### Web workspace

Use a persistent, quiet sidebar and a content header with the page title, contextual actions, and account access. Keep dense operations readable through aligned rows, restrained dividers, generous section spacing, and tabular money values. Do not put every row inside a separate decorative card.

| Navigation | Main destinations |
| --- | --- |
| Vue d’ensemble | Collected sales, outstanding collections, result, payouts due, activity |
| Stock | Available products, item detail, photos, lots, visibility, display openings, gifts |
| Ventes | New basket, history, collection corrections, conflicts, sales tickets |
| Achats | Buybacks, supplier receipts, pending work, acquisition documents |
| Dépôts-ventes | Dossiers, agreements, returns, depositor balances, payouts |
| Contacts | Sellers, customers, suppliers, depositors |
| Documents | Archived PDFs, signed versions, delivery status |
| Exports | Excel workbook and gifts export |
| Paramètres | Account signatory, grading companies, session/account settings |

Creation is a contextual action, not a competing navigation tree. A stock header offers `Ajouter au stock` with explicit `Rachat`, `Achat fournisseur`, and `Dépôt-vente` choices. The sale basket persists while navigating stock. Back navigation restores the previous search and filters.

At wide sizes, use a list plus detail panel when it helps compare products. Give complex editors their own route. Below tablet widths, collapse navigation and use a full-page detail view; never squeeze the desktop table into illegible columns.

### iPhone app

Agreed mobile priority: **Rachats** and **Vendre** are the core tasks. Stable tabs: **Rachats**, **Vendre**, **Stock**, **Activité**, **Plus**. The app opens on Rachats with a prominent new-buyback action, resumable drafts and buyback history. Vendre opens the item selection list directly; a persistent basket summary leads to review and payment. Dépôts and account utilities remain accessible under Plus. `Activité` contains purchases and sales histories, pending buybacks, receipts, and gift history. Supplier receipts remain accessible from Stock; buybacks have their own primary destination. Contacts and grading companies are reachable from account utilities and inline pickers.

Use large titles at the root, standard navigation bars in pushed screens, and a familiar back action. Keep tab destinations stable when data is empty. The basket belongs to `Vendre`; a badge reflects its item count. A focused creation flow can present as a full-screen sheet with an explicit close and draft behavior.

Use native search, grouped lists, pickers, date entry, sheets, alerts, photo selection, PDF viewing, and share actions where practical. Swipe actions are shortcuts with visible menu equivalents. Do not simulate a native system bar in the shipped app; the OS provides safe areas and system chrome.

The native app retains editable instance selection. Switching instances closes previous subscriptions and separates sessions and device-local drafts. Show the shop name as context without assuming the app itself is permanently bound to Cartélites.

### Public website

The public catalogue uses a minimal header, large card imagery, a clear search field, compact filters, and grid/list modes. Cards show name, full identifier, set, language, grading where relevant, availability, and price. The product view shows the selected variant and authorized photos. Each product supports a detailed description, multiple photos, and an explicit cover photo. Clicking a product in Convention opens a full product page or accessible detail overlay with a navigable gallery, public specifications, price and availability. Acquisition cost, supplier/depositor details, margins, private evidence and signature data are never included in the public view.

Preserve the buyback/consignment information page, contact links, social links, and legal/privacy/cookie pages. Do not add checkout or imply an item is reserved because it is being viewed. Public pages expose only eligible available inventory and never expose invoices, personal details, or signature evidence.

## Visual direction and tokens

The working UI is calm and precise: generous spacing, clear typography, thin separators, restrained surfaces, and a clear action hierarchy. Apple-inspired describes the layout, interaction quality, and platform conventions; the palette comes from the shop’s logo. Cartélites uses warm gold, cream, and dark brown, with subtle warm neutrals for large surfaces. Do not hard-code Apple blue as the application action color. The existing PDF palette and layouts remain a separate, preserved document requirement.

| Token | Web proposal | iPhone proposal |
| --- | --- | --- |
| Typography | System sans stack; 15–16 px body; 28–32 px page title | System text styles; 17 pt default body; Dynamic Type |
| Canvas / surface | Shop-configured warm neutrals for Cartélites; explicit dark counterparts | Native grouped layout with the same shop surface roles |
| Main / muted text | Shop-configured foreground and muted foreground | Matching semantic text roles, adapted to native controls |
| Primary action | Configured primary fill with its paired foreground; Cartélites gold with dark text | Same brand role for primary buttons; use a contrasting action tint for text-only controls |
| Secondary action | Configured secondary fill and foreground; Cartélites pale cream with brown text | Same hierarchy in native controls |
| Accent / selection | Configured accent and selected-state colors with matching foregrounds | Shop tint for active tabs and selection; checkmarks remain visible |
| Spacing | 4, 8, 12, 16, 24, 32 px | 4, 8, 12, 16, 20, 24 pt with safe-area insets |
| Radius | 8–10 px controls, 12–16 px bounded surfaces | System component shapes; custom surfaces around 12–16 pt |
| Dividers | One subtle separator between logical rows | Native list separators and section boundaries |
| Elevation | Reserved for overlays and floating context | Native materials only where they preserve readability |
| Numbers | Tabular numerals, right-aligned currency | Tabular currency and stable totals |
| Motion | Short purposeful transitions, roughly 150–220 ms | Native navigation transitions; honor Reduce Motion |

Treat translucency as optional navigation polish, not a background for dense data. No decorative glass over tables, oversized metric cards, emoji navigation, or ornamental gradients. Light and dark appearances use semantic tokens; status never depends on color alone.

### Shop branding configuration

Keep one source of truth in the planned `shop.config.ts`. The current `branding/brand.ts` and `branding/logo.png` supply the Cartélites starting palette and logo; their current web-only wiring is not the final cross-platform implementation. A new shop replaces its identity assets and theme values in configuration without editing screens or components. Do not infer colors from the logo at runtime: select and validate an explicit palette once per shop.

Proposed configuration shape (excerpt; the theme resolver supplies complete defaults for both appearances):

```ts
export const shopConfig = {
  branding: {
    name: 'Cartélites',
    logo: '/branding/logo.png',
    // Optional alternate logo asset for dark surfaces.
    logoDark: '/branding/logo.png',
    theme: {
      appearance: 'system', // system | light | dark
      light: {
        primary: '#efbd53', primaryForeground: '#2c211b',
        primaryHover: '#e3ac3f',
        secondary: '#fbf0d9', secondaryForeground: '#795018',
        accent: '#795018', accentForeground: '#ffffff',
        actionTint: '#795018', // Links, native back buttons, active tabs.
        selected: '#fbf0d9', selectedForeground: '#583710',
        background: '#f7f3eb', foreground: '#2c211b',
        card: '#fffdf8', cardForeground: '#2c211b',
        popover: '#fffdf8', popoverForeground: '#2c211b',
        muted: '#f1e9dc', mutedForeground: '#75695c',
        border: '#e4d9c7', input: '#75695c', ring: '#795018',
        destructive: '#a33d36', destructiveForeground: '#ffffff',
        success: '#286347', successForeground: '#ffffff',
        warning: '#805600', warningForeground: '#ffffff',
      },
      dark: {
        primary: '#efbd53', primaryForeground: '#2c211b',
        primaryHover: '#f6ca6d',
        secondary: '#33291e', secondaryForeground: '#fbf0d9',
        accent: '#efbd53', accentForeground: '#2c211b',
        actionTint: '#efbd53',
        selected: '#40321e', selectedForeground: '#f6ca6d',
        background: '#181410', foreground: '#fff3df',
        card: '#231d17', cardForeground: '#fff3df',
        popover: '#2b231c', popoverForeground: '#fff3df',
        muted: '#332b23', mutedForeground: '#c8b9a5',
        border: '#504335', input: '#a7947c', ring: '#efbd53',
        destructive: '#f28b82', destructiveForeground: '#281210',
        success: '#81c8a3', successForeground: '#10291d',
        warning: '#efbd53', warningForeground: '#2c211b',
      },
    },
  },
};
```

`primary` and `secondary` name action roles, not text importance. Each filled role has a matching foreground; gold is suitable for a filled button with dark text, while text-only actions on a light canvas use the darker `actionTint`. Status roles retain their meaning independently of branding: a red shop logo does not make all red elements errors. Status always includes a label or icon.

The shared resolver merges each appearance separately with its defaults, validates color values and foreground/background pairs, and outputs a complete semantic theme. Partial overrides are supported, but changing a background must also validate its paired foreground. Use a minimum text contrast target of 4.5:1 for normal text and 3:1 for large text and meaningful control boundaries/focus indicators. Reject invalid or unreadable configuration during deployment checks with the offending token pair identified. Validate hover, pressed, selected, disabled, and focus states; do not produce dark mode by simply inverting light colors.

Web workspace and Convention consume the same resolved theme through shadcn CSS variables such as `--primary`, `--primary-foreground`, `--secondary`, `--background`, and `--ring`. Map sidebar, chart, and other component-specific tokens centrally, with optional shop overrides; do not embed brand hex values in components. Native components consume equivalent semantic values through a theme provider while retaining native sizing, navigation, gestures, and accessibility behavior. OS-owned dialogs and system chrome follow platform appearance.

Because the mobile app can switch instances, the selected deployment exposes only public branding through a versioned public configuration response. Fetch and apply that shop’s theme before showing its workspace, cache it per instance, and clear the previous shop’s active theme on switching. Until the selected shop’s config is available, show a neutral connection/loading state; never carry another shop’s logo or colors across instances. Legal/private configuration and secrets are not included in the theme response.

Acceptance: changing only the logo and theme config must rebrand web, Convention, and mobile, including primary/secondary buttons, active tabs, links, focus, selection, empty states, and overlays in both appearances. Check Cartélites plus a contrasting test-shop palette to expose hard-coded colors. Theme changes must not alter layout dimensions, cart-row height, business behavior, PDF renderers, or archived documents. The HTML prototypes remain interaction references; their existing palette is not proof that this configuration contract is implemented.

### shadcn component mapping

| Need | Component starting point |
| --- | --- |
| Navigation and page structure | Sidebar, Breadcrumb, Separator |
| Search and entity pickers | Input, Combobox, Command, Popover |
| Stock/history lists | Data Table, Pagination, Checkbox, Dropdown Menu |
| Filters and view switching | Tabs, Select, Toggle Group, Badge |
| Transaction forms | Field, Input, Textarea, Date Picker, Radio Group |
| Quick detail and short edits | Sheet; Dialog only for bounded tasks |
| Destructive or consequential actions | Alert Dialog with explicit action wording |
| Loading and feedback | Skeleton, Alert, Empty, Toast |

Use the actual shadcn component code in implementation, with shared theme tokens and consistent form validation. HTML mockups are visual specifications, not proof that shadcn or native controls are installed. shadcn distributes component code intended for application-level customization. [shadcn introduction](https://ui.shadcn.com/docs)

## Main workflows

### Find a card and add it to a buyback

1. Choose or create a contact; set date and optional buyer/seller notes.
2. Search by name, full collector number, or promo identifier. Show `Nom, numéro ou promo` with examples `60/106 · XY95 · 001/XY-P`.
3. Show exact candidates with image, set, full number, and language. Preserve ambiguity instead of silently selecting a different card.
4. Choose condition, optional grading company, grade text, certificate, market estimate, and buyback percentage. Allow `Ajouter une société de gradation` inline.
5. Add photos, review cards and totals, then save pending or validate. Describe estimated gain as theoretical, before VAT and fees.
6. Prepare the existing PDF, read it, collect customer consent and both signatures, and archive. Signing does not silently validate stock entry.

On iPhone, multiple local drafts preserve cards, photos, contact, and step. Explicitly show `Enregistré sur cet iPhone`; remove only the draft whose server operation succeeded. Editing an existing purchase is separate from creation drafts and protects sold/donated history.

### Receive supplier stock

Choose supplier, reference, date, and invoice. Add existing products or create products with quantity, cost excluding VAT, and explicit sale tax rate. Preview totals and confirm the receipt transaction. Existing products retain their price and visibility; new products start hidden. Photo uploads can resume independently without duplicating the receipt.

### Sell and record collection

Select available stock, set quantities and line totals, and review a single basket. Show origin-specific economics without conflating buyback margin with consignment commission. Choose cash, transfer, mixed, or awaiting payment; mixed amounts must equal the sale total.

Confirmation validates every allocation and agreement together. If stock changed, identify the affected line and preserve the basket for correction. After success, show the sale reference and optional ticket/share/email actions. A document or email failure must not undo or repeat the sale.

### Consign and pay the depositor

Choose depositor, inventory, agreed prices, commissions, duration, and contract terms. Preview the agreement, sign it, and make eligible stock available. A revised agreement creates a revision and requires the relevant signature state before sale.

Dossier detail separates available, sold, and returned articles. `À reverser` displays positive balances with a clear `Enregistrer un versement` action. Record full or partial payment already made; the app does not send money. Returns preserve item condition notes and signed documents. Negative balances are labeled as regularizations.

### Manage stock and photos

Item detail separates product description, physical condition/grading, price, public visibility, acquisition lots, and activity. A visibility switch explains only public visibility; it never implies internal stock availability. Cover selection and photo removal have previews and accessible labels.

Opening a display previews display quantity, resulting boosters, and cost transfer before confirmation. A gift captures quantity, recipient, reason, and evidence; it clearly removes stock without a sale. Reversals are explicit operations, not deletion of the historical action.

### Review history and documents

Lists provide text search, dates, status, and relevant origin filters. Details show business facts, payments, supporting files, documents, and audit history as separate sections. Historical PDFs display version and signing date. `Créer une nouvelle version` is distinct from downloading an existing original.

## TCGDex search contract

- Parse regular numeric denominators, prefixed numbers, and promo-series suffixes separately. Preserve the user's original text.
- For `60/106`, match the collector number exactly and the printed denominator against the set's official count, not total including secret cards.
- For `XY95`, preserve the prefix; for `001/XY-P`, interpret the suffix as a series identifier rather than a numeric count.
- Resolve provider set IDs through cached metadata and maintained aliases. Do not assume Japanese and international promo identifiers are equivalent.
- Normalize harmless case/spacing and appropriate leading zeros; never strip meaningful prefixes. Suggest corrections such as `YX-P` → `XY-P` visibly.
- Use exact provider filters and complete candidate retrieval. Never fetch one small page of fuzzy results and label the survivors exhaustive.
- Filter/rank by the chosen language first; make alternate-language results explicit. Do not infer translation availability from a matching ID alone.
- Keep no-result, ambiguous-result, provider-unavailable, and missing-image states distinct. Manual entry is always available.
- Persist selected card metadata and exact provider references on products. Stock creation cannot depend on later catalogue availability.

Acceptance examples include `60/106`, `060/106`, a card name plus number, `XY95`, `001/XY-P`, an ambiguous bare number, secret-rare fractions, and a manually entered promo absent from the provider. Verify catalogue examples against actual provider responses before shipping.

## Proposed database model

Convex IDs are references, not tenant keys. All business records include creation metadata; editable records also include update metadata and a revision for concurrency checks. Amounts use safe integer cents; rates use integer basis points. Missing historical cost remains unknown, not zero.

| Table | Main fields and purpose |
| --- | --- |
| `accounts` | Email, password hash, signatory profile/saved signature, disabled date |
| `sessions` | Account, expiration, last activity, revocation |
| `passwordResetTokens` | Account, token hash, expiration, consumed date |
| `loginAttempts` | Hashed identifier, window, count |
| `contacts` | Person/company, name, email, phone, address, business details, archive date |
| `gradingCompanies` | Name, normalized name, abbreviation, website/logo, archive date |
| `products` | Type, TCG, name, description, set, printed identifier, language, variant (normal/reverse/holo), format, pack size, selected catalogue metadata/references |
| `stockItems` | Product, individual/quantity tracking, condition, serial, asking price, visibility, cover file |
| `itemGradings` | Stock item, company, text grade, certificate, verification URL, notes, superseded date |
| `purchases` | Contact, buyback/supplier type, reference/date, status, buyer/seller notes |
| `purchaseLines` | Purchase, item, quantity, cost, estimated value, buyback rate, tax treatment |
| `stockLots` | Item, typed acquisition source, original/remaining quantity and cost, acquired date, tax treatment |
| `consignments` | Depositor, reference/date, due date, status, current agreement revision |
| `consignmentRevisions` | Dossier, revision, contract text/version, authorization note, signature state |
| `consignmentTerms` | Revision, item, agreed price, commission rate |
| `consignmentReturns` | Dossier, date, condition notes, completion state |
| `consignmentReturnLines` | Return, lot, quantity |
| `depositorPayouts` | Depositor, amount, method/date/reference, reversal reference |
| `sales` | Reference/date, optional contact, customer snapshot, confirmed/cancelled state |
| `saleLines` | Sale, item, quantity, line total, frozen description/cost/tax, consignment revision and split |
| `saleAllocations` | Sale line, lot, quantity consumed, exact cost allocation |
| `salePayments` | Sale, date, cash/transfer amounts, reference, correction/reversal chain |
| `saleConflicts` | Attempted operation, item, reason, resolution and note |
| `stockOperations` | Kind/date, reason, recipient, source reference, reversal reference |
| `stockMovements` | Operation, lot, signed quantity and cost changes |
| `files` | R2 key, filename/type/size/hash, thumbnail key, upload state |
| `fileLinks` | File, validated business reference, purpose, display order |
| `documents` | Kind/version/status, typed immutable input snapshot, shop snapshot, renderer version, PDF file, expiry |
| `documentLinks` | Document, validated business reference |
| `documentSignatures` | Document, signer role/identity, strokes, consent, signing date |
| `emailDeliveries` | Document, recipient snapshot, attempt key, provider ID, state/error/time |
| `auditEvents` | Actor, record, action/time, change summary or version reference |
| `operations` | Actor, idempotency key, kind, payload hash, result references |
| `legacyMappings` | Old table/ID, new table/ID, migration batch |

Use typed unions for source/link references and snapshot schemas; avoid unconstrained strings and unvalidated blobs. Add indexes for contact history, purchase lines, sale lines, item lots, current grading, document links, source movements, operation keys, dates, and open statuses. Enforce uniqueness and referential rules within server mutations; an index alone is not a uniqueness constraint.

A product identifies a catalogue description; a stock item identifies an individual object or interchangeable group. Separate stock items when condition, grading, ownership origin, or sale treatment differs. Individual items have quantity one. A stock lot has exactly one acquisition source, preserving its depositor or purchase provenance.

Sales allocate lots transactionally, never allowing negative availability. Sold costs, names, grading labels, and agreement economics are snapshots. Corrections and cancellations preserve history. Display conversion conserves exact total cost, including indivisible cents. Stock balances and movement records update together and can be reconciled.

Payments describe recorded collection. Replacements supersede prior records rather than overwriting them. Legacy unknown payment status is preserved. Depositor balances derive from eligible collected sale shares minus active payouts, including negative regularizations; no manually editable balance field is authoritative.

Financial/dashboard summaries are derived or rebuildable materializations, never a competing ledger. Large history queries use pagination. R2 upload completion and email delivery use explicit states because external side effects cannot be part of a Convex transaction.

## States and accessibility

| State | Required behavior |
| --- | --- |
| First load | Stable skeleton matching content; accessible loading announcement |
| Empty | Explain what belongs here; offer one relevant action |
| No filtered result | Preserve filters and offer clear/reset; never resemble empty inventory |
| Validation failure | Inline field explanation plus focusable summary; retain values |
| Saving | Disable only conflicting actions; show progress; deduplicate retries |
| Connection lost | Explain server operations are unavailable; keep local draft state explicit |
| Concurrent edit | Preserve input, show changed record, require reviewed retry |
| Partial photo upload | Keep saved transaction; retry remaining files only |
| PDF archive failure | Keep confirmed business action; show document recovery action |
| Email accepted | Say accepted by provider, not delivered to recipient |
| Email uncertain | Keep attempt history; no silent automatic resend |
| Expired prepared document | Reprepare from current data before signing |
| Session expired | Reauthenticate without exposing private cached data; retain eligible local draft |

Target WCAG AA for the web and usable VoiceOver behavior on iPhone. Use keyboard-operable controls, visible focus, logical headings, named icon actions, focus return after dialogs, and status announcements. Test long names, 200% text, narrow widths, dark mode, Increase Contrast, Reduce Motion, and screen-reader order.

Use at least 44 pt touch targets in custom iPhone controls as a project design target. Do not convey availability, debt, or errors by color alone. Signature collection needs an explicit alternative completion/support path rather than claiming the drawing surface is universally accessible. Respect Dynamic Type and platform semantic colors. [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility)

Keep primary tabs stable and use navigation for detail, not a new tab per task. Prefer system components and behaviors so the app feels familiar. [Apple tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) · [Apple HIG](https://developer.apple.com/design/human-interface-guidelines)

## Feature coverage and platform plan

| Capability | Rebuild coverage |
| --- | --- |
| Accounts, reset, signatory, contacts | Web and iPhone; preserve session behavior |
| Buyback creation, valuation, corrections | Web and iPhone; device-local draft recovery remains iPhone-specific |
| Supplier receipts, invoices, lots | Preserve mobile flow; add full web workflow as proposed parity |
| Stock, grading companies, photos, visibility | Web and iPhone; public visibility remains distinct from availability |
| Baskets, quantities, payments, cancellations | Web and iPhone with one server rule set |
| Consignments, revised terms, returns, payouts | Web and iPhone; retain signature gating and balance rules |
| Gifts and display opening/reversal | Preserve mobile flow; add full web workflow as proposed parity |
| PDFs, signatures, archive, share/email | Both platforms; native sharing on iPhone |
| Dashboard and breakdowns | Full web; mobile history/context summaries, full dashboard optional later |
| Excel and gifts CSV | Web Excel retained; mobile gifts CSV retained; web gifts CSV parity proposed |
| Concurrent sale conflicts and audit | Full web review; mobile actionable conflict feedback and history |
| Public catalogue and informational/legal pages | Responsive web, including Convention use |
| Live changes | Web, mobile, public eligibility updates and reconnection recovery |

Coverage includes stock photos and evidence, custom grading, supplier FIFO, exact-cost display conversion, gifts, outstanding collections, partial depositor payouts, historical document versions, and payment corrections. Existing capabilities must not disappear merely because a primary mockup shows only a subset.

## PDF preservation and migration

The user reports production database and R2 backups completed. A separate verified 74-file source archive exists at `/Users/mew/Backups/cartelites/2026-11-23T08-35-10Z/pdf-creation-code.zip`, with an adjacent SHA-256 file. It contains canonical renderers, API copies, identity/logo assets, integration code, tests, and dependency versions.

Keep `packages/domain/src/{purchaseReceipt,consignmentReceipt,consignmentDocument,signature}.ts`, the API ticket renderer, and their branding inputs intact. Introduce explicit new-schema-to-renderer adapters. Compare representative output fixtures before changing any generator dependency. Archived signed PDFs remain the original bytes; new code must retrieve them without regeneration.

Build migration against an isolated deployment and copied/private object storage first. Map original IDs explicitly, preserve object keys and signed snapshots, retain legacy unknown fields, and reconcile purchase totals, sale allocations, stock, payouts, payment status, and document counts. Import grading company names as records without assuming a closed enum. Product grouping must never merge distinct physical cards or consignment owners.

Before cutover, test restored signed PDF downloads and checksums, representative images, all inventory origins, cancellations, payout balances, and session behavior. Quiesce writes for the final export/import, record the deployed version, and retain an operational rollback plan. A backup file existing is not evidence that a full restore has succeeded.

## Delivery phases and acceptance

1. **Direction:** review desktop workspace, public catalogue, and native phone mockups; agree IA and visual tokens. Demonstrate exact-number and promo search states, custom grading, and a sale review.
2. **Foundation:** implement configuration, shared contracts/search, schema invariants, account/session behavior, and shadcn/native shells. Validate accessibility of reusable controls.
3. **Inventory:** migrate contacts/products/items/lots, build buyback and supplier receipt flows, photos, grading, visibility, drafts, and PDF adapters.
4. **Transactions:** implement baskets/payments, consignment revisions/signatures/returns/payouts, gifts, display conversion, conflicts, and reversals with concurrency tests.
5. **History and public experience:** finish documents/email, dashboard/exports, public pages, pagination, empty/error states, and cross-device refresh.
6. **Migration rehearsal and release:** reconcile restored data, compare existing PDF fixtures, verify backup recovery and rollback, then perform an explicitly scheduled production cutover.

Release acceptance requires the full feature matrix, server-side invariants, exact-search regression cases, document preservation, two-device concurrency/reconnection checks, keyboard and VoiceOver passes, and a migration reconciliation report. Mockup review alone does not satisfy functional acceptance.

## Interactive mockups

- [Web workspace](mockups/web.html): stock search, visibility, item detail, and new buyback.
- [iPhone app](mockups/mobile.html): grouped stock, native navigation direction, and buyback search.
- [Public catalogue](mockups/catalogue.html): customer-facing browsing and product detail.

These prototypes use local fictional data and represent selected flows, not the completed application.

## Prototype behavior validated on 23 November 2026

The expanded prototypes include working local pagination, filters, transaction wizards, state changes, multi-photo product editing, public galleries, and explicit error scenarios. Business data remains fictional and independently stored per prototype. TCGDex search in acquisition flows uses the real public API via the same embedded adapter on web and mobile.

Live checks returned Pikachu EX Émeraude for `60/106`, alongside two other exact matches in other sets; `XY95` returned Pikachu. The Japanese catalogue queried did not contain the `XY-P` series, so `001/XY-P` produces a coverage explanation and manual entry rather than unrelated results. Name queries support provider pagination.

Browser checks passed 16 web assertions, 11 mobile journey groups, and 12 public catalogue assertions. These check prototype behavior, not production readiness. Document previews and typed signatures are illustrative; emails and payments remain simulated.

## Cart selection feedback

Stock and sale selection lists show persistent selected-row styling, a checkmark and the actual quantity in the basket. Inline minus/plus controls update that quantity; plus is disabled when available stock is fully selected, and removing the final unit restores the unselected row. Selection survives filters and pagination. The mobile basket summary displays unit count and total. Ordinary selection does not require dismissing a message or opening an item detail. Color is complemented by a text label and quantity.

### Stabilité des interactions

- Les contrôles de quantité et leurs états occupent le même espace avant ajout, après ajout et au stock maximum ; aucun déplacement des lignes voisines.
- La barre du panier mobile garde sa place, avec un état vide désactivé.
- Dans les parcours mobiles, le retour en haut à gauche revient à l’étape précédente en conservant la saisie. Aucun bouton « Étape précédente » supplémentaire en bas.
