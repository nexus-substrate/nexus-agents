---
'nexus-agents': patch
---

docs(cost): correct the cache-rate provenance comment to cite the live path (#5170)

`TokenRates`' doc comment named `config/models-dev-client.ts` as the module that
fetches `cache_read` from upstream. That module has **zero non-test importers**
(#5200) and never runs, so the sentence described a path that does not exist.

It caused a real error: a cost estimate on #5170 claimed the cache-pricing fix
was cheap "because the rate is already being fetched", which had to be retracted.

The live path is the generator. `scripts/build-model-registry-types.ts:49-50`
validates **both** `cache_read` and `cache_write` from models.dev, and
`build-model-registry-helpers.ts:192-198` drops them where `toPricing` maps only
input and output — so `model-registry.generated.json` carries neither. That also
corrects the earlier claim that upstream had no cache-write rate; it does.

Comment-only; no behaviour change.
