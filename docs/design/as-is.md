# Nexus Agents: As-Is Architecture

_An honest, evidence-backed assessment of the current system. No marketing. Every claim cites code._

_Generated: 2026-02-08_

---

## What This System Actually Is

Nexus-agents is a **multi-agent orchestration server** that coordinates AI model CLIs (Claude, Gemini, Codex) via the Model Context Protocol (MCP). It provides 20 MCP tools for task orchestration, consensus voting, model routing, research tracking, and workflow execution.

**Primary interface:** MCP stdio server (invoked by Claude Code, Gemini CLI, or any MCP client).
**Secondary interfaces:** CLI binary (31 commands), REST API (partial).

**Primary user:** A developer using Claude Code who wants to leverage multiple AI models for complex tasks like code review, architecture decisions, and security audits.

---

## System Topology

```
                    ┌─────────────────────┐
                    │    MCP Client        │
                    │ (Claude Code, etc.)  │
                    └──────────┬──────────┘
                               │ stdio
                    ┌──────────▼──────────┐
                    │   Gateway Middleware │ ← classify + log (observe-only)
                    │   (tier-classifier)  │
                    ├─────────────────────┤
                    │    MCP Server        │
                    │   (20 tool handlers) │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                     │
  ┌───────▼───────┐   ┌───────▼───────┐   ┌────────▼────────┐
  │ Task Analysis  │   │  Routing      │   │  Orchestration  │
  │ (SharedTask    │   │ (Composite    │   │  (Workflow      │
  │  Analyzer)     │   │  Router)      │   │   Router)       │
  └───────┬───────┘   └───────┬───────┘   └────────┬────────┘
          │                    │                     │
          │            ┌───────▼───────┐             │
          │            │  CLI Adapters │             │
          │            │ ┌─────┬─────┐│             │
          │            │ │Claud│Gemin││             │
          │            │ │e    │i    ││             │
          │            │ ├─────┼─────┤│             │
          │            │ │Codex│Codex││             │
          │            │ │     │MCP  ││             │
          │            │ └─────┴─────┘│             │
          │            └──────────────┘             │
          │                                         │
  ┌───────▼──────────────────────────────────▼──────┐
  │              Model Registry                      │
  │  (config/model-capabilities.ts — single source)  │
  └──────────────────────────────────────────────────┘
```

---

## What Works

### 1. MCP Tool Dispatch (Solid)

All 20 tools are registered, validated with Zod, wrapped with timeouts, and dispatched through the gateway middleware. The registration is consistent — every tool uses `formatZodError()` and follows the same handler pattern.

**Evidence:** `src/mcp/tools/index.ts` — `REGISTERED_TOOLS` array has 20 entries. Export contract tests verify all 20 at runtime (`src/exports/export-contracts.test.ts`).

### 2. Model Registry (Solid)

Single source of truth for all model metadata. All four adapter types (`getModelInfo()`) use `buildModelInfo()` from `model-config-helpers.ts` with legacy fallback. Pricing, context windows, quality scores, CLI aliases — all centralized.

