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
import { loadPersistedRules } from '../learning/strategy-distiller-persistence.js';
import { getResearchStatus } from '../cli/research-helpers.js';
import type { TechniqueStatusSummary } from '../cli/research-types.js';

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
  /**
   * Prior research techniques from the research registry whose topic/name is
   * relevant to the task (#3148 / #2792 research→context loop). Surfaces what
   * we have already investigated — and its status (implemented / rejected /
   * planned) — so planning reuses research instead of re-proposing settled or
   * already-rejected approaches. Empty when nothing matches or no registry.
   */
  readonly researchInsights: readonly TechniqueStatusSummary[];
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

  const [
    beliefs,
    similarMemories,
    recentLearnings,
    experiencePatterns,
    outcomes,
    researchInsights,
  ] = await Promise.all([
    fetchBeliefs(options.task, limit, logger),
    fetchSimilarMemories(options.task, limit, logger),
    fetchRecentLearnings(options.task, limit, logger),
    fetchExperiencePatterns(options.task, limit, logger),
    fetchOutcomes(options.category, logger),
    fetchResearchInsights(options.task, limit, logger),
  ]);

  const priorStrategies = fetchPriorStrategies(options.category, limit, logger);

  return {
    beliefs,
    similarMemories,
    recentLearnings,
    experiencePatterns,
    outcomes,
    priorStrategies,
    researchInsights,
  };
}

/** Tokens shorter than this are too generic to anchor research relevance. */
const MIN_RELEVANCE_TOKEN = 4;

/**
 * Pure relevance filter: select research techniques whose `topic` or `name`
 * shares a meaningful word (≥{@link MIN_RELEVANCE_TOKEN} chars) with the task
 * text. Order-preserving; returns at most `limit`. Exported for direct unit
 * testing of the matching logic (the network/registry read is wrapped
 * separately in {@link fetchResearchInsights}).
 */
export function selectRelevantResearch(
  techniques: readonly TechniqueStatusSummary[],
  task: string,
  limit: number
): readonly TechniqueStatusSummary[] {
  const taskTokens = tokenize(task);
  if (taskTokens.size === 0) return [];
  const matches: TechniqueStatusSummary[] = [];
  for (const t of techniques) {
    const fieldTokens = tokenize(`${t.name} ${t.topic}`);
    let hit = false;
    for (const tok of fieldTokens) {
      if (taskTokens.has(tok)) {
        hit = true;
        break;
      }
    }
    if (hit) {
      matches.push(t);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

/** Lowercase word set, keeping only tokens long enough to be discriminating. */
function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= MIN_RELEVANCE_TOKEN) tokens.add(raw);
  }
  return tokens;
}

/**
 * Read research-registry techniques relevant to the task. Fail-soft: a missing
 * registry, a failed status read, or any throw yields `[]` so context assembly
 * never breaks on the research backend. Uses the lightweight status read (not
 * full synthesis) so it stays cheap enough for the per-task context fan-out.
 */
async function fetchResearchInsights(
  task: string,
  limit: number,
  logger: ILogger
): Promise<readonly TechniqueStatusSummary[]> {
  try {
    const result = await getResearchStatus({ status: 'all', format: 'json' });
    if (!result.success) return [];
    return selectRelevantResearch(result.techniques, task, limit);
  } catch (error: unknown) {
    logger.debug('ContextRetriever: research insights fetch failed', {
      error: formatError(error),
    });
    return [];
  }
}

/**
 * Phase 5 of #2792 — surface distilled routing rules in the unified
 * context. Reads from the persisted rules file (written by
 * `PersistentStrategyDistiller`) so consumers see the same learnings the
 * CompositeRouter applies at decision time, without needing a live
 * router instance.
 *
 * Filters to (a) `status === 'active'` (rules that aren't deprecated or
 * shadowed), (b) `tainted === false` (security gate — tainted rules
 * never reach consumers per Phase 5 acceptance), and (c) category
 * matching the task's category or a global rule.
 */
