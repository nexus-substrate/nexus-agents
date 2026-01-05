# PROJECT_PLAN.md — Nexus Agents v3 Hardening & Safety

**Version:** 3.1.0
**Last Updated:** 2026-01-04 (America/New_York)
**Status:** Approved (Reviewed by Architecture, Security, DevEx agents)

---

## Executive Summary

This plan focuses nexus-agents on **safety, observability, and production-readiness** without adding unnecessary complexity. After research and multi-agent consensus voting, the original 6 workstreams have been refined to 4 actionable workstreams plus cleanup.

### Key Decisions

| Original Proposal           | Decision                   | Reasoning                                                      |
| --------------------------- | -------------------------- | -------------------------------------------------------------- |
| Centralized Router (A)      | **DO NOT IMPLEMENT**       | TechLead + ExpertSelector already provide hierarchical routing |
| Context Budgets (B)         | **Simplify**               | Existing ContextManager is solid; just wire to workflows       |
| Typed Artifacts (C)         | **Thin envelope only**     | Existing Zod schemas suffice; add provenance wrapper           |
| Policy Firewall (D)         | **IMPLEMENT (Priority 1)** | Real security gap - validation != authorization                |
| Trace/Replay (E)            | **Lightweight only**       | Extend logger, skip OpenTelemetry                              |
| Unify TechLead+Workflow (F) | **Keep separate**          | Define clear interface, not merge                              |

---

## Goal

Make nexus-agents a **trustworthy orchestration layer** that:

- Enforces **authorization policies** (beyond schema validation)
- Provides **provenance tracking** for orchestration outputs
- Enables **cost/token observability** for debugging and tuning
- Maintains **clear separation** between planning (TechLead) and execution (WorkflowEngine)
- Supports the **CLI integration roadmap** (v2.2.0+)

---

## Non-Goals

- Training a learned router (rules-first; telemetry enables learning later)
- Building a UI
- Adding lots of new tools (focus on safety and correctness first)
- OpenTelemetry or external observability services
- Replay/dry-run capability (defer until production usage patterns emerge)

---

## Current Architecture (Validated)

Research confirmed the current architecture is well-designed:

```
Claude CLI → MCP Server → Tools → TechLead → ExpertSelector → Experts
                 ↓
           WorkflowEngine → Steps → Experts
```

**What exists and works well:**

- TechLead with typed outputs (ExecutionPlan, TaskAnalysis, SubTask[])
- ExpertSelector with capability scoring
- ContextManager with budget enforcement (15/20/50/15 split)
- ContextPruner with 4 strategies
- ResultAggregator with conflict resolution and quality scoring
- CLI adapters (Claude, Gemini, Codex) with unified interface

**What is missing:**

- Authorization layer (validation != authorization)
- Provenance/traceability for outputs
- Token/cost metrics in traces
- Explicit budget wiring in workflows

---

## Workstreams (Revised)

### Workstream A — REMOVED (Do Not Implement)

**Original:** Centralized Router Spine

**Decision:** Skip. The existing TechLead + ExpertSelector + delegate_to_model provides hierarchical routing. Adding a separate router would:

- Create redundant decision points
- Violate MCP's host-driven dispatch model
- Add complexity without improving routing quality

**Optional Enhancement:** Add routing metrics logging to existing components for observability.

---

### Workstream B — Context Budget Workflow Integration

**Goal:** Wire existing ContextManager/ContextPruner into workflow execution.

**Scope:** 2-3 days of development

#### B1. Add budget types to workflow definitions

Update:

- `src/workflows/workflow-types.ts`
- `src/core/types/workflow.ts`

```typescript
interface WorkflowDefinition {
  // ...existing fields
  defaultBudget?: ContextBudget;
}

interface WorkflowStep {
  // ...existing fields
  contextBudget?: Partial<ContextBudget>;
}
```

#### B2. Wire ContextManager into WorkflowEngine

Update:

- `src/workflows/workflow-engine.ts`
- `src/workflows/execution-context.ts`

Acceptance Criteria:

- Steps inherit budget from workflow or use step-specific override
- Budget enforcement logged in execution trace
- Existing ContextManager tests continue to pass

---

### Workstream C — Artifact Provenance Envelope

**Goal:** Add thin wrapper for traceability without duplicating existing types.

**Scope:** 1-2 days of development

#### C1. Create artifact envelope type

Create:

- `src/core/artifact.ts`

