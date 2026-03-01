/**
 * Result Synthesizer — merges worker outputs into a unified response.
 *
 * Opt-in synthesis: only runs when explicitly requested. When the model
 * adapter fails, falls back to concatenated worker outputs with conflict
 * warnings prepended. Conflicts are SURFACED (not auto-resolved) per
 * consensus vote feedback.
 *
 * @module orchestration/aorchestra/result-synthesizer
 * (Source: Issue #1309, Epic #1307)
 */

import type { WorkerResult } from './worker-dispatcher.js';
import type { WorkerConflict } from './conflict-detector.js';
import type { IModelAdapter } from '../../core/index.js';
import type { ContentBlock } from '../../core/types/model.js';
import { sanitizeWorkerOutput } from './cross-wave-context.js';
import { createLogger } from '../../core/index.js';

const logger = createLogger({ component: 'result-synthesizer' });

// ============================================================================
// Constants
// ============================================================================

/** Maximum total characters for all worker outputs fed into synthesis. */
export const MAX_SYNTHESIS_INPUT_CHARS = 20_000;

/** Maximum tokens for synthesis LLM response. */
export const SYNTHESIS_MAX_TOKENS = 4000;

// ============================================================================
// Types
// ============================================================================

/** Input for building a synthesis prompt. */
export interface SynthesisPromptInput {
  readonly results: readonly WorkerResult[];
  readonly conflicts: readonly WorkerConflict[];
  readonly taskDescription: string;
}

/** Input for synthesizing results. */
export interface SynthesizeResultsInput {
  readonly results: readonly WorkerResult[];
  readonly conflicts: readonly WorkerConflict[];
  readonly taskDescription: string;
  readonly modelAdapter: IModelAdapter;
}

/** Result type for synthesis — always ok, falls back on failure. */
export interface SynthesisResult {
  readonly ok: true;
  readonly value: string;
}

// ============================================================================
// Synthesis Prompt Builder
// ============================================================================

/**
 * Build the prompt for the synthesis LLM call.
 *
 * Uses XML-delimited sections for worker outputs to prevent confusion
 * between different workers' contributions. Instructs the model to
 * surface conflicts rather than auto-resolve them.
 *
 * @param input - Results, conflicts, and task description
 * @returns Formatted synthesis prompt
 */
export function buildSynthesisPrompt(input: SynthesisPromptInput): string {
  const { results, conflicts, taskDescription } = input;
  const successResults = results.filter((r) => r.status === 'success' && r.output !== '');

  const parts: string[] = [
    'You are a synthesis agent. Your job is to merge the outputs from multiple specialist workers into a single coherent response.',
    '',
    `## Task Description`,
    taskDescription,
    '',
    '## Worker Outputs',
    '',
  ];

  // Budget per worker: divide total evenly, with minimum floor
  const perWorkerBudget = Math.max(
    500,
    Math.floor(MAX_SYNTHESIS_INPUT_CHARS / successResults.length)
  );

  for (const result of successResults) {
    const sanitized = sanitizeWorkerOutput(result.output);
    const truncated =
      sanitized.length > perWorkerBudget
        ? sanitized.slice(0, perWorkerBudget) + ' [truncated]'
        : sanitized;
    parts.push(`<worker-output role="${result.role}">`);
    parts.push(truncated);
    parts.push('</worker-output>');
    parts.push('');
  }

  appendConflictsAndInstructions(parts, conflicts);
  return parts.join('\n');
}

/** Append conflict warnings and synthesis instructions to prompt parts. */
function appendConflictsAndInstructions(
  parts: string[],
  conflicts: readonly WorkerConflict[]
): void {
  if (conflicts.length > 0) {
    parts.push('## Detected Conflicts');
    parts.push('');
    parts.push(
      'The following files were modified by multiple workers. You MUST surface these conflicts clearly in your output. Do NOT automatically resolve them — describe what each worker did and flag the conflict for human review.'
    );
    parts.push('');
    for (const conflict of conflicts) {
      parts.push(`- **${conflict.filePath}**: modified by ${conflict.workers.join(', ')}`);
    }
    parts.push('');
  }

  parts.push('## Instructions');
  parts.push('');
  parts.push(
    '1. Merge the worker outputs into a single coherent response that addresses the original task.'
  );
  parts.push('2. Attribute key contributions to their source worker role.');
  parts.push(
    '3. Surface any conflicts between workers — do NOT automatically resolve conflicting changes.'
  );
  parts.push(
    '4. If workers produced code changes, present them in a unified view with clear attribution.'
  );
  parts.push('5. Keep the response focused and actionable.');
}

// ============================================================================
// Fallback Builder
// ============================================================================

/**
 * Build a fallback response by concatenating worker outputs.
 * Used when the synthesis LLM call fails.
 */
function buildFallbackResponse(
  results: readonly WorkerResult[],
  conflicts: readonly WorkerConflict[]
): string {
  const successResults = results.filter((r) => r.status === 'success' && r.output !== '');
  if (successResults.length === 0) return '';

  const parts: string[] = [];

  if (conflicts.length > 0) {
    parts.push('**Conflict Warning:** The following files were modified by multiple workers:');
    for (const conflict of conflicts) {
      parts.push(`- ${conflict.filePath}: ${conflict.workers.join(', ')}`);
    }
    parts.push('');
  }

  const perWorkerBudget = Math.max(
    500,
    Math.floor(MAX_SYNTHESIS_INPUT_CHARS / successResults.length)
  );

  for (const result of successResults) {
    const sanitized = sanitizeWorkerOutput(result.output);
    const truncated =
      sanitized.length > perWorkerBudget
        ? sanitized.slice(0, perWorkerBudget) + ' [truncated]'
        : sanitized;
    parts.push(`### ${result.role}`);
    parts.push(truncated);
    parts.push('');
  }

  return parts.join('\n');
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Synthesize worker results into a unified response.
 *
 * Makes a single LLM call to merge all worker outputs. On failure,
 * falls back to concatenated outputs with conflict warnings.
 *
 * @param input - Worker results, conflicts, task description, and model adapter
 * @returns Always succeeds — falls back gracefully on LLM failure
 */
export async function synthesizeResults(input: SynthesizeResultsInput): Promise<SynthesisResult> {
  const { results, conflicts, taskDescription, modelAdapter } = input;
  const successResults = results.filter((r) => r.status === 'success' && r.output !== '');

  if (successResults.length === 0) {
    return { ok: true, value: '' };
  }

  const prompt = buildSynthesisPrompt({ results, conflicts, taskDescription });

  try {
    const response = await modelAdapter.complete({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: SYNTHESIS_MAX_TOKENS,
    });

    if (!response.ok) {
      logger.warn('Synthesis LLM call failed, using fallback', {
        error: response.error.message,
      });
      return { ok: true, value: buildFallbackResponse(results, conflicts) };
    }

    const text = response.value.content
      .filter((b: ContentBlock): b is ContentBlock & { type: 'text' } => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    return { ok: true, value: text };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('Synthesis threw exception, using fallback', { error: message });
    return { ok: true, value: buildFallbackResponse(results, conflicts) };
  }
}
