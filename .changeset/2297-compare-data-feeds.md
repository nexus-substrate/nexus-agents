---
'nexus-agents': minor
---

New MCP tool: `compare_data_feeds` — diff two YAML/JSON feeds along coverage and per-field axes (#2297, child of #2293).

Given two file paths to YAML or JSON feeds, returns a structured diff: which entries exist in A, B, both (membership diff), plus optional field-level diffs across matched entries. Use case: aegis-boot's catalog cross-checks against upstream feeds (e.g., netboot.xyz/endpoints.yml) to surface "what's new in A?" or "what fields differ between A and B for entries that exist in both?".

**v1 takes file paths only.** URL-fetch mode is deferred — fetching arbitrary user-supplied URLs needs an SSRF design pass. For now, users `curl` the remote feed to a local file and pass the path. Path traversal is guarded (must be within cwd subtree).

Tool count: 36 → 37. Auto-sync via `inject-governance.ts` propagated to all 7 surfaces.
