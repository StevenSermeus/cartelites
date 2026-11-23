# Local password-reset acceptance

The medium auth implementation agent executed `apps/api/tests/passwordResetLocal.test.ts` against canonical Convex3220 and API3002. Production reset routes were imported in process so the exact Brevo send URL could be intercepted; login/status used the running HTTP API. The fetch guard denied any other non-loopback destination. No email was delivered and no real-provider request was made.

Verified: unknown-email generic response, replacement token invalidating the prior link, concurrent completion with one204 and one400, replay rejection, both earlier sessions revoked, original password rejected and replacement password accepted. Both backend test suites also cover exact expiry and disabled accounts. Independent review inspected the rehearsal boundary and ran backend regressions; the live rehearsal itself was implementation-agent evidence.

Explicit opt-in (creates a synthetic account only in the local canonical rehearsal):

```sh
RUN_LOCAL_AUTH_REHEARSAL=1 node --env-file=/tmp/cartelites-canonical-rehearsal/api.env --import ./apps/api/node_modules/tsx/dist/loader.mjs --test apps/api/tests/passwordResetLocal.test.ts
```

The test asserts the canonical model and exact loopback3220 before creating a fixture. Default combined tests skip it. Three synthetic `reset-qa-…@example.invalid` accounts remain from the implementation runs, including an initial test-harness URL-prefix failure; existing accounts and the closed registration policy were unchanged. This evidence does not cover real Brevo delivery or deployed ingress behavior.
