---
'nexus-agents': patch
---

chore: delete the unreachable models-dev client (#5200)

`config/models-dev-client.ts` had **zero non-test importers**. Every export —
`fetchModelsDevCatalog`, `findModelInCatalog`, `convertToPerMillion`,
`MODEL_ID_MAP`, `ModelsDevEntry`, `PricingDiff` — was unreachable from
production, and its only importer was its own test.

A naive grep hid this: `ModelsDevEntry` showed 36 references and `PricingDiff` 8.
They are **different types with the same names**.
`scripts/build-model-registry-types.ts` defines its own `ModelsDevEntry`, and
`scripts/sync-model-pricing.ts` defines a third one plus its own `fetchCatalog`
and `PricingDiff`, importing nothing from `config/`.

Not merely dead but actively misleading: reading it produced a wrong cost
estimate on #5170, where I claimed the cache-pricing fix was cheap "because the
rate is already being fetched". Nothing fetched it. The live path runs through
the generator, which is what #5202 actually changed.

Verified before deleting, per the lesson that an absent production consumer is
not proof a component is dead (#4958): zero non-test importers, no barrel
re-export, nothing in `api-surface.txt`, and orphan detection clean afterwards.

Two duplicate models.dev client implementations remain in `scripts/`; whether
`sync-model-pricing.ts` should reuse `build-model-registry-types.ts` is left to
#5200's follow-up rather than bundled here.
