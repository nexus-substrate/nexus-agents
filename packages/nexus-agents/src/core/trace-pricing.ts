/**
 * nexus-agents/core - Model Pricing
 *
 * Model pricing constants and cost calculation functions.
 */

// =============================================================================
// Model Pricing (per 1M tokens, USD)
// =============================================================================

/**
 * Pricing information for a model.
 * (Source: Provider pricing pages, verified 2026-01-04)
 */
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

/**
 * Model pricing table.
 * Prices are in USD per 1 million tokens.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic Claude models (Source: anthropic.com/pricing)
  'claude-opus-4': { inputPer1M: 15.0, outputPer1M: 75.0 },
  'claude-sonnet-4': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-3-5-sonnet': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-3-5-haiku': { inputPer1M: 0.8, outputPer1M: 4.0 },
  'claude-3-opus': { inputPer1M: 15.0, outputPer1M: 75.0 },
  'claude-3-sonnet': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-3-haiku': { inputPer1M: 0.25, outputPer1M: 1.25 },

  // OpenAI models (Source: openai.com/pricing)
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10.0 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gpt-4-turbo': { inputPer1M: 10.0, outputPer1M: 30.0 },
  'gpt-4': { inputPer1M: 30.0, outputPer1M: 60.0 },
  'gpt-3.5-turbo': { inputPer1M: 0.5, outputPer1M: 1.5 },
  o1: { inputPer1M: 15.0, outputPer1M: 60.0 },
  'o1-mini': { inputPer1M: 3.0, outputPer1M: 12.0 },

  // Google models (Source: cloud.google.com/vertex-ai/pricing)
  'gemini-2.0-flash': { inputPer1M: 0.1, outputPer1M: 0.4 },
  'gemini-1.5-pro': { inputPer1M: 1.25, outputPer1M: 5.0 },
  'gemini-1.5-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
};

// =============================================================================
// Cost Calculation
// =============================================================================

/**
 * Calculates the cost of an LLM call based on token usage.
 *
 * @param model - Model identifier
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cost in USD, or undefined if pricing not available
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | undefined {
  // Try exact match first
  let pricing = MODEL_PRICING[model];

  // If not found, try partial match (e.g., 'claude-sonnet-4-20250514' -> 'claude-sonnet-4')
  if (pricing === undefined) {
    const baseModel = Object.keys(MODEL_PRICING).find((key) => model.startsWith(key));
    if (baseModel !== undefined) {
      pricing = MODEL_PRICING[baseModel];
    }
  }

  if (pricing === undefined) {
    return undefined;
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;

  return inputCost + outputCost;
}
