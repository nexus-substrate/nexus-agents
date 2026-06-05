---
'nexus-agents': patch
---

test(routing): lock api:\* arm participation in tier stages (#3424)

Verify-before-implement found #3424 already resolved by the #3422 migration:
`filterByPreferenceTier` and `filterByDifficultyTier` collapse an `api:*` arm to
its display slot (`routingArmDisplaySlot`) for tier membership/ordering, so a
wrapped API arm inherits its vendor slot's tier and is never dropped. Adds
regression tests pinning that behavior (api:anthropic → strong/powerful as
claude; api:openai → weak as codex; arms preserved, not filtered out).
