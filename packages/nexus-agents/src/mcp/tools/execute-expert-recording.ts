/**
 * Recording helpers for execute_expert tool.
 *
 * Extracts best-effort recording logic (outcome store, session memory)
 * from the main tool file to stay within max-lines.
 *
 * @module mcp/tools/execute-expert-recording
 * (Source: Issue #1298 — extracted during Layer 2 refactor)
 */

import { createLogger, getErrorMessage, getTimeProvider } from '../../core/index.js';
import type { OutcomeFailureCategory } from '../../orchestration/outcomes/index.js';
import {
  getOutcomeStore,
  categorizeOutcomeErrorMessage,
} from '../../orchestration/outcomes/index.js';
import { detectTaskCategory } from '../../config/task-specialization.js';
import type { TaskCategory } from '../../config/task-specialization-types.js';
import { DEFAULT_CLI } from '../../config/model-capabilities-types.js';
import { getToolMemory } from './tool-memory.js';
import { getAutoCatalog } from './research-auto-catalog.js';
import type { ILogger } from '../../core/index.js';

// ============================================================================
// Outcome Recording (Issue #1014)
// ============================================================================

/** Maps expert role names to task categories for accurate outcome attribution. */
const ROLE_TO_CATEGORY: Readonly<Record<string, TaskCategory>> = {
  code_expert: 'code_generation',
  architecture_expert: 'architecture',
  security_expert: 'security_review',
  documentation_expert: 'documentation',
  testing_expert: 'testing',
  devops_expert: 'devops',
  research_expert: 'research',
  pm_expert: 'planning',
  ux_expert: 'planning',
  infrastructure_expert: 'devops',
};

/** Records expert execution outcome to OutcomeStore. Best-effort. */
export function recordExpertOutcome(opts: {
  task: string;
  role?: string;
  success: boolean;
  durationMs: number;
  model?: string;
  failureCategory?: OutcomeFailureCategory;
}): void {
  try {
    const roleCategory = opts.role !== undefined ? ROLE_TO_CATEGORY[opts.role] : undefined;
    const match = detectTaskCategory(opts.task);
    getOutcomeStore().append({
      id: `exp-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
      cli: match?.primaryCli ?? DEFAULT_CLI,
      category: roleCategory ?? match?.category ?? 'exploration',
      model: opts.model ?? 'expert',
      success: opts.success,
      durationMs: opts.durationMs,
      timestamp: new Date(getTimeProvider().now()).toISOString(),
      source: 'delegate',
      ...(opts.failureCategory !== undefined ? { failureCategory: opts.failureCategory } : {}),
    });
  } catch (error: unknown) {
    createLogger({ tool: 'execute_expert' }).debug('Best-effort outcome recording failed', {
      error: getErrorMessage(error),
    });
  }
}

// ============================================================================
// Session Memory Recording (Issue #690)
// ============================================================================

/** Records a successful expert execution to session memory. */
export function recordExpertSuccess(expertId: string, role: string, durationMs: number): void {
  try {
    const memory = getToolMemory();
    memory.recordTask({
      approach: `Expert execution: ${role} (${expertId})`,
      challenges: [],
      durationMs,
    });
    memory.recordLearning({
      pattern: `Expert ${role} completed successfully`,
      context: `id=${expertId} duration=${String(durationMs)}ms`,
      confidence: 0.75,
      source: 'execute-expert-success',
    });
    void memory.runPromotionPipeline().catch((error: unknown) => {
      createLogger({ tool: 'execute_expert' }).warn('Promotion pipeline failed', { error });
    });
  } catch (error: unknown) {
    createLogger({ tool: 'execute_expert' }).debug('Best-effort success recording failed', {
      error: getErrorMessage(error),
      expertId,
    });
  }
}

/** Records a failed expert execution to session memory. */
export function recordExpertError(expertId: string, role: string, errorMessage: string): void {
  try {
    const memory = getToolMemory();
    memory.recordError({
      error: `Expert ${role} (${expertId}): ${errorMessage.slice(0, 150)}`,
      solution: 'Pending - expert execution failed',
      filePattern: 'mcp/tools/execute-expert',
    });
  } catch (error: unknown) {
    createLogger({ tool: 'execute_expert' }).debug('Best-effort error recording failed', {
      error: getErrorMessage(error),
      expertId,
    });
  }
}

// ============================================================================
// Auto-catalog & Error Hints (Issue #753)
// ============================================================================

/** Scans expert output for research references. Best-effort. */
export function autoCatalogScan(output: string, expertId: string, logger?: ILogger): void {
  try {
    const catalog = getAutoCatalog();
    catalog.scanAndRecord(output, 'execute_expert');
  } catch (error: unknown) {
    logger?.debug('Best-effort auto-catalog scan failed', {
      error: getErrorMessage(error),
      expertId,
    });
  }
}

/** Records failure outcome and returns error result with observability data (#1129). */
export function handleExpertFailure(
  task: string,
  expert: { expertId: string; role: string; modelId?: string },
  errorMsg: string,
  durationMs: number
): { ok: false; error: string } {
  recordExpertError(expert.expertId, expert.role, errorMsg);
  const fc = categorizeOutcomeErrorMessage(errorMsg);
  recordExpertOutcome({
    task,
    role: expert.role,
    success: false,
    durationMs,
    failureCategory: fc,
    ...(expert.modelId !== undefined ? { model: expert.modelId } : {}),
  });
  const durationSec = Math.round(durationMs / 1000);
  const model = expert.modelId ?? 'default';
  const timeoutHint = errorMsg.includes('timed out')
    ? ' Hint: omit timeoutMs to use auto-detected timeout (300-600s).'
    : '';
  return {
    ok: false,
    error: `Expert execution failed after ${String(durationSec)}s (role=${expert.role}, model=${model}): ${errorMsg}${timeoutHint}`,
  };
}

/** Records success outcome and tracking. */
export function handleExpertSuccess(
  task: string,
  expert: { expertId: string; role: string; modelId?: string },
  durationMs: number
): void {
  recordExpertSuccess(expert.expertId, expert.role, durationMs);
  recordExpertOutcome({
    task,
    role: expert.role,
    success: true,
    durationMs,
    ...(expert.modelId !== undefined ? { model: expert.modelId } : {}),
  });
}
