/**
 * Pins termination of the two-bus reflection cycle as an INVARIANT (#5223).
 *
 * The cycle:
 *
 *   adapter.failover                    (collaboration / v1 bus)
 *     -> failover-signals subscribes 'adapter.failover'
 *     -> emits signal.swarm_unhealthy   (pipeline bus)
 *     -> event-bus-bridge subscribes {} — EVERY pipeline event
 *     -> emits pipeline.signal.swarm_unhealthy  (collaboration bus)
 *     -> failover-signals matches only 'adapter.failover' -> STOP
 *
 * It terminates for one reason: the B->A leg is single-topic while the A->B leg
 * is an unfiltered firehose. Nothing pinned that. "Make the bridges symmetric"
 * is exactly the cleanup a reader would propose — and exactly what a consensus
 * panel already assumed was true (#5125's correction) — and it would turn one
 * hop into an unbounded loop.
 *
 * Every assertion here is a COUNT, never an existence check. `toHaveBeenCalled()`
 * passes just as happily under an infinite loop, which would make a test for a
 * loop bug unable to detect the loop.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EventBus as PipelineEventBus } from '../pipeline/event-bus.js';
import { createEventBusBridge } from '../pipeline/event-bus-bridge.js';
import {
  startFailoverSignals,
  shutdownFailoverSignals,
  unhealthyCliFrom,
} from './failover-signals.js';
import { getGlobalEventBus, resetGlobalEventBus } from '../agents/collaboration/event-bus.js';
import { createEvent } from '../agents/collaboration/event-bus.js';
import type { DomainEvent } from '../core/event-bus.js';
import type { PipelineEvent } from '../pipeline/event-types.js';

describe('two-bus reflection terminates by construction (#5223)', () => {
  let pipelineBus: PipelineEventBus;
  let bridge: ReturnType<typeof createEventBusBridge>;

  beforeEach(() => {
    resetGlobalEventBus();
    shutdownFailoverSignals();
    pipelineBus = new PipelineEventBus();

    // Both legs live, wired to the same pair of buses as production.
    startFailoverSignals({ sourceBus: getGlobalEventBus(), pipelineBus, cooldownMs: 0 });
    bridge = createEventBusBridge({ source: pipelineBus });
  });

  afterEach(() => {
    bridge.dispose();
    shutdownFailoverSignals();
    resetGlobalEventBus();
  });

  it('reflects a failover exactly one hop and stops', () => {
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

    // Exactly one, not "at least one". Under a symmetric B->A bridge these grow
    // without bound and an existence assertion would still pass.
    expect(pipelineSeen.filter((t) => t === 'signal.swarm_unhealthy')).toHaveLength(1);
    expect(v1Seen).toHaveLength(1);
    // The bridge's own counter, which is the number that would run away.
    expect(bridge.forwarded()).toBe(1);
  });

  it('does not re-enter: the reflected topic is not one failover-signals listens for', () => {
    // The load-bearing asymmetry, asserted directly rather than inferred from
    // the counts above. If this ever becomes true, the cycle is unbounded.
    const pipelineSeen: string[] = [];
    pipelineBus.subscribe({}, (e: PipelineEvent) => {
      pipelineSeen.push(e.type);
    });

    // Emitting the REFLECTED topic must produce nothing on the pipeline bus.
    getGlobalEventBus().emit(
      createEvent('pipeline.signal.swarm_unhealthy', { agentId: 'claude', reason: 'x' })
    );

    expect(pipelineSeen).toHaveLength(0);
    expect(bridge.forwarded()).toBe(0);
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

describe('the two guards that stop the cycle, pinned separately (#5223)', () => {
  /**
   * The issue says termination rests on ONE property — that the B->A leg is
   * single-topic. Measured while writing this: there are TWO, and either alone
   * is sufficient. Mutating the subscription to `'*'` (exactly the
   * "make the bridges symmetric" cleanup the issue warns about) left the
   * cycle-count tests above GREEN, because the second guard still held.
   *
   * Two redundant guards each survive solo mutation, so counting hops cannot
   * pin either. Each is asserted directly below.
   */

  afterEach(() => {
    shutdownFailoverSignals();
  });

  it('GUARD 1 — subscribes to exactly one topic, not a pattern', () => {
    // White-box on purpose: the hop-count tests cannot see this, because
    // widening the pattern alone does not produce a second hop.
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
    // Spelled out: a wildcard here would make the reflected topic re-enter, and
    // only GUARD 2 would then stand between that and an unbounded loop.
    expect(patterns.some((p) => p.includes('*'))).toBe(false);
  });

  it('GUARD 2 — a reflected payload cannot re-trigger the signal', () => {
    // The bridge builds its v1 payload as the pipeline event minus
    // type/timestamp (`toV1Payload`), so a reflected `signal.swarm_unhealthy`
    // carries { agentId, reason } — no `source`, no `state`. `unhealthyCliFrom`
    // narrows on exactly those two fields and therefore rejects it.
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
