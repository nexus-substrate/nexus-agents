/**
 * Research Quality Scoring
 *
 * Scores discovered research items by relevance, impact, recency,
 * and reproducibility to aid prioritization.
 *
 * @module cli/research-helpers-scoring
 * (Source: Research System Enhancement - Phase 2E)
 */

import type { DiscoveredSource } from './research-helpers-sources.js';

// =============================================================================
// TYPES
// =============================================================================

/** Quality score for a discovered research item. */
export interface QualityScore {
  /** Topic keyword match ratio (0-1). */
  readonly relevance: number;
  /** Normalized impact metric (0-1) - citation count or star count. */
  readonly impact: number;
  /** Recency decay (0-1) - newer items score higher. */
  readonly recency: number;
  /**
   * Whether {@link QualityScore.recency} is a measurement (#4841).
   *
   * `false` means the item carried no usable publication date, so `recency`
   * is the neutral 0.5 and NOT a decay. It was previously scored from
   * `discoveredAt` — when WE found the source, which every producer stamps as
   * today — so the 730-day decay was unreachable and every composite carried
   * a flat +0.2.
   */
  readonly recencyMeasured: boolean;
  /** Code availability (0-1) - items with repos score higher. */
  readonly reproducibility: number;
  /** Weighted composite score (0-1). */
  readonly composite: number;
}

/** Weights for composite score calculation. */
const WEIGHTS = {
  relevance: 0.35,
  impact: 0.25,
  recency: 0.2,
  reproducibility: 0.2,
} as const;

// =============================================================================
// SCORING FUNCTIONS
// =============================================================================

/** Score topic relevance from a title against a topic string. */
function scoreRelevance(title: string, topic: string): number {
  const titleLower = title.toLowerCase();
  const topicWords = topic
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (topicWords.length === 0) return 0.5;
  const matched = topicWords.filter((w) => titleLower.includes(w)).length;
  return matched / topicWords.length;
}

/** Convert relevance label to numeric score. */
function relevanceLabelToScore(relevance: string): number {
  switch (relevance) {
    case 'high':
      return 0.9;
    case 'medium':
      return 0.5;
    case 'low':
      return 0.2;
    default:
      return 0.5;
  }
}

/** Neutral recency for an item whose publication date is unknown. */
const NEUTRAL_RECENCY = 0.5;
/**
 * Age at which recency halves. Chosen to match the point the previous linear
 * curve passed through 0.5, so the 0.6 review gate and the 0.8 P1 boundary in
 * `executeReview` keep the calibration they were tuned against (#4882).
 */
const RECENCY_HALF_LIFE_DAYS = 365;

/**
 * Score recency from the item's PUBLICATION date, halving each year.
 *
 * Exponential rather than linear because a linear decay has to bottom out
 * somewhere, and the old `max(0, 1 - days/730)` bottomed out at two years:
 * every source older than that scored exactly 0.0, so a 2024 paper and a 2015
 * paper were indistinguishable to a ranking that sorts on composite alone
 * (#4882). Halving approaches zero without ever reaching it, so age keeps
 * separating sources however old they get.
 *
 * `undefined` or unparseable yields neutral with `measured: false`. Not 1.0:
 * an unknown age is not evidence of freshness, and reporting it as fresh is
 * what made this term a constant (#4841).
 */
function scoreRecency(publishedAt: string | undefined): {
  value: number;
  measured: boolean;
} {
  if (publishedAt === undefined || publishedAt === '') {
    return { value: NEUTRAL_RECENCY, measured: false };
  }
  const published = new Date(publishedAt);
  if (isNaN(published.getTime())) return { value: NEUTRAL_RECENCY, measured: false };
  const daysSince = (Date.now() - published.getTime()) / (1000 * 60 * 60 * 24);
  // Clamped at the top, not just the bottom: a future publication date is a
  // real input — Semantic Scholar stamps year-only dates as `${year}-01-01` —
  // and it used to score above 1.0, outscoring anything actually published.
  return { value: Math.min(1, 0.5 ** (daysSince / RECENCY_HALF_LIFE_DAYS)), measured: true };
}

/** Score reproducibility based on source type. */
function scoreReproducibility(source: string): number {
  // Sources with code get higher scores
  switch (source) {
    case 'github':
      return 1.0;
    case 'papers_with_code':
      return 0.8;
    default:
      return 0.3;
  }
}

/**
 * Score a discovered research item for quality.
 *
 * @param item - The discovered source to score
 * @param topic - The search topic for relevance scoring
 * @returns Quality score breakdown and composite
 */
/**
 * Weighted composite, with an UNMEASURED recency excluded rather than defaulted.
 *
 * `NEUTRAL_RECENCY` is 0.5, which was mid-range under the old linear curve but
 * is the two-year point under exponential decay — so scoring an undated source
 * at 0.5 made it beat a real three-year-old source by 0.075 composite, above
 * the resolution of the 0.6 review gate. Absence of a publication date is not
 * evidence of freshness, and it must not be evidence of staleness either
 * (#4956).
 *
 * Excluding the term and renormalising the rest is the same treatment the
 * unmeasured-token and unscored-step aggregates get: judge on what was
 * measured, over the weight that was measured.
 */
function compositeOf(parts: {
  relevance: number;
  impact: number;
  recency: { value: number; measured: boolean };
  reproducibility: number;
}): number {
  const measuredWeight =
    WEIGHTS.relevance +
    WEIGHTS.impact +
    WEIGHTS.reproducibility +
    (parts.recency.measured ? WEIGHTS.recency : 0);
  const weighted =
    WEIGHTS.relevance * parts.relevance +
    WEIGHTS.impact * parts.impact +
    WEIGHTS.reproducibility * parts.reproducibility +
    (parts.recency.measured ? WEIGHTS.recency * parts.recency.value : 0);
  return weighted / measuredWeight;
}

export function scoreDiscoveredItem(item: DiscoveredSource, topic: string): QualityScore {
  const relevance =
    topic !== '' ? scoreRelevance(item.title, topic) : relevanceLabelToScore(item.relevance);
  const impact = relevanceLabelToScore(item.relevance);
  const recency = scoreRecency(item.publishedAt);
  const reproducibility = scoreReproducibility(item.source);

  const composite = compositeOf({ relevance, impact, recency, reproducibility });

  return {
    relevance: Math.round(relevance * 100) / 100,
    impact: Math.round(impact * 100) / 100,
    recency: Math.round(recency.value * 100) / 100,
    recencyMeasured: recency.measured,
    reproducibility: Math.round(reproducibility * 100) / 100,
    composite: Math.round(composite * 100) / 100,
  };
}

/**
 * Score and sort a list of discovered items by quality.
 *
 * @param items - Items to score
 * @param topic - Topic for relevance scoring
 * @returns Items sorted by composite score (descending) with scores
 */
export function rankDiscoveredItems(
  items: readonly DiscoveredSource[],
  topic: string
): Array<{ item: DiscoveredSource; score: QualityScore }> {
  return items
    .map((item) => ({ item, score: scoreDiscoveredItem(item, topic) }))
    .sort((a, b) => b.score.composite - a.score.composite);
}
