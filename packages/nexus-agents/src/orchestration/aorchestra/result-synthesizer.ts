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
import { getSynthesisHistoryTracker, createConflictPatternKey } from './synthesis-history.js';

const logger = createLogger({ component: 'result-synthesizer' });

// ============================================================================
// Constants
// ============================================================================

/** Maximum total characters for all worker outputs fed into synthesis. */
export const MAX_SYNTHESIS_INPUT_CHARS = 20_000;

/** Maximum tokens for synthesis LLM response. */
export const SYNTHESIS_MAX_TOKENS = 4000;

/** Minimum per-worker character budget when dividing synthesis input. */
const MIN_PER_WORKER_BUDGET_CHARS = 500;

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

/** Source of synthesis output. */
export type SynthesisSource = 'llm' | 'fallback' | 'deterministic' | 'reimagine';

/** Successful synthesis result. */
interface SynthesisSuccess {
  readonly ok: true;
  readonly value: string;
  /** How the synthesis was produced — 'llm' or 'fallback'. */
  readonly synthesisSource?: SynthesisSource;
  /** Number of workers excluded (error/empty) from synthesis. */
  readonly excludedWorkerCount?: number;
}

/** Failed synthesis result (#1469). */
interface SynthesisFailure {
  readonly ok: false;
  readonly error: string;
}

/** Result type for synthesis — discriminated union for safe access (#1469). */
export type SynthesisResult = SynthesisSuccess | SynthesisFailure;

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

  // Guard: no successful outputs → nothing to synthesize (Issue #1327)
  if (successResults.length === 0) return '';

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
    MIN_PER_WORKER_BUDGET_CHARS,
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
    MIN_PER_WORKER_BUDGET_CHARS,
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
// Deterministic Merge — Tier 1 (#1507)
// ============================================================================

/**
 * Merge non-conflicting worker outputs without an LLM call.
 *
 * When workers produce non-overlapping results (zero conflicts), their outputs
 * can be directly merged with role headers. This saves tokens and latency on
 * the majority of dispatches where workers operate on independent concerns.
 */
