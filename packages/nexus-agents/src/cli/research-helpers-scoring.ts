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

/** Score recency based on discovered date. Decays over 2 years. */
function scoreRecency(discoveredAt: string): number {
  const discoveredDate = new Date(discoveredAt);
  if (isNaN(discoveredDate.getTime())) return 0.5;
  const now = new Date();
  const daysSince = (now.getTime() - discoveredDate.getTime()) / (1000 * 60 * 60 * 24);
  // Linear decay over 730 days (2 years)
  return Math.max(0, 1 - daysSince / 730);
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
export function scoreDiscoveredItem(item: DiscoveredSource, topic: string): QualityScore {
  const relevance =
    topic !== '' ? scoreRelevance(item.title, topic) : relevanceLabelToScore(item.relevance);
  const impact = relevanceLabelToScore(item.relevance);
  const recency = scoreRecency(item.discoveredAt);
  const reproducibility = scoreReproducibility(item.source);

  const composite =
    WEIGHTS.relevance * relevance +
    WEIGHTS.impact * impact +
    WEIGHTS.recency * recency +
    WEIGHTS.reproducibility * reproducibility;

  return {
    relevance: Math.round(relevance * 100) / 100,
    impact: Math.round(impact * 100) / 100,
    recency: Math.round(recency * 100) / 100,
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
