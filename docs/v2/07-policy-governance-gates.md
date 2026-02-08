# 07 — Policy & Governance Gates

---

## Current State

V1 has three governance mechanisms that don't talk to each other:

1. **Gateway middleware** (`mcp/gateway/`) — Classifies tool calls into tiers (DIRECT/ANALYZED/ORCHESTRATED). Logs only. Never blocks.
2. **Security policy gate** (`security/policy/policy-gate.ts`) — Evaluates typed agent actions against trust tiers. Blocks or allows.
3. **Consensus voting** (`consensus/engine.ts`) — Multi-agent approval for architecture/security decisions. Manual invocation only.

V2 unifies these into a single **Policy Engine** that gates pipeline stage transitions.

## Policy Engine

```typescript
interface IPolicyEngine {
  /**
   * Evaluate whether a stage transition is allowed.
   * Called automatically by the PipelineRunner between stages.
   */
  evaluate(gate: PolicyGateSpec, context: PolicyContext): PolicyDecision;

  /**
   * Register a policy rule. Rules are evaluated in priority order.
   */
  registerRule(rule: PolicyRule): void;

  /**
   * List all registered rules (for introspection/debugging).
   */
  listRules(): readonly PolicyRule[];
}

interface PolicyGateSpec {
  readonly id: string;
  /** Stage this gate follows */
  readonly afterStage: string;
  /** Stage this gate precedes (blocked until gate passes) */
  readonly beforeStage: string;
  /** Rules to evaluate at this gate */
  readonly rules: readonly string[]; // rule IDs
  /** What to do on failure */
  readonly onFail: 'block' | 'warn' | 'escalate';
}

type PolicyDecision =
  | { readonly allow: true }
  | { readonly allow: false; readonly reason: string; readonly escalateTo?: string };

interface PolicyContext {
  readonly task: Readonly<TaskContract>;
  readonly stage: StageSpec;
  readonly stageResult: StageResult;
  readonly artifacts: readonly ArtifactRef[];
  readonly pipelineState: Readonly<GraphState>;
}
```

## Built-In Policy Rules

### Rule 1: Trust Tier Enforcement

```typescript
const TRUST_TIER_RULE: PolicyRule = {
  id: 'trust-tier',
  priority: 100,
  evaluate(context): PolicyDecision {
    // If stage processes untrusted input (tier 3-4),
    // block stages that write to repo or execute code
    const hasUntrustedInput = context.artifacts.some((a) => a.metadata.trustTier >= 3);
    const stageWrites = context.stage.type === 'execute';
    if (hasUntrustedInput && stageWrites) {
      return {
        allow: false,
        reason: 'Untrusted input cannot trigger execute stages',
        escalateTo: 'user',
      };
    }
    return { allow: true };
  },
};
```

### Rule 2: Security Review Gate

```typescript
const SECURITY_REVIEW_RULE: PolicyRule = {
  id: 'security-review',
  priority: 90,
  evaluate(context): PolicyDecision {
    // If task involves security-sensitive changes,
    // require security expert review before implementation
    const isSecuritySensitive =
      context.task.analysis.requiredCapabilities.experts.includes('security_expert');
    const isImplementation = context.stage.type === 'execute';
    const hasSecurityReview = context.artifacts.some(
      (a) => a.type === 'review' && a.metadata.reviewer === 'security_expert'
    );
    if (isSecuritySensitive && isImplementation && !hasSecurityReview) {
      return { allow: false, reason: 'Security review required before implementation' };
    }
    return { allow: true };
  },
};
```

### Rule 3: Bounded Iteration

```typescript
const BOUNDED_ITERATION_RULE: PolicyRule = {
  id: 'bounded-iteration',
  priority: 80,
  evaluate(context): PolicyDecision {
    // Enforce per-stage max retries
    const stageAttempts = context.pipelineState.stageResults[context.stage.id]?.attempts ?? 0;
    const maxAttempts = context.stage.config.maxRetries ?? 3;
    if (stageAttempts >= maxAttempts) {
      return {
        allow: false,
        reason: `Stage ${context.stage.id} exceeded max retries (${maxAttempts})`,
      };
    }
    return { allow: true };
  },
};
```

