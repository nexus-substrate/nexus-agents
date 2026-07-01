---
'nexus-agents': patch
---

Fix a fail-open in the dev-pipeline vote stage (#4143, epic #4130). When the consensus vote
stage threw (all voters errored, adapter down, timeout), `agent-executor` caught it and
returned `{ kind: 'approved' }` ("Error (auto-approved)") — executing an unvoted plan as if
the panel had approved it. It now FAILS CLOSED to `no_quorum` (a recoverable "vote couldn't
complete — re-run/escalate" state, handled by #4135), never auto-approving. Consistent with
the fail-loud principle behind the voter-drop epic: an errored gate must block, not grant,
execution.
