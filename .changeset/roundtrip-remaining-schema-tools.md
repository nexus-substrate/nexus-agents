---
'nexus-agents': patch
---

test(mcp): cover the three schema-declaring tools the round-trip suite could not reach

`consensus_vote`, `delegate_to_model`, and `list_workflows` declare an
`outputSchema` and are registered on the production server, but were absent from
the test server the round-trip suite builds. A response-field addition to any of
them would have broken every call with `-32602` and left CI green — the exact
regression #5045 exists to prevent, in the three tools it could not see.

Also widens the failure filter: an earlier version counted a call as violating
only if the thrown message contained `output schema` or `-32602`, silently
crediting the tool for a timeout or transport fault. Any protocol-level throw
now fails the suite.

Fixes a latent bug in the test's own workflow-engine stub along the way.
`IWorkflowEngine.listTemplates` is declared as `Promise<WorkflowTemplate[]>`, but
the stub returned `{ ok, value }`; nothing called it until `list_workflows` did,
and it crashed on `templates.map`.

Refs #5045.
