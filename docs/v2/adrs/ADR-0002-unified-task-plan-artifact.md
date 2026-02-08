# ADR-0002: Unified TaskContract + PlanContract + ArtifactStore

**Status:** Proposed
**Date:** 2026-02-08
**Deciders:** Architect, PM, DevEx

---

## Context

A "task" is currently represented by 5+ different types depending on which subsystem handles it:

- `TaskSignals` (WorkflowRouter input)
- `TaskAnalysisResult` (SharedTaskAnalyzer output)
- `RoutingDecision` (router output)
- `PatternOutcome` (outcome tracking)
- Raw JSON (MCP tool arguments)
- `GraphState` (graph execution)

There is no explicit "plan" type. Execution plans are implicit in pattern selection.

Artifacts (code, reviews, reports) are passed as function arguments. There is no artifact store with provenance.

## Decision

**Introduce three unified types:**

1. **TaskContract** — A single typed representation of a task throughout its lifecycle, from intake to completion. Contains analysis, constraints, capabilities, status, and artifact references.

2. **PlanContract** — An explicit execution plan with declared stages, dependencies, policy gates, cost estimates, and approval requirements. Every complex task gets a plan before execution.

3. **ArtifactStore** — Typed storage for all pipeline inputs and outputs with provenance tracking. Artifacts reference their creators and input artifacts.

V1 types are preserved and wrapped into TaskContract via adapter functions. No V1 types are deleted.

## Consequences

**Positive:**

- Single source of truth for task state
- Explicit plans enable user review before execution
- Provenance enables debugging ("who produced this artifact and from what?")
- Outcome tracking has one type to record against

**Negative:**

- Another type in a type-heavy codebase
- Adapter functions add indirection during migration
- ArtifactStore adds memory overhead

## Alternatives Considered

1. **Extend TaskAnalysisResult with all fields:** Rejected. TaskAnalysisResult is an analysis output, not a lifecycle container. Different concern.
2. **Use GraphState as the universal type:** Rejected. GraphState is `Record<string, unknown>` — no type safety.
3. **No explicit plan type (keep implicit):** Rejected. Users cannot review implicit plans.
