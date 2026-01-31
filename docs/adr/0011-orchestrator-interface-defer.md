# ADR-0011: Orchestrator Interface Unification

## Status

SUPERSEDED by ADR-0014 (Re-evaluation: APPROVED, 100% approval, 2026-01-31)

## Original Decision (2026-01-31)

**REJECTED (50% tie)** - Defer unified IOrchestrator interface implementation.

## Re-evaluation (2026-01-31)

A fresh consensus vote was conducted. Key changes since original vote:

1. IOrchestrator interface already exists in `core/types/orchestrator.ts`
2. OrchestratorFactory already exists with working adapters
3. WorkflowOrchestratorAdapter proves the pattern works
4. TechLeadAdapter and PuppeteerAdapter stubs are ready

### Re-evaluation Consensus Vote

- **Date:** 2026-01-31
- **Threshold:** Simple Majority (50%)
- **Result:** APPROVED (100%)
- **Votes:**
  - Software Architect: APPROVE (infrastructure already exists, complete the pattern)
  - Security Engineer: APPROVE (enables consistent security controls)
  - Developer Experience: APPROVE (reduces learning curve)
  - AI/ML Engineer: APPROVE (unlocks token tracking across orchestration)
  - Product Manager: APPROVE (low effort, high return)

## New Decision

**Complete the unified IOrchestrator implementation.**

The infrastructure (interface, factory, one adapter) already exists. Only adapter completion and entry point refactoring remains.

## Implementation

See ADR-0014 for implementation details.

## Related

- Issue #595
- ADR-0014 (supersedes this document)
