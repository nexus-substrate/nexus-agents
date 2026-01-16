/**
 * nexus-agents/agents - SICA Self-Improving Agent Helpers
 *
 * Pure helper functions for SICA agent operations.
 * These functions have no class dependencies and can be tested independently.
 *
 * @module agents/self-improving/sica-agent-helpers
 * (Source: arXiv:2504.15228, Issue #151)
 */

import { randomUUID } from 'node:crypto';
import type { TaskResult } from '../../core/index.js';
import type {
  AgentConfiguration,
  ConfigurationChange,
  ImprovementAttempt,
  ImprovementOptions,
  VersionMetrics,
} from './sica-types.js';

/**
 * Estimates quality of output based on heuristics.
 *
 * Quality scoring:
 * - Base: 0.5
 * - +0.1 for length > 100 chars
 * - +0.1 for length > 500 chars
 * - +0.1 for no error mentions
 * - +0.1 for code blocks
 *
 * @param result - The task result to evaluate
 * @returns Quality score between 0 and 1
 */
export function estimateQuality(result: TaskResult): number {
  const output = result.output as string;
  if (typeof output !== 'string') return 0.5;

  let score = 0.5;
  if (output.length > 100) score += 0.1;
  if (output.length > 500) score += 0.1;
  if (!output.includes('error') && !output.includes('Error')) score += 0.1;
  if (output.includes('```')) score += 0.1;

  return Math.min(1, score);
}

/**
 * Improves a prompt with general clarity instructions.
 *
 * @param prompt - The original system prompt
 * @returns Enhanced prompt with clarity instructions
 */
export function improvePromptGeneral(prompt: string): string {
  const addition = '\n\nFocus on clarity, correctness, and completeness in your responses.';
  return prompt + addition;
}

/**
 * Improves a prompt with error handling instructions.
 *
 * @param prompt - The original system prompt
 * @returns Enhanced prompt with error handling guidance
 */
export function improvePromptForErrors(prompt: string): string {
  const addition = '\n\nIMPORTANT: Handle edge cases carefully. Validate inputs before processing.';
  return prompt + addition;
}

/**
 * Improves a prompt with conciseness instructions.
 *
 * @param prompt - The original system prompt
 * @returns Enhanced prompt with conciseness guidance
 */
export function improvePromptForConciseness(prompt: string): string {
  const addition = '\n\nBe concise. Provide direct answers without unnecessary elaboration.';
  return prompt + addition;
}

/**
 * Applies configuration changes to create a new configuration.
 *
 * @param config - The original configuration
 * @param changes - The changes to apply
 * @returns New configuration with changes applied
 */
export function applyChanges(
  config: AgentConfiguration,
  changes: readonly ConfigurationChange[]
): AgentConfiguration {
  let result = { ...config };

  for (const change of changes) {
    if (change.field === 'systemPrompt') {
      result = { ...result, systemPrompt: change.newValue as string };
    } else if (change.field === 'temperature') {
      result = { ...result, temperature: change.newValue as number };
    } else if (change.field === 'maxTokens') {
      result = { ...result, maxTokens: change.newValue as number };
    }
  }

  return result;
}

/**
 * Creates a failed improvement attempt record.
 *
 * @param sourceVersionId - The version that was being improved
 * @param hypothesis - The improvement hypothesis
 * @param reason - The reason for failure
 * @returns A failed ImprovementAttempt
 */
export function createFailedAttempt(
  sourceVersionId: string,
  hypothesis: string,
  reason: string
): ImprovementAttempt {
  return {
    id: randomUUID(),
    sourceVersionId,
    hypothesis,
    changes: [],
    successful: false,
    attemptedAt: new Date(),
    validation: {
      passed: false,
      performanceChange: 0,
      checks: [{ name: 'creation', passed: false, details: reason }],
    },
  };
}

/**
 * Generates an improvement hypothesis based on metrics.
 *
 * @param metrics - The version metrics to analyze
 * @param options - Improvement options with focus area
 * @returns A hypothesis string describing the improvement direction
 */
export function generateHypothesis(metrics: VersionMetrics, options: ImprovementOptions): string {
  const focus = options.focusArea ?? 'reliability';

  if (metrics.successRate < 0.5) {
    return 'Improve error handling and robustness';
  }
  if (focus === 'speed' && metrics.avgDurationMs > 10000) {
    return 'Optimize for faster execution';
  }
  if (focus === 'quality' && (metrics.avgQualityScore ?? 0.5) < 0.7) {
    return 'Enhance output quality and completeness';
  }
  if (focus === 'cost' && metrics.avgTokensUsed > 2000) {
    return 'Reduce token usage while maintaining quality';
  }

  return 'General improvement to prompt clarity and structure';
}

/**
 * Generates configuration changes based on hypothesis.
 *
 * @param config - The current configuration
 * @param hypothesis - The improvement hypothesis
 * @returns Array of configuration changes to apply
 */
export function generateChanges(
  config: AgentConfiguration,
  hypothesis: string
): ConfigurationChange[] {
  const changes: ConfigurationChange[] = [];

  if (hypothesis.includes('error handling')) {
    changes.push({
      field: 'systemPrompt',
      oldValue: config.systemPrompt,
      newValue: improvePromptForErrors(config.systemPrompt),
      reason: 'Added explicit error handling instructions',
    });
  }

  if (hypothesis.includes('faster')) {
    changes.push({
      field: 'maxTokens',
      oldValue: config.maxTokens,
      newValue: Math.max(500, Math.floor(config.maxTokens * 0.8)),
      reason: 'Reduced max tokens for faster response',
    });
  }

  if (hypothesis.includes('quality')) {
    changes.push({
      field: 'temperature',
      oldValue: config.temperature,
      newValue: Math.max(0.1, config.temperature - 0.1),
      reason: 'Lowered temperature for more consistent output',
    });
  }

  if (hypothesis.includes('token usage')) {
    changes.push({
      field: 'systemPrompt',
      oldValue: config.systemPrompt,
      newValue: improvePromptForConciseness(config.systemPrompt),
      reason: 'Added conciseness instructions',
    });
  }

  // General improvement if no specific changes
  if (changes.length === 0 && hypothesis.includes('General')) {
    changes.push({
      field: 'systemPrompt',
      oldValue: config.systemPrompt,
      newValue: improvePromptGeneral(config.systemPrompt),
      reason: 'Refined prompt clarity and structure',
    });
  }

  return changes;
}
