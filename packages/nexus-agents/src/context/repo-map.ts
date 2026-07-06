/**
 * Repo-map context provider — pull-shaped, usage-aware, measured (#4254,
 * Phase 3 of epic #4251; call-site signal added in #4268).
 *
 * Wires the EXISTING module-import graph (`indexer/types.ts`
 * `ModuleEntry.dependsOn`, built by `analyzer.ts buildIndex`, until now
 * emitted only as docs/mermaid) into context assembly as a **ranked,
 * token-budgeted repo-map**. Modules are ordered by import-graph PageRank
 * centrality **blended with real call-site frequency** (#4268 — the
 * `search_usages` ast-grep signal, `context/repo-map-callsites.ts`), then
 * budget-clipped to a small token target so heavily-*called* modules surface,
 * not just heavily-imported ones.
 *
 * ## Shaped exactly as the consensus vote (#4251) constrained it
 *
 * 1. **Default OFF / opt-in.** {@link getRepoMapForTask} contributes only when
 *    `NEXUS_REPO_MAP=1` (mirrors the `NEXUS_CONTEXT_RANKED` pattern). Flag off
 *    ⇒ it returns `undefined` before doing any work, so `getContextForTask`
 *    output is byte-for-byte unchanged.
 * 2. **Pull-shaped / rank-gated.** Even with the flag on, the map is produced
 *    ONLY for tasks that plausibly span multiple modules ({@link taskNeedsRepoMap}) —
 *    never pushed onto 100% of calls (the rejected eager-RAG anti-pattern).
 * 3. **PageRank + call-site ranking.** Import-graph PageRank is the base score;
 *    a bounded per-module call-site count ({@link computeCallSiteCounts}) is
 *    blended in as a secondary signal ({@link blendRankScore}). The block is
 *    then clipped to a token budget (reusing the #4253 char/4 mechanism —
 *    {@link clampToTokenBudget}).
 * 4. **Honest caveat.** Call-site data IS incorporated, but structural matching
 *    is syntactic (no type checker): dynamic dispatch, computed/string-keyed
 *    calls, and same-named members on unrelated objects are not resolved, and
 *    the call-site signal only samples the top import-ranked modules. Every
 *    rendered map carries an explicit {@link REPO_MAP_CAVEAT} at the top so
 *    agents treat centrality as an approximate structural+usage signal, not an
 *    exact call graph.
 * 5. **Measured.** The emitted token count is recorded in the token ledger
 *    tagged `contextSource: 'repo-map'` by the `context-retriever.ts` wiring.
 * 6. **Fresh, not persisted.** The default index provider builds from the
 *    CURRENT source tree each call ({@link buildLiveIndex}) — no persisted
 *    stale-map path. (A scoped index cache is a tracked follow-up; the
 *    provider is opt-in + rank-gated so the build cost is only paid when asked.)
 *
 * Pure builder + fail-soft provider: a build (or call-site) failure degrades to
 * import-only ranking / `undefined`, never a throw into context assembly.
 *
 * @module context/repo-map
 */

import type { CodebaseIndex, ModuleEntry } from '../indexer/types.js';
import type { TaskCategory } from '../config/task-specialization-types.js';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import { extractProject } from '../indexer/extractor.js';
import { buildIndex } from '../indexer/analyzer.js';
import { clampToTokenBudget } from './context-retriever-helpers.js';
import { CALLSITE_TOP_N_MODULES, computeCallSiteCounts } from './repo-map-callsites.js';

// ============================================================================
// Public constants
// ============================================================================

/** Env flag gating the repo-map provider (#4254). `1` enables; default off. */
export const REPO_MAP_FLAG = 'NEXUS_REPO_MAP';

/** Default token budget for the rendered repo-map block. Small — it is a map, not a dump. */
export const DEFAULT_REPO_MAP_TOKEN_BUDGET = 400;

