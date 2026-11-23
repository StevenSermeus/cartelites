# Rebuild development and configuration

The stack remains pnpm/TypeScript, React/Vite, React Native/Expo/React Navigation, Hono/Zod, Convex, R2, Brevo and TCGDex. PDF implementations and their identity inputs remain preserved separately.

## Shop configuration

`shop.config.ts` owns versioned shop identity, currency, timezone, registration policy and complete semantic light/dark palettes. Legacy legal data is imported there from `branding/legal.ts` to preserve PDF identity. Do not put secrets in either file; deployment credentials remain server environment variables. Public output is an explicit allowlist of version, currency, timezone and branding, including configured public social links. Legal/private settings and registration policy are not serialized publicly.

Theme validation rejects invalid colors and unreadable foreground pairs during API configuration generation and web build. `packages/domain/src/shopTheme.ts` provides shared roles; action tint is separate from filled primary. Changing normal/alternate logo and tokens requires redeployment. Local logos must be PNG/JPEG/WebP under `branding/`; the API generator embeds only those allowlisted assets so mobile can fetch branding from its selected API instance. External HTTP(S) logo URLs are supported. Mobile clears active branding on instance switch and validates the new response.

API `shop:config` generates public/server-only modules and allowlisted logo data. Run it after configuration edits. API `dev` and `build` run it automatically. Registration `closed` rejects registration including initial bootstrap; temporarily configuring `open` is an explicit deployment choice, not an environment secret.

## Local checks

For the local browser at `http://localhost:5174`, keep all three services running in separate terminals:

```
pnpm dev:convex
pnpm dev:api
pnpm dev:web
```

Use the existing isolated local Convex configuration (`http://127.0.0.1:3210`), API port `3001`, `WEB_ORIGIN=http://localhost:5174`, and `COOKIE_SECURE=false`. Running Vite alone does not start the API or database. A stopped API can appear as a browser CORS/network error; check `http://localhost:3001/health` before changing origin permissions. Use `localhost` consistently for the browser, since `127.0.0.1` is a different origin. Do not replace the allowed origin with `*` for cookie authentication.

On 2026-11-23, restarting the local API and this checkout's anonymous Convex instance restored browser preflight and login requests. A deliberately invalid test login returned the expected `401 INVALID_CREDENTIALS` through the real local backend. That initial connection check was later followed by successful local QA login and real workflows; see the current acceptance ledger. The Convex CLI automatically updated its local backend binary from `precompiled-2026-11-16-80befbc` to `precompiled-2026-11-21-cf39368`; no package versions or production deployments changed.

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

The test command uses Node's tsx loader directly, avoiding the CLI IPC socket restriction encountered in the sandbox. It covers domain, Convex, API, mobile helpers and web regressions. Tests are not a substitute for real backend/native workflows.

Web additions use shadcn source components and Radix primitives, with Tailwind 3/PostCSS and supporting class utilities. Native-stack 7 is added for actual native pushed screens; no unrelated framework upgrades were requested. Keep web React 18 and mobile React 19 installations isolated as before.

## Backup preparation

Never commit raw exports, password hashes, customer records or original signed documents. Convert an export into a private directory outside the checkout:

```
python3 scripts/prepare-convex-backup.py /path/snapshot.zip /private/tmp/cartelites-reimport
node --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/scripts/migration/rehearse.ts /private/tmp/cartelites-reimport/export.json /private/tmp/cartelites-reimport/audit /path/copied-r2
```

Preparation validates ZIP integrity, table IDs and duplicates, records a source digest and creates private output files. Rehearsal is offline. Missing or mismatched originals fail the CLI; attachments without baseline hashes remain explicitly unverified. Follow backend-migration.md for normalized package commands and compatibility limits. User explicitly excluded cutover: do not deploy a schema, import production or switch traffic as part of this work.

## Runtime acceptance

The current rewritten web UI is available on localhost5174 with the retained isolated legacy development backend3001/3210. Canonical verification runs separately on127.0.0.1:5175 → API3002 → Convex3220/site3221. The final restore rehearsal uses an independent3224/site3225 database. Never reuse production deployment credentials for these targets. See `canonical-backend.md` for private environment setup and import commands.

Current iOS app `dev.wdee.cartelites.dev` uses a signed development build and current Metro bundle. Real login, acquisition, nested native Back, Activity and date picker checks have passed. Android SDK is unavailable on this host. The earlier installed release app does not verify this checkout.

If file watching fails with `EMFILE`, run the API without `--watch` and restart it after edits; do not silently keep an old process during acceptance tests.

## Market research configuration

Market research uses direct public retrieval inside the existing API process. GCC uses its structured public API; Vinted uses its public trading-card catalogue. eBay/Cardmarket HTML parsers use pinned Cheerio1.2.0. No paid credentials, proxy subscription, MCP server or scraper daemon is configured. Browser cookie requests require `X-Market-Research: 1` and the configured Origin or same-origin browser metadata; native bearer requests use the same authenticated route.

