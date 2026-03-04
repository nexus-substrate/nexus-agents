/**
 * nexus-agents/orchestration - Parallel Exploration
 *
 * Dispatches exploration/research tasks across multiple CLIs in parallel.
 * Each CLI brings its own perspective (e.g., Gemini for research context,
 * Claude for architecture, Codex for code analysis). Results are synthesized.
 *
 * @module orchestration/parallel-exploration
 * (Source: Issue #862 — Multi-model parallel exploration)
 */

import type { Result, ILogger } from '../core/index.js';
import { getErrorMessage, ok, err, createLogger, getTimeProvider } from '../core/index.js';
// CLI_NAMES canonical source: config/model-capabilities-types.ts
// CliName type ensures these stay in sync with the canonical list

import type {
  ICliAdapter,
  CliName,
  CliTask,
  CliResponse,
  CliError,
} from '../cli-adapters/types.js';
import type { TaskCategory } from '../config/task-specialization-types.js';
import { detectTaskCategory } from '../config/task-specialization.js';
import { getOutcomeStore, categorizeOutcomeErrorMessage } from './outcomes/index.js';
import type {
  PartitionResult,
  ExplorationResult,
  ParallelExplorationConfig,
} from './parallel-exploration-types.js';
import { createDefaultConfig, isParallelEligible } from './parallel-exploration-types.js';

// ============================================================================
// Parallel Explorer
// ============================================================================

/** Options for executeParallelExploration. */
export interface ExploreOptions {
  readonly config?: Partial<ParallelExplorationConfig>;
  readonly logger?: ILogger;
}

/**
 * Executes a task across multiple CLIs in parallel and synthesizes results.
 *
 * @param task - The exploration/research task description
 * @param adapters - Map of available CLI adapters
 * @param options - Optional configuration
 * @returns Synthesized exploration result, or error if no CLIs available
 */
export async function executeParallelExploration(
  task: string,
  adapters: ReadonlyMap<CliName, ICliAdapter>,
  options?: ExploreOptions
): Promise<Result<ExplorationResult, Error>> {
  const logger = options?.logger ?? createLogger({ component: 'parallel-exploration' });
  const config = { ...createDefaultConfig(), ...options?.config };

  // Detect task category
  const match = detectTaskCategory(task);
  const category: TaskCategory = match?.category ?? 'exploration';

  if (!isParallelEligible(category)) {
    return err(new Error(`Task category '${category}' not eligible for parallel exploration`));
  }

  // Select CLIs to use (up to maxParallelClis)
  const selectedClis = selectClis(adapters, config.maxParallelClis);
  if (selectedClis.length === 0) {
    return err(new Error('No CLI adapters available'));
  }

  logger.info('Starting parallel exploration', {
    clis: selectedClis.map((s) => s.cli),
    category,
    taskLength: task.length,
  });

  const startTime = getTimeProvider().now();

  // Dispatch to all CLIs in parallel
  const partitions = await dispatchPartitions(task, category, selectedClis, config, logger);

  const totalDurationMs = getTimeProvider().now() - startTime;
  const clisUsed = partitions.filter((p) => p.success).map((p) => p.cli);

  // Synthesize results
  const synthesized = synthesizeResults(partitions, category);

  // Record outcomes (best-effort)
  recordOutcomes(partitions, category);

  const result: ExplorationResult = {
    partitions,
    synthesized,
    totalDurationMs,
    clisUsed,
    category,
  };

  logger.info('Parallel exploration completed', {
    totalDurationMs,
    clisUsed,
    successCount: clisUsed.length,
    failCount: partitions.length - clisUsed.length,
  });

  return ok(result);
}

// ============================================================================
// Internal Helpers
// ============================================================================

interface SelectedCli {
  readonly cli: CliName;
  readonly adapter: ICliAdapter;
}

/** Selects CLIs to use, up to maxCount. */
function selectClis(
  adapters: ReadonlyMap<CliName, ICliAdapter>,
  maxCount: number
): readonly SelectedCli[] {
  const selected: SelectedCli[] = [];
  // Preferred order: gemini (research), claude (architecture), codex (code)
  const preferredOrder: readonly CliName[] = ['gemini', 'claude', 'codex'];

  for (const cli of preferredOrder) {
    if (selected.length >= maxCount) break;
    const adapter = adapters.get(cli);
    if (adapter !== undefined) {
      selected.push({ cli, adapter });
    }
  }

  return selected;
}

/** Builds a CLI task with context about the exploration role. */
function buildCliTask(task: string, cli: CliName, category: TaskCategory): CliTask {
  const roleContext = getRoleContext(cli, category);
  return {
    content: `${roleContext}\n\nTask: ${task}\n\nProvide a focused analysis. Be concise (max 2000 chars).`,
  };
}

