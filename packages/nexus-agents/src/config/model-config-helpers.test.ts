/**
 * Tests for Model Config Helpers
 *
 * @module config/model-config-helpers.test
 * (Source: Issue #807 - Centralized Model Registry)
 */

import { describe, it, expect } from 'vitest';
import { CLI_NAMES } from './model-capabilities-types.js';
import {
  getModelPricing,
  getModelDisplayName,
  getModelContextWindow,
  getModelMaxOutput,
  getModelQualityScores,
  getDefaultModelForCli,
  getCliModelName,
  resolveCliAlias,
  findCanonicalModel,
  buildModelInfo,
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

  it('returns fail-closed 8k default for unknown model (#2177)', () => {
    // Previously returned a silent 200_000 — masked routing-critical
    // metadata for unknown models. CapabilityDiscovery now resolves
    // unknown ids at T4 with a conservative 8 K default + structured warn.
    const ctx = getModelContextWindow('nonexistent' as 'claude-sonnet');
    expect(ctx).toBe(8_192);
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

  // #2199 Child 5: aliases field migration. Legacy version-suffix names
  // resolve via the registry's `aliases` array, so adapter files don't need
  // to maintain their own LEGACY_CLAUDE_ALIASES lookups.
  it('resolves claude-opus-4 legacy alias to claude-opus via registry aliases', () => {
    expect(resolveCliAlias('claude-opus-4')).toBe('claude-opus');
  });

  it('resolves claude-sonnet-4 legacy alias to claude-sonnet via registry aliases', () => {
    expect(resolveCliAlias('claude-sonnet-4')).toBe('claude-sonnet');
  });

  it('resolves claude-haiku-4 legacy alias to claude-haiku via registry aliases', () => {
    expect(resolveCliAlias('claude-haiku-4')).toBe('claude-haiku');
  });

  it('resolves claude-haiku-3 legacy alias to claude-haiku (pre-4.x compat)', () => {
    expect(resolveCliAlias('claude-haiku-3')).toBe('claude-haiku');
  });
});

// ============================================================================
// CLI-Model Lookups (Issue #886)
// ============================================================================

describe('findCanonicalModel', () => {
  it('finds codex model by cliModelName', () => {
    const model = findCanonicalModel('codex', 'gpt-5.4');
    expect(model).toBeDefined();
    expect(model?.id).toBe('codex-5.3');
  });

  it('finds gemini model by cliModelName', () => {
    const model = findCanonicalModel('gemini', 'gemini-2.5-flash');
    expect(model).toBeDefined();
    expect(model?.id).toBe('gemini-flash');
  });

  it('finds claude model by cliAlias', () => {
    const model = findCanonicalModel('claude', 'opus');
    expect(model).toBeDefined();
    expect(model?.id).toBe('claude-opus');
  });

  it('returns undefined for unknown model', () => {
    expect(findCanonicalModel('codex', 'nonexistent')).toBeUndefined();
  });

  it('returns undefined when cli does not match', () => {
    // 'o3' is a codex model, not gemini
    expect(findCanonicalModel('gemini', 'o3')).toBeUndefined();
  });
});

describe('buildModelInfo', () => {
  it('builds model info for codex model', () => {
    const info = buildModelInfo('codex', 'gpt-5.4');
    expect(info).toBeDefined();
    expect(info?.id).toBe('gpt-5.4');
    expect(info?.name).toBe('GPT-5.4');
    expect(info?.contextWindow).toBe(1_000_000);
    expect(info?.maxOutput).toBe(128_000);
    expect(info?.costPerMillionInput).toBe(2.5);
    expect(info?.costPerMillionOutput).toBe(15.0);
  });

  it('builds model info for gemini model', () => {
    const info = buildModelInfo('gemini', 'gemini-2.5-flash');
    expect(info).toBeDefined();
    expect(info?.id).toBe('gemini-2.5-flash');
    expect(info?.name).toBe('Gemini 2.5 Flash');
    expect(info?.contextWindow).toBe(1_000_000);
  });

  it('builds model info for claude model via cliAlias', () => {
    const info = buildModelInfo('claude', 'opus');
    expect(info).toBeDefined();
    expect(info?.id).toBe('opus');
    expect(info?.name).toBe('Claude Opus 4.6');
    expect(info?.contextWindow).toBe(1_000_000);
    expect(info?.maxOutput).toBe(128_000);
  });

  it('returns undefined for unknown model', () => {
    expect(buildModelInfo('codex', 'nonexistent')).toBeUndefined();
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
  it('returns profiles for all CLIs', () => {
    const profiles = buildCliCapabilityProfiles();
    for (const cli of CLI_NAMES) {
      expect(profiles[cli]).toBeDefined();
    }
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
  it('returns profiles for all CLIs', () => {
    const profiles = buildTopsisProfiles();
    expect(profiles.length).toBe(CLI_NAMES.length);
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
  it('returns info for all CLIs', () => {
    const info = buildMockModelInfo();
    for (const cli of CLI_NAMES) {
      expect(info[cli]).toBeDefined();
    }
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
