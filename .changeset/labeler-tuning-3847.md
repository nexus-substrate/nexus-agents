---
'nexus-agents': patch
---

fix(eval): generalize pr_review labeler bug-signal beyond path-prefix (#3847)

The pr_review case-curation labeler (`scripts/curate-pr-review-labeling.ts`) was
systematically too conservative: it gated `buggy` off a narrow correctness-domain
PATH-PREFIX allowlist, so real bug-corrections that touched files outside those
prefixes (a CI gate that did not read its doc, a router split-brain, a silently
dropped cost record) were mislabeled `borderline`.

The signal that distinguishes a real bug-correction from a mere refinement is the
NATURE of the corrective change, not its path. The labeler now classifies the
referenced follow-up's KIND from objective fields it already has — the corrective
PR's conventional-commit type prefix (`fix(` vs `refactor(`/`feat(`/`perf(`) plus
keyword signals in its title:

- defect-fix (adds a guard/fail-loud/error-handling for a silent failure, makes a
  cosmetic gate actually resolve/validate, corrects a split-brain/tie-break, or is
  a `revert`) → `buggy`;
- refinement (refines heuristics / tunes thresholds / no-behavior-change hardening
  / quality) → `clean`;
- a bare `fix(` with neither marker → `borderline` (Rule 4), never guessed.

Severity stays at the `medium` floor (Rule 5.1) and escalates to `high` only on a
clear integrity-domain signal (governance/CI gate, router split-brain, auth/
security), never auto-`critical`. The path is now a severity escalator, not the
bug gate. No PR numbers are encoded in the logic; the 5 adjudicated pilot cases
are added as held-out regression tests.
