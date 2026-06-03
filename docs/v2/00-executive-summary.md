# V2 Rearchitecture — Executive Summary

_Nexus Agents reviewing Nexus Agents. No marketing. Evidence-backed._

---

## What Nexus Agents Is Today

An intelligent orchestration platform for AI coding tools (650+ source files, 900+ test files) that coordinates Claude, Gemini, Codex, and OpenCode CLIs via 44 MCP tools. It routes tasks to the best model using data-driven algorithms (LinUCB bandit, TOPSIS), validates through multi-model consensus, and learns from outcomes across sessions. Users can orchestrate tasks, run consensus votes, execute a full dev pipeline (research→plan→vote→implement→QA), and run graph workflows.

## What's Wrong

1. **Sprawl.** The `agents/` module is 287 files (44% of codebase). Within it, `collaboration/` alone is 91 files and 27k lines of research-grade protocols (AEGEAN, Trinity, FreeMad, Reflexion, Constitutional AI) that are not wired into any production pathway. This is academic code living alongside production infrastructure.

2. **No unified task model.** A "task" is represented as `TaskSignals` in the router, `TaskAnalysisResult` in the analyzer, `RoutingDecision` in routing output, `PatternOutcome` in outcome tracking, and ad-hoc JSON in MCP tool arguments. There is no single `TaskContract` that flows through the system.

3. **Open feedback loop.** `OutcomeStore`, `OutcomeFeedbackCollector`, `SQLiteOutcomeStorage`, `LinUCB` bandit, and `AbTestTracker` all exist. None of them feed runtime routing decisions. The bandit explores but never learns.

4. **Two adapter layers.** `src/adapters/` (API) and `src/cli-adapters/` (subprocess) serve different transports but share no common interface above transport. The `CompositeRouter` only works with CLI adapters.

5. **Gateway without teeth.** The gateway classifies every tool call into tiers (DIRECT/ANALYZED/ORCHESTRATED) and logs. It never blocks, never enforces, never gates.

6. **Mesh mode lies.** Help text claims "Full bidirectional." Server rejects with "not yet implemented."

## What V2 Does

V2 introduces **five core primitives** and restructures the system as a **Pipeline OS with Plugins**:

| Primitive           | Purpose                                            | Replaces                                       |
| ------------------- | -------------------------------------------------- | ---------------------------------------------- |
| **TaskContract**    | Unified typed task lifecycle (intake→done/failed)  | TaskSignals + TaskAnalysisResult + ad-hoc JSON |
| **PlanContract**    | Explicit execution plan with stages                | Implicit pattern selection                     |
| **Pipeline Runner** | Deterministic stage executor with graph semantics  | Orchestrator + WorkflowRouter + GraphBuilder   |
| **Plugin Registry** | Structural isolation for all stage implementations | Direct imports between modules                 |
| **Policy Engine**   | Governance gates between stages                    | Observe-only gateway                           |

## What V2 Does NOT Do

- Does not rewrite from scratch. Every phase is additive or wrapping.
- Does not break MCP tools. All 20 continue to work.
- Does not add ML/RL. Routing stays rule-based with bandit exploration.
- Does not merge adapter transports. API and CLI adapters stay separate.
- Does not remove experimental features. Moves them behind structural plugin flags (default off).

## Migration Strategy

Five phases, each independently shippable:

1. **TaskContract + PlanContract** — New types wrapping existing analysis/routing output. No behavioral change.
2. **Pipeline Runner** — Executes PlanContract stages using existing GraphBuilder's compile/super-step model. New MCP tool `execute_pipeline` alongside `orchestrate`.
3. **Plugin Registry** — Structural isolation. Experimental features (SICA, Forest-of-Thought, ICTM, collaboration protocols) move behind manifests. Default off.
4. **Event Bus + Artifact Store** — Typed events at every stage boundary. Provenance tracking. Closes the feedback loop (outcomes → routing).
5. **Policy Enforcement** — Gateway gains teeth. Stages require approval. Trust tiers enforced.

## Minimum Viable V2 (Thin Slice)

Phases 1 + 2 only: `TaskContract` type + `PipelineRunner` using existing graph execution. One new MCP tool. No plugin registry needed. No event bus needed. Shippable in ~2 weeks.

## Key Numbers

| Metric                                | V1              | V2 Target             |
| ------------------------------------- | --------------- | --------------------- |
| Modules with >100 files               | 1 (agents: 287) | 0 (max 80 per module) |
| Experimental files in production path | ~130            | 0 (plugin-gated)      |
| Task representations                  | 5+              | 1 (TaskContract)      |
| Feedback loop                         | Open            | Closed (Phase 4)      |
| Policy enforcement                    | Observe-only    | Active (Phase 5)      |
| Plugin isolation                      | None            | Structural (Phase 3)  |

---

_This document supersedes `docs/design/v2-proposal.md`. See individual design docs for details._
