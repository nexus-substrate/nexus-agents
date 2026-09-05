/**
 * Tests for usage-log (#2469).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ModelRegistry,
  getDefaultRegistry,
  peekDefaultRegistry,
  setDefaultRegistry,
  type ModelEntry,
} from '../config/model-registry.js';
import {
  computeCostDetail,
  computeCostUSD,
  loadUsageEvents,
  priceBasisOf,
  recordUsageEvent,
  rollupByModel,
  type UsageEvent,
} from './usage-log.js';

function makeEvent(overrides: Partial<UsageEvent> = {}): UsageEvent {
  return {
    timestamp: '2026-05-09T12:00:00.000Z',
    modelId: 'claude-sonnet',
    providerId: 'anthropic',
    inputTokens: 1000,
    outputTokens: 500,
    usdCost: 0.01,
    latencyMs: 200,
    success: true,
    ...overrides,
  };
}

describe('computeCostUSD (#2469)', () => {
  it('computes cost from inputPer1M + outputPer1M for a known model', () => {
    // claude-sonnet-4 pricing (per source): input 3.0/1M, output 15.0/1M
    // 1000 input + 500 output = 3000 + 7500 = 10500 micro-USD = 0.0105
    const cost = computeCostUSD('claude-sonnet', 1000, 500);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.02); // sanity check
  });

  it('returns 0 for unknown model (no pricing data)', () => {
    expect(computeCostUSD('mystery-model', 1000, 500)).toBe(0);
  });

  it('returns 0 for zero token counts', () => {
    expect(computeCostUSD('claude-sonnet', 0, 0)).toBe(0);
  });

  it('scales linearly with token counts', () => {
    const cost1 = computeCostUSD('claude-sonnet', 1000, 500);
    const cost2 = computeCostUSD('claude-sonnet', 2000, 1000);
    // 2x tokens → 2x cost (within rounding)
    expect(cost2).toBeCloseTo(cost1 * 2, 6);
  });
});

describe('computeCostDetail (#4165)', () => {
  /** Canonical priced entry so the fuzzy tier (#4164) has something to match. */
  const opus48Canonical: ModelEntry = {
    id: 'claude-opus-4-8',
    vendor: 'anthropic',
    family: 'claude-opus',
    version: '4-8',
    displayName: 'Claude Opus 4.8',
    pricing: { inputPer1M: 5, outputPer1M: 25 },
    parallelToolCalls: true,
    promptCaching: 'ephemeral',
    toolDefinitionFormat: 'anthropic',
    maxRecommendedTurnBudget: 20,
    strictJson: true,
    quirks: [],
    profileId: 'claude-opus',
    source: 'in-tree',
  };

  describe('with an injected registry (deterministic pricing)', () => {
    let prevRegistry: ModelRegistry | undefined;

    beforeEach(() => {
      prevRegistry = peekDefaultRegistry();
      setDefaultRegistry(new ModelRegistry({ inTreeEntries: [opus48Canonical] }));
    });

    afterEach(() => {
      setDefaultRegistry(prevRegistry);
    });

    it('prices a decorated gateway id via the fuzzy tier with provenance', () => {
      // OpenAI-compatible gateways expose decorated model names; the #4164
      // resolution tier maps them to the canonical entry's pricing.
      const detail = computeCostDetail('Claude_Opus_4.8_hardened', 1000, 500);
      // 1000 * 5 + 500 * 25 = 17_500 micro-USD = 0.0175.
      expect(detail.costUsd).toBeCloseTo(0.0175, 9);
      expect(detail.priced).toBe(true);
      expect(detail.matchedVia).toBe('identity');
      expect(detail.resolvedId).toBe('claude-opus-4-8');
    });

    it('keeps the caller id as resolvedId for an exact (non-fuzzy) match', () => {
      const detail = computeCostDetail('claude-opus-4-8', 1000, 500);
      expect(detail.priced).toBe(true);
      expect(detail.resolvedId).toBe('claude-opus-4-8');
      expect(detail.matchedVia).toBeUndefined();
    });

    it('reports priced: false with costUsd 0 for an unknown model', () => {
      const detail = computeCostDetail('mystery-model-xyz', 1000, 500);
      expect(detail.costUsd).toBe(0);
      expect(detail.priced).toBe(false);
      expect(detail.resolvedId).toBe('mystery-model-xyz');
      expect(detail.matchedVia).toBeUndefined();
    });

    it('computeCostUSD is a thin wrapper returning .costUsd (priced and unpriced)', () => {
      expect(computeCostUSD('Claude_Opus_4.8_hardened', 1000, 500)).toBe(
        computeCostDetail('Claude_Opus_4.8_hardened', 1000, 500).costUsd
      );
      expect(computeCostUSD('mystery-model-xyz', 1000, 500)).toBe(
        computeCostDetail('mystery-model-xyz', 1000, 500).costUsd
      );
      expect(computeCostUSD('mystery-model-xyz', 1000, 500)).toBe(0);
    });
  });

  /**
   * Pick a `:free` catalogue id that exists right now, priced 0/0.
   *
   * Read from the registry rather than hardcoded so the weekly catalogue refresh
   * cannot turn an expired example into a false regression (#4417 / the refresh
   * in #4340 retired the id this test used to pin).
   */
  function findFirstFreeCatalogId(): string | undefined {
    return getDefaultRegistry()
      .allEntries()
      .find(
        (e) => e.id.endsWith(':free') && e.pricing?.inputPer1M === 0 && e.pricing.outputPer1M === 0
      )?.id;
  }

  describe('against the real default registry (full chain)', () => {
    it('prices a long-tail catalog id from the generated tier', () => {
      // 'amazon-bedrock/amazon.nova-micro-v1:0' has NO in-tree entry — its
      // pricing only exists in the generated (LiteLLM) catalog tier, which
      // the old lookupInTreeCapability path priced at $0.
      const detail = computeCostDetail('amazon-bedrock/amazon.nova-micro-v1:0', 1_000_000, 0);
      expect(detail.priced).toBe(true);
      expect(detail.costUsd).toBeGreaterThan(0);
      expect(computeCostUSD('amazon-bedrock/amazon.nova-micro-v1:0', 1_000_000, 0)).toBe(
        detail.costUsd
      );
    });

    it('reports a MEASURED $0 (priced: true) for a `:free` catalog id (#4209)', () => {
      // ':free'-suffixed openrouter entries are genuinely free: the generated
      // loader keeps their $0/$0 pricing (exempt from the #4176 placeholder
      // guard), so the full chain prices them at a real, measured $0 — not
      // priced:false/UNMEASURED (#3855/#4165 semantics).
      //
      // The id is chosen from the catalogue at run time rather than hardcoded.
      // This test previously pinned `openrouter/meta-llama/llama-3.3-70b-instruct:free`
      // and went red the moment the weekly refresh retired that SKU — the
      // invariant under test ("a :free entry prices at a measured $0") was
      // still true; only the example had expired. Binding a behavioural
      // assertion to a third-party SKU makes upstream churn look like a
      // regression in our code.
      const freeId = findFirstFreeCatalogId();
      expect(freeId, 'no `:free` entry in the generated catalogue to exercise').toBeDefined();

      const detail = computeCostDetail(freeId as string, 1_000_000, 500_000);

      expect(detail.priced).toBe(true);
      expect(detail.costUsd).toBe(0);
    });
  });
});

