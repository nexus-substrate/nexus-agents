---
title: Alignment Roadmap
description: Strategic alignment with the north star goal and forward-looking improvement plan
tier: 2
keywords: [roadmap, alignment, phases, progress, milestones, north-star]
related_files: [CHANGELOG.md, architecture/README.md]
---

# Nexus-Agents Alignment Roadmap

**Goal:** Create the best software development agent swarm possible
**Assessment Date:** 2026-01-09 (ET) | **Last Updated:** 2026-03-17 (ET)
**Architecture Decision:** HYBRID APPROVED (5-0 unanimous)
**Current Version:** v2.28.0 | **Fitness Score:** 98/100 | **SWE-bench Lite:** 91.4% (32/35, +25.7pts from test-aware prompting + failure lessons)
**Historical Reviews:** [docs/archive/system-reviews-2026-01.md](./archive/system-reviews-2026-01.md)

---

## Score Progression

| Date       | Score   | Milestone                                                                      |
| ---------- | ------- | ------------------------------------------------------------------------------ |
| 2026-01-09 | 6.4/10  | Initial 5-agent consensus                                                      |
| 2026-01-13 | 7.28/10 | Observability + docs automation                                                |
| 2026-01-16 | 8.06/10 | v2.2.0 release, security complete                                              |
| 2026-01-23 | 7.78/10 | Skills loader, deeper review                                                   |
| 2026-03-04 | 8.0/10  | v2.26.1, feedback loops, research synthesis                                    |
| 2026-03-05 | 8.0/10  | Roadmap accuracy audit, reliability hardening                                  |
| 2026-03-17 | 8.5/10  | v2.28.0, SWE-bench 65.7%, symbol extraction, codebase search, Augment analysis |

**Trend:** Baseline 6.4 -> peak 8.06. Score fluctuations reflect increasingly rigorous review standards rather than capability regression.

---

## North Star Strengths

These capabilities form the foundation — confirmed by multiple consensus agents:

| Strength                     | Evidence                                                        |
| ---------------------------- | --------------------------------------------------------------- |
| Research-backed protocols    | 34/47 mapped techniques implemented, 13 partial                 |
| Multi-criteria model routing | TOPSIS + LinUCB bandit + KNN + preference + cascade + tolerance |
| Memory system diversity      | 8 backends + reflective MemR3 enhancement                       |
| Closed-loop learning         | Weather report, feedback integration, self-refinement           |
| Security posture             | 113 pentest tests, Docker sandbox, rate limiting                |
| Zero-credential architecture | OAuth 2.0/PKCE, SecretsVault, no stored creds                   |
| Strong type system           | Result<T,E>, Zod validation, strict TypeScript                  |
| Multi-CLI orchestration      | 4 CLIs (claude/gemini/codex/opencode), 3,806 observed tasks     |

---

## Current State (2026-03-05)

### System Metrics (as of 2026-03-05)

| Metric                       | Value                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| Version                      | v2.26.1                                                                                         |
| Fitness score                | 98/100                                                                                          |
| Test suite                   | 24,335 tests, 921 files                                                                         |
| Coverage                     | 89.66% statements, 93.26% functions                                                             |
| MCP tools                    | 25 registered                                                                                   |
| Research techniques (mapped) | 34 implemented, 13 partial (47 mapped techniques from 174+ papers)                              |
| Routing tasks observed       | 3,806 across 4 CLIs                                                                             |
| Overall success rate         | 73.9%                                                                                           |
| Expert types                 | 10 (code, architecture, security, testing, docs, devops, research, product, ux, infrastructure) |

### CLI Performance (live weather report, 2026-03-05)

| CLI      | Tasks | Success Rate | Best Category                        |
| -------- | ----- | ------------ | ------------------------------------ |
| Claude   | 2,664 | 71%          | Planning (92%), Code Review (84%)    |
| Gemini   | 365   | 85%          | Exploration (98%), Research (87%)    |
| Codex    | 618   | 86%          | Code Generation (91%), Testing (90%) |
| OpenCode | 63    | 27%          | Code Generation (38%)                |

