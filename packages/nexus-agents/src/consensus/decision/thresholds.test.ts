/**
 * `consensus/decision/thresholds` (#6000 step 1) — the bars a tally is measured
 * against, imported DIRECTLY from the governed module.
 *
 * The identity assertions are the point of the extraction: every previous home
 * must hand back the SAME binding, not a copy, or a future edit to the governed
 * module would leave the re-exporting home serving a stale value.
 */

import { describe, it, expect } from 'vitest';
import { ERROR_FLOOR_FRACTION, SUPERMAJORITY_THRESHOLD, VOTING_THRESHOLDS } from './thresholds.js';
import {
  SUPERMAJORITY_THRESHOLD as fromTypesCore,
  VOTING_THRESHOLDS as thresholdsFromTypesCore,
} from '../types-core.js';
import { VOTING_THRESHOLDS as thresholdsFromBarrel } from '../index.js';
import { ERROR_FLOOR_FRACTION as floorFromMcpTypes } from '../../mcp/tools/consensus-vote-types.js';

describe('consensus/decision/thresholds (#6000 step 1)', () => {
  it('pins the governance bars', () => {
    expect(SUPERMAJORITY_THRESHOLD).toBe(2 / 3);
    expect(VOTING_THRESHOLDS).toEqual({
      simple_majority: 0.5,
      supermajority: 2 / 3,
      unanimous: 1.0,
      proof_of_learning: 0.5,
      opinion_wise: 0.5,
      higher_order: 0.5,
    });
    expect(ERROR_FLOOR_FRACTION).toBe(0.5);
  });

  it('covers every algorithm exactly once — no bar can be missing or defaulted', () => {
    const algorithms = Object.keys(VOTING_THRESHOLDS).sort();
    expect(algorithms).toEqual(
      [
        'higher_order',
        'opinion_wise',
        'proof_of_learning',
        'simple_majority',
        'supermajority',
        'unanimous',
      ].sort()
    );
  });

  it('the previous homes re-export the SAME bindings, not copies', () => {
    expect(fromTypesCore).toBe(SUPERMAJORITY_THRESHOLD);
    expect(thresholdsFromTypesCore).toBe(VOTING_THRESHOLDS);
    expect(thresholdsFromBarrel).toBe(VOTING_THRESHOLDS);
    expect(floorFromMcpTypes).toBe(ERROR_FLOOR_FRACTION);
  });
});
