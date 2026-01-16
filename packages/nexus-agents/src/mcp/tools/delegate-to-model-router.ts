/**
 * nexus-agents/mcp - Delegate to Model Router Integration
 *
 * CompositeRouter integration for delegate_to_model tool.
 *
 * (Source: Issue #169, Epic #164)
 */

import type { ILogger } from '../../core/index.js';
import type {
  ICompositeRouter,
  CompositeRoutingDecision,
} from '../../cli-adapters/composite-router.js';
import type { IFeedbackIntegration } from '../../learning/feedback-integration.js';
// Import directly from types to avoid circular dependency with delegate-to-model.ts
import type { CapabilityProfile, DelegateOutput } from './delegate-to-model-types.js';
import { MODEL_CAPABILITIES } from './delegate-to-model-types.js';

/**
 * Maps CLI name to model name for output.
 */
export function cliNameToModel(cliName: 'claude' | 'gemini' | 'codex'): string {
  const modelMap: Record<string, string> = {
    claude: 'claude-sonnet',
    gemini: 'gemini-pro',
    codex: 'codex-5.2',
  };
  return modelMap[cliName] ?? cliName;
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
  const modelName = cliNameToModel(decision.cliName);
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

  return { decision, routingId };
}