/**
 * Mandatory honesty caveat (#4254 constraint 4, updated in #4268 once call-site
 * data landed). Ranking now blends import PageRank with real call-site
 * frequency, so the old "no call-site data" wording is gone. The remaining,
 * honest limitation is that call-site matching is structural/syntactic (no type
 * checker). Rendered at the TOP of every map so a prefix-cut budget clamp can
 * never remove it.
 */
export const REPO_MAP_CAVEAT =
  'Ranking blends import-graph PageRank with structural call-site frequency ' +
  '(ast-grep, sampled over the top import-ranked modules). Call-site matching is ' +
  'syntactic, not type-aware: dynamic dispatch, computed/string-keyed calls, and ' +
  'same-named members on unrelated objects are not resolved — treat centrality as ' +
  'an approximate structural+usage signal, not an exact call graph.';

/** Section header for the rendered repo-map block. */
const REPO_MAP_HEADER = '## Repo Map (module import graph + call-site usage — ranked)';

// ============================================================================
// PageRank over the module-import graph
// ============================================================================

/** PageRank damping factor (the standard 0.85). */
const PAGERANK_DAMPING = 0.85;
/** Max PageRank iterations. Module-scale graphs converge in far fewer. */
const PAGERANK_MAX_ITERATIONS = 100;
/** Convergence threshold on the L1 delta between successive iterations. */
const PAGERANK_EPSILON = 1e-6;

/**
 * Compute PageRank centrality over the module-import graph. An edge `A → B`
 * exists when `B ∈ A.dependsOn` (A imports B), so PageRank scores a module
 * high when many/important modules depend on it — i.e. the foundational
 * modules surface first. Restricted to intra-index edges (unknown/self
 * targets are dropped). Returns a probability distribution summing to ~1.
 * Pure; never throws; empty graph → empty map.
 */
export function computeModulePageRank(modules: Record<string, ModuleEntry>): Map<string, number> {
  const names = Object.keys(modules);
  const n = names.length;
  if (n === 0) return new Map();
  const outEdges = buildOutEdges(modules, names);
  let ranks = new Map(names.map((name) => [name, 1 / n]));
  for (let iter = 0; iter < PAGERANK_MAX_ITERATIONS; iter++) {
    const next = pageRankStep(names, outEdges, ranks, n);
    if (l1Delta(ranks, next) < PAGERANK_EPSILON) return next;
    ranks = next;
  }
  return ranks;
}

/** Out-edge adjacency restricted to known modules, self-edges removed. */
function buildOutEdges(
  modules: Record<string, ModuleEntry>,
  names: readonly string[]
): Map<string, readonly string[]> {
  const known = new Set(names);
  const out = new Map<string, readonly string[]>();
  for (const name of names) {
    const deps = modules[name]?.dependsOn ?? [];
    out.set(
      name,
      deps.filter((d) => known.has(d) && d !== name)
    );
  }
  return out;
}

/** One power-iteration step, redistributing dangling-node rank uniformly. */
function pageRankStep(
  names: readonly string[],
  outEdges: Map<string, readonly string[]>,
  ranks: Map<string, number>,
  n: number
): Map<string, number> {
  const danglingShare = (PAGERANK_DAMPING * sumDanglingRank(names, outEdges, ranks)) / n;
  const base = (1 - PAGERANK_DAMPING) / n + danglingShare;
  const next = new Map<string, number>(names.map((name) => [name, base]));
  for (const src of names) {
    const targets = outEdges.get(src) ?? [];
    if (targets.length === 0) continue;
    const share = (PAGERANK_DAMPING * (ranks.get(src) ?? 0)) / targets.length;
    for (const t of targets) {
      next.set(t, (next.get(t) ?? 0) + share);
    }
  }
  return next;
}

/** Total rank held by dangling nodes (no outgoing edges). */
function sumDanglingRank(
  names: readonly string[],
  outEdges: Map<string, readonly string[]>,
  ranks: Map<string, number>
): number {
  let sum = 0;
  for (const name of names) {
    if ((outEdges.get(name) ?? []).length === 0) sum += ranks.get(name) ?? 0;
  }
  return sum;
}

