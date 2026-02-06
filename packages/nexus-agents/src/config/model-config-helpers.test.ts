/**
 * Tests for Model Config Helpers
 *
 * @module config/model-config-helpers.test
 * (Source: Issue #807 - Centralized Model Registry)
 */

import { describe, it, expect } from 'vitest';
import {
  getModelPricing,
  getModelDisplayName,
  getModelContextWindow,
  getModelMaxOutput,
  getModelQualityScores,
  getDefaultModelForCli,
  getCliModelName,
  resolveCliAlias,
  buildCapabilityProfiles,
  buildCliCapabilityProfiles,
  buildTopsisProfiles,
  buildMockModelInfo,
} from './model-config-helpers.js';

// ============================================================================
// Single-Model Lookups
// ============================================================================

describe('getModelPricing', () => {
  it('returns pricing for known model', () => {
    const pricing = getModelPricing('claude-sonnet');
    expect(pricing).toBeDefined();
    expect(pricing?.inputPer1M).toBeGreaterThan(0);
    expect(pricing?.outputPer1M).toBeGreaterThan(0);
  });

  it('returns undefined for unknown model', () => {
    // Cast to bypass type restriction for testing edge case
    const pricing = getModelPricing('nonexistent-model' as 'claude-sonnet');
    expect(pricing).toBeUndefined();
  });
});

describe('getModelDisplayName', () => {
  it('returns display name for known model', () => {
    const name = getModelDisplayName('claude-sonnet');
    expect(name).toBeTruthy();
    expect(name).not.toBe('claude-sonnet'); // Should be a friendly name
  });

  it('falls back to modelId for unknown model', () => {
    const name = getModelDisplayName('nonexistent' as 'claude-sonnet');
    expect(name).toBe('nonexistent');
  });
});

describe('getModelContextWindow', () => {
  it('returns context window for known model', () => {
    const ctx = getModelContextWindow('claude-sonnet');
    expect(ctx).toBeGreaterThan(0);
  });

  it('returns default 200k for unknown model', () => {
    const ctx = getModelContextWindow('nonexistent' as 'claude-sonnet');
    expect(ctx).toBe(200_000);
  });
});

describe('getModelMaxOutput', () => {
  it('returns max output for known model', () => {
    const max = getModelMaxOutput('claude-sonnet');
    expect(max).toBeDefined();
    expect(max).toBeGreaterThan(0);
  });

  it('returns undefined for unknown model', () => {
    const max = getModelMaxOutput('nonexistent' as 'claude-sonnet');
    expect(max).toBeUndefined();
  });
});

describe('getModelQualityScores', () => {
  it('returns quality scores for known model', () => {
    const scores = getModelQualityScores('claude-sonnet');
    expect(scores).toBeDefined();
    expect(scores?.reasoning).toBeGreaterThan(0);
    expect(scores?.codeGeneration).toBeGreaterThan(0);
    expect(scores?.speed).toBeGreaterThan(0);
    expect(scores?.cost).toBeGreaterThan(0);
  });
});

describe('getDefaultModelForCli', () => {
  it('returns default model for claude', () => {
    const model = getDefaultModelForCli('claude');
    expect(model).toBeTruthy();
    expect(model).toContain('claude');
  });

  it('returns default model for gemini', () => {
    const model = getDefaultModelForCli('gemini');
    expect(model).toBeTruthy();
  });

  it('returns default model for codex', () => {
    const model = getDefaultModelForCli('codex');
    expect(model).toBeTruthy();
  });
});

describe('getCliModelName', () => {
  it('returns CLI model name for known model', () => {
    const name = getCliModelName('claude-sonnet');
    expect(name).toBeTruthy();
  });

  it('falls back to modelId for unknown model', () => {
    const name = getCliModelName('unknown' as 'claude-sonnet');
    expect(name).toBe('unknown');
  });
});

describe('resolveCliAlias', () => {
  it('resolves model ID to itself', () => {
    const resolved = resolveCliAlias('claude-sonnet');
    expect(resolved).toBe('claude-sonnet');
  });

  it('returns undefined for unknown alias', () => {
    const resolved = resolveCliAlias('totally-fake');
    expect(resolved).toBeUndefined();
  });
});

// ============================================================================
// Bulk Builders
// ============================================================================

describe('buildCapabilityProfiles', () => {
  it('returns profiles keyed by ModelId', () => {
    const profiles = buildCapabilityProfiles();
    expect(Object.keys(profiles).length).toBeGreaterThan(0);

    const first = Object.values(profiles)[0];
    expect(first).toBeDefined();
    expect(first).toHaveProperty('reasoning');
    expect(first).toHaveProperty('contextWindow');
    expect(first).toHaveProperty('codeGeneration');
    expect(first).toHaveProperty('speed');
    expect(first).toHaveProperty('cost');
  });

  it('includes claude-sonnet profile', () => {
    const profiles = buildCapabilityProfiles();
    expect(profiles['claude-sonnet']).toBeDefined();
  });
});

describe('buildCliCapabilityProfiles', () => {
  it('returns profiles for all three CLIs', () => {
    const profiles = buildCliCapabilityProfiles();
    expect(profiles.claude).toBeDefined();
    expect(profiles.gemini).toBeDefined();
    expect(profiles.codex).toBeDefined();
  });

  it('has valid capability values', () => {
    const profiles = buildCliCapabilityProfiles();
    for (const profile of Object.values(profiles)) {
      expect(profile.reasoning).toBeGreaterThan(0);
      expect(profile.contextWindow).toBeGreaterThan(0);
      expect(profile.speed).toBeGreaterThan(0);
    }
  });
});

describe('buildTopsisProfiles', () => {
  it('returns profiles for all three CLIs', () => {
    const profiles = buildTopsisProfiles();
    expect(profiles.length).toBe(3);
  });

  it('has valid TOPSIS profile structure', () => {
    const profiles = buildTopsisProfiles();
    for (const profile of profiles) {
      expect(profile.cliName).toBeTruthy();
      expect(profile.capabilities.reasoning).toBeGreaterThan(0);
      expect(profile.costPerMillionInput).toBeGreaterThanOrEqual(0);
      expect(profile.costPerMillionOutput).toBeGreaterThanOrEqual(0);
      expect(profile.averageLatencyMs).toBeGreaterThan(0);
      expect(profile.qualityScore).toBeGreaterThan(0);
    }
  });

  it('quality score is average of reasoning and code generation', () => {
    const profiles = buildTopsisProfiles();
    for (const profile of profiles) {
      const expected = (profile.capabilities.reasoning + profile.capabilities.codeGeneration) / 2;
      expect(profile.qualityScore).toBeCloseTo(expected);
    }
  });
});

describe('buildMockModelInfo', () => {
  it('returns info for all three CLIs', () => {
    const info = buildMockModelInfo();
    expect(info.claude).toBeDefined();
    expect(info.gemini).toBeDefined();
    expect(info.codex).toBeDefined();
  });

  it('has valid model info structure', () => {
    const info = buildMockModelInfo();
    for (const model of Object.values(info)) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.contextWindow).toBeGreaterThan(0);
    }
  });
});
