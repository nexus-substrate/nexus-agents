/**
 * Tests for registry-derived tier / rank / strength tables (#4195).
 *
 * Pins the four BINDING vote conditions and the deterministic derived
 * orderings that the five routing consumers depend on.
 */
import { describe, it, expect } from 'vitest';

import type { CliNameLiteral } from '../config/model-capabilities-types.js';
import {
  readCliModelData,
  buildQualityRank,
  buildCostRank,
  buildTierToClis,
  buildPremiumClis,
  deriveCliQualityRank,
  deriveCliCostRank,
  deriveTierToClis,
  deriveStrongClis,
  deriveWeakClis,
  deriveCliConfidenceProfiles,
  normalizeBlendedPrice,
  EXPENSIVE_SENTINEL,
  type CliModelData,
} from './derive-tier-tables.js';

type Data = Record<CliNameLiteral, CliModelData>;

/** Synthetic cohort with knobs for the fail-safe conditions. */
function makeData(over: Partial<Record<CliNameLiteral, Partial<CliModelData>>> = {}): Data {
  const base: Data = {
    claude: { quality: 10, price: 60, speed: 5 },
    gemini: { quality: 9.5, price: 14, speed: 8 },
    codex: { quality: 10, price: 35, speed: 7 },
    opencode: { quality: 9, price: 18, speed: 7 },
  };
  for (const cli of Object.keys(over) as CliNameLiteral[]) {
    base[cli] = { ...base[cli], ...over[cli] };
  }
  return base;
}

