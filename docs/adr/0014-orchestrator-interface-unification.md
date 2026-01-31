# ADR-0014: Orchestrator Interface Unification

## Status

APPROVED (Consensus Vote: 100% approval, 2026-01-31)

## Context

Multiple orchestration entry points exist with no shared interface:

1. `cli-orchestrator.ts` - CLI task execution
2. `mcp/tools/orchestrate.ts` - MCP server task execution
3. `workflows/workflow-engine.ts` - Workflow step execution

However, significant infrastructure already exists:

- `IOrchestrator` interface in `core/types/orchestrator.ts`
- `OrchestratorFactory` in `orchestration/orchestrator-factory.ts`
- `WorkflowOrchestratorAdapter` - proven working adapter
- `TechLeadAdapter` and `PuppeteerAdapter` stubs

This was previously deferred (ADR-0011, 50% tie) but re-evaluated with updated context.

## Decision

**Complete the unified IOrchestrator implementation.**

### Implementation Approach

1. **Complete TechLeadAdapter** - Wrap existing TechLead class
2. **Complete PuppeteerAdapter** - Wrap PuppeteerOrchestrator
3. **Refactor CLI orchestrator** - Use `OrchestratorFactory.create('tech_lead')`
4. **Refactor MCP orchestrate tool** - Use OrchestratorFactory
5. **Consolidate error handling** - Use OrchestratorError consistently
6. **Unified configuration** - Share timeout and rate limiting settings

## Consensus Vote

- **Date:** 2026-01-31
- **Threshold:** Simple Majority (50%)
- **Result:** APPROVED (100%)
- **Votes:**
  - Software Architect: APPROVE
  - Security Engineer: APPROVE
  - Developer Experience: APPROVE
  - AI/ML Engineer: APPROVE
  - Product Manager: APPROVE

## Consequences

### Positive

- Consistent error handling across all orchestration paths
- Unified security controls (rate limiting, timeouts)
- Easier testing via mock implementations
- Token tracking enabled across CLI and MCP
- Reduced cognitive load for contributors

### Negative

- Initial refactoring effort (~4 hours estimated)
- Must maintain backward compatibility during transition

### Key Benefits

1. **Security:** Single-point security policy enforcement
2. **Observability:** Consistent telemetry across all paths
3. **Testing:** Mock implementations via factory
4. **Research:** Token budget tracking for LATTS/SEW

## Implementation Plan

1. Complete TechLeadAdapter in `orchestrator-adapters.ts`
2. Complete PuppeteerAdapter
3. Add OrchestratorFactory types for 'cli' and 'mcp'
4. Refactor cli-orchestrator.ts to use factory
5. Refactor mcp/tools/orchestrate.ts to use factory
6. Consolidate error handling into OrchestratorError
7. Add unified timeout/rate limiting configuration
8. Update tests to verify behavior unchanged

## Related

- Issue #595
- ADR-0011 (superseded)
- Epic #598 (LOOP H)
- Fitness Dimension: canonicalPaths, explicitBehavior
