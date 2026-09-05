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
 * Phase 1 (#2793) made `IContextMemoryBackend.query()` real on every attached
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
import {
  rankMemories,
  topRankedWithinBudget,
  clampToTokenBudget,
  sliceContextLines,
  disclosedHeading,
  type RankedMemoryItem,
} from './context-retriever-helpers.js';
import { createTokenCounter } from './token-counter.js';
import { getTokenLedger } from './token-ledger.js';
import { getRepoMapForTask, REPO_MAP_FLAG } from './repo-map.js';
import { tokenizeFiltered } from '../utils/text-utils.js';

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
  /**
   * All non-aggregate backend items lexically cross-ranked into one comparable,
   * sorted list (#3236). The seven lists above are per-backend and on
   * incomparable scales; this is the single "globally-best signal first" view a
   * voter/planning step can read without comparing across backends itself. The
   * aggregate `outcomes` summary is excluded (it is a rollup, not a per-item
   * memory). Additive — the existing lists are unchanged; this is derived from
   * them by {@link rankMemories}.
   */
  readonly rankedMemories: readonly RankedMemoryItem[];
  /**
   * Ranked, token-budgeted repo-map (#4254, Phase 3 of epic #4251): the module
   * import graph ordered by PageRank centrality, carrying an explicit
   * "import-graph only, no call-site data" caveat. **Present ONLY when
   * `NEXUS_REPO_MAP=1` AND the task plausibly needs cross-file structure**
   * (pull-shaped / rank-gated — see {@link getRepoMapForTask}). Absent
   * (`undefined`) on every other call, so flag-off `getContextForTask` output
   * is byte-for-byte unchanged. Rendered into the prompt — and measured in the
   * token ledger tagged `repo-map` — by {@link summarizeContextForPrompt}.
   */
  readonly repoMap?: string;
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
  /**
   * Optional correlation id for the calling execution (#3180). When present it
   * is bound to a child logger so every per-backend log line for this retrieval
   * carries the same `executionId`, making a failure traceable back to its
   * graph run. Backward-compatible: the four existing callers omit it.
   */
  readonly executionId?: string;
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
  const baseLogger = options.logger ?? createLogger({ component: 'ContextRetriever' });
  // Bind the correlation id to every per-backend log line for this retrieval (#3180).
  const logger =
    options.executionId !== undefined
      ? baseLogger.child({ executionId: options.executionId })
      : baseLogger;

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
    getResearchInsightsForTask(options.task, limit, logger),
  ]);

  const priorStrategies = fetchPriorStrategies(options.category, limit, logger);

  const base = {
    beliefs,
    similarMemories,
    recentLearnings,
    experiencePatterns,
    outcomes,
    priorStrategies,
    researchInsights,
  };

  // Derive the cross-ranked view from the seven per-backend lists (#3236). Pure
  // + fail-soft, so this never affects the lists above or throws.
  const result: UnifiedContext = {
    ...base,
    rankedMemories: rankMemories({ ...base, rankedMemories: [] }, options.task),
  };

  // Pull-shaped repo-map (#4254). Returns undefined — doing no work — unless
  // NEXUS_REPO_MAP=1 AND the task plausibly needs cross-file structure, so the
  // key is only added on those calls. Flag off ⇒ `result` is byte-identical to
  // the pre-#4254 return value (the byte-unchanged constraint). Fail-soft.
  const repoMap = getRepoMapForTask({ task: options.task, category: options.category, logger });
  return repoMap === undefined ? result : { ...result, repoMap };
}

/** Tokens shorter than this are too generic to anchor research relevance. */
const MIN_RELEVANCE_TOKEN = 4;

/**
 * Evidence-tier rank for the read-time weighting (#4287): higher wins. A
 * technique with no joined tier (papers.yaml absent / ids unresolved) sorts
 * last, preserving the pre-#4287 ordering when no evidence data exists.
 *
 * Explicit branches (rather than a map lookup) guarantee a finite numeric rank
 * for `undefined` AND for any unexpected out-of-enum value — the sort
 * comparator can never see a NaN, so ordering stays deterministic even though
 * the tier originates from unvalidated papers.yaml.
 */