**Evidence:** `src/config/model-capabilities.ts` — `DEFAULT_MODEL_CAPABILITIES`. All adapters import `buildModelInfo` (verified in #885, #886).

### 3. Task Analysis (Solid)

`SharedTaskAnalyzer` (ADR-0004) consolidates 5 prior independent analyzers into one canonical path. Extended with ambiguity scoring, constraint extraction, and capability inference (#903). Output drives both routing and clarification.

**Evidence:** `src/core/task-analysis/shared-task-analyzer.ts` — 396 lines. Produces `TaskAnalysisResult` with 10+ fields.

### 4. Consensus Voting (Solid)

Real multi-model voting with 6 agent personas. Round-robin CLI assignment ensures diversity (#845). 6 voting strategies including Bayesian higher-order. Reasoning limit: 4000 chars.

**Evidence:** `src/consensus/engine.ts`, `src/mcp/tools/consensus-vote.ts`. Vote reasoning tested extensively.

### 5. Security Pipeline (Solid)

8 security modules fully wired: input sanitizer, trust classifier, trust types, action schema, policy gate, corroboration validator, reputation model, audit trail. Hostile input firewall composes them (#826).

**Evidence:** `src/security/` — 35 source files, 38 test files. All modules independently testable.

### 6. Graph Workflows (Solid)

DAG-based execution with checkpointing, rollback, conditional edges. 7 templates. Super-step execution model. Multi-CLI routing per node (#866).

**Evidence:** `src/orchestration/graph/` — GraphBuilder, 126+ tests.

---

## What Partially Works

### 7. Composite Router (Functional but Disconnected)

The 5-stage routing pipeline (Budget -> Zero -> Preference -> TOPSIS -> LinUCB) exists and routes correctly based on static model metadata. However:

- LinUCB bandit has no feedback loop — it explores but never learns from outcomes.
- OutcomeStore records data but doesn't feed back into routing decisions.
- The router operates on CLI adapters only, not API adapters.

### 8. AI Software Factory (Functional but Untested in Production)

The full 6-stage pipeline (parse -> decompose -> compile -> execute -> validate -> analyze) exists with 94 tests. However, it has only been tested with mocked adapters. Real end-to-end execution with live models has not been validated.

### 9. Gateway Middleware (Observe-Only)

Classifies every tool call into tiers (DIRECT, ANALYZED, ORCHESTRATED) and logs. But enforcement is not active — no requests are blocked or modified. Governance enforcer exists but is not wired to block.

### 10. Learning Module (Infrastructure Without Integration)

`OutcomeFeedbackCollector`, `SQLiteOutcomeStorage`, and `AbTestTracker` exist. But:

- No active experiments running
- No runtime feedback influencing routing
- The loop is open, not closed

---

## What Doesn't Work

### 11. Mesh Mode

Documented in help text. Explicitly rejected at startup with error message. Tests verify rejection. Should be removed from documentation until implemented.

### 12. Closed-Loop Learning

Despite extensive infrastructure, routing decisions today are based on static model metadata (quality scores, pricing) plus task analysis signals. No outcome data feeds back into future routing. The bandit algorithm explores without learning.

---

## Architectural Observations

### Strengths

1. **Canonical path discipline**: ONE implementation for each concern. `CLAUDE.md` enforces this.
2. **Layered dependencies**: 5 clean layers with no circular imports at the module level.
3. **Consistent patterns**: Result types, Zod validation, `createLogger`, barrel exports — uniformly applied.
4. **High test density**: 426 test files, critical paths covered.
5. **Model registry as truth**: All model metadata flows from one source.

### Weaknesses

1. **Agent module bloat**: `src/agents/` is 287 files (44% of the codebase) with 9 sub-export barrels. It mixes framework code (BaseAgent, StateMachine) with application code (specific experts, skills, ICTM). This module needs decomposition.

2. **Two adapter abstraction layers**: `src/adapters/` (API) and `src/cli-adapters/` (CLI subprocess) serve different transport mechanisms but don't share a common interface above the transport level. The CompositeRouter only works with CLI adapters.

3. **Rule-based everything**: WorkflowRouter, TaskAnalyzer, TierClassifier — all use hand-coded rules with static thresholds. This is correct for v1 (per consensus vote: "no ML/RL yet") but limits adaptability.

4. **Orchestrator complexity**: The `Orchestrator` (née TechLead) in `agents/tech-lead.ts` is a large class that tries to coordinate task decomposition, expert delegation, and result aggregation. Its responsibilities overlap with both the WorkflowRouter and the graph execution engine.

5. **Unused sophistication**: Some components (Forest-of-Thought reasoning, SICA self-improvement, ICTM agent creation) are implemented and tested but have no clear integration path into the primary MCP tool flows.

---

## Quantitative Summary

| Metric             | Value                    |
| ------------------ | ------------------------ |
| Source files       | 650                      |
| Test files         | 426                      |
| MCP tools          | 20                       |
| CLI commands       | 31                       |
| Expert roles       | 9                        |
| Workflow templates | 9 (workflow) + 7 (graph) |
| Skills             | 13                       |
| Export barrels     | 16                       |
| Dependency layers  | 5                        |
| Security modules   | 8                        |
| Voting strategies  | 6                        |
| Router stages      | 5                        |
| Known gaps         | 8 (see gaps.md)          |

---

## Supporting Documents

- [ARCHITECTURE_MAP.json](./ARCHITECTURE_MAP.json) — Machine-readable component inventory
- [components.md](./components.md) — Detailed component descriptions with source references
- [interfaces.md](./interfaces.md) — Key interfaces and contracts
- [flows.md](./flows.md) — Traced dataflows through the system
- [gaps.md](./gaps.md) — Intended vs actual truth table
