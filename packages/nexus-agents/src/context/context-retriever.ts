/**
 * ContextRetriever — the unified read surface every entry point should call
 * to learn what we already know about a task.
 *
 * Phase 2 of #2792. Before this module, each entry point (routing, orchestration,
 * graph workflow, expert creation) reinvented memory access — or, more commonly,
 * skipped it entirely. That made every backend write-only in practice.
 *
 * `getContextForTask({ task, category })` is the one function every entry point
 * calls. It fans out across the shared backends in parallel, tolerates
 * individual failures (never throws), and returns a typed `UnifiedContext`
 * the consumer can either use directly or summarize into a prompt.
 *
 * **Implementation choice — typed singletons, not registry fan-out.**
 * Phase 1 (#2793) made `IMemoryBackend.query()` real on every attached
 * domain, so a registry-level `Promise.all(...domains.map(d => d.query()))`
 * would now work. But the result type is `unknown[]` per domain, which
 * loses the typed shapes consumers want. For typed reads, reaching into
 * `getToolMemory()` and `getOutcomeStore()` directly is cleaner. The
 * registry-level fan-out remains the right path for opaque/observability
 * consumers like `memory_stats`.
 *
 * @module context/context-retriever
 * (Source: #2792 / #2794)
 */

import type { Belief } from './belief-core-types.js';
import type { AgenticMemoryEntry } from './agentic-memory.js';
import type { ScoredMemoryEntry } from './adaptive-memory-types.js';
import type { ExperienceEntry } from './mobimem-types.js';
import type { PerformanceSummary } from '../orchestration/outcomes/outcome-types.js';
import type { TaskCategory } from '../config/task-specialization-types.js';
import type { DistilledRule } from '../learning/strategy-distiller-types.js';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import { getToolMemory } from '../mcp/tools/tool-memory.js';
import { getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';

/**
 * What we know about a task, derived from every shared memory backend.
 *
 * Every field is `readonly` and may be empty — consumers should treat
 * absence as "no signal," not failure. Errors fetching any single backend
 * are logged and produce empty results for that field; the function as a
 * whole never throws.
 */
export interface UnifiedContext {
  /** Beliefs whose subject matches the task text. */
  readonly beliefs: readonly Belief[];
  /** A-MEM Zettelkasten entries similar to the task. */
  readonly similarMemories: readonly AgenticMemoryEntry[];
  /** Adaptive priority-scored entries ranked by relevance + recency + importance. */
  readonly recentLearnings: readonly ScoredMemoryEntry[];
  /** MobiMem patterns observed for the task type. */
  readonly experiencePatterns: readonly ExperienceEntry[];
  /** Performance summary scoped to the requested category. */
  readonly outcomes: PerformanceSummary | null;
  /** Distilled routing rules — populated once #2797 lands; empty until then. */
  readonly priorStrategies: readonly DistilledRule[];
}

/** Options accepted by {@link getContextForTask}. */
export interface ContextRetrieverOptions {
  /** Free-text description of the task. Used as the search term. */
  readonly task: string;
  /** Canonical category for outcome scoping. */
  readonly category: TaskCategory;
  /** Per-backend cap on returned rows. Defaults to 5. */
  readonly limit?: number;
  /** Optional logger override. */
  readonly logger?: ILogger;
}

/** Sensible default — small enough to embed in a prompt, large enough to be useful. */
const DEFAULT_LIMIT = 5;

/**
 * The canonical "what do we already know about this task" read.
 *
 * Wire this at the top of every entry point: `CompositeRouter.route`,
 * `orchestrate`, graph workflow start, `create_expert`. Even if the
 * consumer initially just logs the result, every backend's read path
 * gets exercised and the silos visibly converge.
 *
 * Latency: O(slowest individual backend). Each backend's call is wrapped
 * so a slow/failing one doesn't block the others. No caching in this
 * version — if a hot caller emerges, layer a TTL cache on top.
 */
export async function getContextForTask(options: ContextRetrieverOptions): Promise<UnifiedContext> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const logger = options.logger ?? createLogger({ component: 'ContextRetriever' });

  const [beliefs, similarMemories, recentLearnings, experiencePatterns, outcomes] =
    await Promise.all([
      fetchBeliefs(options.task, limit, logger),
      fetchSimilarMemories(options.task, limit, logger),
      fetchRecentLearnings(options.task, limit, logger),
      fetchExperiencePatterns(options.task, limit, logger),
      fetchOutcomes(options.category, logger),
    ]);

  return {
    beliefs,
    similarMemories,
    recentLearnings,
    experiencePatterns,
    outcomes,
    // priorStrategies stays empty until #2797 wires StrategyDistiller persistence.
    priorStrategies: [],
  };
}

async function fetchBeliefs(
  task: string,
  limit: number,
  logger: ILogger
): Promise<readonly Belief[]> {
  try {
    const tm = getToolMemory(logger);
    const beliefs = tm.getBeliefMemory();
    const result = await beliefs.recallBySubject(task, limit);
    return result.ok ? result.value : [];
  } catch (error: unknown) {
    logger.debug('ContextRetriever: belief fetch failed', { error: formatError(error) });
    return [];
  }
}

async function fetchSimilarMemories(
  task: string,
  limit: number,
  logger: ILogger
): Promise<readonly AgenticMemoryEntry[]> {
  try {
    const tm = getToolMemory(logger);
    const agentic = tm.getAgenticMemoryBackend();
    if (agentic === null) return [];
    const result = await agentic.searchAgentic(task, limit);
    return result.ok ? result.value : [];
  } catch (error: unknown) {
    logger.debug('ContextRetriever: agentic search failed', { error: formatError(error) });
    return [];
  }
}

async function fetchRecentLearnings(
  task: string,
  limit: number,
  logger: ILogger
): Promise<readonly ScoredMemoryEntry[]> {
  try {
    const tm = getToolMemory(logger);
    const adaptive = tm.getAdaptiveMemoryBackend();
    if (adaptive === null) return [];
    const result = await adaptive.retrieveByPriority({ query: task, limit });
    return result.ok ? result.value : [];
  } catch (error: unknown) {
    logger.debug('ContextRetriever: adaptive fetch failed', { error: formatError(error) });
    return [];
  }
}

function fetchExperiencePatterns(
  task: string,
  limit: number,
  logger: ILogger
): Promise<readonly ExperienceEntry[]> {
  try {
    const tm = getToolMemory(logger);
    const mobimem = tm.getMobiMem();
    if (mobimem === null) return Promise.resolve([]);
    return Promise.resolve(mobimem.experience.findPatterns(task, limit));
  } catch (error: unknown) {
    logger.debug('ContextRetriever: mobimem fetch failed', { error: formatError(error) });
    return Promise.resolve([]);
  }
}

function fetchOutcomes(
  category: TaskCategory,
  logger: ILogger
): Promise<PerformanceSummary | null> {
  try {
    const store = getOutcomeStore();
    return Promise.resolve(store.summarize({ category }));
  } catch (error: unknown) {
    logger.debug('ContextRetriever: outcomes fetch failed', { error: formatError(error) });
    return Promise.resolve(null);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
