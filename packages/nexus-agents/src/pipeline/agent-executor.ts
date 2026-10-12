/**
 * Agent Executor — Connects pipeline stages to nexus-agents infrastructure (#1684)
 *
 * DRY integration (Issue #1691):
 * - CompositeRouter for intelligent multi-CLI routing (#1692)
 * - Pipeline observability events + OutcomeStore recording (#1696)
 * - Task tracker for GitHub/GitLab/JSON issue management
 *
 * @module pipeline/agent-executor
 */

import type { DevPipelineStages } from './dev-pipeline.js';
import { createBudgetGuard } from './budget-guard.js';
import {
  type AgentExecutorConfig,
  emitStageEvent,
  UNMEASURED_TRUST_TIER,
} from './agent-executor-core.js';
import { createVoteStage } from './agent-executor-vote.js';
import { IMPLEMENT_ACCESS_MODE } from './implement-result.js';
import {
  createDecomposeStage,
  createImplementStage,
  createPlanStage,
  createQaReviewStage,
  createQualityGateStage,
  createResearchStage,
  createSecurityScanStage,
} from './agent-executor-stages.js';
import type { IAuditLogger } from '../audit/audit-types.js';
import { createDurableAuditSink } from '../security/audit-bridge.js';
import type { AuditTrail } from '../security/audit-trail.js';
import { createAuditTrail } from '../security/audit-trail.js';
import { getPipelineEventBus } from './event-bus.js';
import { createDefaultPolicyEngine, type PolicyContext } from './policy-engine.js';
import {
  evaluatePipelinePolicy,
  getGateEnforcementMode,
  PolicyBlockedError,
} from './policy-evaluator.js';

// The executor's pieces live in sibling modules (#6331); these re-exports keep
// the published names on this module.
export {
  type AgentExecutorConfig,
  runExpert,
  UNMEASURED_TRUST_TIER,
} from './agent-executor-core.js';
export { buildVoteProposal } from './agent-executor-vote.js';
export { flushPipelineMemory } from './agent-executor-memory.js';
// Re-export the shared ReDoS-safe JSON-array extractor (moved to
// core/json-extract.ts in #1912 to serve multiple callers). Kept as a
// re-export for backwards compatibility with the existing regression
// tests in agent-executor-redos.test.ts.
export { extractJsonArray } from '../core/json-extract.js';

// ============================================================================
// Pipeline Stages
// ============================================================================

/** Build the durable policy AuditTrail wrapping the server's auditLogger (#4694). */
function buildPolicyAuditTrail(auditLogger: IAuditLogger | undefined): AuditTrail | undefined {
  if (auditLogger === undefined) return undefined;
  return createAuditTrail(createDurableAuditSink(auditLogger));
}

/**
 * Enforces policy at stage boundaries (#4694).
 *
 * Missing or unmeasured caller tier fails closed to untrusted (4) by leaving
 * pipelineState.trustTier undefined in the snapshot. Under WARN mode (default),
 * violations are emitted to the event bus and audit trail without throwing.
 * Under BLOCK mode, violations throw {@link PolicyBlockedError} and halt the stage.
 */
function enforceStagePolicy(
  stage: string,
  stageType: 'plan' | 'execute',
  config: AgentExecutorConfig,
  callerTrustTier: string
): void {
  const mode = getGateEnforcementMode();
  if (mode === 'off') return;

  const auditTrail = buildPolicyAuditTrail(config.auditLogger);

  const context: PolicyContext = {
    taskId: config.sessionId ?? 'agent-executor',
    stageId: stage,
    stageType,
    // #4694: Map UNMEASURED_TRUST_TIER or missing tier to undefined in the snapshot
    // so trustTierRule fail-closes to untrusted (4) by default.
    pipelineState:
      callerTrustTier !== UNMEASURED_TRUST_TIER && typeof callerTrustTier === 'string'
        ? { trustTier: callerTrustTier }
        : {},
  };

  const result = evaluatePipelinePolicy(
    {
      engine: createDefaultPolicyEngine(),
      mode,
      eventBus: getPipelineEventBus(),
      ...(auditTrail !== undefined ? { auditTrail } : {}),
    },
    context
  );

  if (mode === 'block' && !result.allowed) {
    throw new PolicyBlockedError(context.stageId, result.violations);
  }
}

export function createAgentStages(config: AgentExecutorConfig = {}): DevPipelineStages {
  // Per-run budget guard (#3395). No-op unless config.budget is set.
  const guard = createBudgetGuard(config.budget);

  // #4733: record caller authentication and sanitizer observations at stage entry.
  // Stage entry is the one point BOTH model paths pass through — `runExpert`
  // (plan/decompose/implement/qaReview) and `executeVoting`, which dispatches
  // consensus voters through its own adapters and never touches `runExpert`.
  // Recording and policy enforcement here therefore have no coverage gap (#4694),
  // which a `runExpert` guard would have had while reporting success.
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- retain the published alias until the next major (#4733)
  const callerTrustTier = config.callerTrustTier ?? config.trustTier ?? UNMEASURED_TRUST_TIER;
  const inputSanitization = config.inputSanitization ?? 'unmeasured';
  const startStage = (stage: string, stageType?: 'plan' | 'execute'): void => {
    emitStageEvent(stage, 'started', {
      callerTrustTier,
      trustTier: callerTrustTier,
      inputSanitization,
      ...(inputSanitization === 'modified' && config.inputSanitizationCounts !== undefined
        ? { inputSanitizationCounts: config.inputSanitizationCounts }
        : {}),
    });
    const resolvedType =
      stageType ?? (stage === 'implement' || stage.startsWith('impl-') ? 'execute' : 'plan');
    enforceStagePolicy(stage, resolvedType, config, callerTrustTier);
  };
  // Left un-annotated on purpose: the api-surface walk follows type references
  // inside function bodies, and `StageDeps` is an internal seam, not public API.
  const deps = { config, guard, startStage };
  return {
    research: createResearchStage(deps),
    plan: createPlanStage(deps),
    vote: createVoteStage(deps),
    decompose: createDecomposeStage(deps),
    ...createExecutionStages(deps),
    // #6794: execution closures share the same guard and scratch directory.
    withWorkspace: ({
      directory,
      root,
      dependencies: workspaceDependencies,
      wrapper,
      baseline,
    }) => {
      const bound = {
        ...deps,
        workspaceDependencies,
        workspaceRoot: root,
        wrapper,
        config: { ...config, scanTarget: directory, securityBaseline: baseline },
      };
      return {
        ...createExecutionStages(bound),
        research: createResearchStage(deps),
        plan: createPlanStage(deps),
        vote: createVoteStage(deps),
        decompose: createDecomposeStage(deps),
      };
    },
  };
}

/** Execution stages share a budget while targeting the per-run checkout. */
function createExecutionStages(
  deps: Parameters<typeof createImplementStage>[0]
): Pick<
  DevPipelineStages,
  'implement' | 'qaReview' | 'qualityGate' | 'securityScan' | 'implementWorkspace'
> {
  return {
    implement: createImplementStage(deps),
    qaReview: createQaReviewStage(deps),
    qualityGate: createQualityGateStage(deps),
    securityScan: createSecurityScanStage(deps),
    implementWorkspace: {
      accessMode: deps.config.dryRun === true ? 'read-only-analysis' : IMPLEMENT_ACCESS_MODE,
      directory: deps.config.scanTarget ?? process.cwd(),
    },
  };
}
