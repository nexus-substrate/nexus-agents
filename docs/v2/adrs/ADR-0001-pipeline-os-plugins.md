# ADR-0001: Pipeline OS + Plugins as the Only Orchestration Primitive

**Status:** Accepted
**Date:** 2026-02-08
**Deciders:** Architect, Security, DevEx, PM, AI/ML

---

## Context

V1 has six orchestration patterns: sequential, wave, graph, consensus, aflow, puppeteer. The WorkflowRouter selects among them using hand-coded rules. Each pattern has its own execution model. This creates:

- 6 execution paths to maintain and test
- Pattern-specific bugs that don't affect other patterns
- Confusion about which pattern to use when

Meanwhile, the GraphBuilder already provides the most general execution model (compile, super-steps, conditional edges, checkpoints, bounded iteration). The other patterns are subsets of what a graph can express.

## Decision

**Adopt a Pipeline OS model where the compiled graph is the ONLY execution primitive.** All orchestration patterns become PlanContract configurations that compile to graphs:

- Sequential = linear graph (A→B→C)
- Wave = graph with independent nodes (parallel super-step)
- Graph = graph (identity mapping)
- Consensus = N parallel nodes → aggregator node
- AFlow/Puppeteer = experimental plugins that produce subgraphs

Plugins implement stage logic. The PipelineRunner compiles PlanContracts to graphs and executes them.

## Consequences

**Positive:**

- ONE execution model to maintain, test, and reason about
- All patterns get checkpointing, bounded iteration, and observability for free
- Plugin isolation prevents sprawl in execution logic

**Negative:**

- Simple sequential tasks pay graph compilation overhead (mitigated: compile is fast)
- Migration requires wrapping existing patterns as PlanContract generators
- WorkflowRouter's pattern selection becomes PlanContract template selection (conceptual shift)

## Alternatives Considered

1. **Keep all 6 patterns:** Rejected. Maintenance burden scales linearly with patterns.
2. **Simplify to 3 patterns (sequential, parallel, graph):** Rejected. Still multiple execution models.
3. **LangGraph-style framework replacement:** Rejected. Existing GraphBuilder already has the needed semantics. Replacing it would be wasteful.
