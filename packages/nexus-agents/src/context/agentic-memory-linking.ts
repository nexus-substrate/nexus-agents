/**
 * Agentic Memory Linking
 *
 * Similarity calculation, link suggestion, and evolution detection
 * for A-MEM agentic memory system.
 *
 * @module context/agentic-memory-linking
 * (Source: Issue #122, arXiv:2502.12110)
 */

import { RelationType } from './graph-memory-types.js';
import type {
  MemoryAttributes,
  LinkingConfig,
  LinkSuggestion,
  EvolutionResult,
  EvolutionType,
} from './agentic-memory-types.js';

// ============================================================================
// Similarity Calculation (FTS-based)
// ============================================================================

/**
 * Calculate keyword overlap similarity between two memory entries.
 * Uses Jaccard-like coefficient: |intersection| / |union|
 */
export function calculateKeywordSimilarity(
  attrs1: MemoryAttributes,
  attrs2: MemoryAttributes
): number {
  const set1 = new Set(attrs1.keywords);
  const set2 = new Set(attrs2.keywords);

  if (set1.size === 0 && set2.size === 0) return 0;

  let intersection = 0;
  for (const k of set1) {
    if (set2.has(k)) intersection++;
  }

  const union = set1.size + set2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Calculate entity overlap similarity.
 * Returns the fraction of shared entities.
 */
export function calculateEntitySimilarity(
  attrs1: MemoryAttributes,
  attrs2: MemoryAttributes
): number {
  const names1 = new Set(attrs1.entities.map((e) => e.name.toLowerCase()));
  const names2 = new Set(attrs2.entities.map((e) => e.name.toLowerCase()));

  if (names1.size === 0 && names2.size === 0) return 0;

  let intersection = 0;
  for (const name of names1) {
    if (names2.has(name)) intersection++;
  }

  const union = names1.size + names2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Calculate overall similarity between two memories.
 * Combines keyword similarity (60%) and entity similarity (40%).
 */
export function calculateOverallSimilarity(
  attrs1: MemoryAttributes,
  attrs2: MemoryAttributes
): number {
  const keywordSim = calculateKeywordSimilarity(attrs1, attrs2);
  const entitySim = calculateEntitySimilarity(attrs1, attrs2);

  return keywordSim * 0.6 + entitySim * 0.4;
}

// ============================================================================
// Link Suggestion Generation
// ============================================================================

/**
 * Infer relationship type based on similarity and content.
 */
export function inferRelationType(
  fromAttrs: MemoryAttributes,
  toAttrs: MemoryAttributes,
  fromCreatedAt: Date,
  toCreatedAt: Date
): RelationType {
  // Check for shared entities (same_entity)
  const fromNames = new Set(fromAttrs.entities.map((e) => e.name.toLowerCase()));
  const toNames = new Set(toAttrs.entities.map((e) => e.name.toLowerCase()));
  let sharedEntities = 0;
  for (const name of fromNames) {
    if (toNames.has(name)) sharedEntities++;
  }
  if (sharedEntities > 0) return RelationType.SAME_ENTITY;

  // Check temporal relationship (precedes)
  if (fromCreatedAt < toCreatedAt) return RelationType.PRECEDES;

  // Default to related_to
  return RelationType.RELATED_TO;
}

/**
 * Generate a human-readable reason for a link suggestion.
 */
function generateLinkReason(
  fromAttrs: MemoryAttributes,
  toAttrs: MemoryAttributes,
  similarity: number
): string {
  // Find shared keywords
  const sharedKeywords = fromAttrs.keywords.filter((k) => toAttrs.keywords.includes(k));

  if (sharedKeywords.length > 0) {
    const sample = sharedKeywords.slice(0, 3).join(', ');
    return `Shared keywords: ${sample}`;
  }

  // Find shared entities
  const fromNames = fromAttrs.entities.map((e) => e.name);
  const sharedEntities = fromNames.filter((n) =>
    toAttrs.entities.some((e) => e.name.toLowerCase() === n.toLowerCase())
  );

  const firstSharedEntity = sharedEntities[0];
  if (firstSharedEntity !== undefined) {
    return `Shared entity: ${firstSharedEntity}`;
  }

  return `Similarity: ${(similarity * 100).toFixed(0)}%`;
}

/**
 * Generate link suggestions for a memory.
 */
export function generateLinkSuggestions(
  key: string,
  attrs: MemoryAttributes,
  createdAt: Date,
  candidates: Array<{ key: string; attrs: MemoryAttributes; createdAt: Date }>,
  config: LinkingConfig
): LinkSuggestion[] {
  const suggestions: LinkSuggestion[] = [];

  for (const candidate of candidates) {
    // Skip self
    if (candidate.key === key) continue;

    // Calculate similarity
    const similarity = calculateOverallSimilarity(attrs, candidate.attrs);

    // Skip if below threshold
    if (similarity < config.suggestionThreshold) continue;

    // Infer relationship type
    const relationType = inferRelationType(attrs, candidate.attrs, createdAt, candidate.createdAt);

    // Skip if type not allowed
    if (!config.allowedTypes.includes(relationType)) continue;

    // Generate reason
    const reason = generateLinkReason(attrs, candidate.attrs, similarity);

    suggestions.push({
      from: key,
      to: candidate.key,
      relationType,
      reason,
      confidence: similarity,
    });

    if (suggestions.length >= config.maxSuggestions) break;
  }

  // Sort by confidence descending
  suggestions.sort((a, b) => b.confidence - a.confidence);

  return suggestions.slice(0, config.maxSuggestions);
}

// ============================================================================
// Evolution Detection
// ============================================================================

/**
 * Detect evolution relationship between two memories.
 * Returns null if no evolution detected.
 */
export function detectEvolutionPair(
  newAttrs: MemoryAttributes,
  newCreatedAt: Date,
  existingKey: string,
  existingAttrs: MemoryAttributes,
  existingCreatedAt: Date
): EvolutionResult | null {
  // Calculate similarity
  const similarity = calculateOverallSimilarity(newAttrs, existingAttrs);

  // Only consider if sufficiently similar
  if (similarity < 0.5) return null;

  // Determine evolution type
  let type: EvolutionType;
  let description: string;

  // Check if new memory is newer
  if (newCreatedAt > existingCreatedAt) {
    // Check for contradictions (high similarity but different content keywords)
    const newOnlyKeywords = newAttrs.keywords.filter((k) => !existingAttrs.keywords.includes(k));
    const existingOnlyKeywords = existingAttrs.keywords.filter(
      (k) => !newAttrs.keywords.includes(k)
    );

    if (newOnlyKeywords.length > existingOnlyKeywords.length + 2) {
      type = 'extension';
      description = `Extends with new concepts: ${newOnlyKeywords.slice(0, 3).join(', ')}`;
    } else if (similarity > 0.8) {
      type = 'supersession';
      description = 'Highly similar newer memory, may supersede';
    } else {
      type = 'refinement';
      description = `Refines existing memory (${(similarity * 100).toFixed(0)}% similar)`;
    }
  } else {
    // New memory is older (shouldn't happen in typical flow)
    type = 'refinement';
    description = 'Related historical memory';
  }

  return {
    type,
    affectedKey: existingKey,
    confidence: similarity,
    description,
  };
}

/**
 * Detect all evolution relationships for a new memory.
 */
export function detectEvolution(
  newKey: string,
  newAttrs: MemoryAttributes,
  newCreatedAt: Date,
  existingMemories: Array<{ key: string; attrs: MemoryAttributes; createdAt: Date }>
): EvolutionResult[] {
  const results: EvolutionResult[] = [];

  for (const existing of existingMemories) {
    if (existing.key === newKey) continue;

    const evolution = detectEvolutionPair(
      newAttrs,
      newCreatedAt,
      existing.key,
      existing.attrs,
      existing.createdAt
    );

    if (evolution !== null) {
      results.push(evolution);
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}
