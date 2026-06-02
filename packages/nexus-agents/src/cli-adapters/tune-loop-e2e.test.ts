/**
 * End-to-end + floor-safety tests for the self-tuning loop (#3323, epic #3143).
 *
 * The per-component pieces are unit-tested elsewhere (TuneStage write,
 * TuneAdjustmentStore bounds, getTuneAdjustmentScores penalty math). These tests
 * close two exit-criteria for enabling the loop by default:
 *
 *  1. **Integration** — a `signal.swarm_unhealthy` emitted through the TuneStage
 *     (the producer-consumer path) flows through the SHARED TuneAdjustmentStore
 *     into `CompositeRouter.route()` and measurably changes which CLI is
 *     selected — proving the loop affects real routing, not just the unit pieces.
 *  2. **Floor-safety / never-starve** — a CLI driven to the demotion floor that
 *     is the ONLY viable candidate is still selected. The bounded penalty must
 *     never exclude, zero, or NaN-out the sole option.
 *
 * LinUCB is disabled so the deterministic stage scores (which include the tune
 * penalty) decide the winner — the loop's effect is what we assert, not bandit
 * exploration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CompositeRouter } from './composite-router.js';
import type { ICliAdapter, CliTask, CliName } from './types.js';
import { getTuneAdjustmentStore, resetTuneAdjustmentStore } from '../core/index.js';
import { EventBus } from '../pipeline/event-bus.js';
import { createTuneStage } from '../pipeline/tune-stage.js';
import type { PipelineEvent } from '../pipeline/event-types.js';

function createMockAdapter(name: CliName): ICliAdapter {
  return {
    name,
    transport: 'subprocess',
    capabilities: { reasoning: 8, contextWindow: 200000, codeGeneration: 8, speed: 8, cost: 5 },
    execute: vi.fn().mockResolvedValue({ ok: true, value: { text: 'mock' } }),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, version: '1.0.0' }),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getCapacity: vi.fn().mockResolvedValue({ remainingTokens: 100000 }),
    getModelInfo: vi.fn().mockReturnValue({ id: name, name }),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as ICliAdapter;
}

/** Router with LinUCB disabled → deterministic stage-score selection. */
function deterministicRouter(names: CliName[]): CompositeRouter {
  const adapters = new Map<CliName, ICliAdapter>();
  for (const n of names) adapters.set(n, createMockAdapter(n));
  return new CompositeRouter(adapters, { enableLinUCBSelection: false });
}

const TASK: CliTask = { content: 'Help me write a function' };

describe('self-tuning loop end-to-end (#3323)', () => {
  beforeEach(() => {
    resetTuneAdjustmentStore();
    process.env['NEXUS_TUNE_ENFORCE'] = 'true';
  });
  afterEach(() => {
    resetTuneAdjustmentStore();
    delete process.env['NEXUS_TUNE_ENFORCE'];
  });

  it('a swarm_unhealthy signal through the TuneStage changes the routed CLI', async () => {
    const router = deterministicRouter(['claude', 'gemini', 'codex']);

    const baseline = await router.route(TASK);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const winner = baseline.value.cliName;

    // Drive the loop the real way: emit signal.swarm_unhealthy for the winning
    // CLI through the (enabled) TuneStage, which demotes the shared store.
    const bus = new EventBus();
    createTuneStage(bus, { enabled: true });
    for (let i = 0; i < 8; i++) {
      bus.emit({
        type: 'signal.swarm_unhealthy',
        timestamp: i,
        agentId: winner,
        reason: 'repeated failures',
      } satisfies PipelineEvent);
    }
    // The shared store now reflects a (floored) demotion for the winner.
    expect(getTuneAdjustmentStore().effectiveMultiplier(winner)).toBeLessThan(1.0);

    const afterDemotion = await router.route(TASK);
    expect(afterDemotion.ok).toBe(true);
    if (!afterDemotion.ok) return;
    // The loop changed routing: the demoted CLI is no longer selected.
    expect(afterDemotion.value.cliName).not.toBe(winner);
  });

  it('does NOT change routing when enforce is off (shadow) even after signals', async () => {
    delete process.env['NEXUS_TUNE_ENFORCE']; // shadow
    const router = deterministicRouter(['claude', 'gemini', 'codex']);
    const baseline = await router.route(TASK);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const winner = baseline.value.cliName;

    // Even directly demoting the store has no routing effect while shadow.
    for (let i = 0; i < 8; i++) getTuneAdjustmentStore().demote(winner, 0.2, 'unhealthy');

    const after = await router.route(TASK);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value.cliName).toBe(winner); // unchanged — enforce gates the read
  });
});

describe('floor-safety / never-starve (#3323)', () => {
  beforeEach(() => {
    resetTuneAdjustmentStore();
    process.env['NEXUS_TUNE_ENFORCE'] = 'true';
  });
  afterEach(() => {
    resetTuneAdjustmentStore();
    delete process.env['NEXUS_TUNE_ENFORCE'];
  });

  it('still selects a sole candidate driven to the demotion floor', async () => {
    const router = deterministicRouter(['claude']);
    const store = getTuneAdjustmentStore();
    // Drive well past the floor — the store clamps at TUNE_DEMOTION_FLOOR (0.5).
    for (let i = 0; i < 20; i++) store.demote('claude', 0.2, 'sustained failures');
    expect(store.effectiveMultiplier('claude')).toBeGreaterThanOrEqual(0.5);

    const result = await router.route(TASK);
    // Bounded penalty must never exclude / zero the only option.
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.cliName).toBe('claude');
  });

  it('keeps the demotion bounded — multiplier never below the floor', () => {
    const store = getTuneAdjustmentStore();
    for (let i = 0; i < 50; i++) store.demote('gemini', 0.2, 'sustained');
    expect(store.effectiveMultiplier('gemini')).toBeGreaterThanOrEqual(0.5);
  });
});
