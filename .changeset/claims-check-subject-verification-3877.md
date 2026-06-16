---
'nexus-agents': patch
---

fix(governance): make claims:check verify the subject doc, not just source (#3877, #3878, #3879, #3882)

The merged `claims:check` gate (#3873) only verified each claim's source-of-truth
`verification.path` and never read the `subject` doc making the claim, so a README
that drifted (e.g. "200 MCP tools" while source has 46) stayed green.

- #3877: the runner now ALSO checks the claim's `subject` doc via a new
  `verification.subjectContains` literal — README/ARCHITECTURE drift now fails the
  gate. Regression test reproduces doc-drift → failure.
- #3878: the `claims-check` CI `paths:` filter now includes README.md and
  ARCHITECTURE.md (the `subject` of every current claim) so the gate fires on the
  exact edits it polices.
- #3879: `file-contains` strips comments before matching (a commented-out symbol
  no longer "verifies"); new `source-contains-all` method requires all needles in
  real code; `closed-loop-routing` re-pointed from `file-exists` on a directory to
  `source-contains-all: LinUCB,Topsis` on the real router.
- #3882: `hash-chained-audit` downgraded verified→partial; "immutable" removed in
  favor of "tamper-evident" with a caveat linking the audit hash-chain threat
  model. README "immutable" prose softened to match.
