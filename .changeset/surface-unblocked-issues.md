---
'nexus-agents': patch
---

feat(ops): surface issues whose blockers have all closed

`CLAUDE.md` requires two halves of dependency tracking. The filing half works —
blocked issues genuinely record `blocked by #N` and an unblock trigger. The
surfacing half ("a finished dependency should surface its dependents") was a
rule addressed to whoever closes the blocker, with nothing behind it. #4440 sat
ten days after its blocker closed.

Measured before building, as #4617 required: of 136 open issues, **12 name a
blocker and all 12 have every blocker closed.** Not one stale instance — the
mechanism had never surfaced anything.

`scripts/check-unblocked.ts` parses the blocker forms the repo actually uses,
resolves each referenced issue's state, and reports the ones fully unblocked. A
daily workflow files the result as a single tracking issue, and closes it when
nothing is left to surface — a stale backlog report is worse than none, because
a reader cannot tell it from a current one.

Advisory throughout: it never fails a run and never blocks a merge. Failing CI
because somebody finished a dependency would be hostile.

Closes #4617.
