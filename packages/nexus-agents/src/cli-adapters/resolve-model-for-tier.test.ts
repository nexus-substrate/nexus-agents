/**
 * Tests for tier→model resolution (#3394).
 */
import { describe, it, expect } from 'vitest';

import { resolveModelForTier, TIER_QUALITY_DIMENSION } from './resolve-model-for-tier.js';
import { findInTreeByCli, getDefaultModelForCli } from '../config/model-config-helpers.js';
import type { ModelCapability } from '../config/model-capabilities-types.js';

describe('resolveModelForTier (#3394)', () => {
  it('maps each tier to its quality dimension (table-driven)', () => {
    expect(TIER_QUALITY_DIMENSION).toEqual({
      powerful: 'reasoning',
      balanced: 'codeGeneration',
      fast: 'speed',
    });
  });

  it('picks the highest-reasoning claude model for the powerful tier', () => {
    // Mirror the documented tie-break: reasoning desc, then cheaper (higher
    // cost score) first, then lexicographic. Since #4176 claude-fable-5 and
    // claude-opus tie at reasoning 10; opus (cost 6 vs 4) wins as the cheaper.
    const rank = (m: ModelCapability): number =>
      (m.qualityScores?.reasoning ?? 0) * 100 + (m.qualityScores?.cost ?? 0);
    const best = findInTreeByCli('claude')
      .filter((m) => typeof m.qualityScores?.reasoning === 'number')
      .sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id))[0];
    expect(resolveModelForTier('claude', 'powerful')).toBe(best?.id);
    expect(resolveModelForTier('claude', 'powerful')).toBe('claude-opus');
  });

  it('pins the codex balanced tier to codex-5.2 (gpt-5.3-codex-spark) and fast to codex-5.1-mini (#5091)', () => {
    // Balanced ranks codeGeneration, where gpt-5.5, codex-5.3 and codex-5.2 tie
    // at 10; the tie-break prefers the higher `cost` score, so codex-5.2 (7)
    // wins over codex-5.3 (5) and gpt-5.5 (4). Before #5091 that winner named
    // a slug codex rejected (gpt-5.2-codex); it now names the served, smaller
    // gpt-5.3-codex-spark. The scores were carried over rather than measured,
    // so this pin exists to turn any rescore into a visible decision.
    expect(resolveModelForTier('codex', 'balanced')).toBe('codex-5.2');
    expect(resolveModelForTier('codex', 'fast')).toBe('codex-5.1-mini');
  });

  it('picks codex-5.3 for the codex powerful tier despite gpt-5.5 being the CLI default (#4176)', () => {
    // Deliberate tension, mirroring the claude pin above: gpt-5.5 and
    // codex-5.3 tie at reasoning 10, so the tier resolver's tie-break
    // (cheaper — higher cost score — first) picks codex-5.3 (cost 5 vs 4),
    // while DEFAULT_MODEL_PER_CLI.codex is the frontier gpt-5.5.
    expect(resolveModelForTier('codex', 'powerful')).toBe('codex-5.3');
    expect(getDefaultModelForCli('codex')).toBe('gpt-5.5');
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
