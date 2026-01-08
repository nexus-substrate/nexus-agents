/**
 * Tests for Aggregation Logic.
 * (Source: Issue #139)
 */

import { describe, it, expect } from 'vitest';
import { EvaluationAggregator, createAggregator, aggregateResults } from './aggregation-logic.js';
import type { EvaluationResult, EvaluatorRole } from './evaluation-agents.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createEvaluation(
  overrides: Partial<EvaluationResult> & { agent: EvaluatorRole }
): EvaluationResult {
  return {
    component: 'test/component.ts',
    recommendation: 'retain',
    confidence: 0.8,
    metrics: [
      { metric: 'complexity', value: 10, source: 'scanner' },
      { metric: 'lines', value: 100, source: 'scanner' },
    ],
    concerns: [],
    isRecommendation: true,
    timestamp: new Date(),
    ...overrides,
  };
}

function createEvaluationSet(
  component: string,
  recommendations: Array<{ agent: EvaluatorRole; rec: EvaluationResult['recommendation'] }>
): EvaluationResult[] {
  return recommendations.map((r) =>
    createEvaluation({
      component,
      agent: r.agent,
      recommendation: r.rec,
      confidence: 0.7,
    })
  );
}

// ============================================================================
// EvaluationAggregator Tests
// ============================================================================

