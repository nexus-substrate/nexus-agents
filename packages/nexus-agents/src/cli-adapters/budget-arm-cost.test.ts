/**
 * Tests for the per-task budget arm estimator (#6393).
 *
 * `estimateArmCostUsd` (the ceiling estimator, #4392 inc 2) is covered next
 * to its consumer in `budget-router.test.ts`; this file covers the two
 * policies of `estimateBudgetArmCostUsd` and the reason text.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  describeUnpricedArm,
  estimateArmCostUsd,
  estimateBudgetArmCostUsd,
  estimateRegistryCostUsd,
} from './budget-arm-cost.js';
import { estimateCost } from './budget-utils.js';
import {
  _resetGatewayCatalogs,
  getGatewayCatalog,
  setGatewayCatalog,
} from '../adapters/sdk/gateway-catalog.js';
import { getDefaultRegistry } from '../config/model-registry.js';
import { computeTokenCost } from '../learning/token-cost-core.js';

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

// =============================================================================
// #4392 increment 2 step 2 — per-model pricing for bare `priced` through the
// gateway catalogue (`adapters/sdk/gateway-catalog.ts`).
// =============================================================================

describe('estimateArmCostUsd with a gateway catalogue (#4392 inc 2 step 2)', () => {
  const ARM = 'api:openai-compat' as const;
  const PRICED = { NEXUS_GATEWAY_COST: 'priced' };

  beforeEach(() => {
    _resetGatewayCatalogs();
  });

  it('prices bare priced at the FIRST catalogue model, not the display slot', () => {
    // A priced in-tree id is what the gateway lists first. Haiku, because its
    // rate differs from the display slot's (opencode-default prices as Sonnet),
    // so the two paths cannot agree by coincidence.
    setGatewayCatalog(ARM, ['claude-haiku-4-5', 'gpt-4o']);
    const pricing = getDefaultRegistry().getEntry('claude-haiku-4-5').pricing;
    expect(pricing).toBeDefined();
    const expected = computeTokenCost(
      { input: 1_000_000, output: 1_000_000 },
      { inputPer1M: pricing?.inputPer1M ?? 0, outputPer1M: pricing?.outputPer1M ?? 0 }
    ).costUsd;
    expect(expected).toBeGreaterThan(0);
    const slotPrice = estimateRegistryCostUsd('opencode', 1_000_000, 1_000_000);
    expect(expected).not.toBe(slotPrice);
    expect(estimateArmCostUsd(ARM, 1_000_000, 1_000_000, PRICED)).toBeCloseTo(expected, 9);
  });

  it('prices an explicit modelId over the catalogue head', () => {
    setGatewayCatalog(ARM, ['claude-sonnet-4-6', 'claude-haiku-4-5']);
    const withHead = estimateArmCostUsd(ARM, 1_000_000, 1_000_000, PRICED);
    const withExplicit = estimateArmCostUsd(ARM, 1_000_000, 1_000_000, PRICED, 'claude-haiku-4-5');
    expect(withHead).toBeDefined();
    expect(withExplicit).toBeDefined();
    expect(withExplicit).not.toBe(withHead);
  });

  it('is undefined (fail-CLOSED) when the catalogue model has no registry pricing', () => {
    setGatewayCatalog(ARM, ['totally-unknown-gateway-model-xyz']);
    expect(estimateArmCostUsd(ARM, 1_000, 1_000, PRICED)).toBeUndefined();
    expect(
      estimateArmCostUsd(ARM, 1_000, 1_000, PRICED, 'totally-unknown-gateway-model-xyz')
    ).toBeUndefined();
  });

  it('keeps the display-slot path when the arm has no catalogue', () => {
    expect(getGatewayCatalog(ARM)).toBeUndefined();
    const slotPrice = estimateRegistryCostUsd('opencode', 1_000_000, 1_000_000);
    expect(slotPrice).toBeGreaterThan(0);
    expect(estimateArmCostUsd(ARM, 1_000_000, 1_000_000, PRICED)).toBe(slotPrice);
    // The differential: the same call with a catalogue leaves the slot rate.
    setGatewayCatalog(ARM, ['claude-haiku-4-5']);
    expect(estimateArmCostUsd(ARM, 1_000_000, 1_000_000, PRICED)).not.toBe(slotPrice);
  });

  it('still fails closed on UNDECLARED and prices free/flat regardless of the catalogue', () => {
    setGatewayCatalog(ARM, ['claude-sonnet-4-6']);
    expect(estimateArmCostUsd(ARM, 1_000, 1_000, {})).toBeUndefined();
    expect(estimateArmCostUsd(ARM, 1_000, 1_000, { NEXUS_GATEWAY_COST: 'free' })).toBe(0);
    expect(
      estimateArmCostUsd(ARM, 1_000_000, 1_000_000, { NEXUS_GATEWAY_COST: 'priced:2,10' })
    ).toBeCloseTo(12, 6);
  });

  it('names the unpriced MODEL in the reason when a catalogue is present', () => {
    setGatewayCatalog(ARM, ['totally-unknown-gateway-model-xyz']);
    expect(describeUnpricedArm(ARM, PRICED)).toBe(
      'gateway cost priced at registry rates, but totally-unknown-gateway-model-xyz has no registry pricing'
    );
    expect(describeUnpricedArm(ARM, PRICED, 'other-model')).toBe(
      'gateway cost priced at registry rates, but other-model has no registry pricing'
    );
  });
});

describe('gateway catalogue store (#4392 inc 2 step 2)', () => {
  beforeEach(() => {
    _resetGatewayCatalogs();
  });

  it('round-trips per arm and refuses an empty catalogue', () => {
    setGatewayCatalog('api:openai-compat', ['a', 'b']);
    setGatewayCatalog('api:corp-proxy', ['c']);
    expect(getGatewayCatalog('api:openai-compat')).toEqual(['a', 'b']);
    expect(getGatewayCatalog('api:corp-proxy')).toEqual(['c']);
    // Named empty case: an empty catalogue is not a catalogue.
    expect(() => {
      setGatewayCatalog('api:openai-compat', []);
    }).toThrow(/empty/);
    expect(getGatewayCatalog('api:openai-compat')).toEqual(['a', 'b']);
  });
});
