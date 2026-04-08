/**
 * Quality Pipeline Tests (#1684)
 */

import { describe, it, expect, vi } from 'vitest';
import { runQualityPipeline } from './quality-pipeline.js';
import type { StageConfig } from './quality-pipeline.js';
import type { GateCheckResult } from '../security/quality-gate-types.js';
import type { GateCheckFn } from '../security/quality-gate.js';

function passingCheck(name: string): GateCheckFn {
  return (): Promise<GateCheckResult> => Promise.resolve({ name, verdict: 'pass', details: 'OK' });
}

function failingCheck(name: string): GateCheckFn {
  return (): Promise<GateCheckResult> =>
    Promise.resolve({ name, verdict: 'fail', details: 'Failed' });
}

/** Check that passes on the Nth call. */
function eventuallyPassingCheck(name: string, passOnCall: number): GateCheckFn {
  let calls = 0;
  return (): Promise<GateCheckResult> => {
    calls++;
    const verdict = calls >= passOnCall ? 'pass' : 'fail';
    return Promise.resolve({ name, verdict, details: verdict === 'pass' ? 'OK' : 'Not yet' });
  };
}

describe('runQualityPipeline', () => {
  it('runs all stages when all pass', async () => {
    const stages: StageConfig[] = [
      { stage: 'research', checks: [passingCheck('sources')] },
      { stage: 'plan', checks: [passingCheck('design')] },
      { stage: 'implement', checks: [passingCheck('tests')] },
    ];
    const result = await runQualityPipeline(stages);
    expect(result.completed).toBe(true);
    expect(result.failedAt).toBeNull();
    expect(result.stages).toHaveLength(3);
    expect(result.totalIterations).toBe(3);
  });

  it('stops at first failed stage', async () => {
    const stages: StageConfig[] = [
      { stage: 'research', checks: [passingCheck('sources')] },
      { stage: 'plan', checks: [failingCheck('design')] },
      { stage: 'implement', checks: [passingCheck('tests')] },
    ];
    const result = await runQualityPipeline(stages);
    expect(result.completed).toBe(false);
    expect(result.failedAt).toBe('plan');
    expect(result.stages).toHaveLength(2);
  });

  it('retries failed stages up to maxIterations', async () => {
    const stages: StageConfig[] = [
      { stage: 'qa', checks: [eventuallyPassingCheck('review', 3)], maxIterations: 3 },
    ];
    const result = await runQualityPipeline(stages);
    expect(result.completed).toBe(true);
    expect(result.totalIterations).toBe(3);
  });

  it('calls onFeedback when stage fails', async () => {
    const feedback = vi.fn().mockResolvedValue(undefined);
    const stages: StageConfig[] = [
      { stage: 'scan', checks: [eventuallyPassingCheck('sast', 2)], maxIterations: 3 },
    ];
    await runQualityPipeline(stages, feedback);
    expect(feedback).toHaveBeenCalledTimes(1);
    expect(feedback).toHaveBeenCalledWith('scan', expect.stringContaining('failed'), 1);
  });

  it('handles empty pipeline', async () => {
    const result = await runQualityPipeline([]);
    expect(result.completed).toBe(true);
    expect(result.stages).toHaveLength(0);
  });

  it('fails after max iterations exhausted', async () => {
    const stages: StageConfig[] = [
      { stage: 'implement', checks: [failingCheck('tests')], maxIterations: 2 },
    ];
    const result = await runQualityPipeline(stages);
    expect(result.completed).toBe(false);
    expect(result.failedAt).toBe('implement');
    expect(result.totalIterations).toBe(2);
  });
});