/** L1 distance between two rank vectors, used as the convergence signal. */
function l1Delta(a: Map<string, number>, b: Map<string, number>): number {
  let d = 0;
  for (const [k, v] of a) d += Math.abs(v - (b.get(k) ?? 0));
  return d;
}

// ============================================================================
// Ranked entries
// ============================================================================

/** One repo-map row: a module with its centrality, call-site count, and import edges. */
export interface RepoMapEntry {
  /** Module name. */
  readonly module: string;
  /** PageRank centrality in [0, 1]. */
  readonly centrality: number;
  /** Structural call-sites of this module's exported symbols (#4268; 0 when no call-site data). */
  readonly callSites: number;
  /** Module purpose (from the index). */
  readonly purpose: string;
  /** Modules this module imports (out-edges). */
  readonly dependsOn: readonly string[];
  /** File count, for a rough size signal. */
  readonly fileCount: number;
}

/**
 * Weight of the call-site signal relative to import centrality (#4268). At
 * `2`, a max-called module scores up to 3× its centrality, so a heavily-called
 * but lightly-imported module can overtake a lightly-called one with up to ~3×
 * its centrality — enough to measurably reorder toward actually-used modules
 * while keeping import centrality as the base signal.
 */
const CALL_SITE_WEIGHT = 2;

/** Blend import centrality with a normalized call-site count into the sort score (#4268). */
export function blendRankScore(
  centrality: number,
  callSites: number,
  maxCallSites: number
): number {
  if (maxCallSites <= 0) return centrality;
  return centrality * (1 + CALL_SITE_WEIGHT * (callSites / maxCallSites));
}

/** Largest call-site count across modules, used to normalize the blend. */
function maxCount(counts: ReadonlyMap<string, number>): number {
  let max = 0;
  for (const v of counts.values()) if (v > max) max = v;
  return max;
}

/**
 * Rank every module in the index by import-graph PageRank centrality blended
 * with call-site frequency (#4268) — descending, ties broken by name for a
 * deterministic order. With no `callSiteCounts` (or all-zero counts) the score
 * reduces to pure centrality, so import-only callers rank identically. Pure.
 */
export function rankRepoMapEntries(
  index: CodebaseIndex,
  callSiteCounts?: ReadonlyMap<string, number>
): readonly RepoMapEntry[] {
  const ranks = computeModulePageRank(index.modules);
  const counts = callSiteCounts ?? new Map<string, number>();
  const max = maxCount(counts);
  const scored = Object.entries(index.modules).map(([name, mod]) => {
    const centrality = ranks.get(name) ?? 0;
    const callSites = counts.get(name) ?? 0;
    const entry: RepoMapEntry = {
      module: name,
      centrality,
      callSites,
      purpose: mod.purpose,
      dependsOn: mod.dependsOn,
      fileCount: mod.stats.fileCount,
    };
    return { entry, score: blendRankScore(centrality, callSites, max) };
  });
  scored.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.entry.module.localeCompare(b.entry.module)
  );
  return scored.map((s) => s.entry);
}

// ============================================================================
// Rendering
// ============================================================================

/** Options for {@link buildRepoMap}. */
export interface BuildRepoMapOptions {
  /** Token budget for the rendered block. Defaults to {@link DEFAULT_REPO_MAP_TOKEN_BUDGET}. */
  readonly budgetTokens?: number;
  /** Per-module call-site counts to blend into ranking (#4268). Absent ⇒ import-only order. */
  readonly callSiteCounts?: ReadonlyMap<string, number>;
}

/** Rough chars-per-token estimate, matching {@link clampToTokenBudget} / token-counter (~4). */
const CHARS_PER_TOKEN = 4;
/** Cap on how many import edges to list per module line (keeps lines bounded). */
const MAX_DEPS_PER_LINE = 6;
/** Cap on a single rendered line's chars (defense against a pathological purpose string). */
const MAX_LINE_CHARS = 200;

