---
'nexus-agents': minor
---

Add the `run_quality_gate` MCP tool (#3356) — a callable QA capability that runs a local quality gate (typecheck / lint / tests / build / security) over a project directory and returns a structured pass/fail verdict with per-check details and actionable feedback. It's a thin wrapper over the existing-but-previously-unwired `runQualityGate` engine (#1684), reusing the in-tree check factories and `checkSecurityScan` — closing the gap where `run_dev_pipeline`/`run_pipeline` orchestrate and SARIF-scan but never run a local QA gate before declaring work done. Hardened: `projectDir` is validated via `resolveInsideRoot` (path-traversal rejected) and must be an existing directory; check names are a fixed allowlist mapped to fixed commands (no arbitrary shell); output is bounded. Ratified by consensus vote (higher_order, 7/7). Resolves #3346.
