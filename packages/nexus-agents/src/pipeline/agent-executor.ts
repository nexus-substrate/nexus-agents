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

export function createAgentStages(config: AgentExecutorConfig = {}): DevPipelineStages {
  // Per-run budget guard (#3395). No-op unless config.budget is set.
  const guard = createBudgetGuard(config.budget);

  // #4733: record caller authentication and sanitizer observations at stage entry.
  // Stage entry is the one point BOTH model paths pass through — `runExpert`
  // (plan/decompose/implement/qaReview) and `executeVoting`, which dispatches
  // consensus voters through its own adapters and never touches `runExpert`.
  // Recording here therefore has no coverage gap, which a `runExpert` guard
  // would have had while reporting success.
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- retain the published alias until the next major (#4733)
  const callerTrustTier = config.callerTrustTier ?? config.trustTier ?? UNMEASURED_TRUST_TIER;
  const inputSanitization = config.inputSanitization ?? 'unmeasured';
  const startStage = (stage: string): void => {
    emitStageEvent(stage, 'started', {
      callerTrustTier,
      trustTier: callerTrustTier,
      inputSanitization,
      ...(inputSanitization === 'modified' && config.inputSanitizationCounts !== undefined
        ? { inputSanitizationCounts: config.inputSanitizationCounts }
        : {}),
    });
  };
  // Left un-annotated on purpose: the api-surface walk follows type references
  // inside function bodies, and `StageDeps` is an internal seam, not public API.
  const deps = { config, guard, startStage };
  return {
    research: createResearchStage(deps),
    plan: createPlanStage(deps),
    vote: createVoteStage(deps),
    decompose: createDecomposeStage(deps),
    implement: createImplementStage(deps),
    // #6792: implement passes no workDir, so its expert edits the MCP
    // server's cwd; the pipeline warns when a quality gate then runs there.
    implementWorkspace: { accessMode: IMPLEMENT_ACCESS_MODE, directory: process.cwd() },
    qaReview: createQaReviewStage(deps),
    qualityGate: createQualityGateStage(deps),
    securityScan: createSecurityScanStage(deps),
  };
}