/**
 * Build a ranked, token-budgeted repo-map from a codebase index. Modules are
 * ordered by PageRank centrality; lower-centrality modules are clipped to fit
 * `budgetTokens` worth of module-list content (with a visible "+N omitted"
 * notice). The header + mandatory {@link REPO_MAP_CAVEAT} always lead the block
 * in full — `budgetTokens` governs the clippable module list, never the safety
 * caveat (#4254 constraint 4). Empty index → empty string. Pure.
 */
export function buildRepoMap(index: CodebaseIndex, options: BuildRepoMapOptions = {}): string {
  const entries = rankRepoMapEntries(index, options.callSiteCounts);
  if (entries.length === 0) return '';
  const budget = options.budgetTokens ?? DEFAULT_REPO_MAP_TOKEN_BUDGET;
  return renderRepoMap(entries, budget);
}

/** Assemble preamble (header + caveat) + budget-fitted module lines + omission notice. */
function renderRepoMap(entries: readonly RepoMapEntry[], budgetTokens: number): string {
  const preamble = `${REPO_MAP_HEADER}\n> ${REPO_MAP_CAVEAT}`;
  const lines = entries.map(formatEntryLine);
  const { kept, omitted } = fitLinesWithinBudget(lines, budgetTokens);
  // Defensive re-clamp of the module list reusing the #4253 char/4 mechanism
  // ({@link clampToTokenBudget}); a no-op once the greedy fit has kept lines.
  const bodyText = kept.length > 0 ? clampToTokenBudget(kept.join('\n'), budgetTokens).text : '';
  const body = bodyText === '' ? '' : `\n${bodyText}`;
  const notice =
    omitted > 0
      ? `\n_(+${String(omitted)} lower-centrality modules omitted for the ~${String(budgetTokens)}-token module budget — #4254)_`
      : '';
  return `${preamble}${body}${notice}`;
}

/** Render one module row: `- name (centrality, N call-sites, files): purpose → dep, dep`. */
function formatEntryLine(e: RepoMapEntry): string {
  const shownDeps = e.dependsOn.slice(0, MAX_DEPS_PER_LINE);
  const more = e.dependsOn.length > MAX_DEPS_PER_LINE ? ', …' : '';
  const deps = shownDeps.length > 0 ? ` → ${shownDeps.join(', ')}${more}` : '';
  const calls = e.callSites > 0 ? `, ${String(e.callSites)} call-sites` : '';
  const line = `- ${e.module} (centrality ${e.centrality.toFixed(3)}${calls}, ${String(e.fileCount)} files): ${oneLine(e.purpose)}${deps}`;
  return line.slice(0, MAX_LINE_CHARS);
}

