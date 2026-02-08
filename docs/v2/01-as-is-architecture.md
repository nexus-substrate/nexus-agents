# 01 — As-Is Architecture

_What the system actually does, not what we wish it did._

---

## System Identity

Nexus-agents is an MCP stdio server that wraps three AI CLI tools (Claude, Gemini, Codex) and exposes 20 orchestration tools. Entry point: `src/cli-server.ts`. Primary consumer: Claude Code.

## Topology

```
MCP Client (Claude Code)
    │ stdio
    ▼
┌─────────────────────────┐
│ Gateway Middleware       │ ← classify + log (OBSERVE ONLY)
│ (tier-classifier.ts)    │
├─────────────────────────┤
│ MCP Server              │
│ 20 tool handlers        │
│ (mcp/tools/*.ts)        │
├─────────────────────────┤
│ Rate Limiter            │ ← 100 req bucket, 10/sec refill
│ Timeout Wrapper         │ ← per-tool timeout
└──────────┬──────────────┘
           │
     ┌─────┼──────────────────────┐
     │     │                      │
     ▼     ▼                      ▼
 Analysis  Routing            Execution
 ┌──────┐  ┌───────────┐    ┌──────────┐
 │Shared│  │Composite  │    │CLI       │
 │Task  │  │Router     │    │Adapters  │
 │Analy-│  │(5 stages) │    │┌────────┐│
 │zer   │  └───────────┘    ││Claude  ││
 └──────┘                   ││Gemini  ││
                            ││Codex   ││
                            ││CodexMCP││
                            │└────────┘│
                            └──────────┘
```

## Module Inventory (Evidence-Based)

### Production Modules (Actually Used in MCP Flows)

| Module          | Files | Tests | Lines (est.) | Used By                        |
| --------------- | ----- | ----- | ------------ | ------------------------------ |
| core/           | 39    | 31    | ~8k          | Everything                     |
| config/         | 25    | 15    | ~5k          | All adapters, routing          |
| mcp/            | 81    | 71    | ~16k         | Server entry point             |
| cli-adapters/   | 90    | 68    | ~18k         | Tool handlers                  |
| consensus/      | 20    | 14    | ~4k          | consensus_vote tool            |
| orchestration/  | 33    | 17    | ~7k          | orchestrate, graph, spec tools |
| security/       | 35    | 38    | ~7k          | issue_triage, firewall         |
| agents/experts/ | 81    | ~40   | ~16k         | create_expert, execute_expert  |
| agents/base     | ~15   | ~10   | ~3k          | Expert framework               |

### Non-Production Modules (Not in MCP Critical Path)

| Module                 | Files | Tests | Lines (est.) | Status                                      |
| ---------------------- | ----- | ----- | ------------ | ------------------------------------------- |
| agents/collaboration/  | 91    | ~45   | ~27k         | Research protocols. NOT wired.              |
| agents/skills/         | 59    | ~30   | ~12k         | Skill library. Partially wired via experts. |
| agents/reasoning/      | 16    | ~8    | ~5k          | Forest-of-Thought. NOT wired to MCP.        |
| agents/self-improving/ | 13    | ~6    | ~3k          | SICA. NOT wired to MCP.                     |
| agents/coordination/   | 10    | ~5    | ~2k          | ScalingPredictor. NOT wired to MCP.         |
| agents/ictm/           | 7     | ~3    | ~2k          | AOrchestra. NOT wired to MCP.               |
| agents/orchestration/  | 43    | ~20   | ~9k          | Puppeteer pattern. NOT wired to MCP.        |
| adapters/              | 26    | 19    | ~5k          | API adapters. Secondary to CLI adapters.    |
| learning/              | 14    | 9     | ~3k          | Feedback infra. Not closed-loop.            |

**Observation:** ~260 files (~40% of codebase) are not in the MCP critical path. They are research implementations, experimental protocols, or infrastructure without integration.

