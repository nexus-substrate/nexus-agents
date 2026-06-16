/**
 * nexus-agents/orchestration - MetaOrchestrator decision + record builders (#3836).
 *
 * The pure functions that assemble a {@link MetaDecision} (forced or selected)
 * and project it to its {@link MetaSelectionRecord} for the audit sink. Extracted
 * from `meta-orchestrator.ts` so the orchestrator file stays a thin wiring layer
 * (CODING_STANDARDS ≤400 lines). No I/O, no side effects — every function here is
 * deterministic given its inputs.
 *
 * @module orchestration/meta-orchestrator-decision
 * (Source: Issue #3836 — router refactor over the manifest registry)
 */

import type { ExecutionStrategy, MetaDecision, MetaSelectionRecord } from './meta-orchestrator.js';
import { entrypointToolFor, getStrategyManifest } from './strategy-manifest-registry.js';
import { decideStrategy, buildAlternatives } from './meta-orchestrator-routing.js';
import type { TaskClassification } from '../pipeline/adaptive-orchestrator.js';
import type { RoutingDecision } from './workflow-router-types.js';

/** Common sub-signal fields shared by every decision. */
function subSignals(
  routing: RoutingDecision,
  classification: TaskClassification
): Pick<MetaDecision, 'pattern' | 'pipelineType' | 'analysis' | 'capabilityGaps'> {
  return {
    pattern: routing.pattern,
    pipelineType: classification.pipelineType,
    analysis: routing.analysis,
    ...(routing.capabilityGaps !== undefined ? { capabilityGaps: routing.capabilityGaps } : {}),
  };
}

/**
 * Builds a forced decision. The manifest still backs the audit trail: a forced
 * strategy resolves its manifest (and entrypoint tool) through the registry, so
 * even the escape-hatch path is manifest-sourced, not literal.
 */
export function buildForcedDecision(
  forced: ExecutionStrategy,
  routing: RoutingDecision,
  classification: TaskClassification
): Omit<MetaDecision, 'decisionId'> {
  const manifest = getStrategyManifest(forced);
  return {
    strategy: forced,
    reasoning: `Strategy forced by caller: ${forced} (entrypoint ${entrypointToolFor(forced)})`,
    confidence: 1.0,
    alternatives: buildAlternatives(forced, routing, classification),
    needsShaping: false,
    manifestId: manifest?.id ?? forced,
    manifestSchemaVersion: manifest?.schemaVersion ?? 0,
    ...subSignals(routing, classification),
  };
}

/** Builds a selected (auto-routed) decision from the manifest-driven router. */
export function buildSelectedDecision(
  routing: RoutingDecision,
  classification: TaskClassification
): Omit<MetaDecision, 'decisionId'> {
  const core = decideStrategy(routing, classification);
  const needsShaping = routing.needsClarification === true;
  return {
    strategy: core.strategy,
    reasoning: core.reasoning,
    confidence: core.confidence,
    alternatives: buildAlternatives(core.strategy, routing, classification),
    needsShaping,
    manifestId: core.manifestId,
    manifestSchemaVersion: core.manifestSchemaVersion,
    ...(needsShaping && routing.suggestedQuestions !== undefined
      ? { shapingQuestions: routing.suggestedQuestions }
      : {}),
    ...subSignals(routing, classification),
  };
}

/** Maps a finished decision to its observability record. */
export function toRecord(
  decision: MetaDecision,
  goal: string,
  forced: boolean,
  timestamp: string
): MetaSelectionRecord {
  return {
    decisionId: decision.decisionId,
    timestamp,
    goal,
    strategy: decision.strategy,
    confidence: decision.confidence,
    pattern: decision.pattern,
    pipelineType: decision.pipelineType,
    alternatives: decision.alternatives,
    needsShaping: decision.needsShaping,
    forced,
    manifestId: decision.manifestId,
    manifestSchemaVersion: decision.manifestSchemaVersion,
  };
}
