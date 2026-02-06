/**
 * Tests for Self-Evaluation Output Formatting
 *
 * @module cli/self-eval-format.test
 */

import { describe, it, expect } from 'vitest';
import {
  getRecommendationColor,
  getRecommendationSymbol,
  formatResultSummary,
} from './self-eval-format.js';
import { colors, symbols } from './self-eval-types.js';

// ============================================================================
// getRecommendationColor
// ============================================================================

describe('getRecommendationColor', () => {
  it('returns green for retain', () => {
    expect(getRecommendationColor('retain')).toBe(colors.green);
  });

  it('returns yellow for review', () => {
    expect(getRecommendationColor('review')).toBe(colors.yellow);
  });

  it('returns yellow for refactor', () => {
    expect(getRecommendationColor('refactor')).toBe(colors.yellow);
  });

  it('returns red for deprecate', () => {
    expect(getRecommendationColor('deprecate')).toBe(colors.red);
  });

  it('returns reset for unknown recommendation', () => {
    expect(getRecommendationColor('unknown')).toBe(colors.reset);
  });
});

// ============================================================================
// getRecommendationSymbol
// ============================================================================

describe('getRecommendationSymbol', () => {
  it('returns check for retain', () => {
    expect(getRecommendationSymbol('retain')).toBe(symbols.check);
  });

  it('returns cross for deprecate', () => {
    expect(getRecommendationSymbol('deprecate')).toBe(symbols.cross);
  });

  it('returns warn for review', () => {
    expect(getRecommendationSymbol('review')).toBe(symbols.warn);
  });

  it('returns warn for refactor', () => {
    expect(getRecommendationSymbol('refactor')).toBe(symbols.warn);
  });

  it('returns warn for unknown', () => {
    expect(getRecommendationSymbol('unknown')).toBe(symbols.warn);
  });
});

// ============================================================================
// formatResultSummary
// ============================================================================

describe('formatResultSummary', () => {
  it('formats retain result', () => {
    const result = formatResultSummary({
      component: 'src/core/engine.ts',
      finalRecommendation: 'retain',
      confidence: 0.95,
      evidenceQuality: 0.9,
      isRecommendation: true,
      votes: [],
      dissent: [],
    });

    expect(result).toContain('src/core/engine.ts');
    expect(result).toContain('RETAIN');
  });

  it('includes dissenting opinion count', () => {
    const result = formatResultSummary({
      component: 'src/utils/helper.ts',
      finalRecommendation: 'review',
      confidence: 0.7,
      evidenceQuality: 0.6,
      isRecommendation: true,
      votes: [],
      dissent: [{ agent: 'security', recommendation: 'refactor', confidence: 0.8, concerns: [] }],
    });

    expect(result).toContain('1 dissenting opinion');
  });

  it('pluralizes dissenting opinions', () => {
    const result = formatResultSummary({
      component: 'src/api/routes.ts',
      finalRecommendation: 'refactor',
      confidence: 0.6,
      evidenceQuality: 0.5,
      isRecommendation: true,
      votes: [],
      dissent: [
        { agent: 'security', recommendation: 'deprecate', confidence: 0.9, concerns: [] },
        { agent: 'code', recommendation: 'retain', confidence: 0.7, concerns: [] },
      ],
    });

    expect(result).toContain('2 dissenting opinions');
  });

  it('does not show dissent line when none', () => {
    const result = formatResultSummary({
      component: 'src/utils/helper.ts',
      finalRecommendation: 'retain',
      confidence: 0.9,
      evidenceQuality: 0.9,
      isRecommendation: true,
      votes: [],
      dissent: [],
    });

    expect(result).not.toContain('dissenting');
  });
});
