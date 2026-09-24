---
'nexus-agents': patch
---

Path containment hardening: MCP path guards are now realpath-aware, and `workingDir`/`logDir` are contained.

- The cwd-subtree guards on `compare_data_feeds`, `extract_symbols`, `search_usages`, `search_codebase`, `run_pipeline` (`specFile`), `run_dev_pipeline` (`planFile`) and the security scan target now share the `resolveInsideRoot` helper, which resolves symlinks on both the root and the target (and on the nearest existing ancestor of a path that does not exist yet). A symlink inside the working directory whose target lies outside it is now refused, and so is a dangling symlink, whose target does not exist yet.
- `run_dev_pipeline` rejects a `workingDir` that resolves neither inside the server's working directory nor inside the MCP client's declared workspace root (`roots/list`). It returns a `permission` error before any pipeline stage is created. An accepted `workingDir` is passed on as its canonical path.
- `verify_audit_chain` accepts a `logDir` only inside a directory that holds audit logs: the nexus data dir (`~/.nexus-agents`, `NEXUS_DATA_DIR`, or the sandbox root), a repo-local `.nexus-agents/` that resolves inside its own repo, or the configured `security.audit.logDir`. Any other directory returns a `permission` error. The default audit directory is still accepted.
