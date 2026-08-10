---
'nexus-agents': patch
---

fix(cost): fall back to catalogue list prices instead of reporting no price (#4406)

`calculateCost` read **only** the static in-tree matrix, so a model the registry
priced perfectly well came back unpriced — `calculateCost('gpt-4o', 1M, 1M)`
returned `undefined` while the models.dev tier held `2.5 / 10` for it the whole
time. Its sibling `computeCostDetail` already resolved through the registry, so
this was a second, narrower implementation of the same lookup.

A missing price is not free: cost ceilings are documented as fail-closed for
unpriced candidates, so an unpriced model is rejected for the wrong reason, and
historical spend cannot be costed at all.

Adds `PriceBasis` and `priceBasisCaveat` so a surface showing a cost can say what
it is: a **public list price**, not a rate verified against the operator's account.
There is deliberately no `'contract'` member — nexus-agents has no way for an
operator to state a negotiated rate, so claiming one would be a lie.

Also moves `CUSTOM_API_DEFAULT_MODEL` off `gpt-4o`, which is end-of-life at OpenAI
and was pointing new operators at a model their gateway may refuse.

One existing test asserted `undefined` for these ids on the reasoning that they are
"no longer supported". That conflated whether we can **price** a model with whether
we should **offer** it; lifecycle belongs in the `deprecated`/`replacedBy` fields,
which is tracked in #4408.
