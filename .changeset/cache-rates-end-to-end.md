---
'nexus-agents': minor
---

feat(pricing): carry cache read/write rates from upstream to the cost core (#5170)

Cached tokens were captured from adapters, persisted, and shown in every vote
summary — and could not be priced, because the pricing model was
`{ inputPer1M, outputPer1M }` with nowhere to put a cache rate. Under
`NEXUS_BILLING_MODE=api` a cache-heavy call was costed from its uncached input
alone.

Both upstream sources publish the rates and both were dropped at the same
mapping step: `scripts/build-model-registry-types.ts` validates models.dev's
`cache_read`/`cache_write` and LiteLLM's
`cache_read_input_token_cost`/`cache_creation_input_token_cost`, then
`toPricing` and `toPricingFromPerToken` mapped only input and output. They now
carry all four, `PricingSchema` and the generated-snapshot loader accept them,
and `learning/token-cost-core` already knew what to do with them.

**750 of 1,396 catalogue entries now carry a cache rate.** The rest publish none,
and that is handled honestly: an absent rate stays **absent**, never 0, so
`computeTokenCost` reports `unpricedComponents: ['cacheRead']` and
`complete: false` rather than pricing the component as free. Verified end to end
— `amazon.nova-lite-v1:0` prices complete; `claude-sonnet` reports the cache
component unpriced.

**Incidental catalogue refresh.** Regenerating the snapshot also absorbed
upstream drift, itemized so it is reviewable rather than hidden: 1,385 entries
changed only their `provenance.fetchedAt` timestamp; 102 `maxOutputTokens`, 44
`pricing`, 13 `contextWindow`, 2 `displayName` and 1 `deprecated` changed
genuinely upstream; 11 models added, 13 removed. `check-catalogue-drift` passes
with 0 defects and 1 pre-existing advisory.
