---
"nexus-agents": patch
---

docs: complete the ENTRYPOINTS MCP tools table (38 → 42, #3334)

The prose tool table in `docs/ENTRYPOINTS.md` was missing four registered tools
(`get_job_result`, `list_jobs`, `cancel_job`, `ci_health_check`); added them with
descriptions matching the README, so the human-facing enumeration now lists all
42. The stale machine-parseable YAML block (still 20/42) and a generator to
prevent future drift remain tracked in #3334.
