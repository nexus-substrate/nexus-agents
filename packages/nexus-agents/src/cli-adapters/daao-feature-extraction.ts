/**
 * nexus-agents/cli-adapters - DAAO Feature Extraction
 *
 * Feature extraction functions for DAAO difficulty estimation.
 * Extracted from daao-estimator.ts to comply with file size limits.
 *
 * @module cli-adapters/daao-feature-extraction
 * (Source: Issue #334, arXiv:2509.11079)
 */

// ============================================================================
// Feature Extraction Constants
// ============================================================================

/** Average word length thresholds for lexical complexity */
export const LEXICAL_THRESHOLDS = { simple: 4, complex: 7 } as const;

/** Sentence structure indicators */
export const COMPLEX_SYNTAX_MARKERS = [
  'however',
  'therefore',
  'consequently',
  'furthermore',
  'nevertheless',
  'notwithstanding',
  'whereas',
  'whereby',
  'wherein',
  'although',
  'provided that',
  'in order to',
  'such that',
  'given that',
  'assuming that',
] as const;

/** Technical domain indicators */
export const TECHNICAL_KEYWORDS = [
  'algorithm',
  'implementation',
  'architecture',
  'distributed',
  'concurrent',
  'asynchronous',
  'protocol',
  'encryption',
  'authentication',
  'optimization',
  'scalability',
  'latency',
  'throughput',
  'consensus',
  'replication',
  'sharding',
  'caching',
  'indexing',
  'normalization',
  'serialization',
  'deserialization',
  'middleware',
  'microservice',
  'monolith',
  'kubernetes',
  'docker',
  'terraform',
  'api',
  'rest',
  'graphql',
  'grpc',
] as const;

/** Scope expansion indicators */
export const SCOPE_KEYWORDS = [
  'entire',
  'complete',
  'comprehensive',
  'full',
  'all',
  'every',
  'across',
  'throughout',
  'end-to-end',
  'system-wide',
  'global',
  'universal',
  'holistic',
  'extensive',
] as const;

/** Constraint indicators */
export const CONSTRAINT_KEYWORDS = [
  'must',
  'required',
  'ensure',
  'guarantee',
  'constraint',
  'limitation',
  'restriction',
  'boundary',
  'requirement',
  'specification',
  'compliance',
  'validation',
  'verification',
  'edge case',
  'corner case',
  'error handling',
  'exception',
  'fallback',
  'timeout',
  'retry',
] as const;

/** Clarity indicators (presence reduces ambiguity) */
export const CLARITY_KEYWORDS = [
  'specifically',
  'exactly',
  'precisely',
  'namely',
  'explicitly',
  'defined as',
  'meaning',
  'e.g.',
  'i.e.',
  'for example',
  'such as',
  'in particular',
] as const;

/** Ambiguity indicators (presence increases ambiguity) */
export const AMBIGUITY_KEYWORDS = [
  'maybe',
  'perhaps',
  'possibly',
  'might',
  'could',
  'somehow',
  'somewhere',
  'something',
  'anything',
  'whatever',
  'whichever',
  'flexible',
  'general',
  'appropriate',
  'suitable',
] as const;

/** Output complexity indicators */
export const OUTPUT_COMPLEXITY_KEYWORDS = [
  'implement',
  'create',
  'build',
  'design',
  'develop',
  'write',
  'generate',
  'produce',
  'construct',
  'establish',
  'comprehensive',
  'detailed',
  'complete',
  'full',
  'extensive',
] as const;

/** Rare/advanced vocabulary indicators */
export const ADVANCED_VOCABULARY = [
  'idempotent',
  'ephemeral',
  'immutable',
  'polymorphism',
  'inheritance',
  'encapsulation',
  'abstraction',
  'covariance',
  'contravariance',
  'invariant',
  'deterministic',
  'stochastic',
  'heuristic',
  'recursive',
  'iterative',
  'declarative',
  'imperative',
  'functional',
  'procedural',
  'orthogonal',
  'canonical',
  'idiomatic',
  'ergonomic',
  'performant',
] as const;

/** Concept density indicators */
export const CONCEPT_INDICATORS = [
  'implement',
  'create',
  'design',
  'analyze',
  'optimize',
  'evaluate',
  'process',
  'handle',
  'manage',
  'configure',
  'transform',
  'validate',
  'integrate',
] as const;

/** Abstract term indicators */
export const ABSTRACT_TERMS = [
  'concept',
  'principle',
  'pattern',
  'paradigm',
  'framework',
  'methodology',
  'strategy',
  'approach',
  'mechanism',
  'model',
] as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Tokenizes text into words.
 */