describe('derive-tier-tables (#4195)', () => {
  describe('readCliModelData — from the live registry', () => {
    it('reads composite quality + blended real price for each CLI default', () => {
      const data = readCliModelData();
      // claude default (fable-5) r10/cg10 → composite 10; priced 10+50=60.
      expect(data.claude.quality).toBe(10);
      expect(data.claude.price).toBe(60);
      // gemini default (gemini-3-pro) r10/cg9 → 9.5; 2+12=14.
      expect(data.gemini.quality).toBe(9.5);
      expect(data.gemini.price).toBe(14);
    });
  });

  // --- Condition 1: no qualityScores → conservative, NEVER powerful ---------
  describe('condition 1 — missing qualityScores fails SAFE', () => {
    it('excludes an unscored CLI from the powerful tier entirely', () => {
      const data = makeData({ codex: { quality: undefined } });
      expect(buildTierToClis(data).powerful).not.toContain('codex');
    });

    it('never lets an unscored CLI head the powerful tier', () => {
      // Even if the unscored CLI is the most expensive, it must not be powerful.
      const data = makeData({ claude: { quality: undefined, price: 999 } });
      expect(buildTierToClis(data).powerful).not.toContain('claude');
    });

    it('gives an unscored CLI the lowest (zero) quality rank', () => {
      const data = makeData({ opencode: { quality: undefined } });
      expect(buildQualityRank(data).opencode).toBe(0);
    });

    it('excludes an unscored CLI from the premium (strong) set', () => {
      const data = makeData({ claude: { quality: undefined } });
      expect(buildPremiumClis(data)).not.toContain('claude');
    });
  });

  // --- Condition 2: empty powerful tier must not up-cost --------------------
  describe('condition 2 — degenerate cohort does not synthesise a powerful pick', () => {
    it('yields an EMPTY powerful tier when no CLI is scored (never a frontier default)', () => {
      const data = makeData({
        claude: { quality: undefined },
        gemini: { quality: undefined },
        codex: { quality: undefined },
        opencode: { quality: undefined },
      });
      expect(buildTierToClis(data).powerful).toEqual([]);
      // Fast/balanced still cover every CLI so routing degrades conservative.
      expect(buildTierToClis(data).fast).toHaveLength(4);
    });
  });

  // --- Condition 3: $0 default cannot win the cost rank ---------------------
  describe('condition 3 — $0/$0 pricing cannot look "cheapest"', () => {
    it('normalises a $0 (or negative) blended price to the most-expensive sentinel', () => {
      expect(normalizeBlendedPrice(0)).toBe(EXPENSIVE_SENTINEL);
      expect(normalizeBlendedPrice(-5)).toBe(EXPENSIVE_SENTINEL);
      expect(normalizeBlendedPrice(14)).toBe(14);
    });

    it('ranks a $0-priced default LOWEST on cost, never highest', () => {
      const data = makeData({ opencode: { price: EXPENSIVE_SENTINEL } });
      const rank = buildCostRank(data);
      const cheapest = (Object.keys(rank) as CliNameLiteral[]).sort((a, b) => rank[b] - rank[a])[0];
      expect(cheapest).not.toBe('opencode');
      expect(rank.opencode).toBeLessThanOrEqual(rank.claude);
    });

    it('keeps a $0 default out of the premium set', () => {
      const data = makeData({ claude: { price: EXPENSIVE_SENTINEL } });
      expect(buildPremiumClis(data)).not.toContain('claude');
    });
  });

  // --- Condition 4: deterministic, stably tie-broken ordering ---------------
  describe('condition 4 — deterministic ordering', () => {
    it('is byte-stable across repeated derivations', () => {
      expect(deriveTierToClis()).toEqual(deriveTierToClis());
      expect(deriveCliQualityRank()).toEqual(deriveCliQualityRank());
      expect(deriveCliCostRank()).toEqual(deriveCliCostRank());
    });

    it('breaks quality ties by premium price (claude before codex)', () => {
      // claude & codex both composite 10; claude is pricier → heads powerful.
      const powerful = buildTierToClis(makeData()).powerful;
      expect(powerful.indexOf('claude')).toBeLessThan(powerful.indexOf('codex'));
    });
  });

  // --- Derived orderings the consumers pin ----------------------------------
  describe('derived tier orderings (live registry)', () => {
    it('fast tier leads with gemini (fastest/cheapest default)', () => {
      expect(deriveTierToClis().fast[0]).toBe('gemini');
    });
    it('balanced tier leads with codex (best quality/cost blend)', () => {
      expect(deriveTierToClis().balanced[0]).toBe('codex');
    });
    it('powerful tier leads with claude (strongest premium default)', () => {
      expect(deriveTierToClis().powerful[0]).toBe('claude');
    });
    it('powerful pick is one of the frontier CLIs', () => {
      expect(['claude', 'codex']).toContain(deriveTierToClis().powerful[0]);
    });
  });

  describe('quality / cost ranks (resource-strategy)', () => {
    it('ranks claude above gemini on quality', () => {
      const q = deriveCliQualityRank();
      expect(q.claude).toBeGreaterThan(q.gemini);
    });
    it('ranks gemini above claude on cost efficiency', () => {
      const c = deriveCliCostRank();
      expect(c.gemini).toBeGreaterThan(c.claude);
    });
    it('keeps the cheapest cost rank high enough for a critical boost (>1.875)', () => {
      // critical boost = costRank * (8/3); the resource stage asserts >5.
      expect(deriveCliCostRank().gemini).toBeGreaterThan(1.875);
    });
  });

  describe('confidence profiles', () => {
    it('gemini has the highest simpleScore (fastest)', () => {
      const p = deriveCliConfidenceProfiles();
      const best = (Object.keys(p) as CliNameLiteral[]).sort(
        (a, b) => p[b].simpleScore - p[a].simpleScore
      )[0];
      expect(best).toBe('gemini');
    });
    it('claude has a top complexScore (strongest quality)', () => {
      const p = deriveCliConfidenceProfiles();
      const max = Math.max(...(Object.keys(p) as CliNameLiteral[]).map((c) => p[c].complexScore));
      expect(p.claude.complexScore).toBeCloseTo(max);
    });
  });

  describe('premium (strong) / budget (weak) partition', () => {
    it('marks the most-expensive frontier default as the sole strong CLI', () => {
      expect(deriveStrongClis()).toEqual(['claude']);
    });
    it('places the cheaper CLIs in the weak set', () => {
      const weak = deriveWeakClis();
      expect(weak).toContain('gemini');
      expect(weak).toContain('codex');
      expect(weak).not.toContain('claude');
    });
  });
});
