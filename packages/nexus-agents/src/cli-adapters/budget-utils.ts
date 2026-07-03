/**
 * Budget utilities for cost estimation and token counting.
 *
 * Token costs are NO LONGER hardcoded here: `estimateCost` resolves per-CLI
 * pricing from the model registry via `resolveCliCostPer1M` (#4168), so the
 * `ModelEntry.pricing` chain is the single authoritative source. Unpriced
 * models fall back to the conservative `STATIC_CLI_COST_PER_1M` map (never $0).
 *
 * @module cli-adapters/budget-utils
 * (Source: Issue #102, arXiv:2508.21141 - EMNLP 2025)
 */

import type { CliName } from './types.js';
import { resolveCliCostPer1M } from '../config/model-config-helpers.js';

/**
 * Estimate tokens from task content.
 * Uses rough approximation of 4 characters per token.
 */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Estimate cost (USD) for a task based on estimated tokens, using registry
 * pricing for the CLI's default model (conservative static fallback when
 * unpriced — never $0). Rates are per-1M tokens.
 */
export function estimateCost(model: CliName, inputTokens: number, outputTokens: number): number {
  const costs = resolveCliCostPer1M(model);
  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;
  return inputCost + outputCost;
}

/**
 * Format tokens with K/M suffix for readability.
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return String(tokens);
}
