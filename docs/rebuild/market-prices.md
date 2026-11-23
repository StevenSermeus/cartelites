# Integrated market research

User decision,23November2026: use open-source code/libraries inside the existing Hono/Node application. No paid data provider, separate scraper server, proxy subscription or catalogue mirror. The earlier Soldgraph implementation and environment keys were removed.

## Contract and safeguards

`packages/domain/src/marketPrices.ts` defines the public DTO. API configuration generation copies the same contract into its standalone TypeScript compilation boundary. `GET /api/v1/market-prices` requires a live staff session. Browser cookies additionally require `X-Market-Research: 1` with the configured Origin, or browser `Sec-Fetch-Site: same-origin`; bearer tokens support native clients. Public Convention does not expose staff market research.

Source, mode, query, page/cursor and exact Cardmarket product identity are explicit. Responses distinguish candidate products from actual seller listings, sold from active/unknown, asking price from current bid and accepted-offer prices whose final amount is unknown. Currency, shipping and protection fees are separate. No conversion or automatic acquisition valuation occurs. Structured language/grade/set/number evidence is compared independently; unknown evidence never becomes a confirmed match from a title guess.

The server caches validated public pages for at most five minutes, reuses concurrent requests, recalculates evidence per caller and limits external frequency. There are at most100cached pages by default, eight concurrent requests and30requests/minute/account. Transports bound time and response bytes, omit cookies/credentials, refuse redirects and recognize challenge pages. External errors become explicit unavailable/access-required states, never fabricated empty results. No remote HTML or scripts are evaluated.

## Direct sources

| Source | Integrated implementation | Evidence and limits |
|---|---|---|
| GCC | Public `api.gradedcardcenter.com/on-sale-items`, structured prices/grading/language, actual cursor | Sold and active pages1/2 each24results verified; actual browser→authenticatedAPI query succeeds. Sold prices are GCC-declared; payment settlement is not independently verified. |
| Vinted.fr | Public trading-card catalogue HTML/RSC parser in existingNode process | Category4875(single trading cards) observed in the live category tree; pages1/2 each96real listings parsed. Active only; fees separate; maximum10provider pages. No sold history or inferred grading/language. |
| eBay.fr / eBay.com | Cheerio parser for current and legacy public search pages, sold/completed query flags | Parser fixtures cover sold labels, current bids, accepted-offer uncertainty, ranges and currencies. Actual direct requests currently return403; successful live listings are NOT claimed. |
| Cardmarket | Cheerio public product search candidates then explicitly chosen exact product/article-row offers | Product minimum prices are never seller offers. Ambiguous versions require selection. Actual direct search/product requests currently return403/challenge; successful live offers are NOT claimed. |

`productUrl` is a fixed-host Cardmarket product identity, not a general request URL. The normalizer verifies the selected canonical product rather than silently choosing a similarly named card. Pagination exposes only verified provider continuation; first-page visibility is not a claim of all available offers.

## Open-source provenance and dependencies

- [googlarz/vinted-mcp-cli catalog parser](https://github.com/googlarz/vinted-mcp-cli/blob/main/src/client/catalog-html.ts), MIT: RSC extraction adapted directly; full notice in `apps/api/src/marketPrices/THIRD_PARTY_NOTICES.md`. No MCP server is started.
- [flipagent ebay-scraper package](https://github.com/flipagent/flipagent/tree/main/packages/ebay-scraper), MIT: public DOM layout examined. The hosted service and its paid transport are not used.
- [Cardmarket browser extension source](https://github.com/jordypereira/cardmarket-price-updater): public article-row selectors examined; no extension/account modification is integrated.
- Cheerio1.2.0(MIT), pinned API dependency for DOM parsing; Node>=20.18.1required, compatible with the existing Node24 development runtime. No unrelated version upgrades.
- [impit](https://github.com/apify/impit), Apache2: tested only in a temporary directory. It still received eBay/Cardmarket blocks and was NOT added to the application.

The external sites can change their pages or deny automated requests. Current refusal is an operational limitation, not a missing paid key. The app reports it explicitly. No account session, challenge-solving service or paid provider is silently substituted.

## Verification

Unit coverage includes exact minor units, RSC chunk boundaries, malformed/oversized/challenge responses, cached-error behavior, fixed URLs, credential omission, evidence cache separation, product identity, sold/active semantics and route/session/rate/origin checks. Actual populated GCC/Vinted checks and the blocked eBay/Cardmarket responses are separate from parser fixture coverage. UI panels preserve search identity/pagination and expose ordinary source links; web and iOS checks are recorded in their respective documents.

Final runtime checks: root used actual stock-detail UI on canonical5175/API3002 for Vinted96results/page1 and96different results/page2; keyboard Escape restored the row opener. Temporary isolated Chrome via Playwright was also tried for eBay.fr/eBay.com/Cardmarket; each remained403, browser closed, no Playwright dependency added to the repository. Direct library transport cannot honestly claim successful access from this environment.