describe('EvaluationAggregator', () => {
  describe('aggregate', () => {
    it('should aggregate evaluations into a single result', () => {
      const aggregator = createAggregator();
      const evaluations = [
        createEvaluation({ agent: 'code-quality', recommendation: 'retain' }),
        createEvaluation({ agent: 'architecture-fit', recommendation: 'retain' }),
        createEvaluation({ agent: 'practical-value', recommendation: 'retain' }),
      ];

      const result = aggregator.aggregate('test/component.ts', evaluations);

      expect(result.component).toBe('test/component.ts');
      expect(result.finalRecommendation).toBe('retain');
      expect(result.isRecommendation).toBe(true);
      expect(result.votes).toHaveLength(3);
    });

    it('should throw on empty evaluations', () => {
      const aggregator = createAggregator();

      expect(() => aggregator.aggregate('test.ts', [])).toThrow('Cannot aggregate empty');
    });

    it('should identify dissenting opinions', () => {
      const aggregator = createAggregator();
      const evaluations = [
        createEvaluation({ agent: 'code-quality', recommendation: 'retain' }),
        createEvaluation({ agent: 'architecture-fit', recommendation: 'retain' }),
        createEvaluation({ agent: 'practical-value', recommendation: 'refactor' }),
      ];

      const result = aggregator.aggregate('test/component.ts', evaluations);

      expect(result.finalRecommendation).toBe('retain');
      expect(result.dissent).toHaveLength(1);
      expect(result.dissent[0]?.agent).toBe('practical-value');
    });

    it('should generate audit trail', () => {
      const aggregator = createAggregator();
      const evaluations = [
        createEvaluation({
          agent: 'code-quality',
          concerns: ['High complexity'],
          metrics: [{ metric: 'complexity', value: 25, source: 'scanner', threshold: 20 }],
        }),
      ];

      const result = aggregator.aggregate('test.ts', evaluations);

      expect(result.auditTrail.length).toBeGreaterThan(0);
      expect(result.auditTrail.some((e) => e.claim.includes('complexity'))).toBe(true);
    });
  });

  describe('determineCriticality', () => {
    it('should identify security-critical components', () => {
      const aggregator = createAggregator();

      expect(aggregator.determineCriticality('src/auth/login.ts')).toBe('security-critical');
      expect(aggregator.determineCriticality('src/security/validator.ts')).toBe(
        'security-critical'
      );
      expect(aggregator.determineCriticality('src/crypto/hash.ts')).toBe('security-critical');
      expect(aggregator.determineCriticality('utils/password-utils.ts')).toBe('security-critical');
    });

    it('should identify core components', () => {
      const aggregator = createAggregator();

      expect(aggregator.determineCriticality('src/core/types.ts')).toBe('core');
      expect(aggregator.determineCriticality('src/engine/workflow.ts')).toBe('core');
      expect(aggregator.determineCriticality('src/adapters/claude.ts')).toBe('core');
      expect(aggregator.determineCriticality('src/index.ts')).toBe('core');
    });

    it('should default to utility', () => {
      const aggregator = createAggregator();

      expect(aggregator.determineCriticality('src/utils/format.ts')).toBe('utility');
      expect(aggregator.determineCriticality('src/helpers/string.ts')).toBe('utility');
    });

    it('should respect criticality overrides', () => {
      const overrides = new Map([['special/component.ts', 'security-critical' as const]]);
      const aggregator = createAggregator({ criticalityOverrides: overrides });

      expect(aggregator.determineCriticality('special/component.ts')).toBe('security-critical');
    });
  });

  describe('voting thresholds', () => {
    it('should require unanimous vote for deprecation of security-critical', () => {
      const aggregator = createAggregator();
      const evaluations = [
        createEvaluation({ agent: 'code-quality', recommendation: 'deprecate' }),
        createEvaluation({ agent: 'architecture-fit', recommendation: 'deprecate' }),
        createEvaluation({ agent: 'practical-value', recommendation: 'retain' }),
      ];

      const result = aggregator.aggregate('src/auth/login.ts', evaluations);

      // Not unanimous, should not deprecate
      expect(result.finalRecommendation).not.toBe('deprecate');
    });

    it('should allow deprecation with unanimous vote', () => {
      const aggregator = createAggregator();
      const evaluations = [
        createEvaluation({ agent: 'code-quality', recommendation: 'deprecate' }),
        createEvaluation({ agent: 'architecture-fit', recommendation: 'deprecate' }),
        createEvaluation({ agent: 'practical-value', recommendation: 'deprecate' }),
      ];

      const result = aggregator.aggregate('src/auth/login.ts', evaluations);

      expect(result.finalRecommendation).toBe('deprecate');
    });

    it('should require majority for utility components', () => {
      const aggregator = createAggregator();
      const evaluations = [
        createEvaluation({ agent: 'code-quality', recommendation: 'refactor' }),
        createEvaluation({ agent: 'architecture-fit', recommendation: 'refactor' }),
        createEvaluation({ agent: 'practical-value', recommendation: 'retain' }),
      ];

      const result = aggregator.aggregate('src/utils/format.ts', evaluations);

      expect(result.finalRecommendation).toBe('refactor');
    });
  });

  describe('evidence quality', () => {
    it('should calculate higher quality for well-evidenced evaluations', () => {
      const aggregator = createAggregator();
      const wellEvidenced = [
        createEvaluation({
          agent: 'code-quality',
          metrics: [
            { metric: 'complexity', value: 25, source: 'scanner' },
            { metric: 'lines', value: 500, source: 'scanner' },
            { metric: 'coverage', value: '20%', source: 'coverage_report' },
          ],
          concerns: ['High complexity: 25 exceeds 20'],
        }),
      ];

      const result = aggregator.aggregate('test.ts', wellEvidenced);

      expect(result.evidenceQuality).toBeGreaterThan(0.5);
    });

    it('should calculate lower quality for unevidenced claims', () => {
      const aggregator = createAggregator();
      const poorlyEvidenced = [
        createEvaluation({
          agent: 'code-quality',
          metrics: [],
          concerns: ['This code looks bad', 'Needs refactoring', 'Too messy'],
        }),
      ];

      const result = aggregator.aggregate('test.ts', poorlyEvidenced);

      expect(result.evidenceQuality).toBe(0);
    });
  });

  describe('confidence calculation', () => {
    it('should have higher confidence with unanimous agreement', () => {
      const aggregator = createAggregator();
      const unanimous = [
        createEvaluation({ agent: 'code-quality', recommendation: 'retain', confidence: 0.9 }),
        createEvaluation({
          agent: 'architecture-fit',
          recommendation: 'retain',
          confidence: 0.9,
        }),
        createEvaluation({ agent: 'practical-value', recommendation: 'retain', confidence: 0.9 }),
      ];

      const result = aggregator.aggregate('test.ts', unanimous);

      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should have lower confidence with disagreement', () => {
      const aggregator = createAggregator();
      const disagreeing = [
        createEvaluation({ agent: 'code-quality', recommendation: 'retain', confidence: 0.9 }),
        createEvaluation({
          agent: 'architecture-fit',
          recommendation: 'refactor',
          confidence: 0.9,
        }),
        createEvaluation({
          agent: 'practical-value',
          recommendation: 'deprecate',
          confidence: 0.9,
        }),
      ];

      const result = aggregator.aggregate('utils/test.ts', disagreeing);

      // Only 1/3 agreement, confidence should be lower
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('format', () => {
    it('should format summary mode as single line', () => {
      const aggregator = createAggregator();
      const evaluations = [
        createEvaluation({ agent: 'code-quality', recommendation: 'retain' }),
        createEvaluation({ agent: 'architecture-fit', recommendation: 'retain' }),
        createEvaluation({ agent: 'practical-value', recommendation: 'retain' }),
      ];
      const result = aggregator.aggregate('src/utils/format.ts', evaluations);

      const output = aggregator.format([result], { verbose: false });

      expect(output).toContain('[RETAIN]');
      expect(output).toContain('src/utils/format.ts');
      expect(output).toContain('confidence');
      expect(output.split('\n')).toHaveLength(1);
    });

    it('should format verbose mode with full details', () => {
      const aggregator = createAggregator();
      const evaluations = [
        createEvaluation({
          agent: 'code-quality',
          recommendation: 'refactor',
          concerns: ['High complexity'],
        }),
        createEvaluation({ agent: 'architecture-fit', recommendation: 'refactor' }),
        createEvaluation({ agent: 'practical-value', recommendation: 'retain' }),
      ];
      const result = aggregator.aggregate('src/utils/format.ts', evaluations);

      const output = aggregator.format([result], { verbose: true });

      expect(output).toContain('Component:');
      expect(output).toContain('Final Recommendation:');
      expect(output).toContain('Votes:');
      expect(output).toContain('code-quality');
      expect(output).toContain('Dissenting Opinions:');
    });

    it('should include audit trail when requested', () => {
      const aggregator = createAggregator();
      const evaluations = [
        createEvaluation({
          agent: 'code-quality',
          metrics: [{ metric: 'complexity', value: 25, source: 'scanner' }],
        }),
      ];
      const result = aggregator.aggregate('test.ts', evaluations);

      const output = aggregator.format([result], { verbose: true, includeAuditTrail: true });

      expect(output).toContain('Audit Trail:');
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createAggregator', () => {
  it('should create aggregator with default config', () => {
    const aggregator = createAggregator();
    expect(aggregator).toBeInstanceOf(EvaluationAggregator);
  });

  it('should accept custom config', () => {
    const aggregator = createAggregator({
      securityPatterns: [/custom-security/],
    });

    expect(aggregator.determineCriticality('custom-security/auth.ts')).toBe('security-critical');
  });
});

describe('aggregateResults', () => {
  it('should aggregate multiple components', () => {
    const evaluationsByComponent = new Map([
      [
        'src/utils/a.ts',
        createEvaluationSet('src/utils/a.ts', [
          { agent: 'code-quality', rec: 'retain' },
          { agent: 'architecture-fit', rec: 'retain' },
          { agent: 'practical-value', rec: 'retain' },
        ]),
      ],
      [
        'src/utils/b.ts',
        createEvaluationSet('src/utils/b.ts', [
          { agent: 'code-quality', rec: 'refactor' },
          { agent: 'architecture-fit', rec: 'refactor' },
          { agent: 'practical-value', rec: 'retain' },
        ]),
      ],
    ]);

    const results = aggregateResults(evaluationsByComponent);

    expect(results).toHaveLength(2);
    // Should be sorted by severity (refactor first)
    expect(results[0]?.finalRecommendation).toBe('refactor');
    expect(results[1]?.finalRecommendation).toBe('retain');
  });

  it('should sort results by recommendation severity', () => {
    const evaluationsByComponent = new Map([
      [
        'retain.ts',
        createEvaluationSet('retain.ts', [
          { agent: 'code-quality', rec: 'retain' },
          { agent: 'architecture-fit', rec: 'retain' },
          { agent: 'practical-value', rec: 'retain' },
        ]),
      ],
      [
        'deprecate.ts',
        createEvaluationSet('deprecate.ts', [
          { agent: 'code-quality', rec: 'deprecate' },
          { agent: 'architecture-fit', rec: 'deprecate' },
          { agent: 'practical-value', rec: 'deprecate' },
        ]),
      ],
      [
        'review.ts',
        createEvaluationSet('review.ts', [
          { agent: 'code-quality', rec: 'review' },
          { agent: 'architecture-fit', rec: 'review' },
          { agent: 'practical-value', rec: 'review' },
        ]),
      ],
    ]);

    const results = aggregateResults(evaluationsByComponent);

    expect(results[0]?.finalRecommendation).toBe('deprecate');
    expect(results[1]?.finalRecommendation).toBe('review');
    expect(results[2]?.finalRecommendation).toBe('retain');
  });
});

// ============================================================================
// Result Validation Tests
// ============================================================================

describe('AggregatedResult validation', () => {
  it('should always have isRecommendation=true per AI/ML approval', () => {
    const aggregator = createAggregator();
    const evaluations = [
      createEvaluation({ agent: 'code-quality' }),
      createEvaluation({ agent: 'architecture-fit' }),
      createEvaluation({ agent: 'practical-value' }),
    ];

    const result = aggregator.aggregate('test.ts', evaluations);

    expect(result.isRecommendation).toBe(true);
  });

  it('should preserve all votes in result', () => {
    const aggregator = createAggregator();
    const evaluations = [
      createEvaluation({ agent: 'code-quality' }),
      createEvaluation({ agent: 'architecture-fit' }),
      createEvaluation({ agent: 'practical-value' }),
    ];

    const result = aggregator.aggregate('test.ts', evaluations);

    expect(result.votes).toHaveLength(3);
    expect(result.votes.map((v) => v.agent).sort()).toEqual([
      'architecture-fit',
      'code-quality',
      'practical-value',
    ]);
  });

  it('should bound confidence between 0 and 1', () => {
    const aggregator = createAggregator();

    // Test with high confidence unanimous vote
    const highConf = [
      createEvaluation({ agent: 'code-quality', confidence: 1.0 }),
      createEvaluation({ agent: 'architecture-fit', confidence: 1.0 }),
      createEvaluation({ agent: 'practical-value', confidence: 1.0 }),
    ];
    const highResult = aggregator.aggregate('test.ts', highConf);
    expect(highResult.confidence).toBeLessThanOrEqual(1);
    expect(highResult.confidence).toBeGreaterThanOrEqual(0);

    // Test with low confidence disagreeing vote
    const lowConf = [
      createEvaluation({ agent: 'code-quality', confidence: 0.1, recommendation: 'retain' }),
      createEvaluation({ agent: 'architecture-fit', confidence: 0.1, recommendation: 'refactor' }),
      createEvaluation({ agent: 'practical-value', confidence: 0.1, recommendation: 'deprecate' }),
    ];
    const lowResult = aggregator.aggregate('utils/test.ts', lowConf);
    expect(lowResult.confidence).toBeLessThanOrEqual(1);
    expect(lowResult.confidence).toBeGreaterThanOrEqual(0);
  });
});
