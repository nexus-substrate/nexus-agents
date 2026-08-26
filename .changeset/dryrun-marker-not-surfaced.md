---
'nexus-agents': patch
---

fix(pipeline): surface the dryRun marker on the run_dev_pipeline envelope

`buildStructuredOutput` builds the MCP response from an explicit field list.
#4772 added `securityRan` and `planStatus` to `DevPipelineResult`, omitted them
here, and had to be fixed — leaving a comment that says exactly why: "They were
added to DevPipelineResult and then not listed here, so they never reached the
MCP surface."

#4993 then added `dryRun` to the same type, for the same reason (it says
`completed: false` was the request, not a fault), and did not list it here
either. A live `run_dev_pipeline({ dryRun: true })` came back with no field
distinguishing a successful dry run from a failed pipeline.
