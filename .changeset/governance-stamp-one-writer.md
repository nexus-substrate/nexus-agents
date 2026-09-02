---
'nexus-agents': patch
---

fix(governance): give the version stamp one writer (#5218)

**This was breaking `main`.** `Script Tests`, `Governance Drift Check` and
`Docs Success` were red on `8b080482`, and both open PRs inherited the failure.

The stamp had two independent writers. `generateVersionSection` computes it
from `getGovernanceSourceDate()` into CLAUDE.md's own markers, while AGENTS.md
carried a hand-held copy **inside** the `AGNOSTIC:BODY` slice that
`injectClaudeAgnosticBlock` copies verbatim into CLAUDE.md. Same line, two
writers, no reconciliation.

Editing any of the five governance sources moves the computed date. CLAUDE.md
took the new one, AGENTS.md kept the old, and the #3446 staleness check then
reported the generated block stale — telling the author to "edit the agnostic
prose in AGENTS.md" when nothing about the prose was wrong.

Concretely: #5216 annotated `BUILT_IN_EXPERTS`, which moved
`expert-config.ts`'s commit date to 2026-09-01. CLAUDE.md advanced; AGENTS.md
stayed at 2026-08-30; `main` went red on the next run.

The injector now writes AGENTS.md's stamp from the **same computed value**, so
the two cannot disagree. That removes the drift at its source rather than
reconciling it afterwards. No feedback loop: AGENTS.md is not among the five
sources `getGovernanceSourceDate()` reads, so stamping it cannot move the stamp.

Two regression tests, both mutation-verified: one asserts the stamps in the two
files are equal after inject; the other plants an older stamp in AGENTS.md —
reproducing the exact state that broke main — and asserts the check passes
afterwards. Removing the new writer fails both.

Injection remains idempotent, verified by running it three times and comparing
diffs.
