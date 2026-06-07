/**
 * Recording helpers for execute_expert tool.
 *
 * Extracts best-effort recording logic (outcome store, session memory)
 * from the main tool file to stay within max-lines.
 *
 * @module mcp/tools/execute-expert-recording
 * (Source: Issue #1298 — extracted during Layer 2 refactor)
 */

import {
  createLogger,
  getErrorMessage,
  getTimeProvider,
  getRandomProvider,
} from '../../core/index.js';
import type { OutcomeFailureCategory } from '../../orchestration/outcomes/index.js';
import {
  getOutcomeStore,
  categorizeOutcomeErrorMessage,
} from '../../orchestration/outcomes/index.js';
import { detectTaskCategory } from '../../config/task-specialization.js';
import type { TaskCategory } from '../../config/task-specialization-types.js';
import { CliNameSchema } from '../../config/model-capabilities-types.js';
import { getDefaultRegistry } from '../../config/model-registry.js';
import type { OutcomeCli } from '../../orchestration/outcomes/outcome-types.js';
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

/** Options for recording an expert execution outcome. */
export interface ExpertOutcomeOpts {
  readonly task: string;
  readonly role?: string;
  readonly success: boolean;
  readonly durationMs: number;
  readonly model?: string;
  readonly failureCategory?: OutcomeFailureCategory;
  readonly errorMessage?: string;
}

/** Resolves category from role or task content. */
function resolveExpertCategory(opts: ExpertOutcomeOpts): TaskCategory {
  const roleCategory = opts.role !== undefined ? ROLE_TO_CATEGORY[opts.role] : undefined;
  if (roleCategory !== undefined) return roleCategory;
  return detectTaskCategory(opts.task)?.category ?? 'exploration';
}

/** Models that are placeholders, not real resolvable model ids (#3624). */
const UNATTRIBUTED_MODELS: ReadonlySet<string> = new Set([
  '',
  'expert',
  'unknown',
  'heuristic',
  'default',
]);

/**
 * Resolve the real executing CLI from the EXECUTED model via the registry
 * (#3624), instead of guessing it from task content. Returns the explicit
 * 'unknown' sentinel when the model is a placeholder or maps to no known CLI —
 * never a fabricated real CLI (which would skew that CLI's quality stats).
 */
function resolveExpertCli(model: string | undefined): OutcomeCli {
  if (model === undefined || UNATTRIBUTED_MODELS.has(model)) return 'unknown';
  const cliName = getDefaultRegistry().getEntry(model).cliName;
  const parsed = cliName !== undefined ? CliNameSchema.safeParse(cliName) : undefined;
  return parsed?.success === true ? parsed.data : 'unknown';
}

/**
 * Records expert execution outcome to OutcomeStore. Best-effort.
 * Attribution (#3624): cli is resolved from the EXECUTED model via the registry
 * (vendor/family are auto-resolved from `model` by OutcomeStore.enrich); an
 * unresolvable model records cli='unknown'/model='unknown' rather than a
 * fabricated CLI, so it can't skew a real CLI's performance-floor signal.
 */
export function recordExpertOutcome(opts: ExpertOutcomeOpts): void {
  try {
    const model =
      opts.model !== undefined && !UNATTRIBUTED_MODELS.has(opts.model) ? opts.model : 'unknown';
    getOutcomeStore().append({
      id: `exp-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 8)}`,
      cli: resolveExpertCli(opts.model),
      category: resolveExpertCategory(opts),
      model,
      success: opts.success,
      durationMs: opts.durationMs,
      timestamp: new Date(getTimeProvider().now()).toISOString(),
      source: 'delegate',
      failureCategory: opts.failureCategory,
      errorMessage: opts.errorMessage?.slice(0, 500),
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
    errorMessage: errorMsg,
    ...(expert.modelId !== undefined ? { model: expert.modelId } : {}),
  });
  const durationSec = Math.round(durationMs / 1000);
  const model = expert.modelId ?? 'default';
  // The "MCP error -32001: Request timed out" string comes from the client-side
  // SDK aborting the request, not from our server-side budget. Most MCP clients
  // default to 60s and don't honor server-side progress extensions, so a 300-900s
  // server budget is unreachable. Telling the caller to "omit timeoutMs" doesn't
  // help — that knob is on our side of the transport. See #2631.
  const timeoutHint = errorMsg.includes('timed out')
    ? ` Hint: client MCP timed out at ${String(durationSec)}s (typically the 60s SDK default). Server budget can be 300-900s but most clients don't honor progress extensions — see #2631. Workaround: use a client with longer default (Claude Desktop, mcp-inspector --timeout) or shorten the task.`
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