Current direct eBay/Cardmarket requests return403/challenge pages, which remain explicit source-unavailable states. See `market-prices.md` for live evidence versus parser-only coverage.

Use `feature-parity.md` for current implementation and acceptance gaps rather than historical wave counts. No production cutover is part of this work.

## Session and retry compatibility

The legacy and canonical targets now issue a custom `sessionJti` alongside JWT `jti`; direct Convex guards require the custom binding, account session version and non-revocation. Previously issued legacy sessions without it must sign in again after this update. Keep the API and Convex guard changes together.

`GET /auth/status` returns503 `AUTH_SERVICE_UNAVAILABLE` on temporary account-store failures, without clearing a valid session cookie. Clients must permit retry rather than treating this response as logout. Registration availability is read from auth status; a closed shop never offers account creation on mobile.

Ticket email status `unknown` means delivery could have been accepted. Retry/status checks preserve the original operation identity and recipient. Only a confirmed failure or definite pre-send validation failure permits an explicit fresh attempt. Provider acceptance is not proof of delivery. No actual Brevo email was sent in local acceptance.

Business calendar-day comparisons use `shop.config.ts` timezone through the shared explicit-timezone helper. Expiry clocks, stored instants and preserved PDF rendering semantics remain separate.

## Public operator identity and links

Set `shopConfig.branding.socialLinks` to the shop's own public destinations; use an empty array to hide them. Labels, optional Instagram/Facebook icons and HTTP(S) URLs are configurable. Executable URLs and embedded credentials are rejected at configuration loading. Public navigation uses the configured shop name in its accessible labels.

Web legal pages and contact/footer details consume `shopConfig.legal`, with an incomplete-information notice until the operator has reviewed and completed the required fields. The retained legacy PDF identity inputs are separate and were not changed by this fix; historical documents remain immutable. Never add server credentials to the versioned shop configuration.

## Account-bound recovery

Authenticated `/auth/status` includes the current `accountId`; unauthenticated responses do not. Browser requests bind `X-Expected-Account-ID` to the account that owns the current workspace. Middleware rejects a changed account with403 `ACCOUNT_MISMATCH` before processing the operation. This protects queued work when another tab changes cookies; it does not introduce tenant isolation into shared shop business records.

Uncertain financial submissions and pending photo files remain only in browser memory, separated by account. Signing in with another account remounts private forms and baskets; returning to the original account can recover its original operation identity. Closing/reloading the page still loses browser-memory financial/photo recovery, so unresolved operations must first be checked in history. No browser-persistent storage of passwords, tokens or customer drafts was added.

Sale-ticket email recovery additionally saves minimal intent metadata (account-keyed ticket, recipient, operation ID and outcome) in sessionStorage before POST. Sales and Documents share one outstanding intent. Reload conservatively restores uncertainty; each send/status action reads recent actual server delivery history before proceeding. A storage/history failure blocks a new send; an old accepted result cannot be presented as the outcome of a different failed preflight. Session storage does not survive every browser lifecycle; server history is explicitly limited to recent20 records, so this is not an exhaustive delivery ledger or delivery confirmation. Native email intents use account/instance-scoped private app storage. No PDF bytes are stored by these recovery mechanisms.


## Item activity and correction recovery

Authenticated stock detail combines existing lot data with `inventory:activity` / `GET /stock/:id/activity`. Activity is a disposable indexed projection, never a replacement for financial ledgers. After an isolated import, run the explicit loopback-only maintenance command in `item-activity.md` / `reimport-runbook.md`; preserve its checkpoint for resume. Do not expose admin credentials or run against an unidentified deployment. Unknown historical dates remain unknown; corrected acquisition display and immutable source timestamps have separate documented semantics.

Web and native correction recovery retains original request identity in account-bound memory. It distinguishes uncertain writes from confirmed writes whose follow-up read failed. Reload/process termination loses that memory; inspect actual history before a new operation. Consignment return preparation recovery never signs a return automatically.


## Transient realtime availability

`@tcg-marge/realtime` preserves mounted queries when credential loading temporarily fails. It discards the unauthenticated transport, reloads credentials and rebinds all current listeners with bounded backoff; explicit view retry can restart an exhausted temporary attempt. Reset, final unmount and account/instance generations cancel old callbacks and retries. Web/native loaders throw the shared typed `RealtimeAuthError` for401/403; these are not treated as ordinary network outages. Do not replace typed denial with arbitrary message matching.

The web preserves a verified workspace on temporary auth-status failures and offers an explicit retry banner. Only valid explicit signed-out responses or scoped session denial clear identity. Development HMR can reset local form state and is not a reliable financial concurrency harness: the real two-tab check held both original requests after UI validation and excluded the earlier interrupted attempt. Production artifacts and native process-termination recovery require separate acceptance.
