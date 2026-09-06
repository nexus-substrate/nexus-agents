/**
 * A `routing.topsis` block in the config must reach the TOPSIS stage (#5785).
 *
 * `adaptRoutingConfig` returned three of the four stage configs — zeroRouter,
 * latencyTracker and routingMemory — and dropped topsis on the floor. The
 * stage then constructed itself with no arguments
 * (`composite-router.ts`, `new TopsisRouter()`), so an operator who wrote
 *
 *   routing:
 *     topsis:
 *       minQualityThreshold: 9
 *
 * was validated by the schema, defaulted by DEFAULT_ROUTING_CONFIG, and then
 * ignored: the router ranked with the built-in 5.
 *
 * The adapter for it already existed — `getTopsisConfigFromYaml` — with no
 * caller anywhere in the tree. This was unfinished wiring, not a decision.
 */
import { describe, it, expect } from 'vitest';

import { adaptRoutingConfig } from './routing-config-adapter.js';
import { CompositeRouter } from '../cli-adapters/composite-router.js';
import type { RoutingConfig } from './schemas-routing.js';

describe('routing.topsis reaches the router config (#5785)', () => {
  it('carries a configured minQualityThreshold', () => {
    const adapted = adaptRoutingConfig({
      topsis: { minQualityThreshold: 9, verbose: false },
    } as RoutingConfig);

    expect(adapted.topsisConfig?.minQualityThreshold).toBe(9);
  });

  it('carries a configured maxCostPerRequest', () => {
    const adapted = adaptRoutingConfig({
      topsis: { minQualityThreshold: 5, verbose: false, maxCostPerRequest: 0.01 },
    } as RoutingConfig);

    expect(adapted.topsisConfig?.maxCostPerRequest).toBe(0.01);
  });

  it('sits beside the three sibling stage configs, not instead of them', () => {
    // The bug was that this one key was missing from a return that carried the
    // other three; assert the set rather than the single key.
    const adapted = adaptRoutingConfig({
      topsis: { minQualityThreshold: 7, verbose: false },
    } as RoutingConfig);

    expect(Object.keys(adapted)).toEqual(
      expect.arrayContaining([
        'zeroRouterConfig',
        'latencyTrackerConfig',
        'routingMemoryConfig',
        'topsisConfig',
      ])
    );
  });
});

describe('the router builds the stage with it (#5785)', () => {
  it('applies a configured minQualityThreshold to the ranking stage', () => {
    // The seam, not the parts. Asserting only the adapter's output would have
    // passed while `new TopsisRouter()` ignored it — which is exactly the state
    // this fixes.
    const router = new CompositeRouter(
      new Map(),
      adaptRoutingConfig({ topsis: { minQualityThreshold: 9, verbose: false } } as RoutingConfig)
    );

    expect(router.getTopsisConfig()?.minQualityThreshold).toBe(9);
  });

  it('falls back to the built-in default when no block is configured', () => {
    const router = new CompositeRouter(new Map(), adaptRoutingConfig());

    expect(router.getTopsisConfig()?.minQualityThreshold).toBe(5);
  });
});
