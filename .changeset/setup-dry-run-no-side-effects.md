---
'nexus-agents': patch
---

`nexus-agents setup --dry-run` now has no side effects: it no longer registers MCP servers, creates data directories, edits `.gitignore` (including under `NEXUS_PORTABLE_MODE=1`), or probes gateways. It prints what it would do; the Validation step and Next Steps describe the preview instead of claiming configuration happened. Other commands' `--dry-run` flags are unaffected.

Startup behavior change: importing the package's modules no longer creates `~/.nexus-agents` or edits a repository `.gitignore` at import time (memory, model-manifest, generated-registry and audit paths are now resolved without those side effects). The data directory is created on first use — every CLI command except `setup --dry-run`, and the MCP server, still create it at startup.
