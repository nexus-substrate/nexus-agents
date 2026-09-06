/**
 * Tests for capability-estimator.ts
 *
 * Covers model capability estimation, fuzzy matching, ranking by
 * efficiency, saturation threshold, and model registration.
 *
 * Canonical models are derived from config/in-tree-data.ts (#1149).
 */

import { describe, it, expect } from 'vitest';
import {
  estimateModelCapability,
  findBestModel,
  rankModelsByEfficiency,
  exceedsSaturation,
  getSaturationThreshold,
  getKnownModelIds,
  registerModelCapability,
} from './capability-estimator.js';

// ============================================================================
// estimateModelCapability
// ============================================================================

describe('estimateModelCapability', () => {
  it('returns capability for canonical model', () => {
    const cap = estimateModelCapability('claude-opus', 'parallelizable');
    expect(cap.modelId).toBe('claude-opus');
    // claude-opus: reasoning=10, codeGeneration=9, avg=9.5, /10 = 0.95
    expect(cap.estimatedAccuracy).toBeCloseTo(0.95);
    expect(cap.relativeCost).toBeGreaterThan(0);
    expect(cap.avgLatencyMs).toBeGreaterThan(0);
  });

  it('applies positive adjustment for code generation', () => {
    const neutral = estimateModelCapability('claude-opus', 'parallelizable');
    const code = estimateModelCapability('claude-opus', 'code_generation');
    expect(code.estimatedAccuracy).toBeGreaterThan(neutral.estimatedAccuracy);
  });

  it('applies negative adjustment for web navigation', () => {
    const neutral = estimateModelCapability('claude-opus', 'parallelizable');
    const web = estimateModelCapability('claude-opus', 'web_navigation');
    expect(web.estimatedAccuracy).toBeLessThan(neutral.estimatedAccuracy);
  });

  it('clamps accuracy to [0, 1]', () => {
    // High-accuracy model + positive adjustment should not exceed 1.0
    const cap = estimateModelCapability('claude-opus', 'code_generation');
    expect(cap.estimatedAccuracy).toBeLessThanOrEqual(1.0);
    expect(cap.estimatedAccuracy).toBeGreaterThanOrEqual(0);
  });

  it('returns default capability for unknown model', () => {
    const cap = estimateModelCapability('totally-unknown-model-xyz', 'parallelizable');
    expect(cap.estimatedAccuracy).toBeCloseTo(0.5);
    expect(cap.relativeCost).toBe(0.5);
    expect(cap.avgLatencyMs).toBe(2000);
  });

  it('sets exceedsSaturationThreshold correctly', () => {
    const threshold = getSaturationThreshold();
    // High-accuracy canonical model should exceed threshold
    const high = estimateModelCapability('claude-opus', 'parallelizable');
    expect(high.exceedsSaturationThreshold).toBe(high.estimatedAccuracy > threshold);

    // Low-accuracy open-source model on hard task might not
    const cap = estimateModelCapability('mixtral-8x7b', 'web_navigation');
    // 0.62 - 0.15 = 0.47 > 0.45 — just barely above
    expect(cap.exceedsSaturationThreshold).toBe(cap.estimatedAccuracy > threshold);
  });

  it('handles fuzzy matching for versioned model IDs', () => {
    // claude-opus should be findable even with extra suffix
    const cap = estimateModelCapability('claude-opus-extra-version', 'parallelizable');
    expect(cap.estimatedAccuracy).toBeCloseTo(0.95);
  });

  it('resolves canonical models by cliModelName', () => {
    // 'gpt-5.6-terra' is cliModelName for codex-5.3
    const cap = estimateModelCapability('gpt-5.6-terra', 'parallelizable');
    // codex-5.3: reasoning=10, codeGeneration=10, avg=10, /10 = 1.0
    expect(cap.estimatedAccuracy).toBeCloseTo(1.0);
  });
});

// ============================================================================
// findBestModel
// ============================================================================

describe('findBestModel', () => {
  it('returns undefined for empty list', () => {
    const best = findBestModel([], 'parallelizable');
    expect(best).toBeUndefined();
  });

  it('returns the model with highest accuracy', () => {
    const best = findBestModel(['claude-haiku', 'claude-opus'], 'parallelizable');
    expect(best).toBeDefined();
    expect(best?.modelId).toBe('claude-opus');
  });

  it('considers task type adjustments', () => {
    const best = findBestModel(['claude-sonnet', 'codex-5.3'], 'code_generation');
    expect(best).toBeDefined();
    // codex-5.3 has codeGeneration=10, reasoning=10, avg=1.0 + code boost
    expect(best?.modelId).toBe('codex-5.3');
  });

  it('works with single model', () => {
    const best = findBestModel(['gemini-pro'], 'parallelizable');
    expect(best?.modelId).toBe('gemini-pro');
  });
});

