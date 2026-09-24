---
'nexus-agents': minor
---

The dev pipeline's QA review now runs in read-only analysis mode with no nexus-agents MCP tools. The reviewer reads model-generated code that can come from issue text, so it may read files but may not run commands, edit files or fetch from the network. The implement, plan and decompose experts keep their MCP config and default access.

`executeExpert` takes a new optional `accessMode` option. Under `'read-only-analysis'` the expert gets no MCP config, and the routed CLI must enforce the mode. An unknown value, such as a misspelled `'read-only'`, throws a `TypeError` instead of running with default access and the MCP config.

`CompositeRouter` now honours a task's `accessMode`. A read-only task is routed only to arms that declare `enforcesReadOnlyAnalysis`. A high-confidence routing-memory pick that falls outside those arms is ignored in favour of the scored pick. When no arm qualifies, the route fails with a `CompositeRoutingError` at stage `access-mode` and nothing runs; the QA stage then records the review as unmeasured, not as a pass. Direct-API arms and gateway arms now declare enforcement, since they send no tools and run nothing on the host. A gateway arm that can also be served by a local CLI declares it only when that CLI enforces the mode too.