export function tokenize(text: string): string[] {
  return text
    .split(/[\s\n\r\t]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9'-]/g, ''))
    .filter((w) => w.length > 0);
}

/**
 * Normalizes a value to 0-1 range.
 */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  const normalized = (value - min) / (max - min);
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Applies soft saturation curve to a count.
 */
export function saturate(count: number, saturationPoint: number): number {
  if (count <= 0) return 0;
  const ratio = count / saturationPoint;
  return Math.min(1, ratio * (2 - ratio));
}

/**
 * Counts keyword matches in text.
 */
export function countKeywordMatches(text: string, keywords: readonly string[]): number {
  let count = 0;
  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      count++;
    }
  }
  return count;
}

// ============================================================================
// Feature Extraction Functions
// ============================================================================

/**
 * Extracts lexical complexity feature.
 */
export function extractLexicalComplexity(words: string[]): number {
  if (words.length === 0) return 0;

  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  const lengthScore = normalize(
    avgWordLength,
    LEXICAL_THRESHOLDS.simple,
    LEXICAL_THRESHOLDS.complex
  );

  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const diversityScore = Math.min(1, uniqueWords.size / Math.max(words.length, 1));

  const lower = words.map((w) => w.toLowerCase());
  const advancedCount = countKeywordMatches(lower.join(' '), ADVANCED_VOCABULARY);
  const advancedScore = saturate(advancedCount, 5);

  return lengthScore * 0.3 + diversityScore * 0.3 + advancedScore * 0.4;
}

/**
 * Extracts syntactic complexity feature.
 */
export function extractSyntacticComplexity(content: string, lower: string): number {
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgSentenceLength = sentences.length > 0 ? content.length / sentences.length : 0;
  const sentenceLengthScore = normalize(avgSentenceLength, 50, 200);

  const markerCount = countKeywordMatches(lower, COMPLEX_SYNTAX_MARKERS);
  const markerScore = saturate(markerCount, 5);

  const punctuationMatch = content.match(/[,;:\-()[\]{}]/g);
  const punctuationCount = punctuationMatch !== null ? punctuationMatch.length : 0;
  const punctuationScore = saturate((punctuationCount / Math.max(content.length, 1)) * 100, 5);

  const nestingMatch = content.match(/[([{]/g);
  const nestingCount = nestingMatch !== null ? nestingMatch.length : 0;
  const nestingScore = saturate(nestingCount, 10);

  return (
    sentenceLengthScore * 0.25 + markerScore * 0.35 + punctuationScore * 0.2 + nestingScore * 0.2
  );
}

/**
 * Extracts semantic density feature.
 */
export function extractSemanticDensity(words: string[], lower: string): number {
  if (words.length === 0) return 0;

  const conceptCount = countKeywordMatches(lower, CONCEPT_INDICATORS);
  const conceptScore = saturate(conceptCount, 8);

  const abstractCount = countKeywordMatches(lower, ABSTRACT_TERMS);
  const abstractScore = saturate(abstractCount, 5);

  const densityRatio = conceptCount / Math.max(words.length / 50, 1);
  const densityScore = Math.min(1, densityRatio);

  return conceptScore * 0.4 + abstractScore * 0.3 + densityScore * 0.3;
}

/**
 * Extracts technical specificity feature.
 */
export function extractTechnicalSpecificity(lower: string): number {
  const technicalCount = countKeywordMatches(lower, TECHNICAL_KEYWORDS);
  return saturate(technicalCount, 8);
}

/**
 * Extracts task scope feature.
 */
export function extractTaskScope(lower: string): number {
  const scopeCount = countKeywordMatches(lower, SCOPE_KEYWORDS);
  const scopeScore = saturate(scopeCount, 5);
  const lengthScore = normalize(lower.length, 100, 2000);
  return scopeScore * 0.6 + lengthScore * 0.4;
}

/**
 * Extracts constraint complexity feature.
 */
export function extractConstraintComplexity(lower: string): number {
  const constraintCount = countKeywordMatches(lower, CONSTRAINT_KEYWORDS);
  return saturate(constraintCount, 8);
}

/**
 * Extracts clarity feature.
 */
export function extractClarity(lower: string): number {
  const clarityCount = countKeywordMatches(lower, CLARITY_KEYWORDS);
  const clarityScore = saturate(clarityCount, 5);
  const ambiguityCount = countKeywordMatches(lower, AMBIGUITY_KEYWORDS);
  const ambiguityScore = saturate(ambiguityCount, 5);
  return Math.max(0, Math.min(1, clarityScore * 1.2 - ambiguityScore * 0.8 + 0.5));
}

/**
 * Extracts output complexity feature.
 */
export function extractOutputComplexity(lower: string): number {
  const outputCount = countKeywordMatches(lower, OUTPUT_COMPLEXITY_KEYWORDS);
  return saturate(outputCount, 6);
}
