---
'nexus-agents': patch
---

fix(config): a failed model probe no longer overwrites a good catalog with an empty one

`AvailableModelsCache.fetchSource` has always had the right handling for a
failed probe — keep the stale value, do not restamp `fetchedAt`. It never ran.
Both real sources caught their own failures and returned `[]`, which the cache
reads as a **successful empty probe**: the good catalog was discarded and the
empty one marked fresh for the whole TTL, with the stale-refresh path
re-poisoning it on the next tick. No warning was ever logged.

The fail-open behaviour moves up one level, to the cache, which is the layer
that can tell a failed probe from an empty one:

- `createOpenRouterModelsSource().listModels()` now rejects on network, timeout,
  non-OK status, and byte-cap refusal. `fetchOpenRouterCatalog` keeps the
  documented fail-open contract the #4121 drift job depends on.
- The adapter wrapper in `register-model-sources` lets its probe failure
  propagate. One bad source still cannot poison the union — that isolation is
  the cache's, one level up.

Knock-on: `list_available_models` can now answer `ok: false`. Its handling was
already correct and already tested against a rejecting source; nothing could
make a real source reject, so `ok` was `true` for a dead transport reporting
zero models.

Closes #5059. Addresses the `list_available_models` half of #5060; the `demo`
half is separate and stays open.