function evidenceRank(t: TechniqueStatusSummary): number {
  switch (t.evidenceTier) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

/**
 * Pure relevance filter: select research techniques whose `topic` or `name`
 * shares a meaningful word (≥{@link MIN_RELEVANCE_TOKEN} chars) with the task
 * text. Matches are STABLE-sorted by evidence tier (high > medium > low >
 * none, #4287) before the `limit` is applied — insertion order is preserved
 * within an equal tier, so when no technique carries evidence data the result
 * is byte-identical to the pre-#4287 insertion-ordered slice. Returns at most
 * `limit`. Exported for direct unit testing of the matching logic (the
 * network/registry read is wrapped separately in
 * {@link getResearchInsightsForTask}).
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
    if (hit) matches.push(t);
  }
  // Stable sort by descending evidence rank (Array.prototype.sort is stable),
  // then take the top `limit`. Ties keep insertion (registry) order.
  const ordered = [...matches].sort((a, b) => evidenceRank(b) - evidenceRank(a));
  return ordered.slice(0, limit);
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
 * registry, a failed status read, or any throw yields `[]` so the caller never
 * breaks on the research backend. Uses the lightweight status read (not full
 * synthesis) so it stays cheap enough for a per-task call.
 *
 * Exported so consumers outside the {@link getContextForTask} fan-out can reuse
 * the same relevance read — e.g. the dev-pipeline surfacing prior research to
 * its plan/vote stages (#3472) — without duplicating the fetch+select logic.
 */
export async function getResearchInsightsForTask(
  task: string,
  limit: number,
  logger?: ILogger
): Promise<readonly TechniqueStatusSummary[]> {
  const log = logger ?? createLogger({ component: 'ContextRetriever' });
  try {
    const result = await getResearchStatus({ status: 'all', format: 'json' });
    if (!result.success) return [];
    return selectRelevantResearch(result.techniques, task, limit);
  } catch (error: unknown) {
    log.debug('research insights fetch failed', { error: formatError(error) });
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

/** Upper bound on the belief scan behind the keyword fallback. */
const BELIEF_KEYWORD_SCAN_LIMIT = 1000;

/**
 * Fetch beliefs relevant to a task.
 *
 * `recallBySubject` is an exact lookup against the subject index, and subjects
 * are written by producers like `skill:${name}` and `learning.context` — never
 * the caller's prose. So for any ordinary multi-word task the exact lookup
 * missed and the Beliefs section was silently dropped from the prompt (#4845).
 * Short or identifier-shaped tasks did match, which is why this was
 * intermittent rather than total.
 *
 * The fallback is the one `queryBeliefMemory` already uses for the same store
 * (#1225): when the exact lookup misses, scan and keyword-match the belief
 * text. Kept behind the exact lookup so the path that already worked is
 * unchanged and the scan only runs when it would otherwise return nothing.
 */
async function fetchBeliefs(
  task: string,
  limit: number,
  logger: ILogger
): Promise<readonly Belief[]> {
  try {
    const tm = getToolMemory(logger);
    const beliefs = tm.getBeliefMemory();
    const exact = await beliefs.recallBySubject(task, limit);
    if (exact.ok && exact.value.length > 0) return exact.value;

    const keywords = tokenizeFiltered(task);
    if (keywords.length === 0) return [];

    const all = await beliefs.query({ includeSuperseded: false, limit: BELIEF_KEYWORD_SCAN_LIMIT });
    if (!all.ok) return [];

    const matched = all.value.filter((b) => {
      const text = `${b.subject} ${b.predicate} ${b.object}`.toLowerCase();
      return keywords.some((k) => text.includes(k));
    });
    if (matched.length === 0) {
      // An empty belief list is indistinguishable from "nothing stored", so
      // say which one happened rather than leaving the caller to guess.
      logger.debug('ContextRetriever: no beliefs matched', {
        scanned: all.value.length,
        keywords: keywords.length,
      });
    }
    return matched.slice(0, limit);
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

/** Max chars per interpolated free-text field in a prompt-summary line. */
const MAX_SUMMARY_FIELD = 200;

/**
 * Collapse whitespace (including newlines) and cap length for a single backend
 * value before it is interpolated into a prompt-summary line.
 *
 * Defense-in-depth (#3471): every section below renders backend strings into an
 * LLM system-prompt prefix. Without this, a value containing a newline could
 * inject extra un-prefixed lines that escape the `- ` data-framing — a weak
 * prompt-injection vector. Current sources are all T1 repo/internal data so
 * nothing reachable exploits it today, but collapsing + capping makes the
 * framing a local guarantee rather than a cross-module trust inference, and
 * mirrors the hardening already applied to dev-pipeline hindsight recall (#3257).
 */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_SUMMARY_FIELD);
}

/**
 * Project a {@link UnifiedContext} into a compact human-readable block
 * suitable for prepending to a system prompt. Skips empty sections so
 * the prefix never wastes tokens on \"no signal.\"
 *
 * Phase 3 of #2792 — used by `orchestrate` and graph workflow start to
 * surface accumulated memory at the entry point. Every interpolated free-text
 * field is passed through {@link oneLine} (#3471).
 *
 * When `NEXUS_CONTEXT_RANKED=1` (#3236), the per-backend sections are replaced
 * by a single globally-cross-ranked "Most relevant prior context" block drawn
 * from {@link UnifiedContext.rankedMemories} within a token budget. Flag-off
 * output is byte-identical to the legacy per-section rendering (as long as
 * the result stays under `budgetTokens` — see the budget guard below).
 *
 * **Per-call context budget guard (#4253):** the assembled block — on BOTH
 * the ranked and legacy rendering paths — is clamped to `budgetTokens`
 * (default {@link DEFAULT_CONTEXT_BUDGET_TOKENS}, the CLAUDE.md "Standard"
 * context-budget tier) via {@link clampToTokenBudget}'s char/4 estimate.
 * Before this guard, the legacy path had no cap at all — only per-section
 * `.slice(0, 3-5)` limits, which bound item *count* but not total size. When
 * clamping actually truncates, a trailing notice reports it so callers see
 * backpressure instead of a silent cut. This does not change the
 * memory-backend fan-out or ranking semantics (including the ranked path's
 * own internal {@link RANKED_PREFIX_TOKEN_BUDGET}) — it is a final clamp
 * applied after rendering.
 *
 * **Token ledger wiring (#4252, Phase 0 of epic #4251):** every non-empty
 * result is also recorded in the {@link getTokenLedger} as one `memory-backend`
 * entry, tagged with `variant: 'ranked' | 'legacy'` for which rendering path
 * produced it. This is the single highest-value measurement point named by
 * #4252 — without it, the C3 (#4253 caps) and C1' (#4254 repo-map) savings
 * have no per-call baseline to diff against.
 */
export function summarizeContextForPrompt(
  ctx: UnifiedContext,
  budgetTokens: number = DEFAULT_CONTEXT_BUDGET_TOKENS
): string {
  const ranked = process.env[CONTEXT_RANKED_FLAG] === '1';
  const rendered = ranked ? summarizeRankedContext(ctx) : summarizeLegacyContext(ctx);
  const clamped = clampRenderedContext(rendered, budgetTokens);
  recordAssembledContextTokens(clamped, ranked);
  return appendRepoMapSection(clamped, ctx);
}

/**
 * Append the ranked repo-map block (#4254) after the memory-backend block when
 * `ctx.repoMap` is present. Its emitted token count is recorded in the token
 * ledger tagged `contextSource: 'repo-map'` — a SEPARATE entry from the
 * memory-backend one — so the repo-map's cost is independently visible for the
 * #4251 A/B. Best-effort (the ledger never throws). When `ctx.repoMap` is
 * absent (flag off / rank-gated out) this returns the memory block unchanged,
 * so flag-off output stays byte-for-byte identical and no `repo-map` ledger
 * entry is written.
 */
function appendRepoMapSection(memoryBlock: string, ctx: UnifiedContext): string {
  const map = ctx.repoMap;
  if (map === undefined || map === '') return memoryBlock;
  recordRepoMapTokens(map);
  return memoryBlock === '' ? map : `${memoryBlock}\n\n${map}`;
}

/** Variant tag recording the flag config that produced a repo-map ledger entry (#4254). */
const REPO_MAP_LEDGER_VARIANT = `${REPO_MAP_FLAG}=1`;

/** Record the repo-map's token count in the ledger, tagged `repo-map` (#4254 constraint 5). */
function recordRepoMapTokens(rendered: string): void {
  getTokenLedger().record({
    tool: 'context-retriever.summarizeContextForPrompt',
    contextSource: 'repo-map',
    inputTokens: contextTokenCounter.estimate(rendered),
    variant: REPO_MAP_LEDGER_VARIANT,
  });
}

/** Shared estimator for the ledger wiring below — builds on `token-counter.ts` (#4252). */
const contextTokenCounter = createTokenCounter();

/**
 * Record the assembled-context token count in the per-call token ledger
 * (#4252). Best-effort: {@link getTokenLedger}'s persistence never throws
 * (inherited from the `JsonlStore` contract), so this cannot break context
 * assembly. Skipped for an empty block — there is nothing to measure, and
 * recording it would add "0 tokens" noise to every no-signal call.
 */
function recordAssembledContextTokens(rendered: string, ranked: boolean): void {
  if (rendered === '') return;
  getTokenLedger().record({
    tool: 'context-retriever.summarizeContextForPrompt',
    contextSource: 'memory-backend',
    inputTokens: contextTokenCounter.estimate(rendered),
    variant: ranked ? 'ranked' : 'legacy',
  });
}

/** Default per-call context budget (tokens), applied by {@link summarizeContextForPrompt} (#4253). Matches the CLAUDE.md "Standard" context-budget tier (~2,500); pass a different value for a caller in the Minimal (~800) / Research (~1,500) / Full (~6,000) tier. */
export const DEFAULT_CONTEXT_BUDGET_TOKENS = 2500;

/** Tokens reserved for the trailing clip notice so the final block stays close to `budgetTokens` once the notice is appended. */
const CLIP_NOTICE_RESERVE_TOKENS = 30;

/**
 * Apply the final per-call budget clamp (#4253) to an already-rendered
 * context block, appending a visible notice when clamping actually
 * truncated something. No-op on an empty or already-in-budget block.
 */
function clampRenderedContext(rendered: string, budgetTokens: number): string {
  if (rendered === '') return rendered;
  const contentBudget = Math.max(0, budgetTokens - CLIP_NOTICE_RESERVE_TOKENS);
  const { text: kept, clipped, omittedChars } = clampToTokenBudget(rendered, contentBudget);
  if (!clipped) return rendered;
  return `${kept}\n\n_(context clipped to fit the ~${String(budgetTokens)}-token budget; ~${String(omittedChars)} chars omitted — #4253)_`;
}

/** The legacy (flag-off) per-backend-section rendering (#3148 / #3471). Extracted from {@link summarizeContextForPrompt} so the budget guard wraps both rendering paths identically (#4253). */
function summarizeLegacyContext(ctx: UnifiedContext): string {
  const sections: string[] = [];

  if (ctx.beliefs.length > 0) {
    const slice = sliceContextLines(
      ctx.beliefs.map(
        (b) =>
          `- ${oneLine(b.subject)} ${oneLine(b.predicate)} ${oneLine(b.object)} (confidence: ${b.confidence})`
      ),
      contextTokenCounter
    );
    sections.push(`${disclosedHeading('### Beliefs', slice)}\n${slice.lines.join('\n')}`);
  }

  if (ctx.similarMemories.length > 0) {
    const lines = ctx.similarMemories
      .slice(0, 3)
      .map((m) => `- ${oneLine(m.attributes.contextDescription)}`);
    sections.push(`### Similar prior work\n${lines.join('\n')}`);
  }

  if (ctx.experiencePatterns.length > 0) {
    const lines = ctx.experiencePatterns
      .slice(0, 3)
      .map(
        (p) =>
          `- ${oneLine(p.taskType)}: ${(p.successRate * 100).toFixed(0)}% success over ${String(p.attemptCount)} attempts`
      );
    sections.push(`### Observed patterns\n${lines.join('\n')}`);
  }

  if (ctx.outcomes !== null && ctx.outcomes.totalTasks > 0) {
    sections.push(
      `### Outcomes for this category\n- ${String(ctx.outcomes.totalTasks)} prior tasks, ${(ctx.outcomes.successRate * 100).toFixed(0)}% success`
    );
  }

  if (ctx.researchInsights.length > 0) {
    const lines = ctx.researchInsights.map((r) => {
      // Evidence tier (#4287) is appended only when the papers.yaml join
      // resolved; absent ⇒ the line is byte-identical to the pre-#4287 render.
      // Wrap in oneLine() like every other rendered field so an untrusted
      // papers.yaml value can't escape the `- ` framing with embedded newlines.
      const evidence = r.evidenceTier !== undefined ? `, evidence: ${oneLine(r.evidenceTier)}` : '';
      return `- ${oneLine(r.name)} (${oneLine(r.status)}${evidence}) — ${oneLine(r.topic)}`;
    });
    const slice = sliceContextLines(lines, contextTokenCounter);
    sections.push(
      `${disclosedHeading('### Prior research on this topic', slice)}\n${slice.lines.join('\n')}`
    );
  }

  return sections.length === 0 ? '' : `## Prior Context (Nexus Memory)\n${sections.join('\n\n')}`;
}

/** Rollout gate for the unified cross-ranked prefix rendering (#3236). Default off. */
const CONTEXT_RANKED_FLAG = 'NEXUS_CONTEXT_RANKED';

/** Token budget for the ranked prefix block (#3236). Small enough to stay cheap in a system prompt. */
const RANKED_PREFIX_TOKEN_BUDGET = 400;

/** Human label per cross-ranked source for the rendered prefix line. */
const RANKED_SOURCE_LABEL: Readonly<Record<RankedMemoryItem['source'], string>> = {
  belief: 'belief',
  agentic: 'prior work',
  adaptive: 'learning',
  experience: 'pattern',
  strategy: 'strategy',
  research: 'research',
};

/**
 * Ranked-mode rendering (#3236): collapse the per-backend sections into one
 * globally-best-first block. Reuses {@link rankMemories} (already applied at
 * retrieval, re-derived here so direct callers of this pure function get the
 * same view) and {@link topRankedWithinBudget} for truncation. Every rendered
 * field still flows through {@link oneLine} — the same sanitization the legacy
 * path applies (#3236 vote condition 3; memory backends are untrusted).
 */
function summarizeRankedContext(ctx: UnifiedContext): string {
  const ranked =
    ctx.rankedMemories.length > 0 ? ctx.rankedMemories : rankMemories(ctx, deriveRankTask(ctx));
  const top = topRankedWithinBudget(ranked, RANKED_PREFIX_TOKEN_BUDGET);
  if (top.length === 0) return '';
  const lines = top.map(
    (r) =>
      `- [${RANKED_SOURCE_LABEL[r.source]}] ${oneLine(r.text)} (relevance: ${r.relevanceScore.toFixed(2)})`
  );
  return `## Prior Context (Nexus Memory)\n### Most relevant prior context\n${lines.join('\n')}`;
}

/**
 * When `summarizeContextForPrompt` is called directly (not via the retriever),
 * `rankedMemories` may be empty even though the per-backend lists are populated.
 * Derive a task string from the highest-signal backend text so a direct call can
 * still rank. Empty when nothing is present.
 */
function deriveRankTask(ctx: UnifiedContext): string {
  const first = ctx.beliefs[0];
  if (first !== undefined) return `${first.subject} ${first.predicate} ${first.object}`;
  return ctx.similarMemories[0]?.attributes.contextDescription ?? '';
}

/** Rollout gate for injecting unified context into entry-point prompts (#2921). */
const CONTEXT_INJECT_FLAG = 'NEXUS_CONTEXT_RETRIEVER_INJECT';

/**
 * One-call helper for entry points that want to prepend accumulated context to a
 * prompt: returns the {@link summarizeContextForPrompt} block for `task`, or
 * `undefined` when the rollout flag is unset or there is no signal.
 *
 * Centralizes the `NEXUS_CONTEXT_RETRIEVER_INJECT` gate (#2921) and the
 * fetch→summarize sequence so each consumer (orchestrate, execute_expert,
 * pipeline stage-wrappers …) doesn't re-implement it. Default-off and fail-soft:
 * any retrieval error yields `undefined`. Callers whose prompt also feeds a
 * security decision (e.g. an access policy) must still treat the block as
 * untrusted — the underlying memory backends are writable via `memory_write`.
 */
export async function getContextPromptPrefix(
  task: string,
  logger?: ILogger
): Promise<string | undefined> {
  if (process.env[CONTEXT_INJECT_FLAG] !== '1') return undefined;
  const log = logger ?? createLogger({ component: 'ContextRetriever' });
  try {
    const ctx = await getContextForTask({ task, category: inferTaskCategory(task), logger: log });
    const summary = summarizeContextForPrompt(ctx);
    return summary === '' ? undefined : summary;
  } catch (error: unknown) {
    log.debug('context prompt prefix failed', { error: formatError(error) });
    return undefined;
  }
}
