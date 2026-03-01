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
export function composeWorkerPrompt(input: ComposeWorkerPromptInput): string {
  const { entry, taskDescription, relevantFiles, maxOutputChars, outputFormat, priorWaveResults } =
    input;

  const basePrompt = BUILT_IN_EXPERTS[entry.role].systemPrompt;

  const sanitizedDesc = sanitizeTaskContext(taskDescription);
  const sanitizedSubTask = sanitizeTaskContext(entry.subTask);

  // Build task context with optional prior wave results (Issue #1308)
  const priorWaveBlock =
    priorWaveResults !== undefined && priorWaveResults.length > 0
      ? buildPriorWaveContextBlock(priorWaveResults)
      : '';

  const taskContextLines = buildTaskContextBlock({
    taskDescription: `${sanitizedDesc}\n\nSub-task: ${sanitizedSubTask}`,
    taskType: entry.role,
    ...(relevantFiles !== undefined ? { relevantFiles: [...relevantFiles] } : {}),
  });

  // Combine task context with prior wave context if available
  const taskContext =
    priorWaveBlock !== '' ? `${taskContextLines}\n\n${priorWaveBlock}` : taskContextLines;

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
