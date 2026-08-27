---
'nexus-agents': patch
---

fix(routing): the bandit's dead timePressure feature no longer disagrees with itself

Nothing in the tree computes a time-pressure signal, so `BanditContext.timePressure`
is a constant and its LinUCB coefficient is meaningless. That is known and
documented (#4875), and inventing a producer is a design question rather than a
wiring fix — so it stays constant.

What was wrong is that it was **three** constants across five sites.
`composite-router-helpers` and `task-profile-adapter` emitted `0.3`, while
`LinUCBStage` — the other live builder feeding the same bandit — and the
`warmStart`/`seedPriors` replay both used `0.5`.

A constant feature carries no information. Two _different_ constants across live
paths is worse than that: the value becomes learnable as a path indicator, so
the bandit can fit accidental signal against a dimension nobody measures. All
builders now use the neutral `0.5` the replay paths already assume, and a test
pins that they cannot drift apart again.

Two existing tests asserted the `0.3` as intended behaviour; both are updated
with the reason rather than renumbered silently.

`api-surface.txt` is regenerated for a formatting-only change: prettier collapsed
the multi-line `ExpertTaskDomain` union onto one line when it reformatted the
file this touches. Same seven members, different wrapping — no type change.