/** Gets role-specific context for each CLI. */
function getRoleContext(cli: CliName, category: TaskCategory): string {
  const roleMap: Record<CliName, Record<string, string>> = {
    gemini: {
      exploration:
        'You are exploring a codebase. Focus on high-level structure, patterns, and documentation.',
      research: 'You are researching a topic. Focus on breadth, references, and prior art.',
      code_review: 'You are reviewing code. Focus on design patterns and documentation quality.',
    },
    claude: {
      exploration:
        'You are exploring a codebase. Focus on architecture, design decisions, and trade-offs.',
      research:
        'You are researching a topic. Focus on depth, reasoning, and practical implications.',
      code_review: 'You are reviewing code. Focus on correctness, security, and edge cases.',
    },
    codex: {
      exploration:
        'You are exploring a codebase. Focus on code patterns, dependencies, and implementation details.',
      research:
        'You are researching a topic. Focus on implementation approaches and code examples.',
      code_review: 'You are reviewing code. Focus on code quality, performance, and test coverage.',
    },
    opencode: {
      exploration:
        'You are exploring a codebase. Focus on cross-provider insights, patterns, and practical usage.',
      research:
        'You are researching a topic. Focus on practical applications and comparative analysis.',
      code_review:
        'You are reviewing code. Focus on best practices, readability, and maintainability.',
    },
  };

  return roleMap[cli][category] ?? `You are performing ${category} analysis.`;
}

/** Dispatches tasks to all selected CLIs in parallel. */
async function dispatchPartitions(
  task: string,
  category: TaskCategory,
  selectedClis: readonly SelectedCli[],
  config: ParallelExplorationConfig,
  logger: ILogger
): Promise<readonly PartitionResult[]> {
  const promises = selectedClis.map(async ({ cli, adapter }): Promise<PartitionResult> => {
    const startTime = getTimeProvider().now();
    const cliTask = buildCliTask(task, cli, category);

    try {
      const result: Result<CliResponse, CliError> = await Promise.race([
        adapter.execute(cliTask),
        createTimeout(config.perCliTimeoutMs, cli),
      ]);

      const durationMs = getTimeProvider().now() - startTime;

      if (!result.ok) {
        logger.warn('CLI partition failed', { cli, error: result.error.message });
        return { cli, success: false, output: '', durationMs, error: result.error.message };
      }

      const output = truncateOutput(result.value.text, config.maxOutputCharsPerCli);
      const model = result.value.model;
      return model !== undefined
        ? { cli, success: true, output, durationMs, model }
        : { cli, success: true, output, durationMs };
    } catch (error) {
      const durationMs = getTimeProvider().now() - startTime;
      const message = getErrorMessage(error);
      logger.warn('CLI partition threw', { cli, error: message });
      return { cli, success: false, output: '', durationMs, error: message };
    }
  });

  return Promise.all(promises);
}

/** Creates a timeout promise that rejects after ms. */
function createTimeout(ms: number, cli: CliName): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Timeout after ${String(ms)}ms for ${cli}`));
    }, ms);
  });
}

/** Truncates output to maxChars, adding ellipsis if needed. */
function truncateOutput(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + '...';
}

/** Synthesizes results from multiple CLIs into a unified response. */
function synthesizeResults(partitions: readonly PartitionResult[], category: TaskCategory): string {
  const successful = partitions.filter((p) => p.success);

  if (successful.length === 0) {
    return 'All CLI partitions failed. No results to synthesize.';
  }

  if (successful.length === 1) {
    const p = successful[0];
    if (p !== undefined) {
      return `## ${category} Analysis (${p.cli})\n\n${p.output}`;
    }
  }

  const sections = successful.map((p) => `### ${p.cli} perspective\n\n${p.output}`);
  return `## Parallel ${category} Analysis (${String(successful.length)} CLIs)\n\n${sections.join('\n\n---\n\n')}`;
}

/** Records outcomes for each partition (best-effort). */
function recordOutcomes(partitions: readonly PartitionResult[], category: TaskCategory): void {
  try {
    const store = getOutcomeStore();
    for (const p of partitions) {
      store.append({
        id: `pex-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
        cli: p.cli,
        category,
        model: p.model ?? 'unknown',
        success: p.success,
        durationMs: p.durationMs,
        timestamp: new Date(getTimeProvider().now()).toISOString(),
        source: 'delegate',
        ...(!p.success && p.error !== undefined
          ? { failureCategory: categorizeOutcomeErrorMessage(p.error) }
          : {}),
      });
    }
  } catch (error: unknown) {
    createLogger({ component: 'parallel-exploration' }).warn(
      'Failed to record exploration outcomes',
      {
        error: getErrorMessage(error),
        partitionCount: partitions.length,
      }
    );
  }
}
