---
'nexus-agents': minor
---

teach `doctor` to notice when the global install has drifted from this build

`.mcp.json` runs the MCP server off the **globally installed** package, not the
working tree, and nothing keeps the two in step — the release workflow
publishes to npm, the global install is a separate manual `npm install -g`.
Drift accumulates silently, and every MCP call then executes code the operator
is not looking at. Measured twice on 2026-08-25 alone: eleven minor versions
behind in the morning, three more by the afternoon.

`doctor` now compares the two and reports one of three states. `unknown` is its
own state rather than folded into a pass: "no global install found" and "the
versions match" are different facts, and the second is not something a check
that could not measure is entitled to claim. `unknown` does not count as
healthy, because not knowing is exactly the condition that let the drift
accumulate.

The remediation says to update **and restart any running MCP server**. An
already-spawned server keeps the old code until it is restarted, so stopping at
`npm install -g` reports the problem resolved while the session continues on
the stale build.
