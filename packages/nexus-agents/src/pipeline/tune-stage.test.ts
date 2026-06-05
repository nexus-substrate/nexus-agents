/**
 * Tests for the shadow-mode TuneStage (#3147, epic #3143 P2).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ILogger } from '../core/index.js';
import { getTuneAdjustmentStore, resetTuneAdjustmentStore } from '../core/index.js';
import { setTimeProvider, resetTimeProvider, FixedTimeProvider } from '../core/time-provider.js';
import { TUNE_DECAY_WINDOW_MS } from '../core/tune-adjustment-store.js';
import { EventBus } from './event-bus.js';
import type { PipelineEvent } from './event-types.js';
import { createTuneStage, intendedActionFor } from './tune-stage.js';

const swarmSignal: PipelineEvent = {
  type: 'signal.swarm_unhealthy',
  timestamp: 3,
  agentId: 'gemini',
  reason: 'repeated timeouts',
};

function spyLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function (this: ILogger) {
      return this;
    }),
    setLevel: vi.fn(),
  };
}

const fitnessSignal: PipelineEvent = {
  type: 'signal.fitness_declined',
  timestamp: 1,
  score: 62,
  floor: 90,
  dimension: 'security_review',
};
const voteSignal: PipelineEvent = {
  type: 'signal.vote_rejected',
  timestamp: 2,
  proposalId: 'p-1',
  approvalPercentage: 30,
};

describe('intendedActionFor (#3147)', () => {
  it('maps each signal to its bounded action kind', () => {
    expect(intendedActionFor(fitnessSignal)?.kind).toBe('flag_tech_debt');
    expect(
      intendedActionFor({
        type: 'signal.swarm_unhealthy',
        timestamp: 3,
        agentId: 'gemini',
        reason: 'timeouts',
      })?.kind
    ).toBe('downweight_agent');
    expect(intendedActionFor(voteSignal)?.kind).toBe('record_rejection');
  });

  it('returns undefined for non-signal events', () => {
    expect(
      intendedActionFor({ type: 'task.created', timestamp: 4 } as PipelineEvent)
    ).toBeUndefined();
  });
});

describe('createTuneStage shadow mode (#3147)', () => {
  it('logs the intended action and mutates nothing when a signal is emitted (default = shadow)', () => {
    const bus = new EventBus();
    const logger = spyLogger();
    createTuneStage(bus, { logger });

    bus.emit(fitnessSignal);

    expect(logger.info).toHaveBeenCalledWith(
      'TuneStage (shadow) — intended action',
      expect.objectContaining({ kind: 'flag_tech_debt', signal: 'signal.fitness_declined' })
    );
    // shadow mode performs no mutating action — only an info log
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('ignores non-signal events', () => {
    const bus = new EventBus();
    const logger = spyLogger();
    createTuneStage(bus, { logger });
    bus.emit({ type: 'task.created', timestamp: 9 } as PipelineEvent);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('enabled=true applies a bounded routing demotion on swarm_unhealthy (#3147)', () => {
    resetTuneAdjustmentStore();
    const bus = new EventBus();
    const logger = spyLogger();
    createTuneStage(bus, { logger, enabled: true });

    expect(getTuneAdjustmentStore().effectiveMultiplier('gemini')).toBe(1.0); // baseline
    bus.emit(swarmSignal);

    // store mutated: gemini demoted (multiplier < 1.0, floored/capped by the store)
    expect(getTuneAdjustmentStore().effectiveMultiplier('gemini')).toBeLessThan(1.0);
    expect(logger.info).toHaveBeenCalledWith(
      'TuneStage (enforce) — applied bounded routing demotion',
      expect.objectContaining({ agentId: 'gemini', signal: 'signal.swarm_unhealthy' })
    );
    resetTuneAdjustmentStore();
  });

  it('enabled=true does NOT mutate routing for non-routing signals (vote_rejected stays shadow)', () => {
    resetTuneAdjustmentStore();
    const bus = new EventBus();
    const logger = spyLogger();
    createTuneStage(bus, { logger, enabled: true });
    bus.emit(voteSignal);
    expect(logger.info).toHaveBeenCalledWith(
      'TuneStage (enforce) — non-routing action, shadow-only',
      expect.objectContaining({ kind: 'record_rejection' })
    );
    // no routing mutation from a non-routing signal
    expect(getTuneAdjustmentStore().list()).toHaveLength(0);
    resetTuneAdjustmentStore();
  });

  it('enabled=true writes a tune.demote audit record when an audit sink is wired (#3323)', () => {
    resetTuneAdjustmentStore();
    const bus = new EventBus();
    const auditLog = vi.fn();
    const auditLogger = { log: auditLog };
    createTuneStage(bus, { enabled: true, auditLogger });

    bus.emit(swarmSignal);

    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'configuration',
        action: 'tune.demote',
        outcome: 'success',
        actor: expect.objectContaining({ type: 'system' }),
        metadata: expect.objectContaining({ cli: 'gemini', provenance: 'signal.swarm_unhealthy' }),
      })
    );
    resetTuneAdjustmentStore();
  });

  it('caps an over-long reason entering the audit log (#3323 QA — provider error bloat)', () => {
    resetTuneAdjustmentStore();
    const bus = new EventBus();
    const auditLog = vi.fn();
    createTuneStage(bus, { enabled: true, auditLogger: { log: auditLog } });

    bus.emit({
      type: 'signal.swarm_unhealthy',
      timestamp: 7,
      agentId: 'codex',
      reason: 'x'.repeat(5000), // simulate an unbounded provider lastError
    });

    expect(auditLog).toHaveBeenCalledTimes(1);
    const record = auditLog.mock.calls[0]?.[0] as { metadata: { reason: string } };
    expect(record.metadata.reason.length).toBeLessThanOrEqual(512);
    resetTuneAdjustmentStore();
  });

  it('does NOT write an audit record for non-routing signals or in shadow mode (#3323)', () => {
    resetTuneAdjustmentStore();
    const auditLog = vi.fn();
    const auditLogger = { log: auditLog };

    // non-routing signal under enforce → no audit
    const bus1 = new EventBus();
    createTuneStage(bus1, { enabled: true, auditLogger });
    bus1.emit(voteSignal);
    expect(auditLog).not.toHaveBeenCalled();

    // routing signal in shadow (disabled) → no audit
    const bus2 = new EventBus();
    createTuneStage(bus2, { enabled: false, auditLogger });
    bus2.emit(swarmSignal);
    expect(auditLog).not.toHaveBeenCalled();
    resetTuneAdjustmentStore();
  });

  it('enforce mode increments the APPLIED counter exactly once per swarm signal (#3323)', () => {
    resetTuneAdjustmentStore();
    const bus = new EventBus();
    createTuneStage(bus, { enabled: true, logger: spyLogger() });
    bus.emit(swarmSignal);

    const stat = getTuneAdjustmentStore()
      .demotionStats()
      .find((s) => s.cli === 'gemini');
    expect(stat).toMatchObject({ applied: 1, intended: 0 });
    resetTuneAdjustmentStore();
  });

  it('shadow mode records an INTENDED demotion for soak telemetry without mutating routing (#3323)', () => {
    resetTuneAdjustmentStore();
    const bus = new EventBus();
    createTuneStage(bus, { logger: spyLogger() }); // shadow (enabled defaults false)
    bus.emit(swarmSignal);

    const store = getTuneAdjustmentStore();
    // Routing untouched — still shadow.
    expect(store.effectiveMultiplier('gemini')).toBe(1.0);
    // But the intended counter accrued, so a soak can observe it.
    const stat = store.demotionStats().find((s) => s.cli === 'gemini');
    expect(stat).toMatchObject({ applied: 0, intended: 1 });
    resetTuneAdjustmentStore();
  });

  it('disabled (shadow) does NOT mutate routing even on swarm_unhealthy', () => {
    resetTuneAdjustmentStore();
    const bus = new EventBus();
    const logger = spyLogger();
    createTuneStage(bus, { logger }); // enabled defaults false
    bus.emit(swarmSignal);
    expect(getTuneAdjustmentStore().effectiveMultiplier('gemini')).toBe(1.0);
    expect(logger.info).toHaveBeenCalledWith(
      'TuneStage (shadow) — intended action',
      expect.objectContaining({ kind: 'downweight_agent' })
    );
    resetTuneAdjustmentStore();
  });

  it('unsubscribe stops the stage', () => {
    const bus = new EventBus();
    const logger = spyLogger();
    const unsub = createTuneStage(bus, { logger });
    unsub();
    bus.emit(fitnessSignal);
    expect(logger.info).not.toHaveBeenCalled();
  });
});

describe('createTuneStage reversal audit (#3323 — durable audit criterion)', () => {
  afterEach(() => {
    resetTuneAdjustmentStore();
    resetTimeProvider();
    // Drop any registered reversal listener so it can't leak across tests.
    getTuneAdjustmentStore().onReversal(undefined);
  });

  it('writes a tune.reversal audit record when an enforced demotion decays/expires', () => {
    resetTuneAdjustmentStore();
    const clock = new FixedTimeProvider(0);
    setTimeProvider(clock);
    const bus = new EventBus();
    const auditLog = vi.fn();
    createTuneStage(bus, { enabled: true, auditLogger: { log: auditLog } });

    bus.emit(swarmSignal); // demote gemini → tune.demote
    auditLog.mockClear();

    // Advance past the decay window, then read → lazy eviction fires reversal.
    clock.advance(TUNE_DECAY_WINDOW_MS + 1);
    expect(getTuneAdjustmentStore().effectiveMultiplier('gemini')).toBe(1.0);

    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'configuration',
        action: 'tune.reversal',
        outcome: 'success',
        actor: expect.objectContaining({ type: 'system' }),
        metadata: expect.objectContaining({
          cli: 'gemini',
          cause: 'decay_expiry',
          restoredMultiplier: 1.0,
        }),
      })
    );
  });

  it('writes a tune.reversal audit record when a fresh demotion supersedes an active one', () => {
    resetTuneAdjustmentStore();
    const clock = new FixedTimeProvider(0);
    setTimeProvider(clock);
    const bus = new EventBus();
    const auditLog = vi.fn();
    createTuneStage(bus, { enabled: true, auditLogger: { log: auditLog } });

    bus.emit(swarmSignal); // first demotion (no reversal)
    bus.emit({ ...swarmSignal, reason: 'more timeouts' }); // supersedes

    const reversalCalls = auditLog.mock.calls.filter(
      (c) => (c[0] as { action: string }).action === 'tune.reversal'
    );
    expect(reversalCalls).toHaveLength(1);
    expect(reversalCalls[0]?.[0]).toMatchObject({
      action: 'tune.reversal',
      metadata: expect.objectContaining({ cli: 'gemini', cause: 'superseded' }),
    });
  });

  it('a throwing reversal audit sink does NOT throw out of the mutation path', () => {
    resetTuneAdjustmentStore();
    const clock = new FixedTimeProvider(0);
    setTimeProvider(clock);
    const bus = new EventBus();
    const auditLog = vi.fn().mockImplementation(() => {
      throw new Error('audit backend down');
    });
    createTuneStage(bus, { enabled: true, auditLogger: { log: auditLog } });

    expect(() => {
      bus.emit(swarmSignal);
    }).not.toThrow(); // demote audit throws internally
    clock.advance(TUNE_DECAY_WINDOW_MS + 1);
    // Reading triggers the reversal audit, which throws — must be swallowed.
    expect(() => getTuneAdjustmentStore().effectiveMultiplier('gemini')).not.toThrow();
    expect(getTuneAdjustmentStore().effectiveMultiplier('gemini')).toBe(1.0);
  });

  it('does NOT register a reversal audit listener in shadow mode (no auditLogger or disabled)', () => {
    resetTuneAdjustmentStore();
    const clock = new FixedTimeProvider(0);
    setTimeProvider(clock);
    const bus = new EventBus();
    const auditLog = vi.fn();
    // disabled (shadow) with an audit sink → listener must NOT be registered
    createTuneStage(bus, { enabled: false, auditLogger: { log: auditLog } });

    // Manually drive a demote+decay on the store; no listener should fire.
    getTuneAdjustmentStore().demote('gemini', 0.2, 'manual');
    clock.advance(TUNE_DECAY_WINDOW_MS + 1);
    getTuneAdjustmentStore().effectiveMultiplier('gemini');
    expect(auditLog).not.toHaveBeenCalled();
  });
});
