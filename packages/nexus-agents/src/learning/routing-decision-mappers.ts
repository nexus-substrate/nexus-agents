/** Pure projections of a composite routing decision into its telemetry sinks. */
import type { CompositeRoutingDecision } from '../cli-adapters/composite-router-types.js';
import { routingArmCliSlot, type RoutingArmId } from '../cli-adapters/types.js';
import type { RoutingDecision as ObserverDecision } from '../agents/observability/orchestration-observer-types.js';
import type { RoutingDecision, RouterType } from './outcome-feedback-types.js';
import type { StoredRoutingDecision } from './outcome-storage-types.js';

interface FeedbackContext {
  readonly id: string;
  readonly traceId: string;
  readonly timestamp: string;
  readonly routerType: RouterType;
  readonly routerTypeMeasured: boolean;
  readonly query?: string | undefined;
}

/** Preserve endpoint identity; built-in vendor arms retain their published CLI attribution. */
function recordedArm(armId: RoutingArmId): RoutingArmId {
  return routingArmCliSlot(armId) ?? armId;
}

/** Missing task text uses the public contract's empty-string sentinel. */
export function mapFeedbackRoutingDecision(
  decision: CompositeRoutingDecision,
  context: FeedbackContext
): RoutingDecision {
  return {
    id: context.id,
    traceId: context.traceId,
    timestamp: context.timestamp,
    routerType: context.routerType,
    routerTypeMeasured: context.routerTypeMeasured,
    query: context.query ?? '',
    selectedModel: recordedArm(decision.cliName),
    confidence: decision.confidence,
    selectedTier: decision.preferenceTier,
  };
}

/** The observer retains its bounded task description and distinct endpoint identities. */
export function mapObserverRoutingDecision(
  decision: CompositeRoutingDecision,
  context: { readonly timestamp: string; readonly taskId: string; readonly query: string }
): ObserverDecision {
  return {
    timestamp: context.timestamp,
    taskId: context.taskId,
    taskDescription:
      context.query.length > 100 ? context.query.substring(0, 100) + '...' : context.query,
    selectedCli: recordedArm(decision.cliName),
    confidence: decision.confidence,
    reason: decision.reason,
    alternatives: decision.alternatives.map(recordedArm),
    stagesExecuted: decision.stagesExecuted,
    decisionTimeMs: decision.decisionTimeMs,
    withinBudget: decision.withinBudget,
    topsisScore: decision.topsisScore,
    ucbScore: decision.ucbScore,
  };
}

/** Persist the explanation and serialized task profile, with measured attribution. */
export function mapStoredRoutingDecision(
  decision: CompositeRoutingDecision,
  context: Omit<FeedbackContext, 'query'>
): StoredRoutingDecision {
  const profile = decision.taskProfile;
  return {
    id: context.id,
    traceId: context.traceId,
    timestamp: context.timestamp,
    routerType: context.routerType,
    routerTypeMeasured: context.routerTypeMeasured,
    selectedModel: recordedArm(decision.cliName),
    alternativeModels: decision.alternatives.map(recordedArm),
    confidence: decision.confidence,
    reason: decision.reason,
    taskProfile: {
      contextRequired: profile.contextRequired,
      reasoningComplexity: profile.reasoningComplexity,
      codeGeneration: profile.codeGeneration,
      multimodal: profile.multimodal,
      parallelizable: profile.parallelizable,
      budgetSensitive: profile.budgetSensitive,
      taskType: profile.taskType,
      ...(profile.detectedProductType !== undefined && {
        detectedProductType: profile.detectedProductType,
      }),
    },
  };
}
