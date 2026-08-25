/**
 * Tests for Learning Integration
 * @module agents/orchestration/learning-integration.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PuppeteerResult } from './puppeteer-result-types.js';
import type { PolicyTrajectoryStep, LearnablePolicyStats } from './policy-types.js';
import type { ExperienceBuffer, BufferStats } from './experience-buffer.js';

vi.mock('../../core/index.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
  isErr: (result: { ok: boolean }): boolean => !result.ok,
}));

const mockConvertTrajectory = vi.fn();
vi.mock('./trajectory-converter.js', () => ({
  get convertTrajectory() {
    return mockConvertTrajectory;
  },
}));

const mockIsLearnablePolicyEngine = vi.fn();
vi.mock('./learnable-policy.js', () => ({
  get isLearnablePolicyEngine() {
    return mockIsLearnablePolicyEngine;
  },
}));

import {
  DEFAULT_LEARNING_CONFIG,
  processOrchestrationForLearning,
  supportsLearning,
  createLearningHandler,
  computeEpisodeReward,
} from './learning-integration.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeStep(overrides: Partial<PolicyTrajectoryStep> = {}) {
  return {
    state: {} as PolicyTrajectoryStep['state'],
    action: 'agent-1',
    reward: 0.5,
    logProb: -0.7,
    ...overrides,
  };
}

const ZERO_METRICS = {
  avgReward: 0,
  scoredSteps: 0,
  taskCompletionRate: 0,
  efficiencyScore: 0,
  compactionScore: 0,
  cyclicalityScore: 0,
};

function makeBufferStats(overrides: Partial<BufferStats> = {}): BufferStats {
  return {
    episodeCount: 1,
    totalSteps: 3,
    avgEpisodeLength: 3,
    avgTotalReward: 1.5,
    utilization: 0.01,
    ...overrides,
  };
}

function makePolicyStats(overrides: Partial<LearnablePolicyStats> = {}): LearnablePolicyStats {
  return {
    updateCount: 5,
    currentLearningRate: 0.01,
    baseline: 0.5,
    lastGradientNorm: 0.1,
    totalEpisodes: 5,
    avgEpisodeLength: 3,
    avgFinalReward: 1.2,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeBuffer(overrides: Partial<ExperienceBuffer> = {}) {
  return {
    addEpisode: vi.fn().mockReturnValue('episode-123'),
    getStats: vi.fn().mockReturnValue(makeBufferStats()),
    ...overrides,
  } as unknown as ExperienceBuffer;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeEngine(overrides: Record<string, unknown> = {}) {
  return {
    updatePolicy: vi.fn().mockReturnValue(Promise.resolve({ ok: true, value: undefined })),
    getStats: vi.fn().mockReturnValue(makePolicyStats()),
    isWarmedUp: vi.fn().mockReturnValue(true),
    computeDistribution: vi.fn(),
    sampleAgent: vi.fn(),
    getParameters: vi.fn(),
    loadParameters: vi.fn(),
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeResult(overrides: Partial<PuppeteerResult> = {}) {
  return {
    success: true,
    output: 'done',
    trajectory: [],
    totalSteps: 3,
    totalDurationMs: 1000,
    totalTokens: 500,
    totalCost: 0.01,
    emergentPatterns: { hubAgents: [], cycles: [], graphDensity: 0, cyclicalityScore: 0 },
    terminationReason: 'task_complete' as const,
    sessionId: 'session-abc',
    ...overrides,
    // A fixture that varies `totalSteps` without saying otherwise means every
    // step was scored. Leaving `scoredSteps` at its literal made the arithmetic
    // in these tests inconsistent with itself once reward moved onto it.
    metrics: overrides.metrics ?? {
      avgReward: 0.8,
      scoredSteps: overrides.totalSteps ?? 3,
      taskCompletionRate: 1.0,
      efficiencyScore: 0.5,
      compactionScore: 0.3,
      cyclicalityScore: 0.1,
    },
  };
}

describe('DEFAULT_LEARNING_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_LEARNING_CONFIG.enableLearning).toBe(true);
    expect(DEFAULT_LEARNING_CONFIG.bufferCapacity).toBe(10000);
    expect(DEFAULT_LEARNING_CONFIG.updateAfterEpisodes).toBe(1);
  });
});

describe('processOrchestrationForLearning', () => {
  const steps = [makeStep(), makeStep({ action: 'agent-2' })];

  beforeEach(() => {
    vi.clearAllMocks();
    mockConvertTrajectory.mockReturnValue(steps);
    mockIsLearnablePolicyEngine.mockReturnValue(true);
  });

  it('converts trajectory, adds to buffer, and updates policy', async () => {
    const buffer = makeBuffer();
    const engine = makeEngine();
    const result = makeResult();
    await processOrchestrationForLearning(result, buffer, engine);
    expect(mockConvertTrajectory).toHaveBeenCalledWith(result.trajectory);
    expect(buffer.addEpisode).toHaveBeenCalledWith('session-abc', steps);
    expect(engine.updatePolicy).toHaveBeenCalled();
  });

  it('returns early when trajectory conversion returns empty array', async () => {
    mockConvertTrajectory.mockReturnValue([]);
    const buffer = makeBuffer();
    const engine = makeEngine();
    await processOrchestrationForLearning(makeResult(), buffer, engine);
    expect(buffer.addEpisode).not.toHaveBeenCalled();
    expect(engine.updatePolicy).not.toHaveBeenCalled();
  });

  it('returns early when trajectory conversion throws', async () => {
    mockConvertTrajectory.mockImplementation(() => {
      throw new Error('convert fail');
    });
    const buffer = makeBuffer();
    const engine = makeEngine();
    await processOrchestrationForLearning(makeResult(), buffer, engine);
    expect(buffer.addEpisode).not.toHaveBeenCalled();
  });

  it('returns early when addEpisode throws', async () => {
    const buffer = makeBuffer({
      addEpisode: vi.fn().mockImplementation(() => {
        throw new Error('buffer full');
      }),
    });
    const engine = makeEngine();
    await processOrchestrationForLearning(makeResult(), buffer, engine);
    expect(engine.updatePolicy).not.toHaveBeenCalled();
  });

  it('skips policy update when engine is not learnable', async () => {
    mockIsLearnablePolicyEngine.mockReturnValue(false);
    const buffer = makeBuffer();
    const engine = makeEngine();
    await processOrchestrationForLearning(makeResult(), buffer, engine);
    expect(buffer.addEpisode).toHaveBeenCalled();
    expect(engine.updatePolicy).not.toHaveBeenCalled();
  });

  it('rewards the sum over scored steps, not an extrapolation across all of them', async () => {
    // `avgReward` became the mean over SCORED steps in #4766. Multiplying it
    // by `totalSteps` hands the policy back the contribution of exactly the
    // steps that exclusion removed: 3 scored steps averaging 0.8 out of 4
    // total is a reward sum of 2.4, and the old form reported 3.2.
    const result = makeResult({
      totalSteps: 4,
      metrics: {
        avgReward: 0.8,
        scoredSteps: 3,
        taskCompletionRate: 1.0,
        efficiencyScore: 0.5,
        compactionScore: 0.3,
        cyclicalityScore: 0.1,
      },
    });
    const buffer = makeBuffer();
    const engine = makeEngine();

    await processOrchestrationForLearning(result, buffer, engine);

    expect(engine.updatePolicy).toHaveBeenCalledWith(steps, 2.4000000000000004);
  });

  it('skips the policy update when no step reported a reward', async () => {
    // The empty case. With every step unmeasured there is no reward to learn
    // from; updating on the 0 that falls out of an empty mean trains the
    // policy on the absence of data as though it were a measurement.
    const result = makeResult({
      totalSteps: 4,
      metrics: {
        avgReward: 0,
        scoredSteps: 0,
        taskCompletionRate: 1.0,
        efficiencyScore: 0.5,
        compactionScore: 0.3,
        cyclicalityScore: 0.1,
      },
    });
    const buffer = makeBuffer();
    const engine = makeEngine();

    await processOrchestrationForLearning(result, buffer, engine);

    expect(buffer.addEpisode).toHaveBeenCalled();
    expect(engine.updatePolicy).not.toHaveBeenCalled();
  });

  it('handles policy update returning error result', async () => {
    const engine = makeEngine({
      updatePolicy: vi.fn().mockReturnValue(
        Promise.resolve({
          ok: false,
          error: { message: 'update failed', code: 'UPDATE_FAILED' },
        })
      ),
    });
    await expect(
      processOrchestrationForLearning(makeResult(), makeBuffer(), engine)
    ).resolves.toBeUndefined();
  });

  it('handles policy update throwing an exception', async () => {
    const engine = makeEngine({
      updatePolicy: vi.fn().mockReturnValue(Promise.reject(new Error('kaboom'))),
    });
    await expect(
      processOrchestrationForLearning(makeResult(), makeBuffer(), engine)
    ).resolves.toBeUndefined();
  });

  it('handles error throw in trajectory conversion gracefully', async () => {
    mockConvertTrajectory.mockImplementation(() => {
      throw new Error('string error');
    });
    const buffer = makeBuffer();
    await processOrchestrationForLearning(makeResult(), buffer, makeEngine());
    expect(buffer.addEpisode).not.toHaveBeenCalled();
  });

  it('handles error throw in addEpisode gracefully', async () => {
    const buffer = makeBuffer({
      addEpisode: vi.fn().mockImplementation(() => {
        throw new Error('buffer error');
      }),
    });
    const engine = makeEngine();
    await processOrchestrationForLearning(makeResult(), buffer, engine);
    expect(engine.updatePolicy).not.toHaveBeenCalled();
  });

  it('handles exception in top-level catch', async () => {
    const badResult = {
      get trajectory(): never {
        throw new Error('top-level-fail');
      },
      sessionId: 'sess-bad',
      metrics: ZERO_METRICS,
      totalSteps: 0,
    } as unknown as PuppeteerResult;
    await expect(
      processOrchestrationForLearning(badResult, makeBuffer(), makeEngine())
    ).resolves.toBeUndefined();
  });

  it('calls getStats on buffer after adding episode', async () => {
    const buffer = makeBuffer({
      getStats: vi.fn().mockReturnValue(makeBufferStats({ episodeCount: 5 })),
    });
    await processOrchestrationForLearning(makeResult(), buffer, makeEngine());
    expect(buffer.getStats).toHaveBeenCalled();
  });

  it('calls getStats on engine after successful policy update', async () => {
    const engine = makeEngine();
    await processOrchestrationForLearning(makeResult(), makeBuffer(), engine);
    expect(engine.getStats).toHaveBeenCalled();
  });
});

describe('supportsLearning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true for learnable engine', () => {
    mockIsLearnablePolicyEngine.mockReturnValue(true);
    expect(supportsLearning(makeEngine())).toBe(true);
  });

  it('returns false for non-learnable engine', () => {
    mockIsLearnablePolicyEngine.mockReturnValue(false);
    expect(supportsLearning({})).toBe(false);
  });

  it('returns false for null', () => {
    mockIsLearnablePolicyEngine.mockReturnValue(false);
    expect(supportsLearning(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    mockIsLearnablePolicyEngine.mockReturnValue(false);
    expect(supportsLearning(undefined)).toBe(false);
  });

  it('delegates to isLearnablePolicyEngine', () => {
    const engine = { custom: true };
    mockIsLearnablePolicyEngine.mockReturnValue(true);
    supportsLearning(engine);
    expect(mockIsLearnablePolicyEngine).toHaveBeenCalledWith(engine);
  });
});

describe('createLearningHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConvertTrajectory.mockReturnValue([makeStep()]);
    mockIsLearnablePolicyEngine.mockReturnValue(true);
  });

  it('returns a function', () => {
    const handler = createLearningHandler(makeBuffer(), makeEngine());
    expect(typeof handler).toBe('function');
  });

  it('returned function processes result through learning pipeline', async () => {
    const buffer = makeBuffer();
    const engine = makeEngine();
    const handler = createLearningHandler(buffer, engine);
    const result = makeResult();
    await handler(result);
    expect(mockConvertTrajectory).toHaveBeenCalledWith(result.trajectory);
    expect(buffer.addEpisode).toHaveBeenCalled();
  });

  it('returned function handles errors gracefully', async () => {
    mockConvertTrajectory.mockImplementation(() => {
      throw new Error('fail');
    });
    const handler = createLearningHandler(makeBuffer(), makeEngine());
    await expect(handler(makeResult())).resolves.toBeUndefined();
  });

  it('can be called multiple times with different results', async () => {
    const buffer = makeBuffer();
    const handler = createLearningHandler(buffer, makeEngine());
    await handler(makeResult({ sessionId: 'sess-1' }));
    await handler(makeResult({ sessionId: 'sess-2' }));
    expect(buffer.addEpisode).toHaveBeenCalledTimes(2);
  });
});

describe('computeEpisodeReward', () => {
  it('computes base reward over scored steps, not total steps', () => {
    // The old assertion used `totalSteps: 0`, where every multiplier yields 0
    // — it passed whichever factor the code used. These differ.
    const result = makeResult({
      success: false,
      totalSteps: 10,
      metrics: { ...ZERO_METRICS, avgReward: 0.5, scoredSteps: 2 },
    });

    expect(computeEpisodeReward(result, 0, 0)).toBe(1.0);
  });

  it('still charges the efficiency penalty for unscored steps', () => {
    // The pair: a step that reported no reward was still executed and paid
    // for, so the penalty is over `totalSteps`. Scoping it to scored steps
    // would make an unmeasured step free, which is the distortion #4766 set
    // out to remove.
    const scoredOnly = makeResult({
      success: false,
      totalSteps: 2,
      metrics: { ...ZERO_METRICS, avgReward: 0, scoredSteps: 2 },
    });
    const withUnscored = makeResult({
      success: false,
      totalSteps: 10,
      metrics: { ...ZERO_METRICS, avgReward: 0, scoredSteps: 2 },
    });

    expect(computeEpisodeReward(withUnscored, 0, 1)).toBeLessThan(
      computeEpisodeReward(scoredOnly, 0, 1)
    );
  });

  it('adds completion bonus on success', () => {
    const result = makeResult({ success: true, totalSteps: 0 });
    expect(computeEpisodeReward(result, 2.0, 0) - computeEpisodeReward(result, 0, 0)).toBe(2.0);
  });

  it('does not add completion bonus on failure', () => {
    const result = makeResult({ success: false, totalSteps: 0 });
    expect(computeEpisodeReward(result, 5.0, 0)).toBe(computeEpisodeReward(result, 0, 0));
  });

  it('applies efficiency penalty proportional to steps', () => {
    const fewSteps = makeResult({ success: false, totalSteps: 10, metrics: ZERO_METRICS });
    const manySteps = makeResult({ success: false, totalSteps: 50, metrics: ZERO_METRICS });
    expect(computeEpisodeReward(fewSteps, 0, 0.1)).toBeGreaterThan(
      computeEpisodeReward(manySteps, 0, 0.1)
    );
  });

  it('uses default completionBonus of 1.0', () => {
    const success = makeResult({ success: true, totalSteps: 0 });
    const fail = makeResult({ success: false, totalSteps: 0 });
    expect(computeEpisodeReward(success) - computeEpisodeReward(fail)).toBe(1.0);
  });

  it('uses default efficiencyWeight of 0.1', () => {
    const result = makeResult({ success: false, totalSteps: 100 });
    // base=0.8*100=80, penalty=(100/100)*0.1=0.1, total=79.9
    expect(computeEpisodeReward(result)).toBeCloseTo(79.9, 5);
  });

  it('computes correctly for typical successful run', () => {
    const result = makeResult({
      success: true,
      totalSteps: 5,
      metrics: {
        avgReward: 0.6,
        scoredSteps: 5,
        taskCompletionRate: 1.0,
        efficiencyScore: 0.5,
        compactionScore: 0.3,
        cyclicalityScore: 0.1,
      },
    });
    // base=3.0, bonus=1.0, penalty=0.005, total=3.995
    expect(computeEpisodeReward(result)).toBeCloseTo(3.995, 5);
  });

  it('handles zero avgReward', () => {
    const result = makeResult({ success: false, totalSteps: 10, metrics: ZERO_METRICS });
    // penalty=(10/100)*0.1=0.01
    expect(computeEpisodeReward(result, 0, 0.1)).toBeCloseTo(-0.01, 5);
  });

  it('handles negative avgReward', () => {
    const result = makeResult({
      success: false,
      totalSteps: 2,
      metrics: { ...ZERO_METRICS, avgReward: -1.0, scoredSteps: 2 },
    });
    expect(computeEpisodeReward(result, 0, 0)).toBe(-2.0);
  });

  it('handles large totalSteps', () => {
    const result = makeResult({ success: false, totalSteps: 1000 });
    // base=0.8*1000=800, penalty=(1000/100)*0.1=1.0, total=799.0
    expect(computeEpisodeReward(result, 0, 0.1)).toBeCloseTo(799.0, 5);
  });

  it('returns reward with zero efficiency weight', () => {
    const result = makeResult({ success: true, totalSteps: 50 });
    // base=0.8*50=40, bonus=1.0, no penalty
    expect(computeEpisodeReward(result, 1.0, 0)).toBe(41.0);
  });
});
