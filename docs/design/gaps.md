# Gaps Analysis: Intended vs Actual

_Honest assessment of what's documented/claimed versus what actually exists and works._

_Generated: 2026-02-08 (Updated: 2026-02-08 — Epic #926 resolutions)_

---

## Truth Table

| Feature                            | Documented? | Implemented? |        Tested?         | Notes                           |
| ---------------------------------- | :---------: | :----------: | :--------------------: | ------------------------------- |
| MCP server (stdio)                 |     Yes     |     Yes      |          Yes           | 21 tools, all wired             |
| CLI (36 commands)                  |     Yes     |     Yes      |          Yes           | Gap #1 resolved (Epic #931)     |
| Mesh mode                          |     Yes     |    **No**    | Tests verify rejection | Gap #2 resolved (Epic #931)     |
| Model routing pipeline             |     Yes     |     Yes      |          Yes           | 5-stage composite router        |
| Consensus voting (6 strategies)    |     Yes     |     Yes      |          Yes           | Real multi-CLI votes            |
| Graph workflows (7 templates)      |     Yes     |     Yes      |          Yes           | Checkpointing works             |
| AI Software Factory                |     Yes     |     Yes      |          Yes           | Full 6-stage pipeline           |
| Security pipeline (8 modules)      |     Yes     |     Yes      |          Yes           | All wired, firewall composition |
| Expert agents (9 roles)            |     Yes     |     Yes      |          Yes           | Including pm/ux                 |
| Task analysis (SharedTaskAnalyzer) |     Yes     |     Yes      |          Yes           | ADR-0004 consolidation          |
| Gateway middleware                 |     Yes     |     Yes      |          Yes           | Gap #7 resolved (Epic #926)     |
| Outcome tracking                   |     Yes     |     Yes      |          Yes           | Bounded store, FIFO eviction    |
| Weather report                     |     Yes     |     Yes      |          Yes           | Per-CLI success rates           |
| Learning/feedback loop             |     Yes     |     Yes      |          Yes           | Gap #3 resolved (Epic #926)     |
| TUI/REPL                           |     Yes     |     Yes      |          Yes           | All phases complete (gap #4)    |
| SWE-bench integration              |     Yes     |     Yes      |          Yes           | 92 files                        |
| REST API                           |     Yes     |   Partial    |        Partial         | See gap #5                      |
| Direct API adapters                |     Yes     |     Yes      |          Yes           | Claude, OpenAI, Ollama, Gemini  |
| Context load balancing             |     Yes     |     Yes      |          Yes           | Multi-CLI routing               |
| Research registry                  |     Yes     |     Yes      |          Yes           | arXiv, GitHub, multi-source     |

---

## Gap Details

### Gap #1: CLI Command Coverage — RESOLVED

**Previous claim:** 45 commands in documentation, 31 in validCommands.

**Actual state:** 36 commands in `CliCommand` type (cli-types.ts). All 36 have dispatch handlers in cli-commands.ts (12 sync + 24 async). No orphaned or stale commands found.

**Resolution (Epic #931, Phase 2, Issue #933):**

- Audit confirmed all 36 commands have working handlers
- `demo` and `memory-benchmark` are active features (not stale)
- Documentation updated to reflect actual count of 36
- as-is.md corrected from 31 to 36

---

### Gap #2: Mesh Mode — RESOLVED

**Claimed:** Help text and auto-detection defaulted to mesh mode for interactive terminals.

**Previous state:** Mode detector auto-detected TTY → `'mesh'`, which was immediately rejected at runtime by `validateModeOrExit()`. Users running interactively hit a confusing error.

**Resolution (Epic #931, Phase 1, Issue #932):**

- Auto-detection changed: interactive TTY now defaults to `'orchestrator'` (which IS implemented)
- Help text already omitted mesh (verified)
- CLAUDE.md already omitted mesh (verified)
- `--mode=mesh` explicit flag still accepted by parser but rejected at runtime with clear error message
- `ServerMode` type retains `'mesh'` for forward-compatibility
- 7 tests updated to reflect new default behavior

---

### Gap #3: Learning/Feedback Loop — RESOLVED

**Claimed:** Outcome feedback, reward computation, A/B testing, and closed-loop learning are documented.

**Previous state:** The feedback loop was not wired end-to-end. LinUCB bandit received binary 1/0 rewards without quality data.

**Resolution (Epic #926, Phase 3, Issue #929):**

- `computeQualityReward()` replaces binary rewards with continuous 0.1-0.8 rewards incorporating OutcomeStore historical success rate and latency penalty
- `CompositeRouter.autoRecordFeedback()` now calls `computeQualityReward()` for quality-enriched LinUCB updates
- PolicyEvaluator wired into V2 pipeline execution (Issue #927)
- Governance-enforcer wired into delegate routing output and outcome recording (Issue #928)
- Adaptive thresholds + trend detection already delivered in Epic #901 Phase 4

**Remaining:** `AbTestTracker` exists but no experiments are actively running (low priority).

---

### Gap #4: TUI/REPL — RESOLVED

**Claimed:** Epic #871 describes a 3-phase TUI plan plus security hardening.

**Actual:** All phases complete. Phase 1 (REPL, 10 commands), Phase 2 (observable dashboard), Phase 3 (Ink-based TUI with 28 files, 43 components), and Security hardening are all implemented and tested (20 test files, 169 tests). Epic #871 is closed.

**Impact:** None. Fully delivered.

---

### Gap #5: REST API

**Claimed:** AppConfigSchema includes `rest` configuration section (port, auth, cors).

**Actual:** The REST API server exists but is secondary to the MCP stdio transport. It provides a subset of MCP tool functionality over HTTP. Not all tools are exposed via REST.

**Impact:** Low. MCP is the primary interface.

---

### Gap #6: Skills Count Discrepancy — RESOLVED

**Claimed:** CLAUDE.md Governance section stated "Skills (12)".

**Actual:** 13 skill files exist in `.claude/skills/` (requirements-gathering was added in Issue #905).

**Resolution:** CLAUDE.md updated. Workflows table now lists all 13 skills.

---

### Gap #7: Gateway Enforcement — RESOLVED

**Claimed:** Gateway middleware with tier classification is described as part of the orchestration governance (Epic #888).

**Previous state:** The gateway classified and logged but did NOT enforce policies. Governance enforcement was observe-only.

**Resolution (Epic #926, Phases 1-2):**

- **Phase 1 (Issue #927):** PolicyEvaluator wired into V2 delegate and orchestrate pipelines. Block mode halts execution on policy violations (5 built-in rules: trust-tier, security-review, bounded-iteration, cost-budget, high-risk-approval). 18 tests added.
- **Phase 2 (Issue #928):** Governance-enforcer wired into `delegate_to_model` routing. Security/architecture tasks are classified and output enriched with governance metadata (domain, voting threshold, promotion reason). Governance domain recorded to OutcomeStore quality signals. 6 tests added.

**Impact:** None. Enforcement is now active in block mode (default for V2 full mode).

---

### Gap #8: Two Adapter Layers — RESOLVED (by design)

**Observed:** Two adapter abstraction layers exist:

1. `src/adapters/` — Direct API adapters (`IModelAdapter`: protocol translation via HTTP)
2. `src/cli-adapters/` — CLI subprocess adapters (`ICliAdapter`: subprocess lifecycle and routing)

**Assessment (Issue #934, consensus vote 3-0):**

The dual-layer design is **architecturally correct**. API adapters translate protocols (Claude/OpenAI message formats); CLI adapters manage subprocess lifecycle and routing policy. These are distinct concerns with different failure modes and testing strategies.

- `CliToModelAdapter` (cli-to-model-adapter.ts) already bridges `ICliAdapter → IModelAdapter` when model-layer semantics are needed
- Refactor gate scored **0/5** — unification would blur concerns, not clarify them
- Architecture docs updated with "Adapter Layers" section explaining the design

**Impact:** None. Design is intentional; bridge exists for interoperability.

---

## Non-Gaps (Things That Work Well)

1. **Canonical path enforcement** — Every system concern has ONE implementation path. No forks.
2. **Test coverage** — 426 test files for 650 source files (65% file coverage ratio). Critical paths well-tested.
3. **Module boundaries** — Clean barrel exports, layered dependencies, no circular imports.
4. **Security pipeline** — All 8 modules wired and tested. Firewall composition layer works.
5. **Model registry** — Single source of truth. All adapters derive from it.
6. **MCP tool registration** — All 21 tools consistently use Zod validation, `formatZodError()`, timeout wrapping.