### Adaptive Routing Insights

The system has learned optimal CLI-to-task mappings from 3,806 observations:

- **Code generation** -> Codex (91% success, n=350)
- **Planning** -> Claude (92% success, n=136)
- **Research** -> Gemini (87% success, n=38)
- **Testing** -> Codex (90% success, n=117)
- **Exploration** -> Gemini (98% success, n=143)
- **Documentation** -> Gemini (71% success, n=35)

---

## Phase Completion Summary

| Phase | Goal                     | Status   | Key Deliverable                                       |
| ----- | ------------------------ | -------- | ----------------------------------------------------- |
| 1     | Observability Foundation | COMPLETE | OrchestrationObserver, routing dashboard              |
| 2     | Learning Loop            | COMPLETE | OutcomeFeedbackCollector, CompositeRouter             |
| 3     | Dogfooding               | COMPLETE | Claude Code PR review, SICA test gen                  |
| 4     | Security Hardening       | COMPLETE | Docker sandbox, 113 pentest tests                     |
| 5     | Market Validation        | PARTIAL  | SWE-bench 65.7% (23/35), test-aware prompting         |
| 6     | Evidence-Based Hardening | ACTIVE   | Symbol extraction, codebase search, tool restrictions |

**Phase details and 8 historical system review transcripts:** [archive/system-reviews-2026-01.md](./archive/system-reviews-2026-01.md)

---

## Open Gaps

### Gap 1: No Production Benchmark Evidence (P1) — IN PROGRESS

**Impact:** 8/10 (reduced from 9/10) — Infrastructure ready, execution pending

