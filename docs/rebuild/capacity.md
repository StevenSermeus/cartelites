# Canonical financial read capacity

Checked 2026-11-23. This audit concerns the runnable canonical backend in `convex/rebuild`, not a claim that arbitrary history size is supported.

## Current limits and measurement

[Convex documents](https://docs.convex.dev/production/state/limits) per-transaction limits of 4,096 index ranges, 32,000 scanned documents and 16 MiB read data. Filters also count scanned records. Hosted allocations and the local server build may differ; these are sizing constraints, not a substitute for deployment measurements. [Convex's error-handling guidance](https://docs.convex.dev/functions/error-handling) explains why repeated `get`/`query` calls can exhaust the index-range budget.

`convex/rebuild/tests/dashboardCapacity.test.ts` instruments actual database calls in `convex-test`. The fixture contains 2,000 sales, 500 purchases, 100 depositors, and two payment revisions per sale. It includes depositors with positive balances and negative regularizations. Instrumentation counts completed database operations and returned documents. JSON byte counts estimate payload size; they are **not** Convex billing or storage-byte measurements. No large fixture was inserted into local QA data or a remote deployment.

| Measurement | Previous implementation | Integrated implementation |
| --- | ---: | ---: |
| Database operations / index ranges | 5,312 | 14 |
| Returned documents | 13,804 | 12,804 |
| Sum of serialized document JSON bytes | 3,305,516 | 3,005,062 |
| Sales total | 400,000 cents | 400,000 cents |
| Purchase total | 500,000 cents | 500,000 cents |
| Commissions | 30,000 cents | 30,000 cents |
| Due to depositors | 67,500 cents | 67,500 cents |
| Negative regularizations | 7,500 cents | 7,500 cents |

The previous dashboard exceeded the documented index-range budget despite modest document volume. It queried each purchase's lines, each sale's lines and payments, then read the same sale history again for every depositor.

## Implemented changes

`readModels:dashboardSummary` reads the relevant ledgers once within a single Convex query snapshot. Maps associate lines and payments with active purchases and confirmed sales. The same collected sale-line shares determine depositor balances; payouts are subtracted once. Existing dashboard output and live subscription contracts are unchanged.

The calculation preserves cancelled transactions, removed purchase lines, pending and unknown collection status, superseded payments, unknown costs, recorded gift costs, gift reversals, and negative depositor regularizations. Regression tests compare the resulting depositor totals with `balanceRecord`, which remains the independent financial-domain calculation. Aggregation now rejects unsafe integer totals with `AMOUNT_OVERFLOW` instead of returning rounded cents.

Gift operations with explicit costs or explicitly incomplete history require no movement query. A gift without a recorded cost and with potentially complete history still requires one indexed movement query. Accordingly, the dashboard has **14 + G database operations**, where `G` is the number of such unreversed gifts. Its source rows remain unbounded by history size. No cap, partial total or silent fallback was introduced.

Staff item DTO hydration now reads the first FIFO lot and first current grading through their indexes. Previously it collected their entire history and used only the first entry. A separate regression with 2,000 historical lots verifies one returned lot and unchanged provenance/cost/current grade. Full acquisition and allocation history remains available in its existing detail endpoints.

## Remaining limits

- Dashboard table scans still grow with the complete financial history. At larger volumes, the document, byte or execution limits can still fail the query explicitly. The measured scenario establishes a concrete improvement, not an unlimited capacity guarantee.
- `balanceRecord` and the mutation-time `depositorBalance` still derive a contact's balance from their sale lines and payouts. A very active depositor can exhaust transaction limits even if the dashboard succeeds.
- Paginated purchase/consignment histories still embed all child items. The first-lot improvement removes historical-lot amplification, but large dossiers and complete photo collections still require their full child records.
- Exact public catalogue filtering, totals, sorting and facets still scan all eligible stock. The earlier dedicated public projection removed private-history hydration and loads galleries only for the selected page; it did not add an external catalogue mirror.

## Proposed next interface — not implemented

A fully bounded financial read requires a rebuildable transactional projection, consistent with `docs/rebuild-design.md`; splitting ordinary queries into independent pages would otherwise mix snapshots during concurrent edits.

1. Introduce versioned projection state and typed integer contribution records keyed by canonical source IDs. The purchase/sale/payment/payout/gift ledgers remain authoritative. An entity contributes its current state once, and corrections/cancellations replace or reverse that contribution atomically with the business write.
2. Maintain global, shop-day, TCG/origin and depositor aggregates from those contributions. Balance-sensitive mutations must observe the projection revision in the same transaction; a stale/unready projection must fail explicitly or use the exact ledger calculation only while it remains within limits. Historical payout availability also needs an indexed prefix-sum/range-aggregation strategy, rather than scanning a depositor's entire past.
3. Rebuild into a new projection epoch in bounded chunks from a verified isolated snapshot. Reconcile each category and depositor against the canonical ledger before atomically making that epoch active. Rebuild/cutover needs either a controlled write barrier or an explicit delta-capture protocol; a background table scan alone cannot promise an exact snapshot.
4. Keep `readModels:dashboardSummary`'s current DTO, reading only the active epoch's bounded totals and relevant day buckets. Add readiness/version metadata to administrative diagnostics, not invented zero values to financial screens. Keep existing signed document snapshots immutable.
5. Separately expose paginated child-item histories plus explicit full-document total/count fields before capping any embedded arrays. Existing clients calculate some totals from embedded items, so truncating those arrays now would be incorrect.

This interface requires coordinated schema, importer/rebuild, mutation and client-detail changes. It was proposed to the lead before such edits; this bounded audit did not introduce a competing ledger or an incomplete projection.

## Verification

- Targeted capacity, balance parity, historical-item hydration and overflow tests pass.
- Full canonical suite and typecheck are run after integration; see the lead's final verification record.
- Private measurement logs: `/tmp/cartelites-dashboard-before.log` and `/tmp/cartelites-dashboard-after.log`.
- Live API3002 / Convex3220 check passed using only the existing isolated QA account and read endpoints; authentication created a normal session. Dashboard due amounts (5,600 cents) and regularizations (0 cents) exactly matched all five depositors from paginated balance reads. Report: `/tmp/cartelites-canonical-rehearsal/dashboard-capacity-live.json`.


## Stock activity and numbered purchase history

Stock activity now reads an indexed maximum50 effects per page. Rebuild maintenance processes at most20 source rows with a1MiB source-page target and durable cursor; large legacy purchase fan-out uses scheduled50-item chunks. This does not remove Convex limits on the underlying business mutation or a single large source record. See `item-activity.md` for readiness and incomplete-history behavior.

Canonical buyback history implements the existing numbered HTTP page contract, filtering before pagination and hydrating child items/photos only for the selected page. Exact counts/search still scan purchase/contact metadata. This repairs the UI contract and reduces hydration; it is not evidence of arbitrary full-history capacity. Large selected dossiers still have the child-record limits above.

## Workbook exports

The completion audit reproduced a separate export limit on the same 2,000-sale fixture: the old `operations:salesHistory` workbook read issued **16,004 database calls**, returned12,002 documents and about2.90MB of serialized JSON. The dashboard's14-call improvement did not protect this endpoint. The other independent export calls measured3,504 purchase-history calls,2,004 stock calls and908 balance calls. These are separate transactions, not one combined limit.

Authenticated `exportReads:page` and `/exports/:resource` now provide purpose-specific pages in both models. Resources are `purchases`, `sales`, `stock`, `stockLots`, `consignments`, `payments`, and `contacts`. Each page scans at most250 source records with a1MB byte target and returns at most25 source rows; short or empty intermediate pages retain their cursor. Purchase lines and current consignment terms are paginated directly, preserving the client's parent-with-one-item shape. Photos, evidence, allocation histories and payment revision arrays are not hydrated. Lot valuation and depositor balances are computed from exhaustive exported rows, so a contact's full lifetime ledger is not reread inside one query. The old unpaged compatibility endpoints remain available and retain their documented limits; the workbook no longer depends on them.

Canonical sales are exported per immutable sale line, with their own origin and frozen economics. Actual current cash and transfer totals are apportioned using integer cumulative rounding: first distribute the collected total, then cash within those shares and derive transfer by subtraction. This preserves both each fully paid line total and both payment-method totals, including mixed-origin baskets. Unknown costs remain null. `balanceEligible` preserves each model's established collection semantics; cancelled sales are excluded. Contacts explicitly identify depositors, including zero-history balances.

The integrated 2,000-sale test exhausts80 pages with a maximum255 database reads per page, versus16,004 for the old single query. It also checks mixed-origin payment rounding, source-row uniqueness, null costs, auth and cursor binding. A legacy60-item dossier test verifies complete traversal past the former embedded50-item boundary. Real local HTTP traversals for both models are recorded in `export-pages-3002.json` and `export-pages-3001.json`; canonical depositor due5,600c and regularization0 exactly match the authoritative dashboard.

Pages describe a **reading interval**, not an atomic financial snapshot. Concurrent edits can change data between pages; clients label that limitation and discard the whole workbook if any read fails. Browser memory, individual record size, and a canonical sale's supported200-line maximum remain finite constraints. No data is silently capped. Very large per-entity histories can still exceed limits in old detail/document endpoints; this change does not claim to remove those limits.
