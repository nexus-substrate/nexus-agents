/**
 * nexus-agents/mcp - Delegate to Model Router Integration
 *
 * CompositeRouter integration for delegate_to_model tool.
 *
 * (Source: Issue #169, Epic #164)
 */

import type { ILogger, ICompositeRouter, CompositeRoutingDecision } from '../../core/index.js';
import { getErrorMessage } from '../../core/index.js';
import type { IFeedbackIntegration } from '../../learning/feedback-integration.js';
// Import directly from types to avoid circular dependency with delegate-to-model.ts
import type { CapabilityProfile, DelegateOutput } from './delegate-to-model-types.js';
import { MODEL_CAPABILITIES } from './delegate-to-model-types.js';
import { getDefaultModelForCli } from '../../config/model-config-helpers.js';
import type { CliNameLiteral } from '../../config/model-capabilities-types.js';

/**
 * Maps CLI name to default model ID for output.
 * Registry-backed via {@link getDefaultModelForCli}.
 */
export function cliNameToModel(cliName: CliNameLiteral): string {
  return getDefaultModelForCli(cliName);
}

/**
 * Default capability profile for unknown models.
 */
const DEFAULT_CAPABILITIES: CapabilityProfile = {
  reasoning: 8,
  contextWindow: 200_000,
  codeGeneration: 8,
  speed: 7,
  cost: 6,
};

/**
 * Maps CompositeRoutingDecision to DelegateOutput format.
 */
export function mapCompositeDecisionToOutput(
  decision: CompositeRoutingDecision,
  estimatedTokens: number
): DelegateOutput {
  // #3394: prefer the route-time tier-selected model when present (opt-in);
  // otherwise fall back to the CLI default. Default-off → decision.model undefined.
  const modelName = decision.model ?? cliNameToModel(decision.cliName);
  const caps = MODEL_CAPABILITIES[modelName] ?? DEFAULT_CAPABILITIES;

  return {
    recommended_model: modelName,
    reasoning: decision.reason,
    capabilities: caps,
    estimated_tokens: estimatedTokens,
    alternatives: decision.alternatives.slice(0, 3).map((alt) => ({
      model: cliNameToModel(alt),
      score: decision.topsisScore ?? 0.7,
      tradeoff: 'alternative option',
    })),
  };
}

/**
 * Result of routing via CompositeRouter.
 */
export interface CompositeRoutingResult {
  decision: CompositeRoutingDecision;
  routingId?: string | undefined;
  feedbackIntegration?: IFeedbackIntegration | undefined;
}

/**
 * Routes task via CompositeRouter when available.
 */
export async function routeViaCompositeRouter(
  task: string,
  router: ICompositeRouter,
  feedbackIntegration: IFeedbackIntegration | undefined,
  logger: ILogger
): Promise<CompositeRoutingResult | null> {
  const result = await router.route({ content: task });

  if (!result.ok) {
    logger.warn('CompositeRouter routing failed', { error: result.error.message });
    return null;
  }

  const decision = result.value;

  // Record routing decision for feedback if available
  let routingId: string | undefined;
  if (feedbackIntegration) {
    routingId = feedbackIntegration.recordRoutingDecision(decision);
    logger.debug('Recorded routing decision', { routingId, cliName: decision.cliName });
  }

  return { decision, routingId, feedbackIntegration };
}

/**
 * Records the outcome of a routing decision to close the feedback loop.
 * Without this, pending decisions accumulate and degrade LinUCB learning.
 *
 * Since delegate_to_model is a recommendation (not execution), we cannot
 * observe true success/failure. We derive quality from the TOPSIS score
 * and mark success only when the score exceeds a confidence threshold.
 * This prevents always-positive rewards from collapsing LinUCB to uniform policy.
 *
 * (Source: Issue #1160, refined in #1168)
 */
export function recordRoutingOutcome(
  result: CompositeRoutingResult,
  durationMs: number,
  logger: ILogger
): void {
  if (result.routingId === undefined || result.feedbackIntegration === undefined) return;
  try {
    const topsisScore = result.decision.topsisScore ?? 0;
    // Only mark as success when TOPSIS confidence is above threshold.
    // Low TOPSIS scores indicate weak differentiation — negative signal.
    const TOPSIS_CONFIDENCE_THRESHOLD = 0.6;
    result.feedbackIntegration.recordOutcome({
      routingDecisionId: result.routingId,
      success: topsisScore >= TOPSIS_CONFIDENCE_THRESHOLD,
      qualityScore: topsisScore,
      durationMs,
      tokenUsage: 0, // delegate-to-model is a recommendation, not execution
    });
    logger.debug('Recorded routing outcome', {
      routingId: result.routingId,
      topsisScore,
      success: topsisScore >= TOPSIS_CONFIDENCE_THRESHOLD,
    });
  } catch (error: unknown) {
    logger.warn('Failed to record routing outcome', { error: getErrorMessage(error) });
  }
}
