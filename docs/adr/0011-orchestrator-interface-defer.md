# ADR-0011: Orchestrator Interface - Deferred

## Status

REJECTED (Consensus Vote: 50% approval, 2026-01-31)

## Context

Multiple orchestration entry points exist:

- cli-orchestrator.ts (CLI)
- mcp/tools/orchestrate.ts (MCP)
- workflows/workflow-engine.ts (Workflows)

A proposal was made to wrap these behind a unified IOrchestrator interface.

## Decision

**Defer unified interface implementation.**

The consensus vote was tied (50%), which does not meet the majority threshold. This indicates:

- Current separation works and is well-tested
- Risk of over-abstraction outweighs benefits
- Each orchestrator serves distinct concerns
- Unified interface may add complexity without clear benefit

## Consensus Vote

- **Date:** 2026-01-31
- **Threshold:** Simple Majority (50%)
- **Result:** REJECTED (50% - did not exceed threshold)
- **Votes:**
  - Software Architect: REJECT
  - Security Engineer: APPROVE
  - Developer Experience: APPROVE
  - AI/ML Engineer: REJECT
  - Product Manager: ABSTAIN

## Consequences

### Positive

- Avoids premature abstraction
- Keeps implementation simple
- Each orchestrator can evolve independently

### Negative

- Some error handling duplication
- No shared configuration pattern
- Changes may need to be made in multiple places

## Future Consideration

Revisit if:

- A fourth orchestrator is added
- Significant error handling duplication emerges
- Configuration management becomes complex

Note: IOrchestrator interface exists in core/types/orchestrator.ts but implementation wrapping is deferred.

## Related

- Issue #595
- Epic #598 (LOOP H)
