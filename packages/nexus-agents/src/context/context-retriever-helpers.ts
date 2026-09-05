/**
 * Unified memory cross-ranker (#3236).
 *
 * `getContextForTask` fans out across ~6 memory backends and returns parallel,
 * independently-ranked lists on incomparable scales — a belief's `confidence`
 * enum, an adaptive entry's priority score, an experience pattern's success
 * rate. A consumer (a voter, a planning step) that wants "the single most
 * relevant thing we know" has no way to compare across those lists.
 *
 * This module lexically cross-ranks every per-backend item into ONE comparable,
 * sorted `RankedMemoryItem[]`. It reuses the keyword-coverage relevance pattern
 * from `research-discover.computeRelevanceScore` (a deliberate, cheap lexical
 * score — no embeddings) and combines it with temporal decay and a per-source
 * confidence weight. The aggregate `outcomes` summary is excluded: it is a
 * rollup, not a per-item memory, so it has nothing to cross-rank against.
 *
 * Pure and synchronous: no I/O, no throws. Missing/invalid timestamps degrade
 * to neutral recency rather than failing (fail-soft, #3236 vote condition 5).
 *
 * @module context/context-retriever-helpers
 * (Source: #3236)
 */

import type { UnifiedContext } from './context-retriever.js';
import type { Belief } from './belief-core-types.js';
import type { AgenticMemoryEntry } from './agentic-memory-types.js';
import type { ScoredMemoryEntry } from './adaptive-memory-types.js';
import type { ExperienceEntry } from './mobimem-types.js';
import type { DistilledRule } from '../learning/strategy-distiller-types.js';
import type { TechniqueStatusSummary } from '../cli/research-types.js';

/** The discriminated set of cross-rankable backends (the aggregate `outcomes` is excluded). */
export type RankedMemorySource =
  'belief' | 'agentic' | 'adaptive' | 'experience' | 'strategy' | 'research';

/** A backend item lifted onto a single comparable scale. */
export interface RankedMemoryItem {
  /** Which backend the item came from. */
  readonly source: RankedMemorySource;
  /** Combined cross-source score in [0, 1]; higher is more relevant. */
  readonly relevanceScore: number;
  /** The original backend item, untouched, so consumers can still render its native shape. */
  readonly item:
    | Belief
    | AgenticMemoryEntry
    | ScoredMemoryEntry
    | ExperienceEntry
    | DistilledRule
    | TechniqueStatusSummary
    | string;
  /** Normalized free-text used for lexical scoring + rendering (already a single line). */
  readonly text: string;
  /** Age of the item in milliseconds at ranking time (0 when no timestamp). */
  readonly ageMs: number;
  /** Per-item confidence in [0, 1] (belief enum, rule confidence, success rate, …). */
  readonly sourceConfidence: number;
}

/** Options for {@link rankMemories}. */
export interface RankMemoriesOptions {
  /** Injectable clock for deterministic recency tests. Defaults to `Date.now()`. */
  readonly now?: number;
}

// ---------------------------------------------------------------------------
// Scoring weights — PROVISIONAL (#3236).
//
// These three weights sum to 1.0 and combine the lexical relevance, temporal
// decay, and per-source confidence into the final cross-source score. They are
// a first cut chosen to make text relevance dominate (the consumer is asking
// "what's relevant to THIS task") while letting recency and source confidence
// break ties and rescue strong-but-older signal. Tune against the ranked-render
// flag's outcome telemetry before promoting any of these.
// See https://github.com/nexus-substrate/nexus-agents/issues/3236
// ---------------------------------------------------------------------------
/** Weight on lexical text relevance. PROVISIONAL — see #3236. */
const W_TEXT = 0.6;
/** Weight on temporal recency (exponential decay). PROVISIONAL — see #3236. */
const W_RECENCY = 0.25;
/** Weight on per-source confidence. PROVISIONAL — see #3236. */
const W_SOURCE = 0.15;

/**
 * Per-source baseline trust applied when an item carries no intrinsic
 * confidence (e.g. an agentic note). PROVISIONAL — see #3236. Beliefs and
 * distilled strategies are the most curated; raw agentic notes the least.
 */
