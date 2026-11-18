# Cartélites — base design and page-state atlas

18 November 2026 · design proposal based on `../page-design-plan.md`.

The interactive companion is `app-mockups.html`. It covers **23 page families, 153 page-state presets, plus one Foundations view**: **24 selectable views and 154 presets in total**. Authentication and legal pages each contain their relevant variants. This is a reviewable design prototype, not a production implementation or a connected staging environment.

## How to review

Use **Page** to choose a destination, **État** to inspect the states relevant to that page, and **Format** to switch between desktop and mobile. The default is a purchase form with paginated client search results. Product navigation and primary flow actions also move between mockups. State presets are curated examples, rather than a full simulation of the production database.

All data is fictional. `example.test` email addresses, sample references, prices and identity details are illustrative. The small card illustrations are intentionally abstract placeholders, not fabricated product photos. No API calls, network resources, downloads, authentication or financial operations occur. Form inputs never leave the document.

## Base design

**Web/mobile distinction:** this document and `app-mockups.html` describe the store website (including its responsive layout), which now displays the existing store logo. The dedicated native-app proposal is `mobile-mockups.html`, documented in `mobile-design-and-states.md`. It uses an independent identity and a user-configured, persistent and editable API URL. This supersedes the earlier suggestion of sharing the store's warm palette with the native application.

**Direction:** a warm, restrained workspace that gives inventory and financial decisions priority. Use a quiet canvas, opaque paper surfaces, strong brown actions and a small amount of gold. The layout places one primary task at the top of each page; secondary history and utilities remain easy to find.

| Token | Value | Application |
| --- | --- | --- |
| Canvas | `#f7f3eb` | Working area |
| Surface | `#fffdf8` | Forms, lists, dialogs |
| Ink | `#2c211b` | Primary text |
| Muted | `#746959` | Supporting context |
| Primary | `#795018` | Selected navigation and main action |
| Accent | `#efbd53` | Small emphasis, focus ring, secondary chart series |
| Border | `#e4dccd` | Quiet separation |
| Soft | `#eee5d5` | Neutral status and selected context |
| Success | `#28634b` on pale green | Confirmed/available state |
| Error | `#a4352d` on pale red | Validation and blocked operations |

The web palette follows the existing brand. Product text uses Inter when locally available, otherwise system sans; the compact wordmark uses a serif fallback. Main headings are 27 px, section headings 17 px, primary body text 14 px, and secondary metadata 11–12 px. Financial values use aligned numerals. Panels have a 14 px radius, controls 7–8 px, and major spacing follows 8/12/16/24 px intervals.

**Desktop shell:** compact brand/account bar, six business destinations in the left navigation, nested sales/payout links, utilities below, breadcrumb and page header. Lists show compact rows; record pages separate source evidence and financial information. Empty and failed loads replace the relevant content, while failed mutations preserve the form/context.

**Mobile shell:** five tabs—Stock, Vendre, Rachats, Dépôts, Plus—with stacked forms and summaries, larger editable text and full-width content. Plus exposes Clients, Compte and Catalogue. The internal mobile header says **Espace vendeur**, preserving its independent identity. The shared warm component treatment is a **proposed visual direction**, not a claim that mobile already uses Cartélites branding. Signatory/signup mobile screens explicitly identify themselves as proposed parity; native dashboard and export parity are not implementation prerequisites.

The prototype reflows at widths below 600 px and also offers a constrained 390 px mobile preview. It does not reproduce native iOS keyboard, safe-area, camera or document-picker behavior.

## Component foundation

| Component | Design and behavior |
| --- | --- |
| Page header | Breadcrumb, title, short context, one clear primary action |
| List row | Identity, secondary metadata, text status, amount and contextual action |
| Status badge | Availability, origin, public visibility and payment remain separate labels |
| Form section | Numbered sections for long creation flows; persistent labels and nearby help |
| Validation | Red field treatment, specific inline message; confirmation stays blocked |
| Confirmation | Green status with outcome and useful next destination |
| Network error | Contextual failure and retry; does not assert successful persistence |
| Loading | Skeletons with `aria-busy`, preserving approximate content geometry |
| Empty view | Distinguishes first-use empty, filtered empty, cleared queue and missing record |
| Dialog | Opaque focused surface with cancel/confirm, Escape, keyboard focus loop and inert product background |
| Payment form | Mode, date, cash/transfer amounts and reference; total reconciliation feedback |
| Payout form | Depositor-wide balance, amount/date/method/reference; explicit “already paid” context |
| Agreement form | Prior/new terms, commission and mandatory authorization note |
| Client form | Identity and contact fields; used from directory and acquisition workflows |
| Public item card | Image area, public identity/grade and asking price; no private data or checkout |

The optional host `Tweak` helper exposes a panel-radius adjustment if supported. No external font/icon/runtime library is required.

