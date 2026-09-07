---
'nexus-agents': patch
---

consensus: a supermajority can no longer be carried by too few voices (#5780)

Every strategy measures its threshold over `approve + reject`, and abstentions and errored seats leave that denominator with no floor under it. `ERROR_FLOOR_FRACTION` voids a panel only when errors **exceed** half, so one seat under it — 7 requested, 3 errored, 1 abstained — left three respondents and **2 approvals carried an architecture or security vote at 66.7%**.

`resolveVoteDecision` now requires two thirds of the requested panel to have decided, never fewer than three and never more than the panel itself: 7 → 5, quick 3 → 3. Below that the result is `no_quorum` — a statement about the panel, recoverable by re-running the missing seats — not `rejected`, which would be a verdict the panel never reached.

Two deliberate limits. It guards an **approval** only, mirroring the asymmetry `absolute_quorum` already encodes: too few voices *carrying* a decision is the harm; too few *blocking* one is the safe direction. And it runs after `absolute_quorum` so that policy keeps its own more specific degrade reason — the two are not redundant, since absolute_quorum subsumes the floor at `supermajority` but not at `majority`.

Remedy chosen by a live 7-voter panel (option 1, 5/5 on the option tally).
