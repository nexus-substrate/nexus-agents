/**
 * nexus-agents/utils - Similarity Utilities
 *
 * Shared utility functions for text similarity calculations.
 * Consolidates duplicate similarity code from multiple modules per ADR-0013.
 *
 * Used by:
 * - context/adaptive-memory-helpers.ts (relevance scoring)
 * - agents/orchestration/policy-feature-extraction.ts (stuck detection)
 *
 * @module utils/similarity-utils
 * @see docs/adr/0013-memory-helpers-consolidation.md
 */

// ============================================================================
// Token-Based Similarity
// ============================================================================

/**
 * Calculate token overlap score (query coverage).
 *
 * Measures what fraction of query tokens appear in the target.
 * Score = |query ∩ target| / |query|
 *
 * @param queryTokens - Tokens to find matches for
 * @param targetTokens - Tokens to search in
 * @returns Score between 0 (no overlap) and 1 (full coverage)
 *
 * @example
 * ```ts
 * calculateTokenOverlap(['foo', 'bar'], ['bar', 'baz'])
 * // Returns 0.5 (1 match / 2 query tokens)
 * ```
 */
export function calculateTokenOverlap(queryTokens: string[], targetTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  if (targetTokens.length === 0) return 0;

  const targetSet = new Set(targetTokens);
  let matches = 0;

  for (const token of queryTokens) {
    if (targetSet.has(token)) matches++;
  }

  return matches / queryTokens.length;
}

/**
 * Calculate set overlap count.
 *
 * Returns the number of elements that appear in both sets.
 * |A ∩ B|
 *
 * @param sourceSet - First set
 * @param targetSet - Second set
 * @returns Number of overlapping elements
 */
export function calculateSetOverlapCount<T>(sourceSet: Set<T>, targetSet: Set<T>): number {
  let count = 0;
  for (const item of sourceSet) {
    if (targetSet.has(item)) count++;
  }
  return count;
}

// ============================================================================
// Jaccard Similarity
// ============================================================================

/**
 * Calculate Jaccard similarity between two sets.
 *
 * Jaccard = |A ∩ B| / |A ∪ B|
 *
 * @param set1 - First set
 * @param set2 - Second set
 * @returns Score between 0 (no overlap) and 1 (identical sets)
 *
 * @example
 * ```ts
 * calculateJaccardSimilarity(new Set(['a', 'b']), new Set(['b', 'c']))
 * // Returns 0.333 (1 intersection / 3 union)
 * ```
 */
export function calculateJaccardSimilarity<T>(set1: Set<T>, set2: Set<T>): number {
  if (set1.size === 0 && set2.size === 0) return 1;
  if (set1.size === 0 || set2.size === 0) return 0;

  const intersection = calculateSetOverlapCount(set1, set2);
  const union = set1.size + set2.size - intersection;

  return union > 0 ? intersection / union : 0;
}

/**
 * Calculate Jaccard similarity between two strings using word tokenization.
 *
 * @param text1 - First text
 * @param text2 - Second text
 * @returns Score between 0 (no overlap) and 1 (identical word sets)
 */
export function calculateTextJaccardSimilarity(text1: string, text2: string): number {
  const words1 = new Set(
    text1
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0)
  );
  const words2 = new Set(
    text2
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0)
  );

  return calculateJaccardSimilarity(words1, words2);
}

// ============================================================================
// Similarity Comparison Helpers
// ============================================================================

/**
 * Check if two texts are highly similar (above threshold).
 *
 * Useful for stuck/loop detection in orchestration.
 *
 * @param text1 - First text
 * @param text2 - Second text
 * @param threshold - Similarity threshold (default: 0.8)
 * @returns True if Jaccard similarity >= threshold
 */
export function areTextsSimilar(text1: string, text2: string, threshold = 0.8): boolean {
  return calculateTextJaccardSimilarity(text1, text2) >= threshold;
}

/**
 * Find the maximum pairwise similarity among a list of texts.
 *
 * @param texts - List of texts to compare
 * @returns Maximum similarity score between any two adjacent texts
 */
export function calculateMaxPairwiseSimilarity(texts: string[]): number {
  if (texts.length < 2) return 0;

  let maxSimilarity = 0;

  for (let i = 1; i < texts.length; i++) {
    const prev = texts[i - 1];
    const curr = texts[i];
    if (prev !== undefined && curr !== undefined) {
      const similarity = calculateTextJaccardSimilarity(prev, curr);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }
    }
  }

  return maxSimilarity;
}
