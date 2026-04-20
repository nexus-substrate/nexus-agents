---
'nexus-agents': minor
---

feat(swe-bench): pre-flight research lookup for runAgentOnInstance (#1414 option 3)

Opt-in pre-flight research that appends top-3 relevant papers from
the in-repo research registry to the system prompt before the first
iteration runs.

- New module `swe-bench/preflight-research.ts`:
  - `findRelevantPapers(problemStatement, topN=3)` — scores every
    paper in `docs/research/registry/papers.yaml` against keywords
    extracted from the problem statement; returns top-N hits
  - `extractKeywords(text)` — simple heuristic: alphanumeric tokens
    ≥ 4 chars, stopwords filtered, deduped, capped at 15
  - `renderResearchContext(hits)` — compact markdown fragment ready
    to concatenate to the system prompt
  - `isPreflightResearchEnabled()` — reads `NEXUS_PREFLIGHT_RESEARCH=1`
    (default off)
- Wired into `runAgentOnInstance`: when enabled AND hits found,
  appends the research context block to the system prompt once before
  the iteration loop starts. No-op otherwise.

## Zero-cost design

- No LLM calls
- Registry is bundled with the package (loaded via
  `loadPapersRegistry()`)
- Pure in-memory keyword matching
- Off by default so cost-sensitive runs see no extra prompt size

11 new tests cover keyword extraction, env gate, paper scoring, and
rendering. 9 existing agent-runner tests pass unchanged.

Closes the last option from my #1414 resume-plan message. Remaining
work for the epic: Phase 5 PipelineRunner refactor (design call) +
Verified 500 sweep (#2035 cost-gated).
