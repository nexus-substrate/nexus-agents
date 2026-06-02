/**
 * Tests for the adapter-failover → pipeline-bus signal producer (#3321).
 */

import { describe, it, expect, vi } from 'vitest';
import { EventBus as CollaborationBus, createEvent } from '../core/event-bus.js';
import { EventBus as PipelineBus } from '../pipeline/event-bus.js';
import type { PipelineEvent } from '../pipeline/event-types.js';
import type { AdapterHealthInfo } from '../adapters/resilient-adapter-types.js';
import {
  unhealthyCliFrom,
  startFailoverSignals,
  shutdownFailoverSignals,
} from './failover-signals.js';

function healthInfo(over: Partial<AdapterHealthInfo>): AdapterHealthInfo {
  return {
    source: 'gemini',
    state: 'degraded',
    selectedAt: new Date('2026-06-01T00:00:00.000Z'),
    failoverCount: 2,
    ...over,
  };
}

function captureSignals(bus: PipelineBus): PipelineEvent[] {
  const seen: PipelineEvent[] = [];
  bus.subscribe({ type: ['signal.swarm_unhealthy'] }, (e) => seen.push(e));
  return seen;
}

describe('unhealthyCliFrom (#3321)', () => {
  it('maps a degraded/unavailable CLI adapter to an unhealthy signal payload', () => {
    expect(unhealthyCliFrom(healthInfo({ source: 'codex', state: 'unavailable' }))).toMatchObject({
      cli: 'codex',
    });
    const r = unhealthyCliFrom(
      healthInfo({ source: 'gemini', state: 'degraded', lastError: 'timeout' })
    );
    expect(r?.cli).toBe('gemini');
    expect(r?.reason).toContain('timeout');
  });

  it('returns undefined for a healthy adapter', () => {
    expect(unhealthyCliFrom(healthInfo({ state: 'healthy' }))).toBeUndefined();
  });

  it('returns undefined when the source is api (not a routing slot)', () => {
    expect(unhealthyCliFrom(healthInfo({ source: 'api', state: 'unavailable' }))).toBeUndefined();
  });

  it('returns undefined for malformed payloads', () => {
    expect(unhealthyCliFrom(undefined)).toBeUndefined();
    expect(unhealthyCliFrom(null)).toBeUndefined();
    expect(unhealthyCliFrom('nope')).toBeUndefined();
    expect(unhealthyCliFrom({ source: 'not-a-cli', state: 'degraded' })).toBeUndefined();
  });
});

describe('startFailoverSignals / shutdownFailoverSignals (#3321)', () => {
  function emitFailover(bus: CollaborationBus, info: AdapterHealthInfo): void {
    bus.emit(createEvent('adapter.failover', info));
  }

  it('re-emits adapter.failover as signal.swarm_unhealthy on bus A', () => {
    const sourceBus = new CollaborationBus();
    const pipelineBus = new PipelineBus();
    const seen = captureSignals(pipelineBus);
    try {
      startFailoverSignals({ sourceBus, pipelineBus });
      emitFailover(sourceBus, healthInfo({ source: 'gemini', state: 'unavailable' }));
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ type: 'signal.swarm_unhealthy', agentId: 'gemini' });
    } finally {
      shutdownFailoverSignals();
    }
  });

  it('does not emit for healthy or api failover events', () => {
    const sourceBus = new CollaborationBus();
    const pipelineBus = new PipelineBus();
    const seen = captureSignals(pipelineBus);
    try {
      startFailoverSignals({ sourceBus, pipelineBus });
      emitFailover(sourceBus, healthInfo({ state: 'healthy' }));
      emitFailover(sourceBus, healthInfo({ source: 'api', state: 'unavailable' }));
      expect(seen).toHaveLength(0);
    } finally {
      shutdownFailoverSignals();
    }
  });

  it('applies a per-CLI cooldown to absorb breaker flapping', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    const sourceBus = new CollaborationBus();
    const pipelineBus = new PipelineBus();
    const seen = captureSignals(pipelineBus);
    try {
      startFailoverSignals({ sourceBus, pipelineBus, cooldownMs: 30_000 });
      emitFailover(sourceBus, healthInfo({ source: 'codex', state: 'degraded' }));
      emitFailover(sourceBus, healthInfo({ source: 'codex', state: 'unavailable' }));
      expect(seen).toHaveLength(1); // second within cooldown is suppressed

      vi.advanceTimersByTime(30_001);
      emitFailover(sourceBus, healthInfo({ source: 'codex', state: 'unavailable' }));
      expect(seen).toHaveLength(2); // after cooldown, emits again

      // a different CLI is tracked independently
      emitFailover(sourceBus, healthInfo({ source: 'gemini', state: 'degraded' }));
      expect(seen).toHaveLength(3);
    } finally {
      shutdownFailoverSignals();
      vi.useRealTimers();
    }
  });

  it('is idempotent on start and clean on shutdown', () => {
    const sourceBus = new CollaborationBus();
    const pipelineBus = new PipelineBus();
    const seen = captureSignals(pipelineBus);
    startFailoverSignals({ sourceBus, pipelineBus });
    startFailoverSignals({ sourceBus, pipelineBus }); // no second subscription
    emitFailover(sourceBus, healthInfo({ source: 'claude', state: 'degraded' }));
    expect(seen).toHaveLength(1);

    shutdownFailoverSignals();
    emitFailover(sourceBus, healthInfo({ source: 'claude', state: 'unavailable' }));
    expect(seen).toHaveLength(1); // no emissions after shutdown
  });
});
