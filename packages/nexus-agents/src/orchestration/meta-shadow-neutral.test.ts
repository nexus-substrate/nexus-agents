/**
 * The persisted bandit context must use the same neutral as the live path
 * (#5284).
 *
 * `toBanditContext` wrote `budgetUtilization: 0` and `timePressure: 0` into
 * records that `hydrateShadowSelector` replays into a LinUCB bandit **in a
 * later process** — under a comment saying "left neutral".
 *
 * By this repo's own definition, neutral for these features is `0.5`.
 * `composite-router-helpers.ts` documents why, twice:
 *
 *   "Neutral rather than zero: zero would read as 'budget untouched' and is a
 *    claim; 0.5 is the same value `warmStart` replays historical outcomes at."
 *
 *   "two DIFFERENT constants across live paths let the bandit use the value as
 *    a path indicator — accidental signal rather than none."
 *
 * That second one is the sharp part: a previous fix already unified divergent
 * constants for this exact reason, and the persisted path was a third constant
 * it missed. Records at `0` let the bandit distinguish shadow-selector origin
 * from live-router origin through the budget feature alone.
 */

import { describe, it, expect } from 'vitest';

import { toBanditContext } from './meta-shadow-selector.js';
import { NEUTRAL_BANDIT_FEATURE } from '../cli-adapters/budget-router-types.js';
import type { MetaDecision } from './meta-orchestrator.js';

const decision = {
  strategy: 'dev_pipeline',
  analysis: {
    complexityScore: 0.4,
    estimatedTokens: 1000,
    reasoningType: 'reasoning',
    reasoningConfidence: 0.8,
    taskType: 'code',
  },
} as unknown as MetaDecision;

describe('persisted bandit context uses the shared neutral (#5284)', () => {
  it('writes the neutral value for budgetUtilization, not zero', () => {
    const ctx = toBanditContext(decision);
    expect(ctx.budgetUtilization).toBe(NEUTRAL_BANDIT_FEATURE);
    expect(ctx.budgetUtilization).not.toBe(0);
  });

  it('writes the neutral value for timePressure, not zero', () => {
    const ctx = toBanditContext(decision);
    expect(ctx.timePressure).toBe(NEUTRAL_BANDIT_FEATURE);
    expect(ctx.timePressure).not.toBe(0);
  });

  it('still computes the features that ARE measured', () => {
    // The control. Without it, returning the neutral for every field would
    // satisfy both assertions above and destroy the real signal — which is the
    // failure mode that matters, since these records become training data.
    const ctx = toBanditContext(decision);
    expect(ctx.taskComplexity).toBeCloseTo(0.4, 5);
    expect(ctx.isReasoningTask).toBeCloseTo(0.8, 5);
    expect(ctx.contextLengthNormalized).toBeGreaterThan(0);
  });
});
