# Gaps Analysis: Intended vs Actual

_Honest assessment of what's documented/claimed versus what actually exists and works._

_Generated: 2026-02-08_

---

## Truth Table

| Feature                            | Documented? | Implemented? |        Tested?         | Notes                           |
| ---------------------------------- | :---------: | :----------: | :--------------------: | ------------------------------- |
| MCP server (stdio)                 |     Yes     |     Yes      |          Yes           | 20 tools, all wired             |
| CLI (45 commands)                  |     Yes     |   Partial    |        Partial         | See gap #1                      |
| Mesh mode                          |     Yes     |    **No**    | Tests verify rejection | See gap #2                      |
| Model routing pipeline             |     Yes     |     Yes      |          Yes           | 5-stage composite router        |
| Consensus voting (6 strategies)    |     Yes     |     Yes      |          Yes           | Real multi-CLI votes            |
| Graph workflows (7 templates)      |     Yes     |     Yes      |          Yes           | Checkpointing works             |
| AI Software Factory                |     Yes     |     Yes      |          Yes           | Full 6-stage pipeline           |
| Security pipeline (8 modules)      |     Yes     |     Yes      |          Yes           | All wired, firewall composition |
| Expert agents (9 roles)            |     Yes     |     Yes      |          Yes           | Including pm/ux                 |
| Task analysis (SharedTaskAnalyzer) |     Yes     |     Yes      |          Yes           | ADR-0004 consolidation          |
| Gateway middleware                 |     Yes     |     Yes      |          Yes           | Observe-only, no enforcement    |
| Outcome tracking                   |     Yes     |     Yes      |          Yes           | Bounded store, FIFO eviction    |
| Weather report                     |     Yes     |     Yes      |          Yes           | Per-CLI success rates           |
| Learning/feedback loop             |   Partial   |   Partial    |        Partial         | See gap #3                      |
| TUI/REPL                           |     Yes     |     Yes      |          Yes           | All phases complete (gap #4)    |
| SWE-bench integration              |     Yes     |     Yes      |          Yes           | 92 files                        |
| REST API                           |     Yes     |   Partial    |        Partial         | See gap #5                      |
| Direct API adapters                |     Yes     |     Yes      |          Yes           | Claude, OpenAI, Ollama, Gemini  |
| Context load balancing             |     Yes     |     Yes      |          Yes           | Multi-CLI routing               |
| Research registry                  |     Yes     |     Yes      |          Yes           | arXiv, GitHub, multi-source     |

---

## Gap Details

### Gap #1: CLI Command Coverage

**Claimed:** 45 commands in CLAUDE.md, 31 in validCommands (cli-types.ts).

**Actual:** All 31 validated commands have dispatch handlers. However, many commands are thin wrappers that delegate to MCP tool calls or print help text. Several "demo" and "benchmark" commands exist primarily for development use.

**Impact:** Low. The MCP server is the primary interface; CLI is secondary.

---

### Gap #2: Mesh Mode (Critical)

**Claimed:** Help text (`cli-help-text.ts:64`) states: `mesh: Full bidirectional (both modes)`. CLAUDE.md lists server modes as "server (default), orchestrator, mesh."

**Actual:** Server startup explicitly rejects mesh mode with error: `"Mesh mode is not yet implemented. Use --mode=server instead"` (cli-server.ts:154). Tests verify this rejection (cli-server.test.ts:395-464).

**Impact:** Medium. Users who try `--mode=mesh` get an error. The help text is misleading.

**Recommendation:** Remove mesh from help text until implemented. Document as planned future feature only.

---

### Gap #3: Learning/Feedback Loop

**Claimed:** Outcome feedback, reward computation, A/B testing, and closed-loop learning are documented.

**Actual:** The learning module exists with `OutcomeFeedbackCollector`, `FeedbackIntegration`, and `SQLiteOutcomeStorage`. However:

- The feedback loop is **not wired end-to-end** in production. Outcome recording in `delegate_to_model` is "best-effort" (non-blocking, swallows errors).
- Learning data does not currently influence routing decisions at runtime. The `LinUCB` bandit in the routing pipeline exists but its exploration/exploitation behavior is not fed by the outcome store.
- `AbTestTracker` exists but no experiments are actively running.

**Impact:** Medium. The infrastructure exists but the loop isn't closed. Routing improvements from feedback are not realized.

**Recommendation:** Wire OutcomeStore -> LinUCB feedback path. Create a periodic aggregation job.

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

### Gap #7: Gateway Enforcement

**Claimed:** Gateway middleware with tier classification is described as part of the orchestration governance (Epic #888).

**Actual:** The gateway classifies and logs but does NOT enforce any policies. It's observe-only. The governance enforcement module (`governance-enforcer.ts`) exists but is not actively blocking requests.

**Impact:** Medium. Policy enforcement is infrastructure without teeth. If governance decisions are needed (rate limits per tier, approval requirements for tier 3), they must be activated.

**Recommendation:** This is intentional for Phase 1 (observe before enforce). Phase 2 should wire enforcement.

---

### Gap #8: Two Adapter Layers

**Actual state:** The system has two adapter abstraction layers:

1. `src/adapters/` — Direct API adapters (call model APIs directly via HTTP)
2. `src/cli-adapters/` — CLI subprocess adapters (invoke `claude`, `gemini`, `codex` as child processes)

These serve different purposes but create confusion:

- The `ResilientAdapter` in `src/adapters/` wraps API adapters with retry/failover
- The `CliCircuitBreaker` in `src/cli-adapters/` provides similar resilience for CLI adapters
- The `CompositeRouter` routes between CLI adapters specifically, not API adapters

**Impact:** Architectural complexity. New developers must understand which adapter layer to use when.

**Recommendation:** Consider unifying under a single `IModelAdapter` interface that both API and CLI adapters implement, with the router operating on the unified interface.

---

## Non-Gaps (Things That Work Well)

1. **Canonical path enforcement** — Every system concern has ONE implementation path. No forks.
2. **Test coverage** — 426 test files for 650 source files (65% file coverage ratio). Critical paths well-tested.
3. **Module boundaries** — Clean barrel exports, layered dependencies, no circular imports.
4. **Security pipeline** — All 8 modules wired and tested. Firewall composition layer works.
5. **Model registry** — Single source of truth. All adapters derive from it.
6. **MCP tool registration** — All 20 tools consistently use Zod validation, `formatZodError()`, timeout wrapping.
