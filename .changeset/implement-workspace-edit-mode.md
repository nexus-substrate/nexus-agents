---
'nexus-agents': minor
---

The dev pipeline's implement ("code") expert now runs in a new `'workspace-edit'` access mode with no nexus-agents MCP tools. Its prompt derives from issue text, which may be untrusted. It may read files and edit files inside its working directory, but may not run commands, fetch from the network or load MCP servers. It used to inherit whatever the operator's own claude permission settings allowed, including `auto` mode.

`ExecutionAccessMode` gains `'workspace-edit'`. The claude adapter maps it to `--permission-mode acceptEdits --tools Read,Grep,Glob,Edit,Write --strict-mcp-config --disallowedTools Bash,NotebookEdit,WebFetch,WebSearch`. It refuses the mode when the task also asks to skip permissions or names an MCP config. Adapters declare the mode with a new `enforcesWorkspaceEdit` flag, separate from `enforcesReadOnlyAnalysis`, so enforcing one does not qualify an adapter for the other. The opencode, agy (gemini) and codex adapters do not declare it and refuse such a task. Direct-API and gateway arms declare it, since they send no tools. `CompositeRouter` routes a workspace-edit task only to declaring arms, and fails with a `CompositeRoutingError` at stage `access-mode` when none qualifies. As a result, the implement stage now runs only on the claude CLI or an API/gateway arm.

Orchestrate workers now run in `'read-only-analysis'` mode. Their output is consumed as text only.

The effective access mode of each call is now recorded. `executeExpert` results carry `accessMode`, which is `'default'` when none was requested. Dev-pipeline and orchestrate-worker outcome rows gain an `access-mode:<mode>` quality signal.
