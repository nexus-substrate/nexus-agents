---
'nexus-agents': patch
---

fix(cli): label routing-audit's LinUCB box as a cold bandit (#5267)

`routing-audit-logic.ts` constructs `new LinUCBBandit(eligibleClis)` and does
**not** warm-start it. The production router does — `composite-router.ts:341-342`
calls `warmStartBandit()`, replaying persisted outcomes through a 30-day
lookback.

So the box rendered `pulls: 0` per arm plus `← explore`/`← exploit` verdicts and
UCB scores that are initialization constants, presented as the router's state.
`routing-audit` exists to show what the router would do, and showed something
the router would not do.

Same remedy, and the same two-line shape, as the budget filter's `[simulated]`
label one function up (#4843) — whose comment noted that `boxLine` pads to
`BOX_WIDTH - 2` and `padEnd` silently no-ops past it, so a long single line
pushes the right border off every row. The #4891 overflow regression test covers
the whole report, so the new label is checked for fit automatically.

This completes #5267's ratified disclosure half (option C, 6/6). Making either
surface reflect the router's *real* bandit state is #5275, which records why
"extract the warm-start" may be the wrong shape for it.