// ============================================================================
// rankModelsByEfficiency
// ============================================================================

describe('rankModelsByEfficiency', () => {
  it('returns empty array for empty input', () => {
    const ranked = rankModelsByEfficiency([], 'parallelizable');
    expect(ranked).toEqual([]);
  });

  it('ranks by accuracy/cost ratio', () => {
    const ranked = rankModelsByEfficiency(
      ['claude-opus', 'claude-haiku', 'gemini-flash'],
      'parallelizable'
    );
    expect(ranked).toHaveLength(3);
    // Each entry should have higher or equal efficiency than the next
    for (let i = 0; i < ranked.length - 1; i++) {
      const current = ranked[i];
      const next = ranked[i + 1];
      if (current !== undefined && next !== undefined) {
        const effCurrent = current.estimatedAccuracy / Math.max(0.01, current.relativeCost);
        const effNext = next.estimatedAccuracy / Math.max(0.01, next.relativeCost);
        expect(effCurrent).toBeGreaterThanOrEqual(effNext);
      }
    }
  });

  it('cost-effective models with decent accuracy rank high', () => {
    const ranked = rankModelsByEfficiency(['claude-opus', 'claude-haiku'], 'parallelizable');
    // Haiku has higher cost score (9) = lower relativeCost, decent accuracy
    // Opus has lower cost score (6) = higher relativeCost, highest accuracy
    // Haiku efficiency: ~0.7/0.1 = 7.0 vs Opus: ~0.95/0.4 = 2.375
    expect(ranked[0]?.modelId).toBe('claude-haiku');
  });
});

// ============================================================================
// exceedsSaturation
// ============================================================================

describe('exceedsSaturation', () => {
  it('returns true for high-accuracy canonical models', () => {
    expect(exceedsSaturation('claude-opus', 'parallelizable')).toBe(true);
  });

  it('returns true for most canonical models on neutral tasks', () => {
    // All our canonical models have quality scores ≥ 7, so avg ≥ 0.7 > 0.45
    expect(exceedsSaturation('claude-haiku', 'parallelizable')).toBe(true);
  });
});

// ============================================================================
// getSaturationThreshold / getKnownModelIds
// ============================================================================

describe('getSaturationThreshold', () => {
  it('returns the saturation threshold value', () => {
    const threshold = getSaturationThreshold();
    expect(threshold).toBe(0.45);
  });
});

describe('getKnownModelIds', () => {
  it('returns non-empty list of model IDs', () => {
    const ids = getKnownModelIds();
    expect(ids.length).toBeGreaterThan(0);
  });

  it('includes canonical models', () => {
    const ids = getKnownModelIds();
    expect(ids).toContain('claude-opus');
    expect(ids).toContain('claude-sonnet');
    expect(ids).toContain('gemini-pro');
  });

  it('includes open-source models', () => {
    const ids = getKnownModelIds();
    expect(ids).toContain('llama-3.1-405b');
    expect(ids).toContain('mixtral-8x7b');
  });
});

// ============================================================================
// registerModelCapability
// ============================================================================

describe('registerModelCapability', () => {
  it('registers a new model capability', () => {
    registerModelCapability('test-model-for-test', {
      estimatedAccuracy: 0.99,
      relativeCost: 0.01,
      avgLatencyMs: 100,
    });
    const cap = estimateModelCapability('test-model-for-test', 'parallelizable');
    expect(cap.estimatedAccuracy).toBeCloseTo(0.99);
    expect(cap.relativeCost).toBe(0.01);
    expect(cap.avgLatencyMs).toBe(100);
  });

  it('merges partial capability with existing defaults', () => {
    registerModelCapability('test-partial-model', {
      estimatedAccuracy: 0.8,
    });
    const cap = estimateModelCapability('test-partial-model', 'parallelizable');
    expect(cap.estimatedAccuracy).toBeCloseTo(0.8);
    // Cost and latency should come from defaults
    expect(cap.relativeCost).toBeGreaterThan(0);
  });
});
