---
'nexus-agents': patch
---

fix(cli): report no bandit features rather than five fabricated zeros (#5267)

`computeTopFeatures` filled an empty result with five entries from
`FEATURE_NAMES` at `importance: 0, direction: 'positive'`, so `--bandit-stats`
rendered **five green ↑ arrows over a bandit that had recorded nothing**. A
direction is an affirmative claim about which way a feature pushes; there is no
such claim to make over zero observations.

It also made `formatFeatureImportance`'s `features.length === 0` branch —
printing `No feature data available` — **unreachable**: a display path guarding
a case its own producer had already fabricated away. Returning the empty list
restores that branch, so the honest message can actually appear.

`FEATURE_NAMES` had no remaining use and is removed.

Three tests pinned the defect and are corrected. Two of them named it outright —
`sets default feature importance when no bandit stats` asserted
`topFeatures.length === 0 → 5` and `topFeatures[0].importance === 0`, i.e. the
fabrication was the specification.

The two surfaces #5267 originally reported — the green `✓ exploiting` verdict
and the cold-bandit routing audit — were already fixed by #5277 and #5291. This
is the residual on the same screen. #5275 remains open for the harder half:
making `routing-audit` reflect the router's live warm bandit rather than a
freshly constructed cold one.