const SOURCE_WEIGHT: Readonly<Record<RankedMemorySource, number>> = {
  belief: 0.9,
  strategy: 0.85,
  research: 0.8,
  experience: 0.75,
  adaptive: 0.65,
  agentic: 0.55,
};

/** Recency half-life: signal older than this contributes ~half its recency score. PROVISIONAL — see #3236. */
const RECENCY_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Distinct keywords ≥ this many chars are discriminating enough to score against. */
const MIN_KEYWORD_LEN = 3;

/** Rough chars-per-token used to budget the rendered prefix (matches token-counter ~4). */
const CHARS_PER_TOKEN = 4;

/**
 * Cross-rank every per-backend list in `ctx` into one comparable, sorted list.
 *
 * Score = W_TEXT·textRelevance + W_RECENCY·decay(ageMs) + W_SOURCE·sourceWeight,
 * where `sourceWeight` blends the per-item confidence with the source baseline.
 * Higher score first; ties fall back to source baseline then text length so the
 * order is deterministic. The aggregate `outcomes` summary is intentionally
 * never included.
 */
export function rankMemories(
  ctx: UnifiedContext,
  task: string,
  options: RankMemoriesOptions = {}
): readonly RankedMemoryItem[] {
  const now = options.now ?? Date.now();
  const keywords = extractKeywords(task);

  const normalized: RankedMemoryItem[] = [
    ...ctx.beliefs.map((b) => normalizeBelief(b, now)),
    ...ctx.similarMemories.map((m) => normalizeAgentic(m, now)),
    ...ctx.recentLearnings.map((s) => normalizeAdaptive(s, now)),
    ...ctx.experiencePatterns.map((e) => normalizeExperience(e, now)),
    ...ctx.priorStrategies.map((r) => normalizeStrategy(r, now)),
    ...ctx.researchInsights.map((t) => normalizeResearch(t, now)),
  ];

  const scored = normalized.map((n) => ({
    ...n,
    relevanceScore: combinedScore(n, keywords),
  }));

  return scored.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    const sw = SOURCE_WEIGHT[b.source] - SOURCE_WEIGHT[a.source];
    if (sw !== 0) return sw;
    return b.text.length - a.text.length;
  });
}

/**
 * Take items off the front of an already-ranked list until adding the next one
 * would exceed `maxTokens` (estimated). Order-preserving; never throws. A
 * zero/negative budget yields `[]`.
 */
export function topRankedWithinBudget(
  items: readonly RankedMemoryItem[],
  maxTokens: number
): readonly RankedMemoryItem[] {
  if (maxTokens <= 0) return [];
  const kept: RankedMemoryItem[] = [];
  let used = 0;
  for (const item of items) {
    const cost = estimateTokens(item.text);
    if (used + cost > maxTokens) break;
    used += cost;
    kept.push(item);
  }
  return kept;
}

/** Disclosure returned beside each fixed legacy context slice. */
interface ContextSlice {
  readonly lines: readonly string[];
  readonly included: number;
  readonly dropped: number;
  readonly droppedTokens: number;
}

/**
 * Select five rendered items and disclose how much ranked context was omitted.
 *
 * Selection intentionally remains a fixed `slice(0, 5)` until #5497's
 * token-budget half is triggered by default-on context injection (#2795).
 * Every item is estimated once; dropped estimates are summed from that record.
 */
export function sliceContextLines(
  lines: readonly string[],
  counter: { readonly estimate: (text: string) => number }
): ContextSlice {
  const estimated = lines.map((line) => ({ line, tokens: counter.estimate(line) }));
  const selected = estimated.slice(0, 5);
  const omitted = estimated.slice(5);
  const droppedTokens =
    omitted.length === 0 ? 0 : omitted.reduce((sum, item) => sum + item.tokens, 0);
  return {
    lines: selected.map(({ line }) => line),
    included: selected.length,
    dropped: omitted.length,
    droppedTokens,
  };
}