The SWE-bench module has parallel execution (#1407), cross-run memory enrichment, partial git clones, and thread-safe JSONL output. **First evaluation published:** 65.7% resolution rate (23/35 on SWE-bench Lite). Test-aware prompting (FAIL_TO_PASS + test_patch in prompt) flipped django\_\_django-14534 from failed to resolved. Analysis of 12 unresolved instances shows 100% file targeting accuracy but incorrect patch logic — all failures are "right location, wrong fix."

**Completed:**

- Parallel runner with `--concurrency=N` workers and per-slot isolated work directories
- Cross-run memory enrichment (SessionMemory records outcomes, enriches future prompts)
- Git clone optimization (partial clones, skip-fetch for existing repos)
- CLI agent executor with Claude CLI OAuth authentication
- Instance priority sorting by estimated difficulty (repo complexity + problem length + memory data)
- CLI executor timeout optimized from 10min to 5min (median solve time is 2-4min)

**Required:** Execute SWE-bench Lite (300 instances), publish results, compare against leaderboard.

### Gap 2: Swarm-Level Observability (P2) — MOSTLY RESOLVED

**Impact:** 3/10 (reduced from 7/10) — Core observability complete, visualization is a stretch goal

**Resolved:**

- `nexus-agents health` CLI command implemented with per-CLI performance breakdown
- All 5 swarm health metrics measured (utilization, efficiency, accuracy, regret, adaptation speed)
- JSONL tracing infrastructure with `query_trace` MCP tool
- #1403 closed — all success criteria met

**New (2026-03-05):** Wave dispatch events (`wave.started`, `wave.completed`) emitted to pipeline EventBus and captured by TraceWriter (5986290e). Queryable via `query_trace` tool.

**Remaining (stretch):** Trace visualization UI for multi-wave dispatches, cross-session learning dashboard.

### Gap 3: OpenCode CLI Reliability (P2) — IN PROGRESS

**Impact:** 5/10 — Adapter fixes deployed, monitoring success rate

OpenCode has 63 observed tasks at 27% success. Fixes deployed (#1402): model alias resolution from canonical registry, plaintext fallback for non-JSON output, stderr diagnostic context in PARSE_ERROR, expanded error pattern detection (failed to connect, invalid api key, rate limit, quota exceeded, service unavailable).

**Required:** Monitor post-fix success rate. If still below 50%, investigate exit code handling, session management, and retry logic for transient errors.

### Gap 4: Security Review Accuracy (P2) — MITIGATED

**Impact:** 4/10 (reduced from 6/10) — Routing realigned, prompt improved

Claude's security_review success rate is 30% (107 observations). Multiple fixes deployed:

- Security expert prompt improved with concrete JSON example + plaintext fallback guidance
- Routing realigned: primaryCli changed from claude (30%) to codex (60%), bonus 15→7
- Failure classification now prioritizes message-based patterns (86+ keywords) over coarse error types

**Required:** Monitor post-fix security expert success rate. If codex data grows and confirms >50%, solidify as primary.

### Gap 5: Exploration Success Rate (P3) — MITIGATED

**Impact:** 3/10 (reduced from 5/10) — Fixes deployed, monitoring

Claude exploration success rate was 57% across 286 observations. Fixes deployed (#1405):

- Per-CLI timeout increased from 90s to 180s (aligned with centralized `PER_CLI_TASK_TIMEOUTS`)
- TOPSIS tolerance band (5%) added for routing diversity among quality-equivalent CLIs
- OpenCode added to CLI selection pool for exploration

Gemini remains the exploration champion (98% success, n=143). Claude exploration is trending "improving" per learning insights.

**Required:** Monitor post-fix Claude exploration rate. Target: >70%.

### Gap 6: Failure Classification (P2) — MITIGATED

**Impact:** 3/10 — 60.4% "unknown" failures (historical), expanded patterns deployed

Failure breakdown (historical): unknown 60.4%, execution 25.9%, timeout 12.9%, rate_limit 0.7%. Fixes deployed:

- Message-based classification with 100+ keyword patterns (was 86+)
- Added: SSL/TLS/proxy (→connection), ENOMEM (→crash), HTTP 5xx/bad gateway/service unavailable (→execution), max retries (→rate_limit), truncated/incomplete (→execution)
- Added broad catch-all execution patterns: error:, failed, failure, exception, not found, invalid, unable to, could not, unexpected, missing, unsupported
- Non-zero exit with error stderr now classified as EXECUTION_ERROR (#1402)

**Required:** Monitor next weather report for reduced unknown percentage. Target: <30%.

---

## Forward-Looking: Phase 6 Progress

**Tracking:** #1401 (epic), #1394 (research alignment), #1402 (OpenCode reliability)

Based on gap analysis, weather report data, and research alignment map (32 implemented, 14 partial of 46 mapped techniques):

### 6.1: Evidence-Based Validation (Target: 9.0/10) — NOT STARTED

- Execute SWE-bench Lite benchmark and publish results
- Create 3 demo workflows (PR review, code generation, security audit) with measured outcomes
- Establish automated regression benchmarking in CI

### 6.2: Swarm Intelligence Observability — MOSTLY COMPLETE

- [x] All 5 swarm health metrics computed in weather report (#1403 CLOSED)
- [x] `nexus-agents health` CLI with per-CLI performance breakdown
- [x] JSONL tracing infrastructure + `query_trace` MCP tool
- [x] Wave dispatch events (`wave.started`/`wave.completed`) in pipeline EventBus
- [ ] Trace visualization UI for multi-wave dispatches (stretch)
- [ ] Cross-session learning dashboard (stretch)

### 6.3: Reliability Hardening — IN PROGRESS

- [x] Exploration timeout aligned with centralized config: 90s -> 180s (#1405 CLOSED)
- [x] TOPSIS tolerance band (5%) for routing diversity (#1405)
- [x] Failure classification: message-based patterns prioritized (#1401)
- [x] Security expert prompt improved with example output (#1401)
- [x] OpenCode model alias resolution from canonical registry (#1402)
- [x] Expanded stderr error pattern detection for provider errors (#1402)
- [ ] Monitor OpenCode post-fix success rate (27% -> target 60%)
- [ ] Monitor security_review post-fix success rate (30% -> target 50%)
- [ ] Monitor exploration post-fix success rate (57% -> target 70%)
- [ ] Monitor unknown failure category reduction (60.4% -> target <30%)

### 6.4: Research-Driven Improvements — IN PROGRESS

The research alignment map tracks 47 techniques: 34 implemented, 13 partial. Recent promotions: moe-routing, rl-orchestrator, profile-memory, sater-routing, tolerance-routing, strmac-state-routing, action-memory, agreement-based-cascading, cross-attention-routing, knn-routing.

| Technique Area | Implemented | Partial | Priority |
| -------------- | ----------- | ------- | -------- |
| Routing (14)   | 13          | 1       | High     |
| Consensus (8)  | 5           | 3       | Medium   |
| Memory (10)    | 7           | 3       | Medium   |
| Orchestration  | 4           | 6       | High     |
| Learning (4)   | 4           | 0       | —        |

**Next promotion candidates:** incremental-quorum (deferred per #1408 vote — simpler "escalate on ambiguity" first), capability-instruction-tuning

**Assessment of 13 partial techniques:**

- **1 close to promotion** (1-2 day effort): incremental-quorum (voted to defer — see #1408)
- **6 substantial effort** (3-5 days each): capability-instruction-tuning, mem0-memory, graph-based-memory, aflow-mcts, temporal-scheduling, scaling-prediction
- **6 require novel algorithms** (5+ days): aegean-consensus, cp-wbft-consensus, history-encoding, model-coordination-theory, trinity-agents, self-evolution

---

## Composite Success Metrics

### Target Score Trajectory

| Phase         | Target  | Key Indicator          |
| ------------- | ------- | ---------------------- |
| Current       | ~8.0/10 | All infra phases done  |
| After Phase 6 | 9.0/10  | Market validated       |
| North Star    | 10/10   | Best-in-class evidence |

### Swarm Health Metrics (via `weather_report` tool)

| Metric                   | Definition                                    | Healthy Range | Current | Status  |
| ------------------------ | --------------------------------------------- | ------------- | ------- | ------- |
| Agent Utilization        | % of expert roles actively succeeding         | 70-90%        | 100%    | Healthy |
| Collaboration Efficiency | Successful / total delegate tasks             | > 0.1         | 70.8%   | Healthy |
| Routing Accuracy         | % routed to good CLIs (within 5% of best/cat) | > 50%         | TBD     | Fixed   |
| Weekly Regret            | Avg gap vs best-possible rate/category        | Decreasing    | 0.179   | OK      |
| Adaptation Speed         | Avg samples for best CLI/category to converge | < 50          | TBD     | Fixed   |

Note: Routing Accuracy and Adaptation Speed metrics were corrected on 2026-03-05. Previous values (25.4% accuracy, 249 adaptation) used flawed calculations — accuracy counted only single-best CLI (expected ~25% with 4 CLIs), adaptation averaged all pairs instead of best-per-category.

---

## Appendix: Original Voting Agent Reasoning

From the initial 5-agent consensus assessment (2026-01-09):

> **Architect (7/10):** "The architecture is sound for a multi-agent system. The gap is from 'multi-agent system' to 'swarm with emergent collective intelligence.' That's the difference between 7 and 10."
>
> **AI/ML (7/10):** "The swarm has excellent static decision-making infrastructure but cannot yet learn and improve from its own experience."
>
> **DevEx (6/10):** "The technology is impressive. The experience needs work."
>
> **Security (6/10):** "The security posture is thoughtful but incomplete. The most critical immediate action is sandboxing agent execution."
>
> **PM (6/10):** "The gap is not technical capability - it is market proof. The swarm must demonstrate it is best, not just claim best-in-class architecture."

**Key insight that still applies:** Technique coverage (72% implemented of 46 mapped) is strong but means nothing without user validation. The path from 8 to 10 is evidence, not architecture. The 13 partial techniques represent genuine algorithmic gaps (BFT consensus, MCTS search, learned encoding) — not missing wiring.

---

_Generated via CLAUDE.md Consensus Voting Protocol_
_Consolidation approved 3/3 (unanimous) on 2026-03-05_
_Historical system reviews archived to docs/archive/system-reviews-2026-01.md_