describe('recordUsageEvent + loadUsageEvents (#2469)', () => {
  let tmp: string;
  let originalDataDir: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'usage-log-test-'));
    originalDataDir = process.env['NEXUS_DATA_DIR'];
    process.env['NEXUS_DATA_DIR'] = tmp;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
  });

  it('appends a single event and reads it back', () => {
    recordUsageEvent(makeEvent({ modelId: 'gpt-4o', usdCost: 0.05 }));
    const { events } = loadUsageEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.modelId).toBe('gpt-4o');
    expect(events[0]?.usdCost).toBe(0.05);
  });

  it('appends multiple events to the same monthly log', () => {
    recordUsageEvent(makeEvent({ modelId: 'a', timestamp: '2026-05-01T00:00:00Z' }));
    recordUsageEvent(makeEvent({ modelId: 'b', timestamp: '2026-05-15T00:00:00Z' }));
    recordUsageEvent(makeEvent({ modelId: 'c', timestamp: '2026-05-30T00:00:00Z' }));
    const { events } = loadUsageEvents();
    expect(events).toHaveLength(3);
  });

  it('returns empty array when no log file exists', () => {
    expect(loadUsageEvents()).toEqual({ events: [], complete: true, readErrors: [] });
  });

  it('filters by since/until time window', () => {
    recordUsageEvent(makeEvent({ timestamp: '2026-05-01T00:00:00Z' }));
    recordUsageEvent(makeEvent({ timestamp: '2026-05-15T00:00:00Z' }));
    recordUsageEvent(makeEvent({ timestamp: '2026-05-30T00:00:00Z' }));
    const { events } = loadUsageEvents({
      sinceIso: '2026-05-10T00:00:00Z',
      untilIso: '2026-05-20T00:00:00Z',
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.timestamp).toBe('2026-05-15T00:00:00Z');
  });

  it('filters by modelId', () => {
    recordUsageEvent(makeEvent({ modelId: 'gpt-4o' }));
    recordUsageEvent(makeEvent({ modelId: 'claude-sonnet' }));
    recordUsageEvent(makeEvent({ modelId: 'gpt-4o' }));
    const { events } = loadUsageEvents({ modelId: 'gpt-4o' });
    expect(events).toHaveLength(2);
  });

  it('skips malformed JSONL lines without failing the load', () => {
    recordUsageEvent(makeEvent());
    // Append a bad line directly.
    const dir = join(tmp, 'usage');
    const files = fs.readdirSync(dir);
    if (files[0] !== undefined) {
      writeFileSync(join(dir, files[0]), 'NOT_JSON\n', { flag: 'a' });
    }
    recordUsageEvent(makeEvent({ modelId: 'second' }));
    const { events } = loadUsageEvents();
    // Should get the two good events; the bad line is silently skipped.
    expect(events.length).toBeGreaterThanOrEqual(2);
  });
});