/** Greedily keep module lines while the running estimate stays within the list budget. */
function fitLinesWithinBudget(
  lines: readonly string[],
  budgetTokens: number
): { kept: string[]; omitted: number } {
  let used = 0;
  const kept: string[] = [];
  for (const line of lines) {
    const cost = estimateTokens(line) + 1; // +1 for the joining newline
    if (used + cost > budgetTokens) break;
    used += cost;
    kept.push(line);
  }
  return { kept, omitted: lines.length - kept.length };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Collapse whitespace + trim so a purpose never breaks the single-line framing. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

// ============================================================================
// Pull-shaped rank-gate
// ============================================================================

/** Categories whose tasks plausibly span multiple modules and benefit from a repo-map. */
const STRUCTURAL_CATEGORIES: ReadonlySet<TaskCategory> = new Set<TaskCategory>([
  'architecture',
  'planning',
  'code_generation',
  'code_review',
  'security_review',
]);

/** Task-text signals that a task spans cross-file / cross-module structure. */
const STRUCTURAL_TASK_PATTERN =
  /architect|refactor|depend|module|cross[- ]file|structure|integrat|migrat|coupl|call ?graph|import ?graph|repo.?map|entry ?point|wiring|data ?flow/i;

/**
 * Rank-gate (#4254 constraint 2): decide whether a task plausibly needs a
 * cross-file repo-map. True for structural categories OR task text that
 * mentions cross-file/module structure. This keeps the provider PULL-shaped —
 * it never contributes on tasks that don't plausibly need a global map.
 */
export function taskNeedsRepoMap(task: string, category: TaskCategory): boolean {
  if (STRUCTURAL_CATEGORIES.has(category)) return true;
  return STRUCTURAL_TASK_PATTERN.test(task);
}

// ============================================================================
// Provider
// ============================================================================

/** Options for {@link getRepoMapForTask}. */
export interface RepoMapProviderOptions {
  /** Free-text task description (drives the rank-gate). */
  readonly task: string;
  /** Task category (drives the rank-gate). */
  readonly category: TaskCategory;
  /** Token budget for the rendered map. Defaults to {@link DEFAULT_REPO_MAP_TOKEN_BUDGET}. */
  readonly budgetTokens?: number;
  /**
   * Injectable index source. Defaults to {@link buildLiveIndex} (a fresh index
   * built from the current source tree — #4254 constraint 6, no persisted
   * stale map). Injected in tests for a deterministic fixture graph.
   */
  readonly indexProvider?: () => CodebaseIndex;
  /**
   * Injectable per-module call-site counts (#4268). Defaults to a live,
   * bounded {@link computeCallSiteCounts} pass over the index. Injected in tests
   * for a deterministic call-site signal without touching disk.
   */
  readonly callSiteCounts?: ReadonlyMap<string, number>;
  /** Optional logger override. */
  readonly logger?: ILogger;
}

/**
 * Produce a ranked, budgeted repo-map for a task — or `undefined`. Returns
 * `undefined` (doing no work) when the `NEXUS_REPO_MAP` flag is off or the
 * task doesn't plausibly need cross-file structure, so it is safe to call
 * unconditionally from context assembly. Ranking blends import PageRank with a
 * bounded call-site signal (#4268). Fail-soft: any index-build, call-site, or
 * render error is logged at debug and yields `undefined` / import-only order,
 * never a throw.
 */
export function getRepoMapForTask(options: RepoMapProviderOptions): string | undefined {
  if (process.env[REPO_MAP_FLAG] !== '1') return undefined;
  if (!taskNeedsRepoMap(options.task, options.category)) return undefined;
  const log = options.logger ?? createLogger({ component: 'RepoMap' });
  try {
    const index = (options.indexProvider ?? buildLiveIndex)();
    const callSiteCounts = options.callSiteCounts ?? liveCallSiteCounts(index, log);
    const map = buildRepoMap(index, {
      budgetTokens: options.budgetTokens ?? DEFAULT_REPO_MAP_TOKEN_BUDGET,
      callSiteCounts,
    });
    return map === '' ? undefined : map;
  } catch (error: unknown) {
    log.debug('repo-map build failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * Compute the bounded call-site signal for a live index: take the TOP-N
 * import-ranked modules ({@link CALLSITE_TOP_N_MODULES}) and count structural
 * call-sites of their exported symbols across the tree (#4268). Best-effort —
 * {@link computeCallSiteCounts} never throws; a failure yields an empty map and
 * ranking degrades to import-only order.
 */
function liveCallSiteCounts(index: CodebaseIndex, log: ILogger): ReadonlyMap<string, number> {
  const topModules = rankRepoMapEntries(index)
    .slice(0, CALLSITE_TOP_N_MODULES)
    .map((e) => e.module);
  return computeCallSiteCounts(index, topModules, { logger: log });
}

/**
 * Build a FRESH index from the current source tree (#4254 constraint 6 — no
 * persisted/stale map). `extractDescriptions: false` keeps it cheap: the
 * repo-map needs only the module graph + purposes, not per-file JSDoc.
 */
function buildLiveIndex(): CodebaseIndex {
  const extraction = extractProject({ extractDescriptions: false });
  return buildIndex(extraction.files);
}