### Rule 4: Cost Budget

```typescript
const COST_BUDGET_RULE: PolicyRule = {
  id: 'cost-budget',
  priority: 70,
  evaluate(context): PolicyDecision {
    // If estimated remaining cost exceeds budget, require approval
    const spent = context.pipelineState.costAccumulator ?? 0;
    const budget = context.task.constraints.budget;
    if (budget !== undefined && spent > budget * 0.8) {
      return { allow: false, reason: 'Approaching cost budget limit', escalateTo: 'user' };
    }
    return { allow: true };
  },
};
```

### Rule 5: High-Risk Action Approval

```typescript
const HIGH_RISK_RULE: PolicyRule = {
  id: 'high-risk-approval',
  priority: 60,
  evaluate(context): PolicyDecision {
    // Repo-wide changes, large refactors, security-sensitive ops
    // require explicit user approval
    const highRiskIndicators = [
      context.task.analysis.complexity === 'expert',
      context.task.analysis.taskType === 'architecture',
      (context.task.constraints.scope?.length ?? 0) === 0, // unbounded scope
    ];
    const riskCount = highRiskIndicators.filter(Boolean).length;
    if (riskCount >= 2 && !context.pipelineState.userApproved) {
      return {
        allow: false,
        reason: 'High-risk action requires user approval',
        escalateTo: 'user',
      };
    }
    return { allow: true };
  },
};
```

## Governance Integration

### Tier Classification → Policy Gates

The existing gateway tier classifier maps to default policy gate placement:

| Tier             | Tools                                                         | Default Policy Gates                                            |
| ---------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| DIRECT (1)       | list_experts, list_workflows, memory_stats, research_query    | None (pass-through)                                             |
| ANALYZED (2)     | delegate_to_model, memory_query, weather_report               | Cost budget check                                               |
| ORCHESTRATED (3) | orchestrate, consensus_vote, execute_spec, run_graph_workflow | Trust tier + security review + cost budget + high-risk approval |

### Consensus as Policy Gate

For architecture and security decisions, the consensus vote becomes a policy gate:

```typescript
const CONSENSUS_GATE: PolicyRule = {
  id: 'consensus-approval',
  priority: 50,
  evaluate(context): PolicyDecision {
    if (context.task.analysis.taskType !== 'architecture') return { allow: true };
    // Check if consensus vote artifact exists
    const hasConsensus = context.artifacts.some(
      (a) => a.type === 'vote' && a.metadata.decision === 'approved'
    );
    if (!hasConsensus) {
      return { allow: false, reason: 'Architecture changes require consensus approval' };
    }
    return { allow: true };
  },
};
```

## Escalation Paths

When a policy gate returns `escalateTo`:

| Escalate To   | Action                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------- |
| `'user'`      | Emit `pipeline.approval_required` event. Pause pipeline (breakpoint). Wait for user response. |
| `'consensus'` | Trigger consensus vote. Pass result as artifact. Re-evaluate gate.                            |
| `'admin'`     | Log to audit trail. Block pipeline. Require manual intervention.                              |

## Configuration

```yaml
# nexus-agents.yaml
governance:
  policyGates:
    enabled: true
    defaultOnFail: 'block' # 'block' | 'warn' | 'escalate'
    rules:
      trust-tier: { enabled: true, priority: 100 }
      security-review: { enabled: true, priority: 90 }
      bounded-iteration: { enabled: true, priority: 80 }
      cost-budget: { enabled: true, priority: 70 }
      high-risk-approval: { enabled: true, priority: 60 }
      consensus-approval: { enabled: false, priority: 50 } # opt-in
    escalation:
      defaultTarget: 'user'
      maxEscalationsPerPipeline: 3
```

## Migration from V1

1. **Phase 1:** Policy engine as library with no integration. Rules can be tested standalone.
2. **Phase 2:** Wire into PipelineRunner between graph super-steps. Gateway middleware delegates to policy engine.
3. **Phase 3:** Enable by default. Gateway transitions from observe-only to enforce.
