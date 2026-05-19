---
'nexus-agents': patch
---

**fix(mcp):** `execute_expert` timeout hint now reflects the client-side SDK abort, not the server-side budget.

The previous hint told callers to "omit `timeoutMs` to use auto-detected timeout (300-600s)" when the MCP client SDK timed out the request. That advice was misleading because the kill happens client-side (typically 60s SDK default), not at our configured server budget — so omitting `timeoutMs` has no effect on the outcome. The new hint reports the actual measured duration, names the underlying spec-compliance issue (most MCP clients don't honor server-side progress extensions), and gives two real workarounds plus a link to the tracking epic #2631.
