---
'nexus-agents': patch
---

fix(orchestration): persisted bandit records use the shared neutral, not zero (#5284)

`toBanditContext` wrote `budgetUtilization: 0` and `timePressure: 0` into
records that `hydrateShadowSelector` replays into a LinUCB bandit **in a later
process** — under a comment reading *"left neutral"*.

By this repo's own definition, neutral for these features is `0.5`, documented
in `composite-router-helpers.ts` for two reasons:

> Neutral rather than zero: **zero would read as "budget untouched" and is a
> claim**; 0.5 is the same value `warmStart` replays historical outcomes at.

and, sharper:

> two DIFFERENT constants across live paths let the bandit **use the value as a
> path indicator — accidental signal rather than none**.

A previous fix already unified divergent constants for exactly that reason. The
persisted path was a third constant it missed, so records written at `0` let the
bandit distinguish shadow-selector origin from live-router origin through the
budget feature alone — and they do not match the context `warmStart`
reconstructed the weights against.

`NEUTRAL_BANDIT_FEATURE` now lives beside `BanditContext` in
`budget-router-types.ts`, where every producer of that type can reach it. It was
previously module-private to the live path, which is how the persisted path came
to disagree with its own comment.

No public API change; the writer is gated behind `NEXUS_META_SHADOW_TRAIN=1`, so
this affects shadow training data rather than live routing.