/** Format a section heading with its fixed-slice disclosure. */
export function disclosedHeading(label: string, slice: ContextSlice): string {
  return `${label} (${String(slice.included)} included, ${String(slice.dropped)} dropped, ${String(slice.droppedTokens)} dropped tokens)`;
}

function renderDisclosedSection(
  heading: string,
  lines: readonly string[],
  counter: { readonly estimate: (text: string) => number }
): string {
  const slice = sliceContextLines(lines, counter);
  return `${disclosedHeading(heading, slice)}\n${slice.lines.join('\n')}`;
}

/** Render adaptive-memory and distilled-strategy sections for the legacy prompt path. */
export function renderLegacyLearningSections(
  ctx: UnifiedContext,
  counter: { readonly estimate: (text: string) => number },
  sanitize: (value: string) => string
): readonly string[] {
  const sections: string[] = [];
  if (ctx.recentLearnings.length > 0) {
    const lines = ctx.recentLearnings.map(({ entry }) => {
      const value = typeof entry.value === 'string' ? entry.value : entry.key;
      return `- ${sanitize(value)}`;
    });
    sections.push(renderDisclosedSection('### Recent learnings', lines, counter));
  }
  if (ctx.priorStrategies.length > 0) {
    const lines = ctx.priorStrategies.map(
      (rule) => `- ${sanitize(`${rule.category} ${rule.patternType} ${rule.action} ${rule.cli}`)}`
    );
    sections.push(renderDisclosedSection('### Prior strategies', lines, counter));
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Scoring internals
// ---------------------------------------------------------------------------

function combinedScore(item: RankedMemoryItem, keywords: readonly string[]): number {
  const text = textRelevance(item.text, keywords);
  const recency = recencyDecay(item.ageMs);
  const source = 0.5 * item.sourceConfidence + 0.5 * SOURCE_WEIGHT[item.source];
  const score = W_TEXT * text + W_RECENCY * recency + W_SOURCE * source;
  return Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
}

/**
 * Keyword-coverage relevance in [0, 1], reusing the
 * `research-discover.computeRelevanceScore` pattern: fraction of distinct task
 * keywords present in the item text. No keywords → neutral 0 (recency + source
 * still rank the item).
 */
function textRelevance(text: string, keywords: readonly string[]): number {
  if (keywords.length === 0) return 0;
  const lower = text.toLowerCase();
  let matched = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) matched++;
  }
  return matched / keywords.length;
}

/** Exponential decay on age; fail-soft to neutral 0.5 for non-finite ages. */
function recencyDecay(ageMs: number): number {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0.5;
  return Math.pow(2, -ageMs / RECENCY_HALF_LIFE_MS);
}

function extractKeywords(task: string): readonly string[] {
  return [
    ...new Set(
      task
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= MIN_KEYWORD_LEN)
    ),
  ];
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Result of {@link clampToTokenBudget}. */
export interface TokenBudgetClampResult {
  /** The (possibly truncated) text, always a prefix of the input. */
  readonly text: string;
  /** Whether truncation occurred. */
  readonly clipped: boolean;
  /** Chars removed from the input (0 when not clipped). */
  readonly omittedChars: number;
}

/**
 * Clamp `text` to an estimated `maxTokens` budget using the same char/4
 * heuristic as {@link topRankedWithinBudget} (#4253 — per-call context budget
 * guard). Order-preserving prefix cut; never throws, never grows the input.
 */
export function clampToTokenBudget(text: string, maxTokens: number): TokenBudgetClampResult {
  if (maxTokens <= 0) {
    return { text: '', clipped: text.length > 0, omittedChars: text.length };
  }
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) {
    return { text, clipped: false, omittedChars: 0 };
  }
  const kept = text.slice(0, maxChars);
  return { text: kept, clipped: true, omittedChars: text.length - kept.length };
}

