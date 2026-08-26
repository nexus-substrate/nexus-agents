---
'nexus-agents': patch
---

make `run_workflow`'s idempotency key reachable, and stop hand-copied tool schemas drifting

`RunWorkflowInputSchema` declares `idempotencyKey` and the dispatcher reads it,
but the schema registered with MCP was a hand-written mirror that omitted it —
so the SDK stripped the field, every async dispatch minted a fresh jobId, and
the replay and collision envelopes could never fire. Registering the internal
shape fixes it and removes the second list.

This is the second instance in a week: `consensus_vote` omitted `mode` the same
way, killing its entire async path. Both mirrors had passing test suites. A new
test now scans every tool that calls `runAsJob` and refuses a registration that
is not derived from a schema's `.shape`, with the three remaining mirrors on an
allowlist that can only shrink — an entry must be removed once its tool is
converted, so the list cannot quietly become permission.
