---
'nexus-agents': patch
---

feat(capability-loop): atomic single-flight lease for auto-remediation (#3648)

The #3618 capstone vote's one hard concurrency requirement, implemented:
`makeGitRefLeaseAcquirer` acquires the auto-remediation lease via an ATOMIC
GitHub git-refs create (`POST .../git/refs`, 422 if it already exists) — the
create IS the acquisition, so there is no TOCTOU check-then-act window and
exactly one of two concurrent CI runners wins. Fail-closed: 422 OR any transport
error → null (not acquired) → the orchestrator aborts rather than risk a
double-run. Release deletes the ref (best-effort; stale-lock cleanup is #3646).
The `gh` exec is injected, so it's fully unit-tested without network. Part of the
#3648 enforce-path wiring; consumed by the entry point still to land.