function buildDeterministicMerge(results: readonly WorkerResult[]): string {
  const successResults = results.filter((r) => r.status === 'success' && r.output !== '');
  if (successResults.length === 0) return '';

  const perWorkerBudget = Math.max(
    MIN_PER_WORKER_BUDGET_CHARS,
    Math.floor(MAX_SYNTHESIS_INPUT_CHARS / successResults.length)
  );

  const parts: string[] = [];
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

/** Minimum ratio of synthesis output to worker input for quality check. */
const SYNTHESIS_QUALITY_MIN_RATIO = 0.1;

/** Extract text from LLM response content blocks. */
function extractTextFromBlocks(blocks: readonly ContentBlock[]): string {
  const textBlocks = blocks.filter(
    (b: ContentBlock): b is ContentBlock & { type: 'text' } => b.type === 'text'
  );
  return textBlocks.map((b) => b.text).join('\n');
}

/** Check if synthesis output is suspiciously short relative to input. */
function isSynthesisLowQuality(synthesisText: string, inputLength: number): boolean {
  if (inputLength === 0) return false;
  return synthesisText.length < inputLength * SYNTHESIS_QUALITY_MIN_RATIO;
}

/** Call LLM and return text or null on failure. Non-null may be empty string. */
async function callLlm(adapter: IModelAdapter, prompt: string): Promise<string | null> {
  try {
    const response = await adapter.complete({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: SYNTHESIS_MAX_TOKENS,
    });
    if (!response.ok) return null;
    return extractTextFromBlocks(response.value.content);
  } catch {
    return null;
  }
}

/** Build a reimagine prompt — stronger directive to reconstruct from scratch. */
function buildReimaginePr(input: SynthesisPromptInput): string {
  const base = buildSynthesisPrompt(input);
  return [
    base,
    '',
    '## IMPORTANT: Previous synthesis attempt was inadequate.',
    'The previous merge attempt produced an insufficient response.',
    'You MUST produce a comprehensive, detailed synthesis that:',
    '- Integrates ALL substantive content from every worker',
    '- Preserves code snippets, file paths, and technical details',
    '- Clearly attributes contributions to source workers',
    '- Is proportional in length to the combined worker outputs',
  ].join('\n');
}

/** Extract unique conflicting worker roles for pattern keying. */
function extractConflictRoles(conflicts: readonly WorkerConflict[]): readonly string[] {
  const roles = new Set<string>();
  for (const c of conflicts) {
    for (const w of c.workers) roles.add(w);
  }
  return [...roles];
}

/** Tier 2: LLM-assisted synthesis with Tier 3 reimagine escalation (#1507). */
async function synthesizeViaLlm(
  input: SynthesizeResultsInput,
  excludedWorkerCount: number
): Promise<SynthesisResult> {
  const { results, conflicts } = input;
  const successResults = results.filter((r) => r.status === 'success' && r.output !== '');
  const inputLength = successResults.reduce((sum, r) => sum + r.output.length, 0);
  const tracker = getSynthesisHistoryTracker();
  const patternKey = createConflictPatternKey(extractConflictRoles(conflicts));
  const startTier = tracker.recommendStartTier(patternKey);

  // Skip Tier 2 if historical learning recommends Tier 3 (#1507)
  if (startTier >= 3) {
    logger.info('Skipping Tier 2 — historical failures for pattern', { patternKey });
    return synthesizeTier3(input, inputLength, patternKey, excludedWorkerCount);
  }

  return synthesizeTier2(input, inputLength, patternKey, excludedWorkerCount);
}

/** Tier 2: LLM synthesis attempt. */
async function synthesizeTier2(
  input: SynthesizeResultsInput,
  inputLength: number,
  patternKey: string,
  excludedWorkerCount: number
): Promise<SynthesisResult> {
  const { results, conflicts, taskDescription, modelAdapter } = input;
  const successResults = results.filter((r) => r.status === 'success' && r.output !== '');
  const tracker = getSynthesisHistoryTracker();
  const prompt = buildSynthesisPrompt({ results, conflicts, taskDescription });

  const tier2Text = await callLlm(modelAdapter, prompt);
  if (tier2Text === null) {
    tracker.record(patternKey, 2, false);
    logger.warn('Synthesis LLM call failed, using fallback');
    return mkFallback(results, conflicts, excludedWorkerCount);
  }

  if (tier2Text === '') {
    tracker.record(patternKey, 2, true);
    const raw = successResults.map((r) => r.output).join('\n');
    return { ok: true, value: raw, synthesisSource: 'llm', excludedWorkerCount };
  }

  if (!isSynthesisLowQuality(tier2Text, inputLength)) {
    tracker.record(patternKey, 2, true);
    return { ok: true, value: tier2Text, synthesisSource: 'llm', excludedWorkerCount };
  }

  // Quality gate failed — escalate to Tier 3
  tracker.record(patternKey, 2, false);
  logger.info('Synthesis output suspiciously short, escalating to reimagine', {
    synthesisLength: tier2Text.length,
    inputLength,
  });
  return synthesizeTier3(input, inputLength, patternKey, excludedWorkerCount);
}

/** Tier 3: reimagine — re-prompt with stronger directive. */
async function synthesizeTier3(
  input: SynthesizeResultsInput,
  inputLength: number,
  patternKey: string,
  excludedWorkerCount: number
): Promise<SynthesisResult> {
  const { results, conflicts, taskDescription, modelAdapter } = input;
  const tracker = getSynthesisHistoryTracker();
  const reimaginePrompt = buildReimaginePr({ results, conflicts, taskDescription });
  const tier3Text = await callLlm(modelAdapter, reimaginePrompt);

  if (tier3Text !== null && !isSynthesisLowQuality(tier3Text, inputLength)) {
    tracker.record(patternKey, 3, true);
    return { ok: true, value: tier3Text, synthesisSource: 'reimagine', excludedWorkerCount };
  }

  tracker.record(patternKey, 3, false);
  logger.warn('Reimagine also produced low-quality output, using fallback');
  return mkFallback(results, conflicts, excludedWorkerCount);
}

/** Build fallback synthesis result. */
function mkFallback(
  results: readonly WorkerResult[],
  conflicts: readonly WorkerConflict[],
  excludedWorkerCount: number
): SynthesisResult {
  return {
    ok: true,
    value: buildFallbackResponse(results, conflicts),
    synthesisSource: 'fallback',
    excludedWorkerCount,
  };
}

/**
 * Synthesize worker results into a unified response.
 *
 * Uses tiered conflict resolution (#1507):
 * - Tier 1: Deterministic merge when no conflicts (no LLM call)
 * - Tier 2: LLM-assisted synthesis when conflicts exist
 * - Fallback: Concatenated outputs if LLM fails
 *
 * @param input - Worker results, conflicts, task description, and model adapter
 * @returns Always succeeds — falls back gracefully on LLM failure
 */
export async function synthesizeResults(input: SynthesizeResultsInput): Promise<SynthesisResult> {
  const { results, conflicts } = input;
  const successResults = results.filter((r) => r.status === 'success' && r.output !== '');
  const excludedWorkerCount = results.length - successResults.length;

  if (successResults.length === 0) {
    return { ok: true, value: '', excludedWorkerCount };
  }

  // Tier 1: deterministic merge when no conflicts (#1507)
  if (conflicts.length === 0) {
    return {
      ok: true,
      value: buildDeterministicMerge(results),
      synthesisSource: 'deterministic',
      excludedWorkerCount,
    };
  }

  // Tier 2: LLM-assisted synthesis when conflicts exist
  return synthesizeViaLlm(input, excludedWorkerCount);
}
