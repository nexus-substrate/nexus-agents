---
'nexus-agents': patch
---

docs(capability-loop): reconcile stale '#3669 not landed / fail-closed stub' comments in the auto-remediation deps/cycle/CLI headers (#3768). The Option B proposal-PR implement adapter landed (#3669) and is wired in `buildAutoRemediationDeps`; the comments now state the real enforce-gating: the cycle entry point deliberately withholds `repoRoot`, so `implement` stays a fail-closed rejecting stub and enforce is structurally unreachable until #3769 Step 2 threads operator-supplied repoRoot (gated on a passing readiness verdict + the #3770 provenance re-audit). Comment-only; no behavior change.
