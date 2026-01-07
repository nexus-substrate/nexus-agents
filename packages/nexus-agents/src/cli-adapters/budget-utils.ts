/**
 * Budget utilities for cost estimation and token counting.
 *
 * @module cli-adapters/budget-utils
 * (Source: Issue #102, arXiv:2508.21141 - EMNLP 2025)
 */

import type { CliName } from './types.js';

/**
 * Token cost estimates per 1M tokens (USD).
 * Based on public pricing as of 2025-01.
 */
export const TOKEN_COSTS: Record<CliName, { input: number; output: number }> = {
  claude: { input: 3.0, output: 15.0 },
  gemini: { input: 0.075, output: 0.3 },
  codex: { input: 2.5, output: 10.0 },
};

/**
 * Estimate tokens from task content.
 * Uses rough approximation of 4 characters per token.
 */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Estimate cost for a task based on estimated tokens.
 */
export function estimateCost(model: CliName, inputTokens: number, outputTokens: number): number {
  const costs = TOKEN_COSTS[model];
  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;
  return inputCost + outputCost;
}

/**
 * Format cost as USD string.
 */
export function formatCost(costUsd: number): string {
  return `$${costUsd.toFixed(4)}`;
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
