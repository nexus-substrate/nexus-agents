/**
 * Degree centrality is a fraction, and the bars that render it must not throw.
 *
 * `getDegreeCentrality` counted the EDGE LIST in the numerator — `addEdge`
 * pushes one edge per interaction, so a pair that talks three times has degree
 * 3 — against a denominator of distinct neighbour slots. Two different
 * populations, so the ratio was not bounded by 1: two agents and three
 * interactions produced 1.5.
 *
 * That is not only a wrong number. `renderBar(1.5, 15)` computes
 * `empty = 15 - 23 = -8` and `'░'.repeat(-8)` throws a RangeError, so the
 * whole dashboard render dies on data the observer legitimately records.
 */
import { describe, it, expect } from 'vitest';

import { DirectedInteractionGraph } from './interaction-graph.js';
import { renderProgressBar } from './validation-dashboard-render.js';

function edge(from: string, to: string): never {
  return {
    from,
    to,
    interactionType: 'message',
    outcome: 'success',
    timestamp: '2026-09-06T00:00:00.000Z',
  } as never;
}

describe('degree centrality stays a fraction', () => {
  it('does not exceed 1 when a pair interacts repeatedly', () => {
    const graph = new DirectedInteractionGraph();
    graph.addEdge(edge('a', 'b'));
    graph.addEdge(edge('a', 'b'));
    graph.addEdge(edge('a', 'b'));

    const centrality = graph.getDegreeCentrality();

    expect(centrality.get('a')).toBeLessThanOrEqual(1);
    expect(centrality.get('b')).toBeLessThanOrEqual(1);
  });

  it('counts distinct neighbours, so repeat traffic does not inflate it', () => {
    const repeated = new DirectedInteractionGraph();
    repeated.addEdge(edge('a', 'b'));
    repeated.addEdge(edge('a', 'b'));

    const once = new DirectedInteractionGraph();
    once.addEdge(edge('a', 'b'));

    expect(repeated.getDegreeCentrality().get('a')).toBe(once.getDegreeCentrality().get('a'));
  });

  it('still ranks a hub above a leaf', () => {
    // The measure has to keep discriminating, not just stay in range.
    const graph = new DirectedInteractionGraph();
    graph.addEdge(edge('hub', 'x'));
    graph.addEdge(edge('hub', 'y'));
    graph.addEdge(edge('hub', 'z'));

    const c = graph.getDegreeCentrality();

    expect(c.get('hub') ?? 0).toBeGreaterThan(c.get('x') ?? 0);
  });
});

describe('progress bars survive an out-of-range value', () => {
  it('does not throw when the value exceeds the max', () => {
    // A renderer that dies on its input is worse than a wrong number: it takes
    // every other metric on the page with it.
    expect(() => renderProgressBar(1.5, 1, 15)).not.toThrow();
    expect(renderProgressBar(1.5, 1, 15)).toHaveLength(17); // 15 cells + 2 brackets
  });

  it('does not throw on a negative value', () => {
    expect(() => renderProgressBar(-1, 1, 15)).not.toThrow();
  });

  it('still renders a partial bar in range', () => {
    expect(renderProgressBar(0.5, 1, 10)).toBe(`[${'█'.repeat(5)}${'░'.repeat(5)}]`);
  });
});
