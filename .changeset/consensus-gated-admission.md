---
'nexus-agents': patch
---

feat(capability-loop): consensus-gated admission replaces the human gate (#3653)

Implements the core of the ratified on-by-default posture: the auto-remediation
orchestrator no longer hard-skips security signals to a human — admission now
classifies priority (security always p0) and the consensus rigor is enforced
before any write:

- the security human-gate becomes a **p0 unanimous vote + mandatory dry-run**;
- each tier votes at its priority's algorithm (p1 supermajority, p2 higher_order,
  p3 simple_majority); a rejected vote leaves the signal as an open issue;
- p4 is file-only (never auto-remediated);
- the vote is observed in `audit` mode too (builds readiness soak data) but stops
  before IMPLEMENT; `enforce` proceeds only on approval.

New injected `AutoRemediationDeps.vote` (wraps consensus_vote with live voters)
and optional `dryRun` (required for p0, fail-closed if absent). Still off by
default; PR-only; runaway guard + atomic lease unchanged.