## Sprawl Hotspots

### 1. Collaboration Module (91 files, ~27k lines)

Contains 8+ multi-agent collaboration protocols:

- AEGEAN (Adaptive Expert Group Execution)
- Trinity Coordination
- FreeMad (Free-form Multi-Agent Debate)
- Reflexion (self-reflection loop)
- Constitutional AI checks
- Event bus system
- Message routing
- Circular buffers

**None of these are invoked by any MCP tool handler.** They exist as standalone implementations with tests. Some are referenced in export barrels but never called from production code paths.

**Diagnosis:** Research sprawl. These should be behind plugin flags.

### 2. Puppeteer Orchestration (43 files, ~9k lines)

A complete "puppeteer" multi-agent orchestration system separate from the Orchestrator class and separate from the graph workflow engine. The WorkflowRouter can select "puppeteer" as a pattern but the actual execution path is unclear.

**Diagnosis:** Parallel implementation. Either consolidate with graph engine or isolate as plugin.

### 3. Two Adapter Layers

| Layer        | Location          | Transport          | Router                    | Resilience        |
| ------------ | ----------------- | ------------------ | ------------------------- | ----------------- |
| API adapters | src/adapters/     | HTTP to model APIs | None                      | ResilientAdapter  |
| CLI adapters | src/cli-adapters/ | Child process      | CompositeRouter (5-stage) | CliCircuitBreaker |

These do not share an interface above the transport level. A consumer must know which layer they're using.

### 4. Multiple Task Representations

A task is represented differently in each subsystem:

| Subsystem       | Representation                    | Key Fields                          |
| --------------- | --------------------------------- | ----------------------------------- |
| MCP tools       | Raw JSON args                     | `task: string`, ad-hoc extras       |
| TaskAnalyzer    | `TaskAnalysisResult`              | taskType, complexity, reasoningType |
| WorkflowRouter  | `TaskSignals` → `RoutingDecision` | description, constraints, pattern   |
| CompositeRouter | `RoutingTask`                     | Adapter-level routing context       |
| OutcomeStore    | `TaskOutcome`                     | pattern, success, durationMs        |
| GraphBuilder    | `GraphState`                      | Record<string, unknown>             |

There is no single type that a task "is" throughout its lifecycle.

## What Works Well

1. **MCP tool dispatch** — 20 tools, Zod-validated, timeout-wrapped, consistently registered.
2. **Model registry** — Single source of truth (`model-capabilities.ts`). All adapters derive from it.
3. **Graph execution** — Compile step (cycle detection, reachability), BSP super-steps, state reducers, checkpointing, bounded iteration (maxSteps=100, timeout=120s), conditional edges.
4. **Security pipeline** — 8 modules fully wired, firewall composition, ATL labels.
5. **Consensus voting** — Real multi-CLI votes, round-robin diversity, 6 strategies.
6. **Test density** — 426 test files, critical paths covered.

## What Doesn't Work

1. **Feedback loop is open.** OutcomeStore records outcomes. LinUCB explores. Neither connects to the other at runtime.
2. **Mesh mode is a lie.** Documented, rejected at startup.
3. **Gateway is observe-only.** Classifies, logs, never blocks.
4. **~40% of code is unused in production.** Research protocols, experimental features, alternative orchestration models.

## Contradictions With Existing Docs

| Claim                      | Source                | Reality                                             |
| -------------------------- | --------------------- | --------------------------------------------------- |
| "Skills (12)"              | CLAUDE.md             | 13 skills exist                                     |
| "mesh: Full bidirectional" | cli-help-text.ts      | Rejects with "not implemented"                      |
| "Closed-loop learning"     | learning/ module docs | Loop is open                                        |
| "Policy enforcement"       | Gateway docs          | Observe-only                                        |
| "9 workflows"              | CLAUDE.md             | 9 workflow templates + 7 graph templates = 16 total |
