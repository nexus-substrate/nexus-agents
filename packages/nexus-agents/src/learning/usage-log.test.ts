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
  peekDefaultRegistry,
  setDefaultRegistry,
  type ModelEntry,
} from '../config/model-registry.js';
import {
  computeCostDetail,
  computeCostUSD,
  loadUsageEvents,
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
      const detail = computeCostDetail(
        'openrouter/meta-llama/llama-3.3-70b-instruct:free',
        1_000_000,
        500_000
      );
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
    const events = loadUsageEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.modelId).toBe('gpt-4o');
    expect(events[0]?.usdCost).toBe(0.05);
  });

  it('appends multiple events to the same monthly log', () => {
    recordUsageEvent(makeEvent({ modelId: 'a', timestamp: '2026-05-01T00:00:00Z' }));
    recordUsageEvent(makeEvent({ modelId: 'b', timestamp: '2026-05-15T00:00:00Z' }));
    recordUsageEvent(makeEvent({ modelId: 'c', timestamp: '2026-05-30T00:00:00Z' }));
    const events = loadUsageEvents();
    expect(events).toHaveLength(3);
  });

  it('returns empty array when no log file exists', () => {
    const events = loadUsageEvents();
    expect(events).toEqual([]);
  });

  it('filters by since/until time window', () => {
    recordUsageEvent(makeEvent({ timestamp: '2026-05-01T00:00:00Z' }));
    recordUsageEvent(makeEvent({ timestamp: '2026-05-15T00:00:00Z' }));
    recordUsageEvent(makeEvent({ timestamp: '2026-05-30T00:00:00Z' }));
    const events = loadUsageEvents({
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
    const events = loadUsageEvents({ modelId: 'gpt-4o' });
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
    const events = loadUsageEvents();
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

  it('handles all-failure case (cost-per-success defaults to total cost)', () => {
    const rollups = rollupByModel([
      makeEvent({ modelId: 'a', success: false, usdCost: 0.1 }),
      makeEvent({ modelId: 'a', success: false, usdCost: 0.2 }),
    ]);
    expect(rollups[0]?.successRate).toBe(0);
    expect(rollups[0]?.costPerSuccessUsd).toBeCloseTo(0.3, 4);
  });

  it('returns empty array for no events', () => {
    expect(rollupByModel([])).toEqual([]);
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
