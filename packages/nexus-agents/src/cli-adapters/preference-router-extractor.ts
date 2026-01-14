/**
 * Preference Router Feature Extractor
 *
 * Extracts query features for preference-based routing decisions.
 *
 * @module cli-adapters/preference-router-extractor
 * (Source: Issue #148, arXiv:2406.18665)
 */

import { createHash } from 'node:crypto';
import type { QueryFeatures } from './preference-router-types.js';

// =============================================================================
// KEYWORDS
// =============================================================================

const CODE_KEYWORDS = [
  'function',
  'class',
  'import',
  'export',
  'const',
  'let',
  'var',
  'implement',
  'refactor',
  'debug',
  'compile',
  'test',
  'typescript',
  'javascript',
  'python',
  'code',
];

const REASONING_KEYWORDS = [
  'analyze',
  'compare',
  'evaluate',
  'why',
  'how',
  'explain',
  'reason',
  'logic',
  'prove',
  'deduce',
  'infer',
];

const CREATIVITY_KEYWORDS = [
  'create',
  'design',
  'imagine',
  'brainstorm',
  'innovative',
  'creative',
  'story',
  'write',
  'compose',
];

const AMBIGUITY_INDICATORS = [
  'maybe',
  'might',
  'could',
  'or',
  'possibly',
  'uncertain',
  'unclear',
  'depends',
];

// =============================================================================
// FEATURE EXTRACTOR
// =============================================================================

/**
 * Feature extractor for queries.
 */
export class QueryFeatureExtractor {
  extract(query: string): QueryFeatures {
    const lowerQuery = query.toLowerCase();
    const words = lowerQuery.split(/\s+/);
    const tokenCount = this.estimateTokens(query);

    return {
      tokenCount,
      complexity: this.calculateComplexity(query, words),
      requiresReasoning: this.hasKeywords(words, REASONING_KEYWORDS),
      requiresCode: this.hasKeywords(words, CODE_KEYWORDS),
      requiresCreativity: this.hasKeywords(words, CREATIVITY_KEYWORDS),
      hasAmbiguity: this.hasKeywords(words, AMBIGUITY_INDICATORS),
      domain: this.detectDomain(words),
      keywordSignature: this.generateKeywordSignature(words),
    };
  }

  private estimateTokens(text: string): number {
    // Rough estimate: ~4 chars per token on average
    return Math.ceil(text.length / 4);
  }

  private calculateComplexity(query: string, words: string[]): number {
    let complexity = 0;

    // Length factor (0-0.3)
    complexity += Math.min(0.3, words.length / 100);

    // Sentence structure (0-0.2)
    const sentences = query.split(/[.!?]+/).filter(Boolean);
    complexity += Math.min(0.2, sentences.length / 10);

    // Technical terms (0-0.3)
    const technicalCount =
      this.countKeywords(words, CODE_KEYWORDS) + this.countKeywords(words, REASONING_KEYWORDS);
    complexity += Math.min(0.3, technicalCount / 20);

    // Question depth (0-0.2)
    const questionWords = words.filter((w) =>
      ['what', 'why', 'how', 'when', 'where', 'which'].includes(w)
    );
    complexity += Math.min(0.2, questionWords.length / 5);

    return Math.min(1, complexity);
  }

  private hasKeywords(words: string[], keywords: string[]): boolean {
    return words.some((w) => keywords.includes(w));
  }

  private countKeywords(words: string[], keywords: string[]): number {
    return words.filter((w) => keywords.includes(w)).length;
  }

  private detectDomain(words: string[]): string {
    const domainScores: Record<string, number> = {
      coding: this.countKeywords(words, CODE_KEYWORDS),
      reasoning: this.countKeywords(words, REASONING_KEYWORDS),
      creative: this.countKeywords(words, CREATIVITY_KEYWORDS),
    };

    let maxDomain = 'general';
    let maxScore = 0;

    for (const [domain, score] of Object.entries(domainScores)) {
      if (score > maxScore) {
        maxScore = score;
        maxDomain = domain;
      }
    }

    return maxDomain;
  }

  private generateKeywordSignature(words: string[]): string {
    const allKeywords = [...CODE_KEYWORDS, ...REASONING_KEYWORDS, ...CREATIVITY_KEYWORDS];

    const presentKeywords = words.filter((w) => allKeywords.includes(w)).sort();

    return createHash('sha256').update(presentKeywords.join(',')).digest('hex').slice(0, 16);
  }
}
