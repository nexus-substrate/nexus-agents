---
'nexus-agents': patch
---

fix(governance): stop reporting the reverted tool-fitness writer's residue as current tool health (#5162)

The tool-fitness ledger's only production writer landed as #4723 and was
reverted the same day by #4731 (unbounded per-call rewrite cost at the 50k cap;
no workspace identifier, which made the #3902 per-workspace suppression
unreachable). The revert removed the code but not the ~470 records already
written, and `improvement_review` went on turning that residue into confident
deprecation verdicts for five days — 24 of 30 live signals named test fixtures
(`throw_tool`, `null_args_tool`) that the dead writer had recorded while a test
suite ran, and every signal reported `Workspaces observed: (unattributed)`,
the revert's own defect 2 still on display.

With no producer, any ledger content is residue by definition, so the family now
returns an explicit `unmeasured` signal naming #4656 instead of computing
percentages. Ledger names are also screened against the tool manifest at the I/O
boundary, so a verdict about a tool the server does not register can never reach
the remediation or issue-filing chain. Live output goes from 30 signals to 1.

A staleness guard was considered and rejected on measurement: the residue is 5
days old against a 14-day default lookback, so a "newest record older than the
window" check would not have fired on the incident that motivated it. That guard
belongs on a producer that can actually go quiet, and is recorded in #4656.

`TOOL_FITNESS_PRODUCER_WIRED` is the single flip #4656 must make, together with
a test proving live data flows again.
