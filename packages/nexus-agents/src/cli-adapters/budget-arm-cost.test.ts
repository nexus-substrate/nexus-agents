/**
 * Tests for the per-task budget arm estimator (#6393).
 *
 * `estimateArmCostUsd` (the ceiling estimator, #4392 inc 2) is covered next
 * to its consumer in `budget-router.test.ts`; this file covers the two
 * policies of `estimateBudgetArmCostUsd` and the reason text.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { describeUnpricedArm, estimateBudgetArmCostUsd } from './budget-arm-cost.js';
import { estimateCost } from './budget-utils.js';

describe('estimateBudgetArmCostUsd (#6393)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is undefined for an UNDECLARED gateway arm — never the display slot rate', () => {
    vi.stubEnv('NEXUS_GATEWAY_COST', undefined);
    expect(estimateBudgetArmCostUsd('api:custom-openai', 1_000, 1_000)).toBeUndefined();
  });

  it('is $0 for a gateway declared free, and the flat rate for priced:<in>,<out>', () => {
    expect(
      estimateBudgetArmCostUsd('api:custom-openai', 1_000, 1_000, { NEXUS_GATEWAY_COST: 'free' })
    ).toBe(0);
    expect(
      estimateBudgetArmCostUsd('api:custom-openai', 1_000_000, 1_000_000, {
        NEXUS_GATEWAY_COST: 'priced:2,10',
      })
    ).toBeCloseTo(12, 6);
  });

  it.each(['claude', 'gemini', 'codex', 'opencode', 'api:google', 'api:openai'] as const)(
    'keeps the conservative estimateCost number for non-gateway arm %s',
    (arm) => {
      vi.stubEnv('NEXUS_GATEWAY_COST', 'free');
      const slot = arm === 'api:google' ? 'gemini' : arm === 'api:openai' ? 'codex' : arm;
      const expected = estimateCost(slot, 1_000, 1_000);
      expect(expected).toBeGreaterThan(0);
      expect(estimateBudgetArmCostUsd(arm, 1_000, 1_000)).toBe(expected);
    }
  );
});

describe('describeUnpricedArm (#6393)', () => {
  it('names the declaration gap', () => {
    expect(describeUnpricedArm('api:custom-openai', {})).toBe('gateway cost unset');
    expect(describeUnpricedArm('api:custom-openai', { NEXUS_GATEWAY_COST: 'metered' })).toMatch(
      /^gateway cost invalid \(/
    );
    expect(
      describeUnpricedArm('api:custom-openai', { NEXUS_GATEWAY_COST: 'corp-proxy=free' })
    ).toMatch(/^gateway cost undeclared for api:custom-openai/);
  });

  it('names the missing registry price when the declaration defers to the registry', () => {
    expect(describeUnpricedArm('api:custom-openai', { NEXUS_GATEWAY_COST: 'priced' })).toBe(
      'gateway cost priced at registry rates, but opencode has no registry pricing'
    );
  });
});
