---
'nexus-agents': patch
---

Enforce owner ratification on governance-of-the-governor paths (#4635)

CODEOWNERS and CLAUDE.md both state that the governor's own paths — the audit
hash chain, governance source, drift machinery, `CLAUDE.md`/`AGENTS.md`,
`CODEOWNERS` — are never auto-merged. Nothing enforced it. `governor-review.yml`
checked whether a change was _reviewed_, which is a different question from
whether the owner _ratified_ it, and it warns rather than blocks.

Adds `scripts/check-governor-ratification.ts` and wires it as two jobs: a
pre-merge check, and a post-merge backstop on `main`. The backstop exists
because `gh pr merge --admin` bypasses required status checks, so a pre-merge
check alone cannot stop the merge it is meant to stop.

The gate's own machinery is now itself a governor path. A gate an agent can
weaken without tripping it is not a gate.

Four verdicts stay distinct — `not-applicable`, `ratified`, `unratified`,
`indeterminate`. "No governor path touched" must never render as "ratified", and
an unreadable CODEOWNERS must never render as "unratified" and blame the PR for
a broken gate.