describe('rollupByModel (#2469)', () => {
  it('aggregates per model, sorted by total cost desc', () => {
    const events: UsageEvent[] = [
      makeEvent({ modelId: 'a', usdCost: 0.5, success: true }),
      makeEvent({ modelId: 'a', usdCost: 0.3, success: false }),
      makeEvent({ modelId: 'b', usdCost: 1.5, success: true }),
      makeEvent({ modelId: 'c', usdCost: 0.1, success: true }),
    ];
    const rollups = rollupByModel(events);
    expect(rollups[0]?.modelId).toBe('b'); // highest spend
    expect(rollups[1]?.modelId).toBe('a');
    expect(rollups[2]?.modelId).toBe('c');
  });

  it('computes successRate', () => {
    const rollups = rollupByModel([
      makeEvent({ modelId: 'a', success: true }),
      makeEvent({ modelId: 'a', success: true }),
      makeEvent({ modelId: 'a', success: false }),
      makeEvent({ modelId: 'a', success: false }),
    ]);
    expect(rollups[0]?.successRate).toBe(0.5);
  });

  it('computes costPerSuccess', () => {
    const rollups = rollupByModel([
      makeEvent({ modelId: 'a', success: true, usdCost: 0.1 }),
      makeEvent({ modelId: 'a', success: false, usdCost: 0.2 }),
      makeEvent({ modelId: 'a', success: true, usdCost: 0.1 }),
    ]);
    // total $0.4, 2 successes → $0.20 per success
    expect(rollups[0]?.costPerSuccessUsd).toBeCloseTo(0.2, 4);
  });

  it('reports no cost-per-success when there are no successes', () => {
    const rollups = rollupByModel([
      makeEvent({ modelId: 'a', success: false, usdCost: 0.1 }),
      makeEvent({ modelId: 'a', success: false, usdCost: 0.2 }),
    ]);
    expect(rollups[0]?.successRate).toBe(0);
    expect(rollups[0]?.costPerSuccessUsd).toBeNull();
  });

  it('returns empty array for no events', () => {
    expect(rollupByModel([])).toEqual([]);
  });

  it('counts explicitly unpriced calls', () => {
    const rollups = rollupByModel([makeEvent({ priced: false, usdCost: 0 })]);

    expect(rollups[0]?.unpricedCallCount).toBe(1);
  });

  it('treats legacy events without priced as priced', () => {
    const rollups = rollupByModel([makeEvent()]);

    expect(rollups[0]?.unpricedCallCount).toBe(0);
  });

  it('aggregates token counts', () => {
    const rollups = rollupByModel([
      makeEvent({ modelId: 'a', inputTokens: 100, outputTokens: 50 }),
      makeEvent({ modelId: 'a', inputTokens: 200, outputTokens: 75 }),
    ]);
    expect(rollups[0]?.totalInputTokens).toBe(300);
    expect(rollups[0]?.totalOutputTokens).toBe(125);
  });
});