## Page-state coverage

Each row below corresponds to a selectable page family. All listed states have a rendered preset, rather than only a written recommendation.

| Page | Contents | Rendered states |
| --- | --- | --- |
| 1. Vue d’ensemble | Received/pending money, purchased-stock gains/losses, commissions, activity chart, queues | Normal; loading; first-use empty; network error |
| 2. Stock | Search/filter, source/visibility badges, selection controls, prices, item links | Normal; visibility selection; hidden items; empty stock; no results; loading; error; stale bulk selection |
| 3. Article | Identity, provenance, private evidence, price and visibility | Available; hidden; sold with selling controls removed; missing; error |
| 4. Nouvelle vente | Item search, add actions, basket entry | Normal; added; no inventory; no results; loading; error |
| 5. Panier et confirmation | Line prices, deposit split, payment form and reconciliation | Filled; mixed-payment mismatch; below agreed price; atomic availability conflict; submitting; confirmed; empty basket |
| 6. Historique des ventes | Sale rows, collection segments, detail/collection actions | Normal; pending; legacy unspecified; cancelled; collection dialog; empty; no results; loading; error |
| 7. Vente | Item-level sale, origin, commission/share, collection | Received; pending; collection dialog; cancel confirmation; cancelled; error |
| 8. Conflits de vente | Attempted sale, explanation and resolution note | Open; all-clear; resolved elsewhere; save error; resolved |
| 9. Rachats | History rows, client/reference search, status filters | Normal; pending; empty; no results; loading; error |
| 10. Nouveau rachat | Client/date/reference, article editor, valuation/discount, attachments, review | Filled; field validation; catalogue searching; catalogue fallback; client dialog; submitting; saved; saved with upload failure |
| 11. Rachat | Source, items/costs, pending actions, documents and date correction | Active; pending; pending cancellation; validated; document failure; missing |
| 12. Dossiers de dépôt | Dossiers with availability summaries and deadlines | Normal; overdue; empty; no results; loading; error |
| 13. Nouveau dépôt | Depositor/terms, sealed-item default, price, 30% commission, share and attachments | Filled; invalid fields; client dialog; submitting; saved; saved with upload failure |
| 14. Dossier de dépôt | Agreement, item lifecycle, evidence and depositor link | Available; agreement dialog; missing authorization note; return confirmation; returned; sold; stale availability; upload failure |
| 15. Reversements | Positive balances, settled/regularization views, record-payment action | Due; payout form; overpayment validation; negative regularization; settled; loading; error; recorded |
| 16. Compte déposant | Depositor balance, eligible/pending proceeds, payout history | Positive; payout form; partial payment; negative balance; zero balance; error |
| 17. Clients | Searchable source-client directory | Normal; create form; invalid client; empty; no results; loading; error; saved |
| 18. Fiche client | Contacts, related records, preselected flow entry and balance | Normal; edit form; related-record load failure; missing |
| 19. Exports | Workbook scope and sheet groups | Ready; preparing; failed; simulated ready confirmation |
| 20. Paramètres | Account signatory and instance-wide signup | Filled; invalid signatory; submitting; saved; save failure; signup disabled |
| 21. Authentification | Focused account-task forms outside seller shell | Login; registration; reset request; reset completion; invalid credentials; submitting; generic reset confirmation; expired link; disabled signup |
| 22. Catalogue public | Image-led public stock cards, search/filters and footer | Populated; no results; photo fallback; loading; service unavailable |
| 23. Informations publiques | Common public header and readable content column | Mentions légales; Confidentialité; Cookies |

Legal presets are **layout placeholders for the existing content**, explicitly labeled as such. They do not invent a privacy policy, claim legal completeness or replace existing business information.

## Local interaction coverage

- Page/state/device selection updates the rendered view; sidebar, mobile tabs and detail links navigate locally.
- Search filters the displayed sample records. Relevant filters can expose hidden stock, pending purchases and overdue deposits.
- Add-to-basket changes the demonstration basket count and confirmation feedback. The checkout remains a curated two-item scenario rather than a general basket engine.
- Mixed-payment inputs recalculate the received total, and confirmation demonstrates the missing-amount validation. Switching to cash or transfer prefills that method; pending collection disables the received amounts and confirms a sale still to collect.
- Client, collection, payout, agreement, return and cancellation dialogs open with editable fields. They close via cancel or Escape, with keyboard focus bounded to the dialog.
- Payout amount checks the displayed 105 € maximum. Agreement confirmation requires an authorization note. Curated error states remain independently inspectable.
- Long acquisition forms allow extra sample article fields and a local file selection. Catalogue/manual-entry controls, a representative catalogue match, an expandable grading/certifier/certificate section and deposit notes illustrate the remaining form groups. No file upload or catalogue lookup occurs.
- Successful actions show local confirmation or navigate to the relevant mockup. PDF and export actions explicitly simulate their outcome instead of producing misleading business documents.

