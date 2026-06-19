---
'nexus-agents': patch
---

fix(docs): correct 11 verified JSDoc/MCP-description accuracy findings from the #3519 Phase-2 semantic-accuracy audit

Make each doc/description/annotation match what the code actually does:

- delegate_to_model: drop the false "Read-only." claim (the handler records a routing decision to tool-memory on every call) and set `readOnlyHint: false` in the manifest with an explicit side-effect entry.
- model-registry module doc: rewrite the resolution chain to include the `manifest` and `generated` tiers in correct priority order; replace stale "lands in PR 4 / later PR" forward-refs (both shipped).
- consensus_vote: 7 roles by default / 3 with quickMode; document async mode (returns a jobId to poll via get_job_result).
- registry_import: document `dryRun` as a no-op echo — the tool never persists.
- repo_analyze: document `depth` as a no-op — the handler always runs the full analysis.
- research_add_source: remove the false GitHub `gh`-CLI auto-fetch claim; quality_score is computed from caller-provided quality_signals only.
- composite-router: scoring stages run sequentially (dependency-ordered), not in parallel.
- memory_write: belief predicate is fixed as `has_knowledge` (caller controls key + content only).
- research_catalog_review: note the optional GitHub-issue side-effect on approve.
- 4 pipeline tools (run_dev_pipeline, run_pipeline, run_workflow, run_graph_workflow): document the async dispatch capability.