describe('priceBasisOf (#4406 — the recorded figure carries its provenance)', () => {
  /**
   * Repointed by the #4406 review. The original pair of cases asserted
   * `detail.priced === true` and then `priceBasisOf(detail) === 'list'` — the
   * function body restated, so they could only fail if the two-branch mapping
   * were inverted. These drive a REAL pricing path end to end instead: the
   * operator manifest overlay (registry precedence tier 1, the highest) puts a
   * distinctive rate into the chain, and the assertions pin the dollar figure
   * that rate produces as well as the basis reported for it.
   */
  it('reports an operator-overridden rate as list — the known over-claim (#4406)', async () => {
    const { mkdtempSync: mkTmp, writeFileSync: write, rmSync: rm } = await import('node:fs');
    const dir = mkTmp(join(tmpdir(), 'usage-log-basis-overlay-'));
    const manifestPath = join(dir, 'models-manifest.yaml');
    // 3 USD / 1M input, 15 USD / 1M output — deliberately not any in-tree rate,
    // so the cost below can only come from THIS overlay.
    write(
      manifestPath,
      `version: 1
models:
  - id: negotiated-gateway-model
    vendor: anthropic
    family: claude-sonnet
    pricing:
      inputPer1M: 3
      outputPer1M: 15
`,
      'utf-8'
    );
    const previous = process.env['NEXUS_MODELS_OVERLAY_PATH'];
    process.env['NEXUS_MODELS_OVERLAY_PATH'] = manifestPath;
    setDefaultRegistry(undefined);
    try {
      const detail = computeCostDetail('negotiated-gateway-model', 1_000_000, 1_000_000);
      // The overlay rate actually reached the cost chain: 3 + 15 = 18 USD.
      expect(detail.costUsd).toBe(18);
      expect(detail.priced).toBe(true);
      // ...and is STILL labelled 'list'. The manifest overlay is precisely the
      // mechanism an operator uses to state a negotiated rate, so this label is
      // an over-claim in the conservative direction — the caveat warns a reader
      // their contract may differ over a number that already is their contract.
      // Pinned deliberately: PriceBasis has no 'contract' member to report.
      expect(priceBasisOf(detail)).toBe('list');
    } finally {
      if (previous === undefined) delete process.env['NEXUS_MODELS_OVERLAY_PATH'];
      else process.env['NEXUS_MODELS_OVERLAY_PATH'] = previous;
      setDefaultRegistry(undefined);
      rm(dir, { recursive: true, force: true });
    }
  });

  it('reports a model the registry priced from in-tree data as list', () => {
    // Second real path: no overlay, straight in-tree lookup. Cross-checked
    // against the registry entry the chain actually resolved, so an entry that
    // silently loses its pricing fails here rather than passing as 'unknown'.
    const entry = getDefaultRegistry().getEntry('claude-sonnet');
    expect(entry.pricing).toBeDefined();
    const detail = computeCostDetail('claude-sonnet', 1_000_000, 0);
    expect(detail.costUsd).toBeCloseTo(entry.pricing?.inputPer1M ?? -1, 6);
    expect(priceBasisOf(detail)).toBe('list');
  });

  it('reports a model absent from every registry tier as unknown', () => {
    const detail = computeCostDetail('definitely-not-a-real-model-xyz', 1000, 200);
    expect(detail.priced).toBe(false);
    expect(detail.costUsd).toBe(0);
    expect(priceBasisOf(detail)).toBe('unknown');
  });

  it('does NOT restate the basis as a stored field on CostDetail (#4406 judgement)', () => {
    // `priced` already carries exactly the two-state distinction the CURRENT
    // union can express, so a `priceBasis` property beside it would be a second
    // spelling of the same boolean. The basis is DERIVED once and carried by
    // the downstream records that do not persist `priced`. The derivation is an
    // assumption about the chain, not a fact about it (see `priceBasisOf`); if
    // PriceBasis ever gains a member the chain can actually distinguish, this
    // pin should be revisited deliberately, not silently.
    const detail = computeCostDetail('claude-sonnet', 10, 10);
    expect(Object.keys(detail)).not.toContain('priceBasis');
  });
});

