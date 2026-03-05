/**
 * Compose Worker Prompt — bridges AgentPlanEntry to fully composed prompts.
 *
 * Uses PromptComposer.composeWithContext() to assemble:
 *   [BaseRole] + [TaskContext] + [OutputConstraints]
 *
 * Base prompts come from BUILT_IN_EXPERTS config. Task input is sanitized
 * via sanitizeTaskContext() to prevent prompt injection.
 *
 * @module orchestration/aorchestra/compose-worker-prompt
 * (Source: Issue #1301, Epic #1299, arXiv:2602.20478)
 */

import type { AgentPlanEntry } from './agent-planner.js';
import type { WorkerResult } from './worker-dispatcher.js';
import { BUILT_IN_EXPERTS } from '../../agents/experts/expert-config.js';
import {
  PromptComposer,
  buildTaskContextBlock,
  buildOutputConstraintsBlock,
  sanitizeTaskContext,
} from '../../agents/experts/expert-prompts/prompt-composer.js';
import { buildPriorWaveContextBlock } from './cross-wave-context.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A learning entry for worker prompt enrichment (Issue #1415).
 * Compatible with SessionLearning but decoupled to avoid hard dependency.
 */
export interface WorkerLearning {
  /** The pattern or technique learned */
  readonly pattern: string;
  /** Context where this learning applies */
  readonly context: string;
  /** Confidence in this learning (0-1) */
  readonly confidence: number;
}

/**
 * Input for composing a worker prompt.
 */
export interface ComposeWorkerPromptInput {
  /** The agent plan entry (role + sub-task) */
  readonly entry: AgentPlanEntry;
  /** Original task description */
  readonly taskDescription: string;
  /** Optional relevant file paths for context */
  readonly relevantFiles?: readonly string[];
  /** Optional max output characters (default: 4000) */
  readonly maxOutputChars?: number;
  /** Optional output format hint */
  readonly outputFormat?: string;
  /** Optional results from prior waves for cross-wave context (Issue #1308) */
  readonly priorWaveResults?: readonly WorkerResult[];
  /** Optional learnings from session memory for prompt enrichment (Issue #1415) */
  readonly learnings?: readonly WorkerLearning[];
}

// ============================================================================
// Singleton
// ============================================================================

const composer = new PromptComposer();

// ============================================================================
// Public API
// ============================================================================

/**
 * Compose a fully assembled prompt for a worker from its plan entry.
 *
 * Combines the expert's base system prompt with sanitized task context
 * and output constraints. The resulting prompt is ready for model execution.
 *
 * @param input - Worker prompt composition input
 * @returns Fully composed prompt string
 */
/** Maximum learnings injected per worker prompt. */
const MAX_LEARNINGS_PER_PROMPT = 8;

/** Minimum confidence threshold for including a learning. */
const MIN_LEARNING_CONFIDENCE = 0.5;

/**
 * Build a learnings block for prompt injection (Issue #1415).
 *
 * Filters by role context and confidence, then formats as a bullet list.
 */
export function buildLearningsBlock(learnings: readonly WorkerLearning[], role: string): string {
  const relevant = learnings
    .filter((l) => l.confidence >= MIN_LEARNING_CONFIDENCE)
    .filter((l) => l.context === role || l.context === '' || l.context === 'general')
    .slice(0, MAX_LEARNINGS_PER_PROMPT);

  if (relevant.length === 0) return '';

  const lines = relevant.map((l) => `- ${l.pattern}`).join('\n');
  return `## Learnings from Prior Runs\n\n${lines}`;
}

export function composeWorkerPrompt(input: ComposeWorkerPromptInput): string {
  const {
    entry,
    taskDescription,
    relevantFiles,
    maxOutputChars,
    outputFormat,
    priorWaveResults,
    learnings,
  } = input;

  const basePrompt = BUILT_IN_EXPERTS[entry.role].systemPrompt;

  const sanitizedDesc = sanitizeTaskContext(taskDescription);
  const sanitizedSubTask = sanitizeTaskContext(entry.subTask);

  // Build task context with optional prior wave results (Issue #1308)
  const priorWaveBlock =
    priorWaveResults !== undefined && priorWaveResults.length > 0
      ? buildPriorWaveContextBlock(priorWaveResults)
      : '';

  // Build learnings block (Issue #1415)
  const learningsBlock =
    learnings !== undefined && learnings.length > 0
      ? buildLearningsBlock(learnings, entry.role)
      : '';

  const taskContextLines = buildTaskContextBlock({
    taskDescription: `${sanitizedDesc}\n\nSub-task: ${sanitizedSubTask}`,
    taskType: entry.role,
    ...(relevantFiles !== undefined ? { relevantFiles: [...relevantFiles] } : {}),
  });

  // Combine task context with prior wave context and learnings
  const contextParts = [taskContextLines, priorWaveBlock, learningsBlock].filter((p) => p !== '');
  const taskContext = contextParts.join('\n\n');

  const outputConstraints = buildOutputConstraintsBlock({
    ...(maxOutputChars !== undefined ? { maxOutputChars } : {}),
    ...(outputFormat !== undefined ? { format: outputFormat } : {}),
  });

  return composer.composeWithContext({
    basePrompt,
    taskContext,
    outputConstraints,
  });
}
