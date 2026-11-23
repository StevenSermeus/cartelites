# Staff activity and payment history

Shared types: `packages/domain/src/history.ts`. These reads require a live authenticated shop session. They derive from existing source records, without another financial ledger, and exclude signatures, PDF snapshots and object keys.

## Activity

`GET /activity/:source` and realtime `activity:browse` accept source, size (1–50), cursor, search (200 characters), inclusive from/to epoch boundaries, status, origin, paymentStatus and eventKind. Date pickers convert shop-local boundaries; unknown business dates never match a date range.

| Source | Status options besides all | Origins besides all | Extra filter |
| --- | --- | --- | --- |
| purchases | pending, active, cancelled | purchase | — |
| sales | active, cancelled | purchase, supplier, consignment | paymentStatus: received, pending, unknown |
| consignments | pending, open, closed | consignment | pending means awaiting signature |
| payments | recorded | consignment | — |
| events | recorded | consignment | eventKind: return, terms |
| receipts | active | supplier | — |
| gifts | active, cancelled | purchase, supplier | — |
| openings | active, cancelled | supplier | — |

Unsupported filters fail explicitly. Search covers scalar business facts (reference, title, contact/supplier, applicable item name, beneficiary, reason, note, method); sales also search every line's retained description, set, identifier and grading certificate. PDF contents and arbitrary private metadata are outside this search.

Response: `{items,nextCursor,isDone,order:'recorded-desc'}`. Shallow rows contain source ID, title, recordedAt, nullable occurredAt/amountCents, amountStatus, status, origins, detailsIncomplete and appropriate scalar facts/linked IDs. Fetch existing dossier or sale detail before entering its workflow. recordedAt means database insertion time, including insertion into an imported database; it never replaces the original business date. Independent source cursors do not establish a globally complete chronological feed.

A query scans a bounded source window and returns its matching records. Short/empty pages retain continuation. Cursors bind all filters and size. Buybacks exclude supplier receipts. Mixed sales match any line's origin, including in the existing paginated sales endpoint.

Purchase summaries read at most201 lines: above200, amount is null with detail-required/incomplete, never a partial total. Sales have an existing200-line creation limit; unexpected larger baskets fail explicitly. Canonical shallow sale pages return at most10 records; an11-sale ×200-line fixture uses fewer than2,050 database read calls per page. Existing fully hydrated sale pages return at most5 because they additionally load allocations/photos. Other detailed purchase/consignment queries retain their documented historical fanout limits.

## Payment revisions

`GET /sales/:id/payment-history` and realtime `operations:salePaymentHistory` take saleId, size1–50 and an opaque cursor bound to sale/size. Response: items, nextCursor, isDone, saleStatus, current, currentEntryId, historyStatus.

Snapshots carry collectionStatus (received/pending/unknown), nullable cash/transfer amounts, receivedAt and reference. Rows add id, initial/revision kind, current/superseded/reversed state, nullable changedAt/actorLabel and retained previous snapshot. receivedAt is the collection's business timestamp; changedAt is the recorded change time. Staff identity is shown only where an actual account resolves.

currentEntryId identifies the last revision even after cancellation. It is null for canonical sales without a payment row; legacy uses the last correction ID or `initial:<saleId>`. A correction between pages may change this header without the new row appearing in that page. Clients normalize loaded row states against that identity. Cancellation reverses the last revision; older versions remain superseded.

Legacy retains each before/after correction and appends an initial-snapshot page. Its initial before-snapshot has unknown change time. Canonical uses indexed salePayments/predecessors. New rows preserve collectionStatus/historyKind/previousCollectionStatus, distinguishing received zero amounts from pending states and retaining pending before first collection. Old ambiguous zero or unmarked revisions remain unknown/incomplete. Imported change times are shown only when raw source evidence identifies the revision unambiguously. historyStatus describes incomplete returned evidence/current state, not certification that no historical audit record was lost.

The reads never modify payments, balances, stock or PDFs. Real local3220 verification covered pending → received → identical replay → split correction → cancellation. Two payment rows and original collection timestamps survived; stock restored to2 units and202 cents. Evidence: `payment-history-live.json`.
