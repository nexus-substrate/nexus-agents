/**
 * Agentic Memory Helpers
 *
 * Helper functions for A-MEM attribute extraction.
 * Similarity/linking functions are in agentic-memory-linking.ts.
 *
 * Phase 1 uses rule-based extraction.
 * Phase 2 will add embeddings for semantic similarity.
 *
 * @module context/agentic-memory-helpers
 * (Source: Issue #122, arXiv:2502.12110)
 */

import type { ExtractionConfig } from './agentic-memory-types.js';
import { DEFAULT_EXTRACTION_CONFIG, DEFAULT_LINKING_CONFIG } from './agentic-memory-types.js';

// Re-export similarity/linking functions for backward compatibility
export {
  calculateKeywordSimilarity,
  calculateEntitySimilarity,
  calculateOverallSimilarity,
  inferRelationType,
  generateLinkSuggestions,
  detectEvolutionPair,
  detectEvolution,
} from './agentic-memory-linking.js';

// Re-export database helpers for backward compatibility
export {
  parseAmemAttributes,
  memoryRowToAgenticEntry,
  searchWithAttributes,
  getAttributeSet,
  getAttributesFromRow,
  findMatchingMemories,
} from './agentic-memory-db-helpers.js';

// Re-export extraction helpers for backward compatibility
export {
  tokenize,
  tokenizeFiltered,
  extractKeywords,
  extractSemanticTags,
  extractEntities,
  generateContextDescription,
  extractAttributes,
} from './agentic-memory-extraction.js';

// ============================================================================
// Configuration Merging
// ============================================================================

/**
 * Merge partial extraction config with defaults.
 */
export function mergeExtractionConfig(partial?: Partial<ExtractionConfig>): ExtractionConfig {
  if (partial === undefined) return DEFAULT_EXTRACTION_CONFIG;
  return {
    maxKeywords: partial.maxKeywords ?? DEFAULT_EXTRACTION_CONFIG.maxKeywords,
    maxSemanticTags: partial.maxSemanticTags ?? DEFAULT_EXTRACTION_CONFIG.maxSemanticTags,
    maxContextLength: partial.maxContextLength ?? DEFAULT_EXTRACTION_CONFIG.maxContextLength,
    maxEntities: partial.maxEntities ?? DEFAULT_EXTRACTION_CONFIG.maxEntities,
  };
}

/**
 * Merge partial linking config with defaults.
 */
export function mergeLinkingConfig(
  partial?: Partial<import('./agentic-memory-types.js').LinkingConfig>
): import('./agentic-memory-types.js').LinkingConfig {
  if (partial === undefined) return DEFAULT_LINKING_CONFIG;
  return {
    suggestionThreshold: partial.suggestionThreshold ?? DEFAULT_LINKING_CONFIG.suggestionThreshold,
    maxSuggestions: partial.maxSuggestions ?? DEFAULT_LINKING_CONFIG.maxSuggestions,
    allowedTypes: partial.allowedTypes ?? DEFAULT_LINKING_CONFIG.allowedTypes,
  };
}
