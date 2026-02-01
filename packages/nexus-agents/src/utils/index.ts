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
  capitalize,
  capitalizeWords,
  capitalizeKebab,
  truncateText,
  truncateWithInfo,
  truncateSentence,
  splitLines,
  splitNonEmptyLines,
  splitTrimmedLines,
  countSentences,
  splitSentences,
  countWords,
} from './text-utils.js';

export {
  generateId,
  generateHyphenId,
  generateShortUuid,
  generateUUID,
  generateShortUUIDv4,
  generateStepId,
} from './id-utils.js';

export {
  calculateTokenOverlap,
  calculateSetOverlapCount,
  calculateJaccardSimilarity,
  calculateTextJaccardSimilarity,
  areTextsSimilar,
  calculateMaxPairwiseSimilarity,
} from './similarity-utils.js';

export { sleep, delay, withTimeout, sequence, type TimeoutResult } from './async-utils.js';

export { clamp, clamp01, clampScore, clampPercent } from './math-utils.js';

export {
  asRecord,
  isRecord,
  asString,
  asNumber,
  asBoolean,
  asArray,
  extractStringField,
  extractNumberField,
  extractBooleanField,
  extractRecordField,
  safeJsonParse,
  safeJsonParseRecord,
} from './type-coercion.js';