## Boundaries for implementation

This atlas establishes visual hierarchy and covers representative states. It deliberately does **not** implement the backend contracts, financial calculations, authentication, transaction atomicity, durable drafts, complete editing/history behavior, virtualized lists or production routing. Some controls are illustrative; selected presets use fixed example values. In particular, acquisition summaries, checkout line totals and deposit split summaries do not recalculate from arbitrary edits; only the payment amount feedback is interactive. Navigating/reselecting a preset resets sample field values. Search/filter combinations are intentionally limited to the sample records.

Keep the existing app's authority over business rules. In particular:

- A hidden item is sellable internally; public visibility is not availability.
- A failed batch sale has no partial success.
- Below-agreement deposit sales require a recorded authorization before sale.
- Pending customer collections are excluded from eligible depositor proceeds.
- Payouts belong to a depositor, allow partial amounts and never initiate banking operations.
- Negative balances are regularizations, not negative payout forms.
- Saved records with failed attachments must retry the attachment, not create a duplicate record.
- Legacy unknown payment methods stay unknown.
- Public catalogue cards expose no private source or acquisition information.

## Verification and handoff

JavaScript syntax was parsed using Node. The atlas metadata confirms 24 views and 154 presets. The parent rendered every preset at 728 px and 390 px without script errors or horizontal overflow, and checked every preset at 320 px for horizontal overflow. Dialog bounds fit their product surface after correcting the narrow client form. Visual spot checks covered Stock, mixed-payment validation, mobile purchase validation and the mobile client dialog.

Seven local interaction checks passed: mixed-payment rejection, balanced-payment confirmation, pending-collection confirmation, overpayment rejection, partial-payout acceptance, missing agreement-note rejection and completed agreement acceptance. These checks verify the prototype only; they are not production application tests or an exhaustive accessibility review.

For preview automation, the document exposes `window.mockupAtlas` (also `window.cartelitesMockup`):

```js
mockupAtlas.pages;                         // [{ id, title, states }]
mockupAtlas.navigate('cart', 'payment-error');
mockupAtlas.setState('ready');
mockupAtlas.setDevice('mobile');           // or 'desktop'
mockupAtlas.getState();                    // { page, state, device }
```

All methods only update this local mockup. The production application files remain untouched.


## Correction — recherche client et volumétrie

Les formulaires de rachat et de dépôt utilisent une recherche client, jamais une liste déroulante contenant tout le carnet. Recherche par nom, email, téléphone ou référence après deux caractères, sélection explicite avec coordonnées pour distinguer les homonymes, récapitulatif du client choisi et action « Changer de client ». La recherche, le changement de page et les erreurs ne doivent pas effacer les articles saisis. La création d’un client doit revenir au formulaire et sélectionner la nouvelle fiche.

Cinq états supplémentaires par formulaire sont disponibles : résultats paginés, chargement, aucun résultat, erreur avec réessai et client sélectionné. Le prototype montre deux résultats par page sur cinq clients fictifs pour rendre la pagination observable. Les listes d’articles, clients, ventes, rachats, dépôts, reversements et les historiques liés disposent aussi de contrôles de pagination locaux. Ces jeux de démonstration ne sont pas une stratégie de chargement de production.

**Contrat à implémenter :** recherche, filtres, tri et pagination côté serveur sur toutes les collections potentiellement volumineuses, y compris les résultats de catalogue et les listes imbriquées dans une fiche. Proposition : 10 résultats par page pour un sélecteur client, 25 par défaut pour les listes, choix 25/50, sans option « Tout afficher ». Temporisation de recherche d’environ 300 ms, annulation/ignorance des réponses obsolètes, tri stable avec identifiant de départage et limite maximale imposée par le serveur. Aucun téléchargement intégral suivi d’un filtrage ou d’un découpage dans le navigateur.

Revenir à la première page après modification d’une recherche, d’un filtre ou de la taille de page. Conserver les filtres au retour d’une fiche. Afficher Précédent/Suivant et la plage courante ; n’afficher un total ou un nombre de pages que si le serveur le fournit. Avec des curseurs, conserver les curseurs précédents sans inventer de navigation vers une page arbitraire. Les totaux de tableau de bord sont calculés côté serveur sur le périmètre complet, jamais sur la seule page visible. La sélection de visibilité distingue la page courante d’une action explicite sur tous les résultats et reste plafonnée à 500.

Les contrôles de la maquette sont une simulation locale. Les API et l’application réelle n’ont pas été modifiées par cette correction.

Vérification de cette correction : les 154 états se rendent à 728 px et 390 px sans erreur de script ni débordement horizontal. Le passage à la page suivante des clients, la sélection d’un client, la pagination du stock et le retour à la première page après recherche ont été vérifiés dans le prototype.
