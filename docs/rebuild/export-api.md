# Exhaustive workbook reads

`GET /api/v1/exports/:resource?size=25&cursor=...` requires a live authenticated session. The corresponding Convex query is `exportReads:page`. Omit the first cursor. Sizes1–25 are accepted; cursors are bound to their resource. Unknown resources/query parameters and invalid sizes fail explicitly.

Response: `{ items, nextCursor, isDone, consistency: "reading-interval" }`. Continue through empty pages until `isDone`; never use item count as completion. A failed page invalidates the whole export. Records may change between pages; the workbook is not an atomic snapshot.

| Resource | Row contract |
| --- | --- |
| purchases | Existing purchase fields, stable `exportRowId`, one-element `items` array with that acquisition line's quantity/cost/valuation. Removed canonical lines are excluded. Legacy scope retains its buyback purchase records; canonical scope also includes supplier purchases. |
| sales | One legacy sale or canonical sale line. `_id`/`saleId` identify the sale; `exportRowId` identifies the line. Existing workbook fields, exact `costCents` or null, frozen line economics, apportioned current `payment`, and authoritative `balanceEligible`. Never classify a mixed basket by its first line. |
| stock | Existing available-stock workbook item fields without galleries. No zero substitute for missing costs. |
| stockLots | `{ _id, itemId, remainingQuantity, remainingCostCents }`; remaining cost can be null. Aggregate all pages by item before valuation. Missing lot provenance remains unknown. |
| consignments | Existing dossier fields, stable `exportRowId`, one current-term/item in `items`. Repeated dossier IDs are expected. |
| payments | Existing payout fields including `sellerId`, `sellerName`, `amountCents`, date/method/reference. |
| contacts | `{ _id, name, email?, phone?, address?, hasDeposits }`. All contacts feed Clients; `hasDeposits` includes depositors with zero financial history. |

For each depositor contact, sum `depositorAmountCents` only from sales with `balanceEligible`, then subtract their payouts. Do not coerce missing financial evidence into zero. Canonical eligibility requires received payment; legacy eligibility preserves its established non-pending rule. Cancelled sales are always ineligible. Mixed payment shares preserve each line's collected amount and global cash/transfer totals; historical partial payments remain partial.

Stock valuation checks lot quantity against known item quantity and preserves missing quantity/cost as unknown. Clients must not invent a cost from the asking price or treat an empty history as proof of zero acquisition cost.

## Document and migration audit

Both ticket email claim functions check new requests for `TICKET_STALE` before inserting an email attempt. An existing operation key returns its original status with `send:false`, including `unknown`, even if the sale has since changed. This prevents a retry from creating a duplicate external send. Tests cover both models. Historical originals remain downloadable; claim rejection does not overwrite them.

Legacy receipt history now numbers all sibling versions before filtering signed versions; an unsigned draft leaves a truthful version gap. No PDF input or renderer changed.

Normalization still retains raw original records in the private `legacy-vault.json` restore package and source audit rows. Disposable activity indexes remain vault-only with an explicit rebuild warning. The current actual-backup plan remains1,334 records, digest`ab9a5396913f130293051ab3c355c449b2aff12f64afe67ffa2712997e288d3c`, errors[]. `applicationSettings`, `stockVisibilityOperations`, and `purchaseEdits` are explicitly reported as unmapped domain tables; their raw records remain retained. Archive download routes resolve stored object keys and verify stored SHA-256, failing on unavailable/mismatched bytes rather than replacing originals. No migration or PDF source change was made by this export work.
