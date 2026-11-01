---
'nexus-agents': patch
---

Pin `--full-index` in `CANONICAL_GIT_DIFF_ARGS` so canonical reviewed-diff hashes remain invariant across Git object-database sizes and host `core.abbrev` configurations (#7619).
