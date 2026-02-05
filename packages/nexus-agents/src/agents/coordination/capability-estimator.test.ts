/**
 * Tests for capability-estimator.ts
 *
 * Covers model capability estimation, fuzzy matching, ranking by
 * efficiency, saturation threshold, and model registration.
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
  it('returns capability for known model', () => {
    const cap = estimateModelCapability('claude-3-opus', 'parallelizable');
    expect(cap.modelId).toBe('claude-3-opus');
    expect(cap.estimatedAccuracy).toBeCloseTo(0.85);
    expect(cap.relativeCost).toBe(1.0);
    expect(cap.avgLatencyMs).toBe(5000);
  });

  it('applies positive adjustment for code generation', () => {
    const neutral = estimateModelCapability('claude-3-opus', 'parallelizable');
    const code = estimateModelCapability('claude-3-opus', 'code_generation');
    expect(code.estimatedAccuracy).toBeGreaterThan(neutral.estimatedAccuracy);
  });

  it('applies negative adjustment for web navigation', () => {
    const neutral = estimateModelCapability('claude-3-opus', 'parallelizable');
    const web = estimateModelCapability('claude-3-opus', 'web_navigation');
    expect(web.estimatedAccuracy).toBeLessThan(neutral.estimatedAccuracy);
  });

  it('clamps accuracy to [0, 1]', () => {
    // High-accuracy model + positive adjustment should not exceed 1.0
    const cap = estimateModelCapability('claude-opus-4', 'code_generation');
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
    // High-accuracy model should exceed threshold
    const high = estimateModelCapability('claude-3-opus', 'parallelizable');
    expect(high.exceedsSaturationThreshold).toBe(high.estimatedAccuracy > threshold);

    // Low-accuracy model might not
    const cap = estimateModelCapability('gpt-3.5-turbo', 'web_navigation');
    expect(cap.exceedsSaturationThreshold).toBe(cap.estimatedAccuracy > threshold);
  });

  it('handles fuzzy matching for versioned model IDs', () => {
    // claude-3-opus-20240229 should match claude-3-opus
    const cap = estimateModelCapability('claude-3-opus-20240229', 'parallelizable');
    expect(cap.estimatedAccuracy).toBeCloseTo(0.85);
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
    const best = findBestModel(['gpt-3.5-turbo', 'claude-3-opus'], 'parallelizable');
    expect(best).toBeDefined();
    expect(best?.modelId).toBe('claude-3-opus');
  });

  it('considers task type adjustments', () => {
    const best = findBestModel(['claude-3-opus', 'claude-opus-4'], 'code_generation');
    expect(best).toBeDefined();
    // claude-opus-4 has highest base accuracy (0.9) + code boost (0.05) = 0.95
    expect(best?.modelId).toBe('claude-opus-4');
  });

  it('works with single model', () => {
    const best = findBestModel(['gpt-4o'], 'parallelizable');
    expect(best?.modelId).toBe('gpt-4o');
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
      ['claude-3-opus', 'gpt-3.5-turbo', 'claude-3-haiku'],
      'parallelizable'
    );
    expect(ranked).toHaveLength(3);
    // Each entry should have higher or equal efficiency than the next
    for (let i = 0; i < ranked.length - 1; i++) {
      const current = ranked[i];
      const next = ranked[i + 1];
      if (current && next) {
        const effCurrent = current.estimatedAccuracy / Math.max(0.01, current.relativeCost);
        const effNext = next.estimatedAccuracy / Math.max(0.01, next.relativeCost);
        expect(effCurrent).toBeGreaterThanOrEqual(effNext);
      }
    }
  });

  it('cheap models with decent accuracy rank high', () => {
    const ranked = rankModelsByEfficiency(['claude-3-opus', 'claude-3-haiku'], 'parallelizable');
    // Haiku: 0.65/0.2 = 3.25 efficiency
    // Opus: 0.85/1.0 = 0.85 efficiency
    // Haiku should rank higher
    expect(ranked[0]?.modelId).toBe('claude-3-haiku');
  });
});

// ============================================================================
// exceedsSaturation
// ============================================================================

describe('exceedsSaturation', () => {
  it('returns true for high-accuracy models', () => {
    expect(exceedsSaturation('claude-3-opus', 'parallelizable')).toBe(true);
  });

  it('may return false for low-accuracy models on hard tasks', () => {
    // gpt-3.5-turbo base 0.55, web_navigation -0.15 = 0.40 < 0.45
    expect(exceedsSaturation('gpt-3.5-turbo', 'web_navigation')).toBe(false);
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

  it('includes known models', () => {
    const ids = getKnownModelIds();
    expect(ids).toContain('claude-3-opus');
    expect(ids).toContain('gpt-4o');
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
