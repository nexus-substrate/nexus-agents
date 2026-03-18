/**
 * Research paper quality scoring and evidence tier assessment.
 *
 * Computes a composite quality score (0-10) from verifiable signals:
 * citation count, venue tier, code availability, recency, and rigor tags.
 *
 * Evidence tiers (high/medium/low) determine how much weight to give
 * techniques extracted from a paper when making implementation decisions.
 *
 * @module research/research-quality
 */

import type { ResearchPaper } from './research-schemas.js';

/** Top-tier venues (score 3). */
const TIER_3_VENUES = new Set([
  'neurips',
  'nips',
  'icml',
  'iclr',
  'aaai',
  'acl',
  'emnlp',
  'cvpr',
  'iccv',
  'eccv',
  'sigir',
  'kdd',
  'www',
  'icse',
  'fse',
]);

/** Good venues (score 2). */
const TIER_2_VENUES = new Set([
  'naacl',
  'coling',
  'eacl',
  'ijcai',
  'ecai',
  'aistats',
  'uai',
  'colt',
  'interspeech',
  'ase',
  'issta',
]);

/**
 * Classify venue into tier (0-3).
 */
export function classifyVenue(venue: string | null | undefined): number {
  if (venue === null || venue === undefined || venue.length === 0) return 0;
  const normalized = venue.toLowerCase().replace(/[^a-z]/g, '');
  if (TIER_3_VENUES.has(normalized)) return 3;
  if (TIER_2_VENUES.has(normalized)) return 2;
  // Any non-empty venue that's not arXiv is at least tier 1 (workshop/journal)
  if (!normalized.includes('arxiv')) return 1;
  return 0;
}

/**
 * Compute recency boost (0-2 points).
 * Papers < 6 months = 2, < 1 year = 1, older = 0.
 */
export function recencyBoost(publicationDate: string | undefined): number {
  if (publicationDate === undefined) return 0;
  const now = new Date();
  const pubDate = new Date(publicationDate);
  const monthsAgo = (now.getTime() - pubDate.getTime()) / (30 * 24 * 60 * 60 * 1000);
  if (monthsAgo < 6) return 2;
  if (monthsAgo < 12) return 1;
  return 0;
}

/**
 * Compute citation score (0-3 points).
 * Logarithmic: 0=no citations, 1=1-9, 2=10-99, 3=100+
 */
export function citationScore(count: number | undefined): number {
  if (count === undefined || count === 0) return 0;
  if (count < 10) return 1;
  if (count < 100) return 2;
  return 3;
}

/**
 * Compute composite quality score (0-10) for a paper.
 *
 * Breakdown:
 * - Citation score: 0-3 (logarithmic)
 * - Venue tier: 0-3
 * - Has code: 0 or 2
 * - Recency boost: 0-2
 *
 * Total max: 10
 */
export function computeQualityScore(paper: ResearchPaper): number {
  const citations = citationScore(paper.citation_count);
  const venue = paper.venue_tier ?? classifyVenue(paper.venue);
  const code = paper.has_code === true ? 2 : 0;
  const recency = recencyBoost(paper.publication_date);

  return Math.min(10, citations + venue + code + recency);
}

/**
 * Determine evidence tier based on quality score and rigor tags.
 *
 * - high: peer-reviewed + has-code + has-baselines (or quality >= 7)
 * - medium: has-code OR quality >= 4
 * - low: everything else
 */
export function computeEvidenceTier(paper: ResearchPaper): 'high' | 'medium' | 'low' {
  const score = paper.quality_score ?? computeQualityScore(paper);
  const tags = new Set(paper.rigor_tags);

  if (tags.has('peer-reviewed') && tags.has('has-code') && tags.has('has-baselines')) {
    return 'high';
  }
  if (score >= 7) return 'high';
  if (tags.has('has-code') || score >= 4) return 'medium';
  return 'low';
}
