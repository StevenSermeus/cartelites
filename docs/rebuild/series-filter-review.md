# Independent series feature review

Reviewed 2026-11-23 in the shared dirty working tree. No source changes made.

## Findings

No actionable severity/file findings identified in the current series feature changes. This conclusion is limited to code inspection, focused executable tests and typechecks; it is not browser/device acceptance or production approval.

## Scope and observations

- Inspected the domain series helper, API catalogue and paginated routes, both Convex read models and operations, rebuild public catalogue, the named web/mobile controls and editor integrations, and relevant filter styles. Read the supplied AGENTS instructions and searched for on-disk applicable AGENTS.md files (none found). Git origin is StevenSermeus/cartelites, so the PurePoker-only workflow does not apply.
- Exact normalized matching preserves accents/case tolerance and groups Riftbound printing suffixes without changing stored product text. Legacy missing-game card records resolve to Pokémon. Series filters accept 300 characters in API/backend reads.
- Staff series reads authenticate before querying. Historical completion uses includeUnavailable=true and includes sold/zero-stock labels. Public query validators expose no such flag; public facets derive from the eligible public candidate set, before user filters/pagination, and scope by game. The HTTP catalogue route forwards only its explicit validated fields.
- Stock/sales query keys include game and series; changing them starts at the first cursor. Staff cursor signatures bind these filters. Public Convention resets pagination and disposes old subscriptions on criteria changes. Game changes clear the selected series.
- Web options hide results from a previous game immediately through keyed state; account workspace keys and realtime reset isolate account changes. Mobile subscriptions guard disposal and account scope; the hook also invalidates visible labels with a session revision. Suggestions remain optional: web uses an editable datalist and mobile changes text only when typed or a suggestion is selected.
- Existing staff pagination filters bounded raw pages, so filtered pages can be sparse; this is existing infrastructure, not reported as a new series defect. No unrelated rewrite limitations are included as findings.

## Checks executed

Passed **20/20 tests**, zero failures/skips:

```sh
node --import ./apps/api/node_modules/tsx/dist/loader.mjs --test packages/domain/tests/seriesFilter.test.ts convex/tests/seriesFilters.test.ts apps/mobile/tests/stockSeries.test.ts convex/tests/publicCatalogue.test.ts convex/rebuild/tests/publicCatalogueCapacity.test.ts convex/tests/readModels.test.ts
```

Coverage includes both backend models with Riftbound fixtures, exact series matching, game scoping, historical labels, anonymous rejection, hidden/sold/zero/pending-source exclusion from public facets, pagination across grouped variants, cursor rejection on changed game/series, the 300/301-character boundary, stale mobile success/error callbacks, and delayed subscription disposal. Public catalogue regression/capacity tests also passed.

Passed typechecks for all five affected applications/backends:

```sh
pnpm --filter @tcg-marge/web --filter @tcg-marge/mobile --filter @tcg-marge/backend --filter @tcg-marge/canonical-backend --filter @tcg-marge/api typecheck
```

No browser, device, external network, deployment or cutover operations performed. The root's real-3220 local fixture result was not independently rerun or counted as review evidence. No claim of interactive UI validation is made.
