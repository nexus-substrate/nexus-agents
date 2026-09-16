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
  gatewayCostDetail,
} from './budget-arm-cost.js';
import { estimateCost } from './budget-utils.js';
import {
  _resetGatewayCatalogs,
  getGatewayCatalog,
  setGatewayCatalog,
} from '../adapters/sdk/gateway-catalog.js';
import { getDefaultRegistry } from '../config/model-registry.js';
import { computeTokenCost } from '../learning/token-cost-core.js';
import { computeCostDetail, priceBasisOf } from '../learning/usage-log.js';

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

  it('names the missing model when bare priced has neither a catalogue nor NEXUS_CUSTOM_MODEL', () => {
    // Previously pinned "…but opencode has no registry pricing": the display
    // slot, which is not a model the gateway serves (#6404).
    expect(describeUnpricedArm('api:custom-openai', { NEXUS_GATEWAY_COST: 'priced' })).toBe(
      'gateway cost priced without a catalogue or model: declare priced:<in>,<out> or set NEXUS_CUSTOM_MODEL'
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

  it('is undefined (fail-CLOSED) when the arm has no catalogue — never the display slot rate', () => {
    // Previously pinned the display-slot rate (opencode's default model) for
    // a catalogue-less arm: a number that measured nothing about the gateway
    // (#6404). Undefined is what the ceiling filter excludes on.
    expect(getGatewayCatalog(ARM)).toBeUndefined();
    const slotPrice = estimateRegistryCostUsd('opencode', 1_000_000, 1_000_000);
    expect(slotPrice).toBeGreaterThan(0);
    expect(estimateArmCostUsd(ARM, 1_000_000, 1_000_000, PRICED)).toBeUndefined();
    // The differential: the same call with a catalogue prices the model.
    setGatewayCatalog(ARM, ['claude-haiku-4-5']);
    const priced = estimateArmCostUsd(ARM, 1_000_000, 1_000_000, PRICED);
    expect(priced).toBeDefined();
    expect(priced).not.toBe(slotPrice);
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

// =============================================================================
// #6404 — bare `priced` on mechanism A's `api:custom-openai`, which never gets
// a catalogue: price NEXUS_CUSTOM_MODEL (the model that arm dispatches to) or
// fail CLOSED. Never the display slot.
// =============================================================================

describe('bare priced on api:custom-openai without a catalogue (#6404)', () => {
  const ARM = 'api:custom-openai' as const;

  beforeEach(() => {
    _resetGatewayCatalogs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is undefined with no catalogue and no NEXUS_CUSTOM_MODEL — never the display slot rate', () => {
    expect(getGatewayCatalog(ARM)).toBeUndefined();
    expect(estimateRegistryCostUsd('opencode', 1_000_000, 1_000_000)).toBeGreaterThan(0);
    expect(
      estimateArmCostUsd(ARM, 1_000_000, 1_000_000, { NEXUS_GATEWAY_COST: 'priced' })
    ).toBeUndefined();
    // The default `env` argument reads process.env the same way.
    vi.stubEnv('NEXUS_GATEWAY_COST', 'priced');
    vi.stubEnv('NEXUS_CUSTOM_MODEL', undefined);
    expect(estimateArmCostUsd(ARM, 1_000_000, 1_000_000)).toBeUndefined();
  });

  it('prices the registry rate of NEXUS_CUSTOM_MODEL when it names a priced model', () => {
    const pricing = getDefaultRegistry().getEntry('gpt-4o').pricing;
    expect(pricing).toBeDefined();
    const expected = computeTokenCost(
      { input: 1_000_000, output: 1_000_000 },
      { inputPer1M: pricing?.inputPer1M ?? 0, outputPer1M: pricing?.outputPer1M ?? 0 }
    ).costUsd;
    expect(expected).toBeGreaterThan(0);
    // gpt-4o's rate differs from the display slot's, so the two paths cannot
    // agree by coincidence.
    expect(expected).not.toBe(estimateRegistryCostUsd('opencode', 1_000_000, 1_000_000));
    expect(
      estimateArmCostUsd(ARM, 1_000_000, 1_000_000, {
        NEXUS_GATEWAY_COST: 'priced',
        NEXUS_CUSTOM_MODEL: 'gpt-4o',
      })
    ).toBeCloseTo(expected, 9);
  });

  it('is undefined and names the model when NEXUS_CUSTOM_MODEL has no registry pricing', () => {
    const env = { NEXUS_GATEWAY_COST: 'priced', NEXUS_CUSTOM_MODEL: 'mystery-gateway-model' };
    expect(estimateArmCostUsd(ARM, 1_000, 1_000, env)).toBeUndefined();
    expect(describeUnpricedArm(ARM, env)).toBe(
      'gateway cost priced at registry rates, but mystery-gateway-model has no registry pricing'
    );
  });

  it('ranks an explicit modelId, then the catalogue, above NEXUS_CUSTOM_MODEL', () => {
    const env = { NEXUS_GATEWAY_COST: 'priced', NEXUS_CUSTOM_MODEL: 'gpt-4o' };
    const viaEnv = estimateArmCostUsd(ARM, 1_000_000, 1_000_000, env);
    const viaExplicit = estimateArmCostUsd(ARM, 1_000_000, 1_000_000, env, 'claude-haiku-4-5');
    expect(viaEnv).toBeDefined();
    expect(viaExplicit).toBeDefined();
    expect(viaExplicit).not.toBe(viaEnv);
  });

  it('does not let NEXUS_CUSTOM_MODEL price another gateway arm — it pins mechanism A only', () => {
    expect(
      estimateArmCostUsd('api:openai-compat', 1_000_000, 1_000_000, {
        NEXUS_GATEWAY_COST: 'priced',
        NEXUS_CUSTOM_MODEL: 'gpt-4o',
      })
    ).toBeUndefined();
    expect(
      describeUnpricedArm('api:openai-compat', {
        NEXUS_GATEWAY_COST: 'priced',
        NEXUS_CUSTOM_MODEL: 'gpt-4o',
      })
    ).toBe(
      'gateway cost priced without a catalogue or model: declare priced:<in>,<out> or set NEXUS_CUSTOM_MODEL'
    );
  });

  it('treats a blank NEXUS_CUSTOM_MODEL as unset', () => {
    expect(
      estimateArmCostUsd(ARM, 1_000, 1_000, {
        NEXUS_GATEWAY_COST: 'priced',
        NEXUS_CUSTOM_MODEL: '  ',
      })
    ).toBeUndefined();
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

// =============================================================================
// #4392 increment 2, step 4: the telemetry writers' cost detail for a gateway.
// A `claude-*` id served by an UNDECLARED gateway must record as UNKNOWN —
// never Anthropic's list price, never a measured $0.
// =============================================================================

describe('gatewayCostDetail (#4392 inc 2 step 4)', () => {
  const ARM = 'api:openai-compat' as const;
  // Priced in the registry, so the misreport is reachable: `computeCostDetail`
  // alone would report Anthropic's list price for a call the gateway served.
  const MODEL = 'claude-sonnet-4-6';

  beforeEach(() => {
    _resetGatewayCatalogs();
  });

  it('records UNKNOWN for an undeclared gateway — not the vendor list price, not a measured $0', () => {
    const listPrice = computeCostDetail(MODEL, 1_000, 200);
    expect(listPrice.priced).toBe(true);
    expect(listPrice.costUsd).toBeGreaterThan(0);

    const detail = gatewayCostDetail(ARM, MODEL, 1_000, 200, {});
    expect(detail).toEqual({ costUsd: 0, priced: false, resolvedId: MODEL });
    expect(priceBasisOf(detail)).toBe('unknown');
  });

  it.each(['unset', 'invalid', 'scoped-elsewhere'])(
    'treats every declaration gap (%s) as UNKNOWN',
    (gap) => {
      const env =
        gap === 'unset'
          ? {}
          : gap === 'invalid'
            ? { NEXUS_GATEWAY_COST: 'metered' }
            : { NEXUS_GATEWAY_COST: 'corp-proxy=free' };
      expect(gatewayCostDetail(ARM, MODEL, 1_000, 200, env).priced).toBe(false);
    }
  );

  it('is a MEASURED $0 for free and local, sourced to the arm', () => {
    for (const decl of ['free', 'local', 'openai-compat=free']) {
      const detail = gatewayCostDetail(ARM, MODEL, 1_000, 200, { NEXUS_GATEWAY_COST: decl });
      expect(detail).toEqual({ costUsd: 0, priced: true, resolvedId: ARM });
      expect(priceBasisOf(detail)).toBe('list');
    }
  });

  it('computes the flat rate for priced:<in>,<out>, rounded like the ledger', () => {
    const detail = gatewayCostDetail(ARM, MODEL, 1_000_000, 500_000, {
      NEXUS_GATEWAY_COST: 'priced:2,10',
    });
    expect(detail).toEqual({ costUsd: 7, priced: true, resolvedId: ARM });
    // Sub-micro-USD noise is rounded away (ledger requirement, not a cost one).
    const tiny = gatewayCostDetail(ARM, MODEL, 1, 1, { NEXUS_GATEWAY_COST: 'priced:0.3333333,0' });
    expect(tiny.costUsd).toBe(0);
    expect(tiny.priced).toBe(true);
  });

  it('defers bare priced to the registry entry of the MODEL that answered', () => {
    const detail = gatewayCostDetail(ARM, MODEL, 1_000, 200, { NEXUS_GATEWAY_COST: 'priced' });
    expect(detail).toEqual(computeCostDetail(MODEL, 1_000, 200));
    expect(detail.priced).toBe(true);
    // Bare priced on a model the registry cannot price stays UNKNOWN.
    const unpriced = gatewayCostDetail(ARM, 'mystery-model-xyz', 1_000, 200, {
      NEXUS_GATEWAY_COST: 'priced',
    });
    expect(unpriced.priced).toBe(false);
    expect(unpriced.costUsd).toBe(0);
  });

  it('is UNKNOWN for bare priced when the writer holds no model id (#6399), sourced to the arm', () => {
    // The routing observer records an arm and token counts, not the model
    // that answered. Nothing to look up, and the display slot is no substitute.
    const detail = gatewayCostDetail(ARM, undefined, 1_000, 200, { NEXUS_GATEWAY_COST: 'priced' });
    expect(detail).toEqual({ costUsd: 0, priced: false, resolvedId: ARM });
    expect(priceBasisOf(detail)).toBe('unknown');
    // A declared flat rate still prices without a model id.
    expect(
      gatewayCostDetail(ARM, undefined, 1_000_000, 500_000, { NEXUS_GATEWAY_COST: 'priced:2,10' })
    ).toEqual({ costUsd: 7, priced: true, resolvedId: ARM });
  });
});
