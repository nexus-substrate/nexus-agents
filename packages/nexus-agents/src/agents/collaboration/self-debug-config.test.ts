/**
 * Tests for Self-Debug Protocol Configuration
 *
 * @module agents/collaboration/self-debug-config.test
 */

import { describe, it, expect } from 'vitest';
import { getDefaultConfig, mergeConfig } from './self-debug-config.js';

// ============================================================================
// getDefaultConfig
// ============================================================================

describe('getDefaultConfig', () => {
  it('returns maxIterations of 5', () => {
    expect(getDefaultConfig().maxIterations).toBe(5);
  });

  it('returns iterationTimeoutMs of 60000', () => {
    expect(getDefaultConfig().iterationTimeoutMs).toBe(60000);
  });

  it('returns stopOnFirstError as true', () => {
    expect(getDefaultConfig().stopOnFirstError).toBe(true);
  });

  it('returns includeExplanation as true', () => {
    expect(getDefaultConfig().includeExplanation).toBe(true);
  });

  it('returns allowSyntheticErrors as false', () => {
    expect(getDefaultConfig().allowSyntheticErrors).toBe(false);
  });

  it('includes default error patterns', () => {
    expect(getDefaultConfig().errorPatterns.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// mergeConfig
// ============================================================================

describe('mergeConfig', () => {
  it('returns defaults when config is undefined', () => {
    const result = mergeConfig(undefined);
    expect(result).toEqual(getDefaultConfig());
  });

  it('overrides maxIterations', () => {
    const result = mergeConfig({ maxIterations: 10 });
    expect(result.maxIterations).toBe(10);
    expect(result.iterationTimeoutMs).toBe(60000); // default preserved
  });

  it('overrides iterationTimeoutMs', () => {
    const result = mergeConfig({ iterationTimeoutMs: 30000 });
    expect(result.iterationTimeoutMs).toBe(30000);
  });

  it('overrides stopOnFirstError', () => {
    const result = mergeConfig({ stopOnFirstError: false });
    expect(result.stopOnFirstError).toBe(false);
  });

  it('overrides includeExplanation', () => {
    const result = mergeConfig({ includeExplanation: false });
    expect(result.includeExplanation).toBe(false);
  });

  it('overrides allowSyntheticErrors', () => {
    const result = mergeConfig({ allowSyntheticErrors: true });
    expect(result.allowSyntheticErrors).toBe(true);
  });

  it('preserves defaults for unset fields', () => {
    const result = mergeConfig({ maxIterations: 3 });
    expect(result.stopOnFirstError).toBe(true);
    expect(result.includeExplanation).toBe(true);
    expect(result.allowSyntheticErrors).toBe(false);
  });

  it('overrides error patterns', () => {
    const customPatterns = [
      { pattern: /custom/, category: 'custom' as const, severity: 'error' as const },
    ];
    const result = mergeConfig({ errorPatterns: customPatterns });
    expect(result.errorPatterns).toHaveLength(1);
  });
});
