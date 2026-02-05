/**
 * nexus-agents/testing/framework - Scoring Helpers
 *
 * Helper functions for rubric scoring operations.
 *
 * (Source: cli-project_plan.md v2.1.0, Phase 3)
 */

/**
 * Configuration for pattern matching scoring.
 */
export interface PatternMatchConfig {
  readonly patterns?: readonly string[];
  readonly caseSensitive?: boolean;
  readonly matchAll?: boolean;
  readonly [key: string]: unknown;
}

/**
 * Configuration for keyword presence scoring.
 */
export interface KeywordPresenceConfig {
  readonly keywords?: readonly string[];
  readonly minCount?: number;
  readonly caseSensitive?: boolean;
  readonly [key: string]: unknown;
}

/**
 * Configuration for length check scoring.
 */
export interface LengthCheckConfig {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly targetLength?: number;
  readonly [key: string]: unknown;
}

/**
 * Result from pattern matching.
 */
interface PatternMatchResult {
  matchCount: number;
  totalPatterns: number;
}

/**
 * Count matching patterns in the response.
 */
function countPatternMatches(
  searchText: string,
  patterns: readonly string[],
  caseSensitive: boolean
): PatternMatchResult {
  let matchCount = 0;
  for (const pattern of patterns) {
    const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
    if (searchText.includes(searchPattern)) {
      matchCount++;
    }
  }
  return { matchCount, totalPatterns: patterns.length };
}

/**
 * Score patterns based on match mode (all vs any).
 */
function calculatePatternScore(result: PatternMatchResult, matchAll: boolean): number {
  if (result.totalPatterns === 0) return 0;
  if (matchAll) {
    return result.matchCount === result.totalPatterns ? 1 : 0;
  }
  return result.matchCount / result.totalPatterns;
}

/**
 * Get patterns to use from config or fallback.
 */
function getPatterns(
  config: PatternMatchConfig | undefined,
  fallbackPatterns: readonly string[] | undefined
): readonly string[] {
  return config?.patterns ?? fallbackPatterns ?? [];
}

/**
 * Get the text to search, applying case sensitivity.
 */
function getSearchText(response: string, caseSensitive: boolean): string {
  return caseSensitive ? response : response.toLowerCase();
}

/**
 * Score for empty pattern list.
 */
function scoreEmptyPatternList(response: string): number {
  return response.trim().length > 0 ? 0.5 : 0;
}

/**
 * Scores pattern matching.
 */
export function scorePatternMatch(
  config: PatternMatchConfig | undefined,
  response: string,
  fallbackPatterns?: readonly string[]
): number {
  const patterns = getPatterns(config, fallbackPatterns);
  if (patterns.length === 0) {
    return scoreEmptyPatternList(response);
  }

  const caseSensitive = config?.caseSensitive ?? false;
  const matchAll = config?.matchAll ?? false;
  const searchText = getSearchText(response, caseSensitive);

  const result = countPatternMatches(searchText, patterns, caseSensitive);
  return calculatePatternScore(result, matchAll);
}

/**
 * Count keywords found in text.
 */
function countKeywordMatches(
  searchText: string,
  keywords: readonly string[],
  caseSensitive: boolean
): number {
  let foundCount = 0;
  for (const keyword of keywords) {
    const searchKeyword = caseSensitive ? keyword : keyword.toLowerCase();
    if (searchText.includes(searchKeyword)) {
      foundCount++;
    }
  }
  return foundCount;
}

/**
 * Scores keyword presence.
 */
export function scoreKeywordPresence(
  config: KeywordPresenceConfig | undefined,
  response: string
): number {
  if (config === undefined) {
    return response.trim().length > 0 ? 0.5 : 0;
  }

  const keywords = config.keywords;
  if (keywords === undefined || keywords.length === 0) {
    return response.trim().length > 0 ? 0.5 : 0;
  }

  const caseSensitive = config.caseSensitive ?? false;
  const minCount = config.minCount ?? 1;
  const searchText = caseSensitive ? response : response.toLowerCase();

  const foundCount = countKeywordMatches(searchText, keywords, caseSensitive);

  if (foundCount >= minCount) {
    return Math.min(1, foundCount / keywords.length);
  }

  return foundCount / minCount;
}

/**
 * Score based on minimum length requirement.
 */
function scoreMinLength(length: number, minLength: number): number {
  if (length < minLength) {
    return minLength > 0 ? length / minLength : 0;
  }
  return 1;
}

/**
 * Score based on maximum length requirement.
 */
function scoreMaxLength(length: number, maxLength: number): number {
  if (length > maxLength) {
    const excess = length - maxLength;
    const penalty = Math.min(1, excess / maxLength);
    return Math.max(0, 1 - penalty);
  }
  return 1;
}

/**
 * Score based on target length.
 */
function scoreTargetLength(length: number, targetLength: number, maxLength: number): number {
  const distance = Math.abs(length - targetLength);
  // When maxLength is not explicitly set (MAX_SAFE_INTEGER), use targetLength*2 as reasonable bound
  const effectiveMax = maxLength >= Number.MAX_SAFE_INTEGER ? targetLength * 2 : maxLength;
  const maxDistance = Math.max(targetLength, effectiveMax - targetLength);
  return maxDistance > 0 ? Math.max(0, 1 - distance / maxDistance) : 1;
}

/**
 * Scores based on response length.
 */
export function scoreLengthCheck(config: LengthCheckConfig | undefined, response: string): number {
  const length = response.trim().length;

  if (config === undefined) {
    return length > 0 ? 1 : 0;
  }

  const minLength = config.minLength ?? 0;
  const maxLength = config.maxLength ?? Number.MAX_SAFE_INTEGER;
  const targetLength = config.targetLength;

  // Check minimum
  if (length < minLength) {
    return scoreMinLength(length, minLength);
  }

  // Check maximum
  if (length > maxLength) {
    return scoreMaxLength(length, maxLength);
  }

  // Check target
  if (targetLength !== undefined) {
    return scoreTargetLength(length, targetLength, maxLength);
  }

  return 1;
}