```typescript
export interface Artifact<T> {
  readonly id: string;
  readonly type: ArtifactType;
  readonly schemaVersion: string;
  readonly data: T;
  readonly metadata: ArtifactMetadata;
}

export interface ArtifactMetadata {
  readonly createdAt: string;
  readonly createdBy: string; // agentId
  readonly parentId?: string;
  readonly taskId: string;
  readonly traceId?: string;
}

export const ArtifactType = {
  PLAN: 'plan',
  ANALYSIS: 'analysis',
  DECISION: 'decision',
  RESULT: 'result',
  INTENT: 'intent', // For policy authorization
} as const;

export function createArtifact<T>(
  type: ArtifactType,
  data: T,
  metadata: Omit<ArtifactMetadata, 'createdAt'>
): Artifact<T>;
```

#### C2. Wrap key orchestration outputs

Update (incrementally):

- `src/agents/tech-lead.ts` - Wrap ExecutionPlan in Artifact
- `src/agents/collaboration/result-aggregator.ts` - Wrap AggregatedResult

Acceptance Criteria:

- Existing Result<T, E> pattern unchanged
- Artifacts are optional (used at orchestration boundaries)
- No duplication of Zod schemas

---

### Workstream D — MCP Policy Firewall (PRIORITY 1)

**Goal:** Add authorization layer separate from validation.

**Scope:** 3-4 days of development

This is the primary security gap identified by all reviewers.

#### D1. Create policy middleware

Create:

- `src/mcp/middleware/policy.ts`

```typescript
export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly requiredArtifact?: string;
}

export interface PolicyContext {
  readonly toolName: string;
  readonly args: unknown;
  readonly mode: 'read-only' | 'read-write';
  readonly artifacts?: Map<string, Artifact<unknown>>;
  readonly workflowId?: string;
}

export interface PolicyRule {
  readonly name: string;
  readonly description: string;
  check(ctx: PolicyContext): PolicyDecision;
}

export interface IPolicyFirewall {
  evaluate(ctx: PolicyContext): PolicyDecision;
  addRule(rule: PolicyRule): void;
}
```

#### D2. Implement default rules

Default policy rules:

1. **deny-mutations-without-mode** - Block write operations unless mode is 'read-write'
2. **deny-mutations-without-intent** - Block mutations without ToolIntentArtifact (optional, for strict mode)
3. **safe-paths** - Validate paths against allowed roots (reuse existing logic)

#### D3. Add read-only mode as default

Update:

- `src/config/schemas.ts` - Add `defaultMode: 'read-only' | 'read-write'`
- `src/cli.ts` - Add `--write-mode` flag
- `src/mcp/server.ts` - Wire policy middleware into tool registration

#### D4. Add warn mode for migration

For first release, add `policyMode: 'enforce' | 'warn'`:

- `warn` mode logs denials but allows execution
- `enforce` mode blocks execution

Acceptance Criteria:

- Unit tests show write tools blocked in read-only mode
- Policy decisions logged for audit
- Existing tools continue to work in read-write mode
- Clear error messages explain how to enable writes

---

### Workstream E — Lightweight Trace Module

**Goal:** Add token counting and cost tracking without OpenTelemetry.

**Scope:** 2-3 days of development

#### E1. Add trace types

Create:

- `src/core/trace.ts`

```typescript
export interface TraceContext {
  traceId: string;
  parentSpanId?: string;
  spanId: string;
}

export interface TraceSpan {
  context: TraceContext;
  name: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'success' | 'error';
  attributes: Record<string, unknown>;
  llmMetrics?: LLMMetrics;
}

export interface LLMMetrics {
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
  costUsd?: number;
}
```

#### E2. Integrate with adapters

Update:

- `src/adapters/base-adapter.ts` - Add optional trace context parameter
- `src/adapters/*/` - Emit LLM metrics in traces

#### E3. Add trace summary in logs

Update:

- `src/core/logger.ts` - Add trace span helpers
- `src/mcp/middleware/logging.ts` - Log trace summaries

Acceptance Criteria:

- Token counts logged for each LLM call
- Cost estimates calculated (configurable per model)
- Trace IDs correlate related operations
- No external dependencies added

---

### Workstream F — TechLead/WorkflowEngine Interface Clarity

**Goal:** Define clear handoff between planning and execution, NOT merge.

**Scope:** 1-2 days of documentation + minor code changes

#### F1. Document separation of concerns

Update:

- `ARCHITECTURE.md` (create if not exists)

Document:

- TechLead = **Planner** - analyzes tasks, creates execution plans
- WorkflowEngine = **Executor** - runs predefined workflow definitions
- Clear handoff: TechLead outputs can be converted to WorkflowDefinition

#### F2. Add optional plan-to-workflow conversion

Update:

- `src/agents/tech-lead.ts`

```typescript
interface ExecutionPlan {
  // ...existing fields
  asWorkflowDefinition?(): WorkflowDefinition; // Optional conversion
}
```

