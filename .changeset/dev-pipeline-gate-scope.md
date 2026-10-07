---
'nexus-agents': patch
---

`run_dev_pipeline`'s static-analysis (Semgrep) scan now covers every file the pipeline captures. Before, it scanned only the selected working directory while the captured patch could include files elsewhere in the repository. Both the pinned baseline and the scratch worktree are now scanned from their repository roots. The working directory still scopes implementation, quality checks and the dependency (OSV) check, which reads only that directory's `package.json`.
