/**
 * `critical` must be a severity the detector can actually produce.
 *
 * It could not. The mapping was an object keyed by number, walked with
 * `Object.entries` and last-match-wins:
 *
 * ```ts
 * const severityMap: Record<number, Severity> = { 0.3:'low', 0.5:'medium', 0.7:'high', 1.0:'critical' };
 * for (const [t, sev] of Object.entries(severityMap)) if (confidence >= parseFloat(t)) severity = sev;
 * ```
 *
 * `1.0` stringifies to the key `"1"`, a canonical array index, and ES property
 * enumeration puts integer-like keys FIRST — the real order is
 * `["1","0.3","0.5","0.7"]`. At confidence 1 the loop assigned `critical`, then
 * overwrote it with `low`, `medium` and finally `high`. `FailureSeverity` and
 * its Zod enum both published `critical` as a reachable state; nothing could
 * reach it, and `confidence` is clamped to 1 so no input could route around it.
 */
import { describe, it, expect } from 'vitest';

import { severityForConfidence } from './failure-detector.js';
import { FailureSeveritySchema } from './failure-types.js';

describe('severityForConfidence', () => {
  it('returns critical at full confidence', () => {
    // The assertion the old mapping failed: actual was 'high'.
    expect(severityForConfidence(1)).toBe('critical');
  });

  it.each([
    [0, 'low'],
    [0.29, 'low'],
    [0.3, 'low'],
    [0.5, 'medium'],
    [0.69, 'medium'],
    [0.7, 'high'],
    [0.99, 'high'],
    [1, 'critical'],
  ] as const)('maps confidence %s to %s', (confidence, expected) => {
    // The ladder in full. Testing only the critical case would pass against a
    // mapping that returns 'critical' for everything.
    expect(severityForConfidence(confidence)).toBe(expected);
  });

  it('can produce every level the schema publishes', () => {
    // The property that matters, stated directly: a declared level nothing can
    // return is a level a consumer will wait for forever. This fails the moment
    // a member is added to the enum without a threshold.
    const produced = new Set([0, 0.3, 0.5, 0.7, 1].map((c) => severityForConfidence(c) as string));

    expect([...produced].sort()).toEqual([...FailureSeveritySchema.options].sort());
  });
});
