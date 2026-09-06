/**
 * A mean latency must divide by the things it timed (#5782).
 *
 * `getHealthMetrics` summed `e.durationMs ?? 0` — folding untimed edges in as
 * zero — and divided by EVERY edge in the window. The numerator counted timed
 * interactions, the denominator counted all of them, so one timed edge at
 * 100 ms beside one untimed edge reported 50 ms as a measurement.
 *
 * The correct form already existed 130 lines away in the same directory:
 * `interaction-graph.ts:236-241` tracks `latencyCount` separately.
 *
 * The producers make this reachable rather than theoretical:
 * `mcp/eventbus-bridge.ts:278` records interactions with no `durationMs` at
 * all, while `dogfooding/pr-reviewer.ts:200` always passes one — a single
 * observer can see both.
 */
import { describe, it, expect } from 'vitest';

import { SwarmObserver } from './swarm-observer.js';
import { buildTopEdges } from './dashboard-helpers.js';
import { DirectedInteractionGraph } from './interaction-graph.js';

function interaction(
  from: string,
  to: string,
  durationMs?: number
): Record<string, unknown> {
  return {
    from,
    to,
    interactionType: 'message' as const,
    outcome: 'success' as const,
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

describe('avgLatencyMs divides by the timed interactions (#5782)', () => {
  it('is the mean of the timed edges, not diluted by untimed ones', () => {
    const observer = new SwarmObserver();
    observer.recordInteraction(interaction('a', 'b', 100) as never);
    observer.recordInteraction(interaction('a', 'c') as never);

    const metrics = observer.getHealthMetrics();

    expect(metrics.avgLatencyMs).toBe(100);
  });

  it('reports how many interactions carried a duration', () => {
    // Without this the mean cannot be read: 100ms over one timed edge and
    // 100ms over fifty are the same number with very different weight.
    const observer = new SwarmObserver();
    observer.recordInteraction(interaction('a', 'b', 100) as never);
    observer.recordInteraction(interaction('a', 'c') as never);

    const metrics = observer.getHealthMetrics();

    expect(metrics.totalInteractions).toBe(2);
    expect(metrics.timedInteractions).toBe(1);
  });

  it('reports zero timed interactions when nothing carried a duration', () => {
    const observer = new SwarmObserver();
    observer.recordInteraction(interaction('a', 'b') as never);

    const metrics = observer.getHealthMetrics();

    expect(metrics.timedInteractions).toBe(0);
    expect(metrics.avgLatencyMs).toBe(0);
  });
});

describe('per-edge avgLatencyMs uses the same denominator', () => {
  it('is the mean of the timed edges for that pair', () => {
    const graph = new DirectedInteractionGraph();
    graph.addEdge({ ...interaction('a', 'b', 100), timestamp: '2026-09-06T00:00:00.000Z' } as never);
    graph.addEdge({ ...interaction('a', 'b'), timestamp: '2026-09-06T00:00:01.000Z' } as never);

    const top = buildTopEdges(graph);

    expect(top[0]?.avgLatencyMs).toBe(100);
  });
});