This allows TechLead-generated plans to be "crystallized" into replayable workflows.

Acceptance Criteria:

- Architecture clearly documented
- TechLead and WorkflowEngine remain separate modules
- Optional conversion available but not required

---

## Implementation Priority

Based on security and impact analysis:

| Priority | Workstream    | Effort   | Rationale                    |
| -------- | ------------- | -------- | ---------------------------- |
| 1        | D (Policy)    | 3-4 days | Closes primary security gap  |
| 2        | C (Artifacts) | 1-2 days | Required for D strict mode   |
| 3        | E (Traces)    | 2-3 days | Enables observability        |
| 4        | B (Budgets)   | 2-3 days | Improves resource management |
| 5        | F (Clarity)   | 1-2 days | Documentation improvement    |

**Total estimated effort:** 10-14 days

---

## Milestones

### Milestone 1 — Security Hardening (D + C)

Exit Criteria:

- Policy middleware implemented with deny-by-default for mutations
- Read-only mode is the default
- Artifact envelope available for provenance
- Policy decisions logged for audit

### Milestone 2 — Observability (E + B)

Exit Criteria:

- Token/cost metrics in logs
- Trace IDs correlate operations
- Budgets wired into workflow execution
- Budget usage appears in traces

### Milestone 3 — Documentation (F)

Exit Criteria:

- ARCHITECTURE.md explains TechLead vs WorkflowEngine
- Optional plan-to-workflow conversion available
- Migration guide for existing users

---

## Files to Create

| File                           | Workstream | Purpose                            |
| ------------------------------ | ---------- | ---------------------------------- |
| `src/core/artifact.ts`         | C          | Artifact envelope type and factory |
| `src/mcp/middleware/policy.ts` | D          | Policy firewall middleware         |
| `src/core/trace.ts`            | E          | Trace types and helpers            |
| `ARCHITECTURE.md`              | F          | Architecture documentation         |

## Files to Modify

| File                               | Workstream | Changes                                 |
| ---------------------------------- | ---------- | --------------------------------------- |
| `src/workflows/workflow-types.ts`  | B          | Add ContextBudget to types              |
| `src/workflows/workflow-engine.ts` | B          | Wire ContextManager                     |
| `src/agents/tech-lead.ts`          | C, F       | Wrap output in Artifact, add conversion |
| `src/config/schemas.ts`            | D          | Add policy config                       |
| `src/cli.ts`                       | D          | Add --write-mode flag                   |
| `src/mcp/server.ts`                | D          | Wire policy middleware                  |
| `src/adapters/base-adapter.ts`     | E          | Add trace context                       |
| `src/core/logger.ts`               | E          | Add trace helpers                       |

---

## Risks and Mitigations

### Risk: Policy firewall breaks existing flows

**Mitigation:**

- Add `warn` mode for first release (log denials but allow)
- Clear error messages explain how to enable writes
- Document migration path

### Risk: Artifact adoption is confusing

**Mitigation:**

- Keep Artifact<T> as thin envelope, not full type hierarchy
- Make adoption incremental and optional
- Use at orchestration boundaries only

### Risk: Trace overhead affects performance

**Mitigation:**

- Make tracing opt-in via config
- Use async logging to avoid blocking
- Keep metrics minimal (tokens, cost, duration)

---

## Definition of Done

This plan is complete when:

- [ ] Policy firewall prevents unauthorized mutations by default
- [ ] Read-only mode is the safe default
- [ ] Artifact envelope provides provenance for key outputs
- [ ] Token/cost metrics appear in logs
- [ ] Budgets flow into workflow steps
- [ ] TechLead/WorkflowEngine roles are clearly documented
- [ ] All changes have test coverage

---

## Consensus Vote Record

**Date:** 2026-01-04

| Voter        | A (Skip Router) | B (Budgets) | C (Artifacts) | D (Policy) | E (Trace) | F (Separate) |
| ------------ | --------------- | ----------- | ------------- | ---------- | --------- | ------------ |
| Architecture | APPROVE         | APPROVE     | APPROVE       | APPROVE    | APPROVE   | DISSENT→Keep |
| Security     | APPROVE         | APPROVE     | APPROVE+amend | APPROVE    | APPROVE   | Prefer sep   |
| DevEx        | APPROVE         | APPROVE     | APPROVE       | APPROVE    | APPROVE   | DISSENT→Keep |

**Outcome:** All workstreams approved with amendments noted above.

---

## Immediate Next Action

Implement **Workstream D (Policy Firewall)** first. This is the only true security gap and unblocks safer development of other features.

---

_Plan reviewed by: Architecture, Security, and DevEx agents_
_Last updated: 2026-01-04 (ET)_
