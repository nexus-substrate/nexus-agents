---
'nexus-agents': patch
---

Finish migrating path guards to the realpath-aware `resolveInsideRoot` helper.

- These containment checks now follow symlinks, so a symlink inside the allowed root whose target lies outside it is refused, and an accepted path is used in its canonical form: the `ast-rule-runner` scan directory, `query_trace` trace files (a run directory that resolves outside the runs directory returns no events), `run_workflow` template paths, the `workflow run --input` file, `NEXUS_CONFIG_PATH` for custom experts, `config` import/export file paths, the PolicyFirewall `isPathSafe` allowlist check, and the sandbox executor's working-directory policy. The sandbox resolves the working directory once, during policy evaluation, and runs the command in that canonical directory with `PWD` set to it.
- `run_workflow` also accepts template paths inside the MCP client's declared workspace root when no `security.allowedPaths` is configured, so a globally installed server whose working directory is outside the user's repo can load templates from that repo. An explicit `allowedPaths` list is not widened.
- `resolveInsideRoot` canonicalizes a root that does not exist yet through its nearest existing ancestor, so a child of a not-yet-created directory under a symlinked ancestor is no longer reported as outside it.
