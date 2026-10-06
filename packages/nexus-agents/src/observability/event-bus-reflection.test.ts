/**
 * Failover signals reach direct pipeline subscribers without forwarding back
 * to the collaboration bus (#6291 B1). Topic and payload guards continue to
 * reject legacy reflected events (#5223).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EventBus as PipelineEventBus } from '../pipeline/event-bus.js';
import {
  startFailoverSignals,
  shutdownFailoverSignals,
  unhealthyCliFrom,
} from './failover-signals.js';
import { getGlobalEventBus, resetGlobalEventBus } from '../agents/collaboration/event-bus.js';
import { createEvent } from '../agents/collaboration/event-bus.js';
import type { DomainEvent } from '../core/event-bus.js';
import type { PipelineEvent } from '../pipeline/event-types.js';

describe('failover signals use direct pipeline subscriptions (#6291 B1)', () => {
  let pipelineBus: PipelineEventBus;

  beforeEach(() => {
    resetGlobalEventBus();
    shutdownFailoverSignals();
    pipelineBus = new PipelineEventBus();

    startFailoverSignals({ sourceBus: getGlobalEventBus(), pipelineBus, cooldownMs: 0 });
  });

  afterEach(() => {
    shutdownFailoverSignals();
    resetGlobalEventBus();
  });

  it('delivers a failover to pipeline subscribers without collaboration forwarding', () => {
    const pipelineSeen: string[] = [];
    const v1Seen: string[] = [];
    pipelineBus.subscribe({}, (e: PipelineEvent) => {
      pipelineSeen.push(e.type);
    });
    getGlobalEventBus().subscribe('pipeline.signal.swarm_unhealthy', (e: DomainEvent) => {
      v1Seen.push(e.topic);
    });

    getGlobalEventBus().emit(
      createEvent('adapter.failover', {
        source: 'claude',
        state: 'unavailable',
        failoverCount: 1,
        lastError: 'rate limited',
      })
    );

    expect(pipelineSeen.filter((t) => t === 'signal.swarm_unhealthy')).toHaveLength(1);
    expect(v1Seen).toHaveLength(0);
  });

  it('ignores legacy reflected topics', () => {
    const pipelineSeen: string[] = [];
    pipelineBus.subscribe({}, (e: PipelineEvent) => {
      pipelineSeen.push(e.type);
    });

    // Emitting the REFLECTED topic must produce nothing on the pipeline bus.
    getGlobalEventBus().emit(
      createEvent('pipeline.signal.swarm_unhealthy', { agentId: 'claude', reason: 'x' })
    );

    expect(pipelineSeen).toHaveLength(0);
  });

  it('a second failover for the same CLI is suppressed by cooldown, not by the cycle', () => {
    // Guards against a future change that makes the cycle terminate only
    // because the cooldown happens to swallow the re-entry — a different
    // accident wearing the same clothes.
    const pipelineSeen: string[] = [];
    pipelineBus.subscribe({}, (e: PipelineEvent) => {
      pipelineSeen.push(e.type);
    });
    shutdownFailoverSignals();
    startFailoverSignals({
      sourceBus: getGlobalEventBus(),
      pipelineBus,
      cooldownMs: 60_000,
    });

    const ev = (): DomainEvent =>
      createEvent('adapter.failover', {
        source: 'claude',
        state: 'unavailable',
        failoverCount: 1,
        lastError: 'rate limited',
      });
    getGlobalEventBus().emit(ev());
    getGlobalEventBus().emit(ev());

    expect(pipelineSeen.filter((t) => t === 'signal.swarm_unhealthy')).toHaveLength(1);
  });
});

describe('failover topic and payload guards (#5223)', () => {
  afterEach(() => {
    shutdownFailoverSignals();
  });

  it('GUARD 1 — subscribes to exactly one topic, not a pattern', () => {
    // Pin the topic independently of payload validation.
    const patterns: string[] = [];
    const fakeSource = {
      subscribe: (pattern: string) => {
        patterns.push(pattern);
        return { unsubscribe: (): void => undefined };
      },
    };
    const pipelineBus = new PipelineEventBus();

    startFailoverSignals({
      sourceBus: fakeSource as never,
      pipelineBus,
      cooldownMs: 0,
    });

    expect(patterns).toEqual(['adapter.failover']);
    expect(patterns.some((p) => p.includes('*'))).toBe(false);
  });

  it('GUARD 2 — a reflected payload cannot re-trigger the signal', () => {
    // Legacy reflected payloads carry { agentId, reason }; the failover
    // reader requires the adapter's { source, state } shape.
    const reflected: unknown = {
      agentId: 'claude',
      reason: 'adapter unavailable (failovers: 1)',
    };

    expect(unhealthyCliFrom(reflected)).toBeUndefined();

    // The contrast, so this is not passing because the helper rejects
    // everything: the ORIGINAL shape is accepted.
    const original: unknown = { source: 'claude', state: 'unavailable', failoverCount: 1 };
    expect(unhealthyCliFrom(original)).toBeDefined();
  });
});
