/**
 * Tests for tier→model resolution (#3394).
 */
import { describe, it, expect } from 'vitest';

import { resolveModelForTier, TIER_QUALITY_DIMENSION } from './resolve-model-for-tier.js';
import { findInTreeByCli, getDefaultModelForCli } from '../config/model-config-helpers.js';

describe('resolveModelForTier (#3394)', () => {
  it('maps each tier to its quality dimension (table-driven)', () => {
    expect(TIER_QUALITY_DIMENSION).toEqual({
      powerful: 'reasoning',
      balanced: 'codeGeneration',
      fast: 'speed',
    });
  });

  it('picks the highest-reasoning claude model for the powerful tier', () => {
    const claudeModels = findInTreeByCli('claude');
    const best = claudeModels
      .filter((m) => typeof m.qualityScores?.reasoning === 'number')
      .sort((a, b) => (b.qualityScores?.reasoning ?? 0) - (a.qualityScores?.reasoning ?? 0))[0];
    expect(resolveModelForTier('claude', 'powerful')).toBe(best?.id);
  });

  it('picks the highest-speed model for the fast tier', () => {
    const models = findInTreeByCli('claude');
    const best = models
      .filter((m) => typeof m.qualityScores?.speed === 'number')
      .sort((a, b) => (b.qualityScores?.speed ?? 0) - (a.qualityScores?.speed ?? 0))[0];
    expect(resolveModelForTier('claude', 'fast')).toBe(best?.id);
  });

  it('returns the CLI default when no candidate is in the live set', () => {
    // No registry model id is in this live set → registry-only filter empties →
    // fall back to the CLI default.
    const result = resolveModelForTier('claude', 'powerful', {
      liveModelIds: new Set(['some/unrelated-model']),
    });
    expect(result).toBe(getDefaultModelForCli('claude'));
  });

  it('honours the live set when it contains a real model', () => {
    const models = findInTreeByCli('claude');
    const someId = models[0]?.id ?? '';
    const result = resolveModelForTier('claude', 'powerful', {
      liveModelIds: new Set([someId]),
    });
    // Only one model is live → it must be the result.
    expect(result).toBe(someId);
  });

  it('is deterministic across calls', () => {
    expect(resolveModelForTier('gemini', 'balanced')).toBe(
      resolveModelForTier('gemini', 'balanced')
    );
  });
});
