---
'nexus-agents': patch
---

fix(consensus): report the vote threshold that was applied, not the one requested

`consensus_vote`'s response echoed the caller's `threshold` verbatim. But
`resolveStrategy` ignores `threshold` entirely when `strategy` is also supplied
(`if (input.strategy !== undefined) return input.strategy;`), and
`VOTING_THRESHOLDS.higher_order` is `0.5` — a simple-majority bar.

So a caller passing `strategy: 'higher_order'` with `threshold: 'supermajority'`
received a record naming supermajority beside an approval percentage that never
had to clear it. Observed on a live governance ratification vote: 4 approve / 3
reject returned `decision: 'approved'`, `approvalPercentage: 57.1`,
`threshold: 'supermajority'`. Supermajority is 5/7.

That pairing is the documented usage — the governance table in `CLAUDE.md` lists
a threshold and a strategy per trigger ("Architecture changes | supermajority |
higher_order") — so the combination that silently drops the bar is the one the
rules prescribe.

`response.threshold` now names the bar the engine actually enforced, derived
from `VOTING_THRESHOLDS` rather than a second hand-written mapping so it cannot
drift from the value the engine compares against. The field is now always
present; previously it was absent unless a `threshold` was passed.

Callers wanting a stricter bar should pass it as the **strategy**
(`strategy: 'unanimous'` / `'supermajority'`); a `threshold` argument alongside
a `strategy` is still ignored, and is now visibly so.
