---
'nexus-agents': patch
---

Replace three blanket `eslint-disable max-lines` with enforceable ceilings (#6008)

`belief-memory.ts`, `run-graph-workflow-security-setup.ts` and `cli/index.ts`
each silenced the line cap outright, with no recorded reason. Measured by the
rule's own counting (blanks and comments skipped) they are 492, 458 and 451 —
all inside the 400-600 band `.rules/governance.md` preserves for a cohesive
file. None needed a blanket disable; they needed a ceiling.

`expert-config.ts` (475) is deliberately held back: it is one of the four
`GOVERNANCE_STAMP_SOURCES`, so editing it — even a comment — moves the
`_Governance Version:_` digest and forces a CLAUDE.md/AGENTS.md regeneration,
which turns a lint cleanup into a governor-path PR requiring ratification.
Filed separately rather than paying that toll here.

Each now carries `max-lines: ["error", { max: 600, ... }]` — the top of the
governance band — plus the measured size and why the file is cohesive. Growing
out of the band fails the build instead of a comment quietly aging, which is how
#5766 went unnoticed: a hand-maintained number drifted 426 -> 711 -> 715, and it
was a `wc -l` figure compared against a band the rule measures differently.

No behaviour change. The remaining seven files in #6008 are 60-329 lines PAST
the ceiling and each needs a decision rather than a bigger number, so they are
deliberately untouched.
