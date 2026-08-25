---
'nexus-agents': patch
---

fix(mcp): surface securityRan and planStatus in the run_dev_pipeline response

#4774 added `securityRan` and `planStatus` to `DevPipelineResult` so a caller
could tell a failed planner from a successful one, and a security gate that
never ran from one that rejected. The MCP tool builds its response from an
explicit field list and did not include them, so neither reached any caller —
which is the one consumer that matters, since an agent loop reads the MCP
envelope, not the internal type.

Found by running `run_dev_pipeline --dryRun` against the published 4.1.1 build
and reading the actual response. The unit tests passed throughout: they asserted
the fields on the result object, not in the serialized envelope.

Both are spread conditionally, so absent still means "the producer predates the
distinction" rather than `false` / `'empty'`.