describe('computeCostDetail characterization — pinned before the #5122 refactor', () => {
  // Captured from the CURRENT implementation before it became a wrapper over
  // the shared core. The panel made shadow-comparison a binding condition:
  // swapping live pricing paths without asserting agreement first "risks
  // unpredictable budget enforcement failures upon merge". Every value here is
  // observed output, not a hand-computed expectation.
  const PINNED: readonly {
    model: string;
    input: number;
    output: number;
    costUsd: number;
    priced: boolean;
  }[] = [
    { model: 'claude-sonnet', input: 1_000_000, output: 1_000_000, costUsd: 18, priced: true },
    // The micro-USD round-up. 1 token at $3/1M is exactly 0.000003 here.
    { model: 'claude-sonnet', input: 1, output: 0, costUsd: 0.000003, priced: true },
    { model: 'claude-opus', input: 1000, output: 500, costUsd: 0.0175, priced: true },
    { model: 'claude-sonnet', input: 0, output: 0, costUsd: 0, priced: true },
    // Unpriced: 0 with priced:false is an UNKNOWN, never a real $0 (#3855).
    {
      model: 'definitely-not-a-real-model-xyz',
      input: 1000,
      output: 500,
      costUsd: 0,
      priced: false,
    },
    { model: 'gpt-5.5', input: 12345, output: 6789, costUsd: 0.265395, priced: true },
    // FRACTIONAL RATES — the cases where rounding actually changes the answer.
    // Without these the round-to-micro-USD step could be deleted and every test
    // still passed: at $3/1M a single token is exactly 3 micro-USD, so rounding
    // is a no-op there. Found by mutation testing.
    // codex-5.2 at $1.75/1M: exact 0.00000175 → 0.000002.
    { model: 'codex-5.2', input: 1, output: 0, costUsd: 0.000002, priced: true },
    // gemini-3-flash at $0.5/1M: exact 0.0000015 → 0.000002 (half rounds up).
    { model: 'gemini-3-flash', input: 3, output: 0, costUsd: 0.000002, priced: true },
    // gemini-flash at $0.3/1M: exact 3e-7 rounds DOWN TO ZERO. A real cost
    // recorded as $0 — distinguishable from unpriced only by `priced: true`.
    { model: 'gemini-flash', input: 1, output: 0, costUsd: 0, priced: true },
  ];

  it.each(PINNED)(
    'computeCostDetail($model, $input, $output) stays $costUsd (priced=$priced)',
    ({ model, input, output, costUsd, priced }) => {
      const detail = computeCostDetail(model, input, output);
      expect(detail.costUsd).toBe(costUsd);
      expect(detail.priced).toBe(priced);
    }
  );

  it('keeps rounding to micro-USD, which the shared core deliberately does not do', () => {
    // Uses a FRACTIONAL rate so the assertion can actually fail if rounding is
    // removed. codex-5.2 is $1.75/1M, so one token is 0.00000175 exactly and
    // 0.000002 rounded. Asserting against claude-sonnet here proved nothing.
    expect(computeCostDetail('codex-5.2', 1, 0).costUsd).toBe(0.000002);
  });
});
