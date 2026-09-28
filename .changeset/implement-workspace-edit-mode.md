---
'nexus-agents': minor
---

The dev pipeline's implement ("code") expert now runs in a new `'workspace-edit'` access mode with no nexus-agents MCP tools. Its prompt derives from issue text, which may be untrusted. The expert may read files and edit files inside its working directory, but may not run commands, fetch from the network or load MCP servers. It used to inherit whatever the operator's own claude permission settings allowed, including `auto` mode.

**The working directory is the MCP server's current working directory**, normally the real repository: the implement stage passes no `workDir`. Workspace-edit stops the expert from running commands, but files it edits can still be executed by the pipeline. When `qualityGate` is `advisory` or `blocking`, the gate runs the package manager's typecheck, lint and test scripts in that directory, including any `package.json` script or test file the expert edited. In that case the pipeline result (`DevPipelineResult.warnings`, and `warnings` in the `run_dev_pipeline` output) now says so. The fix is running implement in a scratch worktree (#6794).

`ExecutionAccessMode` gains `'workspace-edit'`. The claude adapter maps it to `--permission-mode acceptEdits --tools Read,Grep,Glob,Edit,Write --strict-mcp-config --disallowedTools Bash,NotebookEdit,WebFetch,WebSearch`. It refuses the mode when the task also asks to skip permissions or names an MCP config. Verified live on claude 2.1.281:

- edits inside the working directory are applied;
- writes outside it are refused, whether by absolute path or through a symlink;
- edits to `.claude/settings.local.json` inside it are refused;
- Bash and WebSearch are not offered.

Adapters declare the mode with a new `enforcesWorkspaceEdit` flag, separate from `enforcesReadOnlyAnalysis`, so enforcing one does not qualify an adapter for the other. The opencode, agy (gemini) and codex adapters do not declare it and refuse such a task. Direct-API and gateway arms declare it, since they send no tools. `CompositeRouter` routes a workspace-edit task only to declaring arms, and fails with a `CompositeRoutingError` at stage `access-mode` when none qualifies. As a result, the implement stage now runs only on the claude CLI or an API/gateway arm.

When an API or gateway arm serves implement, nothing is applied to the workspace. The stage result is prefixed with a note saying so, and the outcome row carries `implement:text-only`. Tool calls claude's permission layer refused (its `permission_denials`) are now surfaced on `CliResponse.permissionDenials`, in the implement stage result and as `implement:permission-denials:<n>`.

Orchestrate workers now run in `'read-only-analysis'` mode. Their output is consumed as text only.

Access modes are now recorded:

- Adapters stamp the mode they enforced on the response (`CliResponse.accessMode`; API/gateway arms also set `textOnly`).
- `executeExpert` results carry the served arm's `accessMode`, the caller's `requestedAccessMode`, `textOnly` and `permissionDenials`.
- Dev-pipeline outcome rows record `access-mode:<mode>` when the served arm reported enforcement. Otherwise they record `access-mode-requested:<mode>`, for example on a failed call, never an enforced mode that no arm reported.
- Orchestrate-worker rows record `access-mode-requested:read-only-analysis`.
