/**
 * Tests for weather bonus routing stage (Issue #1389).
 *
 * @module cli-adapters/weather-bonus-stage.test
 */

import { describe, it, expect, vi } from 'vitest';
import { convertBonusesToScoreMap, getWeatherBonusScores } from './weather-bonus-stage.js';
import type { AdaptiveBonus } from '../mcp/tools/weather-report-types.js';

vi.mock('../mcp/tools/weather-report.js', () => ({
  generateWeatherReport: vi.fn(() => ({
    adaptiveBonuses: [
      {
        cli: 'claude',
        category: 'code_generation',
        staticBonus: 0.1,
        adaptiveBonus: 0.15,
        sampleCount: 20,
        sufficient: true,
      },
      {
        cli: 'gemini',
        category: 'code_generation',
        staticBonus: 0.05,
        adaptiveBonus: -0.08,
        sampleCount: 15,
        sufficient: true,
      },
      {
        cli: 'codex',
        category: 'code_generation',
        staticBonus: 0,
        adaptiveBonus: 0.2,
        sampleCount: 3,
        sufficient: false,
      },
      {
        cli: 'claude',
        category: 'research',
        staticBonus: 0.1,
        adaptiveBonus: 0.1,
        sampleCount: 10,
        sufficient: true,
      },
    ],
    cliEntries: [],
    categoryEntries: [],
    tierRecommendations: [],
  })),
}));

// ============================================================================
// convertBonusesToScoreMap (pure function)
// ============================================================================

describe('convertBonusesToScoreMap', () => {
  const bonuses: readonly AdaptiveBonus[] = [
    {
      cli: 'claude',
      category: 'code_generation',
      staticBonus: 0.1,
      adaptiveBonus: 0.15,
      sampleCount: 20,
      sufficient: true,
    },
    {
      cli: 'gemini',
      category: 'code_generation',
      staticBonus: 0.05,
      adaptiveBonus: -0.08,
      sampleCount: 15,
      sufficient: true,
    },
    {
      cli: 'codex',
      category: 'code_generation',
      staticBonus: 0,
      adaptiveBonus: 0.2,
      sampleCount: 3,
      sufficient: false,
    },
    {
      cli: 'opencode',
      category: 'code_generation',
      staticBonus: 0,
      adaptiveBonus: 0,
      sampleCount: 30,
      sufficient: true,
    },
    {
      cli: 'claude',
      category: 'research',
      staticBonus: 0.1,
      adaptiveBonus: 0.1,
      sampleCount: 10,
      sufficient: true,
    },
  ];

  it('returns scores for matching category', () => {
    const scores = convertBonusesToScoreMap(bonuses, 'code_generation');
    expect(scores.get('claude')).toBe(0.15);
    expect(scores.get('gemini')).toBe(-0.08);
  });

  it('filters out low sample count entries', () => {
    const scores = convertBonusesToScoreMap(bonuses, 'code_generation');
    expect(scores.has('codex')).toBe(false);
  });

  it('filters out zero bonus entries', () => {
    const scores = convertBonusesToScoreMap(bonuses, 'code_generation');
    expect(scores.has('opencode')).toBe(false);
  });

  it('filters by category', () => {
    const scores = convertBonusesToScoreMap(bonuses, 'research');
    expect(scores.size).toBe(1);
    expect(scores.get('claude')).toBe(0.1);
  });

  it('returns empty map for unknown category', () => {
    const scores = convertBonusesToScoreMap(bonuses, 'devops');
    expect(scores.size).toBe(0);
  });

  it('returns empty map for empty bonuses', () => {
    const scores = convertBonusesToScoreMap([], 'code_generation');
    expect(scores.size).toBe(0);
  });
});

// ============================================================================
// getWeatherBonusScores (integration)
// ============================================================================

describe('getWeatherBonusScores', () => {
  it('loads weather report and returns scores', () => {
    const result = getWeatherBonusScores('code_generation');
    expect(result.scores.get('claude')).toBe(0.15);
    expect(result.scores.get('gemini')).toBe(-0.08);
    expect(result.measured).toBe(true);
  });

  // #5329: this used to assert only `scores.size === 0`, which is ALSO what a
  // healthy report with no qualifying bonuses returns. The test therefore
  // pinned the conflation: a read that failed and a read that found nothing
  // were the same value, and the router ranked on the second while the first
  // had happened.
  it('reports a failed read as unmeasured, not as an empty result', async () => {
    const mod = await import('../mcp/tools/weather-report.js');
    vi.mocked(mod.generateWeatherReport).mockImplementationOnce(() => {
      throw new Error('No outcome data');
    });
    const result = getWeatherBonusScores('code_generation');
    expect(result.scores.size).toBe(0);
    expect(result.measured).toBe(false);
  });

  it('distinguishes a healthy report with no qualifying bonuses', () => {
    const result = getWeatherBonusScores('documentation');
    expect(result.scores.size).toBe(0);
    // Nothing failed — the category simply has no bonuses above the sample
    // floor. This is the value the failed read used to be indistinguishable from.
    expect(result.measured).toBe(true);
  });
});