/** Assemble, clamp once, and partition the emitted text by its source. */
export function assembleClampedContext(
  memoryBlock: string,
  repoMap: string,
  budgetTokens: number,
  clipNoticeReserveTokens: number
): { readonly text: string; readonly memory: string; readonly repoMap: string } {
  const rendered =
    repoMap === '' ? memoryBlock : memoryBlock === '' ? repoMap : `${memoryBlock}\n\n${repoMap}`;
  if (rendered === '') return { text: '', memory: '', repoMap: '' };
  const contentBudget = Math.max(0, budgetTokens - clipNoticeReserveTokens);
  const { text: retained, clipped, omittedChars } = clampToTokenBudget(rendered, contentBudget);
  const notice = clipped
    ? `\n\n_(context clipped to fit the ~${String(budgetTokens)}-token budget; ~${String(omittedChars)} chars omitted — #4253)_`
    : '';
  const mapStart = memoryBlock === '' ? 0 : memoryBlock.length;
  const retainedMap = retained.slice(mapStart);
  const mapOwnsNotice = repoMap !== '' && (memoryBlock === '' || retainedMap !== '');
  const memory =
    retained.slice(0, Math.min(memoryBlock.length, retained.length)) +
    (mapOwnsNotice ? '' : notice);
  const emittedMap = retainedMap + (mapOwnsNotice ? notice : '');
  return { text: `${retained}${notice}`, memory, repoMap: emittedMap };
}

/** Age in ms from a possibly-invalid Date; non-finite timestamps → neutral 0. */
function ageFrom(date: Date | undefined, now: number): number {
  const t = date?.getTime();
  if (t === undefined || !Number.isFinite(t)) return 0;
  return Math.max(0, now - t);
}

/** Collapse whitespace + cap length so every normalized text is a single bounded line. */
const MAX_TEXT_LEN = 200;
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LEN);
}

// ---------------------------------------------------------------------------
// Per-source normalization → {text, ageMs, sourceConfidence}
// ---------------------------------------------------------------------------

const BELIEF_CONFIDENCE: Readonly<Record<string, number>> = {
  high: 0.9,
  medium: 0.6,
  low: 0.35,
  speculative: 0.15,
};

function normalizeBelief(b: Belief, now: number): RankedMemoryItem {
  return {
    source: 'belief',
    relevanceScore: 0,
    item: b,
    text: oneLine(`${b.subject} ${b.predicate} ${b.object}`),
    ageMs: ageFrom(b.updatedAt, now),
    sourceConfidence: BELIEF_CONFIDENCE[b.confidence] ?? 0.5,
  };
}

function normalizeAgentic(m: AgenticMemoryEntry, now: number): RankedMemoryItem {
  return {
    source: 'agentic',
    relevanceScore: 0,
    item: m,
    text: oneLine(m.attributes.contextDescription),
    ageMs: ageFrom(m.createdAt, now),
    sourceConfidence: 0.5,
  };
}

function normalizeAdaptive(s: ScoredMemoryEntry, now: number): RankedMemoryItem {
  const value = typeof s.entry.value === 'string' ? s.entry.value : s.entry.key;
  return {
    source: 'adaptive',
    relevanceScore: 0,
    item: s,
    text: oneLine(value),
    ageMs: ageFrom(s.entry.createdAt, now),
    sourceConfidence: clamp01(s.priority.components.relevance),
  };
}

function normalizeExperience(e: ExperienceEntry, now: number): RankedMemoryItem {
  return {
    source: 'experience',
    relevanceScore: 0,
    item: e,
    text: oneLine(e.taskType),
    ageMs: ageFrom(e.lastUsedAt, now),
    sourceConfidence: clamp01(e.successRate),
  };
}

function normalizeStrategy(r: DistilledRule, now: number): RankedMemoryItem {
  return {
    source: 'strategy',
    relevanceScore: 0,
    item: r,
    text: oneLine(`${r.category} ${r.patternType} ${r.action} ${r.cli}`),
    ageMs: ageFrom(new Date(r.updatedAt), now),
    sourceConfidence: clamp01(r.confidence),
  };
}

function normalizeResearch(t: TechniqueStatusSummary, now: number): RankedMemoryItem {
  return {
    source: 'research',
    relevanceScore: 0,
    item: t,
    // Research summaries carry no timestamp; treat as neutral-recency (ageMs 0).
    text: oneLine(`${t.name} ${t.topic} ${t.status}`),
    ageMs: ageFrom(undefined, now),
    sourceConfidence: 0.6,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}