function fetchPriorStrategies(
  category: TaskCategory,
  limit: number,
  logger: ILogger
): readonly DistilledRule[] {
  try {
    const all = loadPersistedRules();
    return all
      .filter((r) => r.status === 'active' && !r.tainted)
      .filter((r) => r.category === category || r.category === '*')
      .slice(0, limit);
  } catch (error: unknown) {
    logger.debug('ContextRetriever: prior-strategies fetch failed', {
      error: formatError(error),
    });
    return [];
  }
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

/**
 * Best-effort {@link TaskCategory} inference from free-text task content.
 * Used by entry-point wiring (Phase 3 / #2795) when the caller doesn't
 * carry a structured category. Keyword-based; if nothing matches,
 * returns `'exploration'` (which scopes the outcomes summary to the
 * broadest historical baseline).
 *
 * Intentionally simple — this is a *fallback*, not a classifier. Real
 * classification happens at routing time via `cli-adapters/task-classifier`.
 */
export function inferTaskCategory(task: string): TaskCategory {
  const t = task.toLowerCase();
  if (/security|vulnerab|cve|threat|owasp|injection|xss/.test(t)) return 'security_review';
  if (/architect|design doc|rfc|adr|system design/.test(t)) return 'architecture';
  if (/test|spec|coverage|vitest|jest|pytest/.test(t)) return 'testing';
  if (/review|audit|critique|feedback/.test(t)) return 'code_review';
  if (/docs|documentation|readme|tutorial|guide/.test(t)) return 'documentation';
  if (/plan|roadmap|epic|sprint|breakdown/.test(t)) return 'planning';
  if (/research|investigate|explore|survey|analyze/.test(t)) return 'research';
  if (/deploy| ci |\bcd\b|pipeline|kubernetes|docker|infra|terraform/.test(t)) return 'devops';
  if (/implement|build|create|add|refactor|fix|bug|feature/.test(t)) return 'code_generation';
  return 'exploration';
}

/**
 * Project a {@link UnifiedContext} into a compact human-readable block
 * suitable for prepending to a system prompt. Skips empty sections so
 * the prefix never wastes tokens on \"no signal.\"
 *
 * Phase 3 of #2792 — used by `orchestrate` and graph workflow start to
 * surface accumulated memory at the entry point.
 */
export function summarizeContextForPrompt(ctx: UnifiedContext): string {
  const sections: string[] = [];

  if (ctx.beliefs.length > 0) {
    const lines = ctx.beliefs
      .slice(0, 5)
      .map((b) => `- ${b.subject} ${b.predicate} ${b.object} (confidence: ${b.confidence})`);
    sections.push(`### Beliefs\n${lines.join('\n')}`);
  }

  if (ctx.similarMemories.length > 0) {
    const lines = ctx.similarMemories
      .slice(0, 3)
      .map((m) => `- ${m.attributes.contextDescription}`);
    sections.push(`### Similar prior work\n${lines.join('\n')}`);
  }

  if (ctx.experiencePatterns.length > 0) {
    const lines = ctx.experiencePatterns
      .slice(0, 3)
      .map(
        (p) =>
          `- ${p.taskType}: ${(p.successRate * 100).toFixed(0)}% success over ${String(p.attemptCount)} attempts`
      );
    sections.push(`### Observed patterns\n${lines.join('\n')}`);
  }

  if (ctx.outcomes !== null && ctx.outcomes.totalTasks > 0) {
    sections.push(
      `### Outcomes for this category\n- ${String(ctx.outcomes.totalTasks)} prior tasks, ${(ctx.outcomes.successRate * 100).toFixed(0)}% success`
    );
  }

  if (ctx.researchInsights.length > 0) {
    const lines = ctx.researchInsights
      .slice(0, 5)
      .map((r) => `- ${r.name} (${r.status}) — ${r.topic}`);
    sections.push(`### Prior research on this topic\n${lines.join('\n')}`);
  }

  return sections.length === 0 ? '' : `## Prior Context (Nexus Memory)\n${sections.join('\n\n')}`;
}
