# ADR-0003: Graph Execution Model (LangGraph Semantics) + Bounded Iteration

**Status:** Accepted
**Date:** 2026-02-08
**Deciders:** Architect, AI/ML, Security

---

## Context

The existing GraphBuilder provides compile-time validation, BSP super-step execution, state reducers, conditional edges, and checkpointing. This is already aligned with LangGraph's conceptual model:

| LangGraph          | Nexus V1                  | Gap                         |
| ------------------ | ------------------------- | --------------------------- |
| State channels     | StateSchema with reducers | None (implemented)          |
| Nodes              | NodeHandler functions     | None (implemented)          |
| Edges + conditions | Fixed + ConditionalEdge   | None (implemented)          |
| Compile            | GraphBuilder.compile()    | None (implemented)          |
| Super-steps        | BSP wavefront execution   | None (implemented)          |
| Checkpoints        | ICheckpointStore          | None (implemented)          |
| Recursion limits   | maxSteps=100              | Partial (no per-edge limit) |
| Breakpoints        | Not implemented           | Gap                         |

## Decision

**Extend the existing GraphBuilder rather than replace it.** Add:

1. **Per-edge maxTraversals** — ConditionalEdge gains `maxTraversals?: number` (default 3). Prevents unbounded loops on specific edges.
2. **Breakpoints** — BreakpointSpec allows pausing before specific nodes with conditions. Integrates with checkpointing for resume.
3. **Plugin handler wrapper** — NodeHandler wraps PipelinePlugin.execute() to bridge the graph execution model with the plugin system.

Do NOT:

- Replace GraphBuilder with a LangGraph import
- Change the BSP execution model
- Change the state reducer semantics
- Break existing graph templates

## Consequences

**Positive:**

- Minimal new code (two extensions to existing model)
- All existing graph templates continue to work
- Breakpoints enable debugging and approval gates
- Per-edge limits prevent pathological loops

**Negative:**

- Per-edge tracking adds state to the execution engine
- Breakpoints add complexity to the resume path

## Alternatives Considered

1. **Import LangGraph.js as a dependency:** Rejected. Nexus already has equivalent functionality. Adding a dependency for conceptual alignment is wasteful.
2. **Topological sort execution (not BSP):** Rejected. BSP is correct for parallel stages. Topological sort serializes unnecessarily.
3. **No per-edge limits (keep maxSteps only):** Rejected. maxSteps is a global bound. A single hot edge can consume all steps while other parts of the graph starve.
