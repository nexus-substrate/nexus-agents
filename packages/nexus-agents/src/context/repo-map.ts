/**
 * Repo-map context provider — pull-shaped, usage-aware, measured (#4254,
 * Phase 3 of epic #4251).
 *
 * Wires the EXISTING module-import graph (`indexer/types.ts`
 * `ModuleEntry.dependsOn`, built by `analyzer.ts buildIndex`, until now
 * emitted only as docs/mermaid) into context assembly as a **ranked,
 * token-budgeted repo-map**. Modules are ordered by PageRank centrality over
 * the import graph, then budget-clipped to a small token target.
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
 * 3. **PageRank ranking** over the import graph orders entries; the block is
 *    then clipped to a token budget (reusing the #4253 char/4 mechanism —
 *    {@link clampToTokenBudget}).
 * 4. **Usage-aware caveat.** The graph is import-edges + declaration-names only
 *    (NO call-site edges yet — that is #4249-A). Every rendered map carries an
 *    explicit {@link REPO_MAP_CAVEAT} so agents do not over-trust it as a call graph.
 * 5. **Measured.** The emitted token count is recorded in the token ledger
 *    tagged `contextSource: 'repo-map'` by the `context-retriever.ts` wiring.
 * 6. **Fresh, not persisted.** The default index provider builds from the
 *    CURRENT source tree each call ({@link buildLiveIndex}) — no persisted
 *    stale-map path. (A scoped index cache is a tracked follow-up; the
 *    provider is opt-in + rank-gated so the build cost is only paid when asked.)
 *
 * Pure builder + fail-soft provider: a build failure yields `undefined`, never
 * a throw into the calling context assembly.
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

// ============================================================================
// Public constants
// ============================================================================

/** Env flag gating the repo-map provider (#4254). `1` enables; default off. */
export const REPO_MAP_FLAG = 'NEXUS_REPO_MAP';

/** Default token budget for the rendered repo-map block. Small — it is a map, not a dump. */
export const DEFAULT_REPO_MAP_TOKEN_BUDGET = 400;

/**
 * Mandatory usage caveat (#4254 constraint 4). The graph is import-edges +
 * declaration-names only — there are NO call-site/usage edges yet (that is
 * #4249-A). This caveat is rendered at the TOP of every map so a prefix-cut
 * budget clamp can never remove it.
 */
export const REPO_MAP_CAVEAT =
  'Import-graph only: edges are module import dependencies + declaration names, ' +
  'NOT call-site/usage data. Centrality reflects import structure, not runtime ' +
  'call frequency — do not treat this as a call graph (call-site edges tracked in #4249-A).';

/** Section header for the rendered repo-map block. */
const REPO_MAP_HEADER = '## Repo Map (module import graph — PageRank-ranked)';

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

/** One repo-map row: a module with its centrality and import edges. */
export interface RepoMapEntry {
  /** Module name. */
  readonly module: string;
  /** PageRank centrality in [0, 1]. */
  readonly centrality: number;
  /** Module purpose (from the index). */
  readonly purpose: string;
  /** Modules this module imports (out-edges). */
  readonly dependsOn: readonly string[];
  /** File count, for a rough size signal. */
  readonly fileCount: number;
}

/**
 * Rank every module in the index by PageRank centrality (descending; ties
 * broken by name for a deterministic order). Pure.
 */
export function rankRepoMapEntries(index: CodebaseIndex): readonly RepoMapEntry[] {
  const ranks = computeModulePageRank(index.modules);
  const entries: RepoMapEntry[] = Object.entries(index.modules).map(([name, mod]) => ({
    module: name,
    centrality: ranks.get(name) ?? 0,
    purpose: mod.purpose,
    dependsOn: mod.dependsOn,
    fileCount: mod.stats.fileCount,
  }));
  return entries.sort((a, b) =>
    b.centrality !== a.centrality ? b.centrality - a.centrality : a.module.localeCompare(b.module)
  );
}

// ============================================================================
// Rendering
// ============================================================================

/** Options for {@link buildRepoMap}. */
export interface BuildRepoMapOptions {
  /** Token budget for the rendered block. Defaults to {@link DEFAULT_REPO_MAP_TOKEN_BUDGET}. */
  readonly budgetTokens?: number;
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
  const entries = rankRepoMapEntries(index);
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

/** Render one module row: `- name (centrality, files): purpose → dep, dep`. */
function formatEntryLine(e: RepoMapEntry): string {
  const shownDeps = e.dependsOn.slice(0, MAX_DEPS_PER_LINE);
  const more = e.dependsOn.length > MAX_DEPS_PER_LINE ? ', …' : '';
  const deps = shownDeps.length > 0 ? ` → ${shownDeps.join(', ')}${more}` : '';
  const line = `- ${e.module} (centrality ${e.centrality.toFixed(3)}, ${String(e.fileCount)} files): ${oneLine(e.purpose)}${deps}`;
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
  /** Optional logger override. */
  readonly logger?: ILogger;
}

/**
 * Produce a ranked, budgeted repo-map for a task — or `undefined`. Returns
 * `undefined` (doing no work) when the `NEXUS_REPO_MAP` flag is off or the
 * task doesn't plausibly need cross-file structure, so it is safe to call
 * unconditionally from context assembly. Fail-soft: any index-build or render
 * error is logged at debug and yields `undefined`, never a throw.
 */
export function getRepoMapForTask(options: RepoMapProviderOptions): string | undefined {
  if (process.env[REPO_MAP_FLAG] !== '1') return undefined;
  if (!taskNeedsRepoMap(options.task, options.category)) return undefined;
  const log = options.logger ?? createLogger({ component: 'RepoMap' });
  try {
    const index = (options.indexProvider ?? buildLiveIndex)();
    const map = buildRepoMap(index, {
      budgetTokens: options.budgetTokens ?? DEFAULT_REPO_MAP_TOKEN_BUDGET,
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
 * Build a FRESH index from the current source tree (#4254 constraint 6 — no
 * persisted/stale map). `extractDescriptions: false` keeps it cheap: the
 * repo-map needs only the module graph + purposes, not per-file JSDoc.
 */
function buildLiveIndex(): CodebaseIndex {
  const extraction = extractProject({ extractDescriptions: false });
  return buildIndex(extraction.files);
}
