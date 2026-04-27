---
'nexus-agents': minor
---

**v2.57.0 — Multi-voter PR review, scope_steward role, model registry hardening**

This release ships Epic #2233 (multi-voter PR review) along with a new consensus role, several architectural improvements, and the model-registry pricing alignment from the weekly drift check.

### Multi-voter PR review (Epic #2233 — experimental)

A new `pr_review` MCP tool that wires the existing 5 consensus voters (architect, security, devex, catfish, scope_steward) to GitHub PR diffs. Each voter emits a typed `PRReview` with mandatory verification-gate output (matching the 4-point check from #2225 — re-read line, trace call path, name assertion, rule out language non-issue).

- Tool: `pr_review` ([#2236](https://github.com/williamzujkowski/nexus-agents/pull/2236)) — children 1+2 of the epic
- Verification gate enforcement in voter prompts ([#2238](https://github.com/williamzujkowski/nexus-agents/pull/2238))
- 10-PR seed dataset + batch harness + scorer ([#2243](https://github.com/williamzujkowski/nexus-agents/pull/2243))
- YAML findings format in voter system prompts ([#2248](https://github.com/williamzujkowski/nexus-agents/pull/2248))
- Hybrid dataset with synthetic diff-readable bugs ([#2249](https://github.com/williamzujkowski/nexus-agents/pull/2249))
- Soft-block aggregation tier on majority dissent ([#2251](https://github.com/williamzujkowski/nexus-agents/pull/2251))
- Voter `maxTokens` bumped 500 → 2000 to fit PR-review-sized findings ([#2253](https://github.com/williamzujkowski/nexus-agents/pull/2253))
- JSON-native findings — moved from lossy YAML-in-string to top-level JSON `findings` array ([#2254](https://github.com/williamzujkowski/nexus-agents/pull/2254))
- v5 promoted to live PRs (Child 6, opt-in) ([#2256](https://github.com/williamzujkowski/nexus-agents/pull/2256))
- Fail-fast when no model API key is configured ([#2257](https://github.com/williamzujkowski/nexus-agents/pull/2257))
- **Local-mode runner** `scripts/pr-review-local.ts` for subscription-plan auth — runs voters through the local Claude/Codex/Gemini CLI subprocess so subscription quota is consumed interactively (the intended use). The GitHub Actions workflow at `.github/workflows/pr-review.yml` is now dormant by default; flip the trigger to re-enable when a metered API key is available. See [`docs/guides/PR_REVIEW_LOCAL.md`](https://github.com/williamzujkowski/nexus-agents/blob/main/docs/guides/PR_REVIEW_LOCAL.md). ([#2261](https://github.com/williamzujkowski/nexus-agents/pull/2261))

Empirical validation (v5 retest): 100% bug-catch on diff-readable bugs in the synthetic dataset, 0% strict false-positive rate, and the v5 run caught a real bug ([#2255](https://github.com/williamzujkowski/nexus-agents/pull/2255)) that no human reviewer noticed.

`pr_review` is **experimental** — surface, output schema, and aggregation tiers may change as we collect data on live PRs.

### scope_steward consensus role ([#2228](https://github.com/williamzujkowski/nexus-agents/pull/2228))

Adds a 7th voter role focused on build-vs-buy gating: should we extend an existing tool/library or build something new? The role asks: does an existing tool already cover this? what's the maintenance cost of building? would adoption-pressure on the new code split the team's attention? Useful when the architect/AI-ML voters skew toward "let's build it" — scope_steward is the counter-pull.

### Verification gate for code-review subagents ([#2225](https://github.com/williamzujkowski/nexus-agents/pull/2225) → [#2226](https://github.com/williamzujkowski/nexus-agents/pull/2226))

A 2026-04-25 audit found that second-pass code-review subagents had a 100% false-positive rate on findings — every claim disqualified by reading 5 more lines or noticing a slice cap. The CLAUDE.md governance now enforces a 4-point gate on every discovered-issue finding before filing: (1) re-read line + 5 above + 5 below, (2) trace the call path, (3) name the failing assertion, (4) rule out language-level non-issues. Subagent prompts must surface which checks each finding passed; the parent agent verifies before filing.

### Audit-trail gap fix ([#2218](https://github.com/williamzujkowski/nexus-agents/pull/2218))

When an MCP tool handler throws, audit events are now emitted with the error context. Previously the throw bypassed the audit pipeline, leaving observability blind on the most actionable subset of tool runs.

### Security: ReDoS in base64 detection ([#2191](https://github.com/williamzujkowski/nexus-agents/pull/2191) → [#2216](https://github.com/williamzujkowski/nexus-agents/pull/2216))

Rewrote the `base64_encoded` injection pattern to eliminate catastrophic backtracking — the previous lookahead-plus-quantifier shape (`(?=X*Y)X{n,}`) was polynomial-time on adversarial inputs.

### Research source repair ([#2234](https://github.com/williamzujkowski/nexus-agents/pull/2234) → [#2235](https://github.com/williamzujkowski/nexus-agents/pull/2235), [#2255](https://github.com/williamzujkowski/nexus-agents/pull/2255))

Restored `research_discover` for GitHub (dropped the `OR` clause that returned 0 results — simpler query returns 359) and Semantic Scholar (added optional `SEMANTIC_SCHOLAR_API_KEY` env var, surfaced 401 → `RATE_LIMIT` for retry). The 429 rate-limit message now uses `GITHUB_TOKEN` (correct) instead of `GITHUB_API_KEY` (wrong) — caught by the pr_review devex voter and fixed before this release.

### Cloud provider setup guide ([#2229](https://github.com/williamzujkowski/nexus-agents/pull/2229) → [#2237](https://github.com/williamzujkowski/nexus-agents/pull/2237))

New `docs/guides/CLOUD_PROVIDER_SETUP.md` covering Bedrock, Vertex AI, and Azure OpenAI configuration paths.

### Model registry — pricing + context window alignment ([#2259](https://github.com/williamzujkowski/nexus-agents/issues/2259) → [#2262](https://github.com/williamzujkowski/nexus-agents/pull/2262))

Eight fields aligned to the litellm community catalog after the weekly drift check:

- `gemini-3-pro` / `gemini-pro` / `gemini-3-flash` / `gemini-flash`: contextWindow 1,000,000 → 1,048,576 (exact 2^20)
- `codex-5.3`: contextWindow 1,000,000 → 1,050,000
- `codex-5.2`: contextWindow 400,000 → 272,000, inputPer1M $2.00 → $1.75, outputPer1M $8.00 → $14.00

### Adapter parallel-registry consolidation (#2199, #2200)

Several adapters had their own private alias/model lookups that drifted from the canonical `model-capabilities.ts` registry. Migrated Claude/Gemini/OpenAI parallel registries to derive from the canonical registry's `aliases[]` field with longest-prefix-wins fallback. The model-string drift CI check is now blocking ([#2210](https://github.com/williamzujkowski/nexus-agents/pull/2210)) — registry inconsistencies fail the build instead of being advisory.

### CLAUDE.md governance reconciliation ([#2231](https://github.com/williamzujkowski/nexus-agents/pull/2231))

Vote-count drift (5→7 agents), phantom subagent types, and stale tool counts reconciled. The agent table now reflects the actual enum (Explore, Plan, general-purpose, claude-code-guide).

### Other fixes

- Backup user config before `--force` overwrite in CLI setup ([#2215](https://github.com/williamzujkowski/nexus-agents/pull/2215))
- Propagate `AbortSignal` in aorchestra worker dispatcher ([#2214](https://github.com/williamzujkowski/nexus-agents/pull/2214))
- `getAdapterForModel` longest-prefix-wins fallback ([#2209](https://github.com/williamzujkowski/nexus-agents/pull/2209))
- Capture fallback duration in `tryExpertFallback` ([#2196](https://github.com/williamzujkowski/nexus-agents/pull/2196))
- Defensive hardening: 3 fixes from code review ([#2193](https://github.com/williamzujkowski/nexus-agents/pull/2193))
- Pin `peter-evans/create-pull-request` to SHA (Scorecard MED) ([#2198](https://github.com/williamzujkowski/nexus-agents/pull/2198))
- Scope `registry-refresh` permissions to refresh job ([#2197](https://github.com/williamzujkowski/nexus-agents/pull/2197))
- Indexer cleanup: silent-empty extraction surfaces as warnings ([#2165](https://github.com/williamzujkowski/nexus-agents/pull/2165)), `extractOption` consolidation ([#2167](https://github.com/williamzujkowski/nexus-agents/pull/2167)), CLI commands single-source-of-truth ([#2173](https://github.com/williamzujkowski/nexus-agents/pull/2173))

No breaking changes.
