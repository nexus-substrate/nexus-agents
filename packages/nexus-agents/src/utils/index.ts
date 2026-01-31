/**
 * nexus-agents/utils - Shared Utilities
 *
 * Common utility functions extracted from multiple modules
 * per ADR-0013 (Memory Helpers Consolidation).
 *
 * @module utils
 * @see docs/adr/0013-memory-helpers-consolidation.md
 */

export {
  memoryRowToEntry,
  memoryExists,
  getMemoryEntry,
  getMemoryRow,
  getAllMemoryRows,
} from './memory-db-utils.js';

export {
  STOPWORDS,
  tokenize,
  tokenizeToSet,
  tokenizeFiltered,
  stringifyValue,
} from './text-utils.js';

export { generateId, generateHyphenId, generateShortUuid } from './id-utils.js';

export {
  calculateTokenOverlap,
  calculateSetOverlapCount,
  calculateJaccardSimilarity,
  calculateTextJaccardSimilarity,
  areTextsSimilar,
  calculateMaxPairwiseSimilarity,
} from './similarity-utils.js';
