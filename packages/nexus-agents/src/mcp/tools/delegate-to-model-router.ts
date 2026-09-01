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
import {
  getDefaultModelForCli,
  FALLBACK_CONTEXT_WINDOW,
} from '../../config/model-config-helpers.js';
import type { CliNameLiteral } from '../../config/model-capabilities-types.js';
import { routingArmDisplaySlot } from '../../cli-adapters/types.js';
import type { RoutingArmId } from '../../cli-adapters/types.js';
// #5269: the same pure capability comparison the non-router path uses, so both
// paths describe an alternative the same way.
import { getTradeoff } from './delegate-to-model-helpers.js';

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
  contextWindow: FALLBACK_CONTEXT_WINDOW,
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
  // Model lookup is registry/slot-level; collapse api:* arms to their display
  // slot for the default-model resolution (#3422).
  const modelName = decision.model ?? cliNameToModel(routingArmDisplaySlot(decision.cliName));
  const caps = MODEL_CAPABILITIES[modelName] ?? DEFAULT_CAPABILITIES;

  return {
    recommended_model: modelName,
    reasoning: decision.reason,
    capabilities: caps,
    estimated_tokens: estimatedTokens,
    alternatives: decision.alternatives
      .slice(0, 3)
      .map((alt) => describeAlternative(alt, decision, caps)),
  };
}

/**
 * Describe one alternative honestly (#5269).
 *
 * This used to be `score: decision.topsisScore ?? 0.7, tradeoff: 'alternative
 * option'` — the WINNER's score on every alternative, and a placeholder string.
 * A caller reading three alternatives that all scored alike concluded they were
 * equivalent to each other and to the selection, which the router had not said.
 *
 * The sibling non-router path (`delegate-to-model-helpers.ts`) always filled
 * these correctly, so identical output shapes carried different epistemic
 * status and the caller could not tell which had produced them. That is the
 * asymmetry this closes.
 */
function describeAlternative(
  alt: RoutingArmId,
  decision: CompositeRoutingDecision,
  bestCaps: CapabilityProfile
): { model: string; score: number; tradeoff: string } {
  const model = cliNameToModel(routingArmDisplaySlot(alt));
  const altCaps = MODEL_CAPABILITIES[model] ?? DEFAULT_CAPABILITIES;
  const ranked = decision.alternativeScores?.get(alt);

  if (ranked !== undefined) {
    return { model, score: ranked, tradeoff: getTradeoff(bestCaps, altCaps) };
  }

  // No ranking ran, so there is no per-alternative score to report. The output
  // schema requires a number, so the winner's score is still what goes in the
  // field — but the tradeoff now SAYS that, rather than letting the number pass
  // as this alternative's own. Absence is disclosed where it can be, since it
  // cannot be represented in a `z.number()`.
  return {
    model,
    score: decision.topsisScore ?? 0.7,
    tradeoff: `not ranked — score shown is the selected model's, not this alternative's; ${getTradeoff(bestCaps, altCaps)}`,
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
