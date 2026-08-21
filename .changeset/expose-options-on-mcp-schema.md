---
'nexus-agents': patch
---

Expose `options` on the advertised `consensus_vote` MCP schema (#4472 follow-up).

#4494 added `options` to `ConsensusVoteInputSchema` — the schema the handler validates against — but **not** to `CONSENSUS_VOTE_TOOL_SCHEMA`, the schema advertised to MCP clients. MCP callers therefore could not pass `options` at all, so the multi-option threshold gate was unreachable through the tool that every caller actually uses. The internal capability shipped; the advertised capability did not.

The tool description also still carried the #4452 caveat asserting "the tally is approve/reject/abstain only", which became false for declared-option votes the moment #4494 landed — a description telling callers the opposite of what the tool now does.

Both are fixed, and a **drift contract** now pins the two schemas together: the advertised input schema must expose every field the handler accepts (excluding the documented async-dispatch internals `mode`/`idempotencyKey`) and must advertise nothing the handler would reject. Verified by removing `options` again — two of the three parity tests fail.

This is the same defect class the surrounding work has been clearing: a capability whose advertised surface does not match its real behaviour.
