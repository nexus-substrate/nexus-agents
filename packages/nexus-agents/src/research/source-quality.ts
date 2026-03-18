/**
 * Source quality scoring for non-paper research sources (repos, tools, blogs).
 *
 * Computes a composite quality score (0-10) from verifiable signals
 * already stored in sources.yaml quality_signals fields.
 * No external API calls — scoring is purely local.
 *
 * @module research/source-quality
 * @see Issue #1577
 */

import type { ResearchSource } from '../indexer/research-index/research-index-base-types.js';

/**
 * Star count score (0-3, logarithmic, matching paper citation scale).
 * 0=none/unknown, 1=1-99, 2=100-999, 3=1000+
 */
export function starScore(stars: number | undefined): number {
  if (stars === undefined || stars === 0) return 0;
  if (stars < 100) return 1;
  if (stars < 1000) return 2;
  return 3;
}

/**
 * Review recency score (0-2).
 * 2=reviewed within 6 months, 1=within 1 year, 0=older or unknown.
 */
export function reviewRecencyScore(reviewedDate: string | undefined): number {
  if (reviewedDate === undefined) return 0;
  const now = new Date();
  const reviewed = new Date(reviewedDate);
  const monthsAgo = (now.getTime() - reviewed.getTime()) / (30 * 24 * 60 * 60 * 1000);
  if (monthsAgo < 6) return 2;
  if (monthsAgo < 12) return 1;
  return 0;
}

/**
 * Compute composite quality score (0-10) for a non-paper source.
 *
 * Breakdown (raw max = 8):
 * - Star count: 0-3 (logarithmic, same scale as paper citations)
 * - has_tests: 0 or 1
 * - has_docs: 0 or 1
 * - Review recency: 0-2
 * - has_paper: 0 or 1 (associated academic paper adds credibility)
 *
 * Normalized: raw * 10/8, capped at 10.
 */
export function computeSourceQualityScore(source: ResearchSource): number {
  const signals = source.quality_signals;
  if (signals === undefined) {
    // No quality signals available — return baseline score
    return source.type === 'open_source_repo' ? 0 : 3;
  }

  const stars = starScore(signals.stars_at_review);
  const tests = signals.has_tests === true ? 1 : 0;
  const docs = signals.has_docs === true ? 1 : 0;
  const recency = reviewRecencyScore(source.reviewed_date);
  const paper = signals.has_paper === true ? 1 : 0;

  const raw = stars + tests + docs + recency + paper;
  return Math.min(10, Math.round((raw * 10) / 8));
}

/**
 * Determine evidence tier for a source based on quality score and signals.
 *
 * - high: quality >= 7 AND (has_tests OR has_paper)
 * - medium: quality >= 4 OR has_tests
 * - low: everything else
 */
export function computeSourceEvidenceTier(source: ResearchSource): 'high' | 'medium' | 'low' {
  const score = source.quality_score ?? computeSourceQualityScore(source);
  const signals = source.quality_signals;

  const hasTests = signals?.has_tests === true;
  const hasPaper = signals?.has_paper === true;

  if (score >= 7 && (hasTests || hasPaper)) return 'high';
  if (score >= 4 || hasTests) return 'medium';
  return 'low';
}
