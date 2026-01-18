/**
 * Pattern Tracker Tests
 *
 * Tests for emergent pattern detection.
 *
 * @module agents/orchestration/pattern-tracker.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PatternTracker,
  createPatternTracker,
  calculateCompactionScore,
  hasStrongCompaction,
  hasStrongCyclicality,
} from './pattern-tracker.js';
import type { PuppeteerStepResult, AgentDistribution, PuppeteerState } from './puppeteer-types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockDistribution = (): AgentDistribution => ({
  probabilities: new Map([
    ['agent-1', 0.5],
    ['agent-2', 0.5],
  ]),
  rawScores: new Map([
    ['agent-1', 1.0],
    ['agent-2', 1.0],
  ]),
  reasoning: 'Test',
});

const createMockState = (step: number): PuppeteerState => ({
  step,
  task: { id: 'test', description: 'Test', context: {} },
  agentOutputs: [],
  context: '',
  metadata: { progress: 0, totalCost: 0, totalTokens: 0, elapsedMs: 0, startedAt: '' },
  sessionId: 'test',
});

const createMockStep = (agent: string, step: number): PuppeteerStepResult => ({
  selectedAgent: agent,
  distribution: createMockDistribution(),
  agentOutput: {
    step,
    agentId: agent,
    output: 'output',
    durationMs: 100,
    tokensUsed: 50,
    model: 'test',
  },
  newState: createMockState(step + 1),
  reward: 0.5,
  shouldTerminate: false,
});

// =============================================================================
// Constructor Tests
// =============================================================================

describe('PatternTracker', () => {
  describe('constructor', () => {
    it('creates with default config', () => {
      const tracker = new PatternTracker();
      expect(tracker).toBeDefined();
    });

    it('creates with custom config', () => {
      const tracker = new PatternTracker({
        hubThreshold: 0.5,
        minCycleLength: 3,
      });
      expect(tracker).toBeDefined();
    });
  });

  describe('createPatternTracker factory', () => {
    it('creates PatternTracker instance', () => {
      const tracker = createPatternTracker();
      expect(tracker).toBeInstanceOf(PatternTracker);
    });
  });
});

// =============================================================================
// Hub Detection Tests
// =============================================================================

describe('detectHubs', () => {
  let tracker: PatternTracker;

  beforeEach(() => {
    tracker = new PatternTracker({ hubThreshold: 0.3 });
  });

  it('returns empty for empty trajectory', () => {
    const hubs = tracker.detectHubs([]);
    expect(hubs).toHaveLength(0);
  });

  it('detects single hub agent', () => {
    const trajectory = [
      createMockStep('agent-hub', 0),
      createMockStep('agent-hub', 1),
      createMockStep('agent-hub', 2),
      createMockStep('agent-other', 3),
      createMockStep('agent-hub', 4),
    ];

    const hubs = tracker.detectHubs(trajectory);

    expect(hubs.length).toBeGreaterThanOrEqual(1);
    const firstHub = hubs[0];
    expect(firstHub).toBeDefined();
    if (firstHub) {
      expect(firstHub.agentId).toBe('agent-hub');
      expect(firstHub.activationCount).toBe(4);
      expect(firstHub.percentage).toBe(0.8);
    }
  });

  it('detects multiple hub agents', () => {
    const trajectory = [
      createMockStep('hub-1', 0),
      createMockStep('hub-1', 1),
      createMockStep('hub-2', 2),
      createMockStep('hub-2', 3),
      createMockStep('hub-1', 4),
      createMockStep('hub-2', 5),
    ];

    const tracker50 = new PatternTracker({ hubThreshold: 0.3 });
    const hubs = tracker50.detectHubs(trajectory);

    expect(hubs.length).toBe(2);
  });

  it('excludes agents below threshold', () => {
    const trajectory = [
      createMockStep('major', 0),
      createMockStep('major', 1),
      createMockStep('major', 2),
      createMockStep('major', 3),
      createMockStep('minor', 4),
    ];

    const hubs = tracker.detectHubs(trajectory);

    expect(hubs).toHaveLength(1);
    const firstHub = hubs[0];
    expect(firstHub).toBeDefined();
    if (firstHub) {
      expect(firstHub.agentId).toBe('major');
    }
  });

  it('sorts hubs by activation count', () => {
    const trajectory = [
      createMockStep('hub-a', 0),
      createMockStep('hub-a', 1),
      createMockStep('hub-b', 2),
      createMockStep('hub-b', 3),
      createMockStep('hub-b', 4),
    ];

    const tracker30 = new PatternTracker({ hubThreshold: 0.3 });
    const hubs = tracker30.detectHubs(trajectory);

    const firstHub = hubs[0];
    expect(firstHub).toBeDefined();
    if (firstHub) {
      expect(firstHub.agentId).toBe('hub-b');
      expect(firstHub.activationCount).toBe(3);
    }
  });
});

// =============================================================================
// Cycle Detection Tests
// =============================================================================

describe('detectCycles', () => {
  let tracker: PatternTracker;

  beforeEach(() => {
    tracker = new PatternTracker({
      minCycleLength: 2,
      maxCycleLength: 4,
      minCycleOccurrences: 2,
    });
  });

  it('returns empty for empty trajectory', () => {
    const cycles = tracker.detectCycles([]);
    expect(cycles).toHaveLength(0);
  });

  it('returns empty for short trajectory', () => {
    const trajectory = [createMockStep('a', 0)];
    const cycles = tracker.detectCycles(trajectory);
    expect(cycles).toHaveLength(0);
  });

  it('detects simple 2-agent cycle', () => {
    const trajectory = [
      createMockStep('a', 0),
      createMockStep('b', 1),
      createMockStep('a', 2),
      createMockStep('b', 3),
      createMockStep('a', 4),
      createMockStep('b', 5),
    ];

    const cycles = tracker.detectCycles(trajectory);

    expect(cycles.length).toBeGreaterThanOrEqual(1);
    const cycle = cycles.find((c) => c.agents.length === 2);
    expect(cycle).toBeDefined();
    expect(cycle!.occurrences).toBeGreaterThanOrEqual(2);
  });

  it('detects 3-agent cycle', () => {
    const trajectory = [
      createMockStep('a', 0),
      createMockStep('b', 1),
      createMockStep('c', 2),
      createMockStep('a', 3),
      createMockStep('b', 4),
      createMockStep('c', 5),
    ];

    const cycles = tracker.detectCycles(trajectory);

    const cycle3 = cycles.find((c) => c.agents.length === 3);
    expect(cycle3).toBeDefined();
    expect(cycle3!.occurrences).toBe(2);
  });

  it('filters cycles below minimum occurrences', () => {
    const trajectory = [
      createMockStep('a', 0),
      createMockStep('b', 1),
      createMockStep('c', 2),
      createMockStep('d', 3),
      createMockStep('e', 4),
    ];

    const cycles = tracker.detectCycles(trajectory);

    // No pattern repeats enough times
    expect(cycles).toHaveLength(0);
  });

  it('handles consecutive same-agent steps', () => {
    const trajectory = [
      createMockStep('a', 0),
      createMockStep('a', 1),
      createMockStep('a', 2),
      createMockStep('a', 3),
    ];

    const cycles = tracker.detectCycles(trajectory);

    // Should detect a|a pattern
    expect(cycles.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// Graph Density Tests
// =============================================================================

describe('calculateGraphDensity', () => {
  let tracker: PatternTracker;

  beforeEach(() => {
    tracker = new PatternTracker();
  });

  it('returns 0 for empty trajectory', () => {
    const density = tracker.calculateGraphDensity([]);
    expect(density).toBe(0);
  });

  it('returns 0 for single-step trajectory', () => {
    const trajectory = [createMockStep('a', 0)];
    const density = tracker.calculateGraphDensity(trajectory);
    expect(density).toBe(0);
  });

  it('calculates density for simple sequence', () => {
    const trajectory = [createMockStep('a', 0), createMockStep('b', 1)];

    const density = tracker.calculateGraphDensity(trajectory);

    // 2 agents, 1 transition (a->b), max edges = 4
    // density = 1/4 = 0.25
    expect(density).toBe(0.25);
  });

  it('higher density for more interconnected graph', () => {
    // Simple linear: a -> b -> c (2 edges, 3 agents, max 9)
    const linear = [createMockStep('a', 0), createMockStep('b', 1), createMockStep('c', 2)];

    // Cyclic: a -> b -> a -> b (2 edges, 2 agents, max 4)
    const cyclic = [
      createMockStep('a', 0),
      createMockStep('b', 1),
      createMockStep('a', 2),
      createMockStep('b', 3),
    ];

    const linearDensity = tracker.calculateGraphDensity(linear);
    const cyclicDensity = tracker.calculateGraphDensity(cyclic);

    // Cyclic should have higher density (2/4=0.5 vs 2/9=0.22)
    expect(cyclicDensity).toBeGreaterThan(linearDensity);
  });
});

// =============================================================================
// Cyclicality Score Tests
// =============================================================================

describe('calculateCyclicalityScore', () => {
  let tracker: PatternTracker;

  beforeEach(() => {
    tracker = new PatternTracker();
  });

  it('returns 0 for no cycles', () => {
    const score = tracker.calculateCyclicalityScore([], 10);
    expect(score).toBe(0);
  });

  it('returns 0 for zero steps', () => {
    const cycles = [{ agents: ['a', 'b'], occurrences: 3 }];
    const score = tracker.calculateCyclicalityScore(cycles, 0);
    expect(score).toBe(0);
  });

  it('calculates score based on cycle coverage', () => {
    const cycles = [{ agents: ['a', 'b'], occurrences: 3 }];
    // 2 agents * 3 occurrences = 6 steps in cycles
    const score = tracker.calculateCyclicalityScore(cycles, 10);

    expect(score).toBe(0.6);
  });

  it('caps score at 1.0', () => {
    const cycles = [{ agents: ['a', 'b', 'c'], occurrences: 10 }];
    const score = tracker.calculateCyclicalityScore(cycles, 5);

    expect(score).toBe(1.0);
  });
});

// =============================================================================
// Full Analysis Tests
// =============================================================================

describe('analyze', () => {
  let tracker: PatternTracker;

  beforeEach(() => {
    tracker = new PatternTracker();
  });

  it('returns empty patterns for empty trajectory', () => {
    const patterns = tracker.analyze([]);

    expect(patterns.hubAgents).toHaveLength(0);
    expect(patterns.cycles).toHaveLength(0);
    expect(patterns.graphDensity).toBe(0);
    expect(patterns.cyclicalityScore).toBe(0);
  });

  it('returns complete analysis for non-empty trajectory', () => {
    const trajectory = [
      createMockStep('hub', 0),
      createMockStep('worker', 1),
      createMockStep('hub', 2),
      createMockStep('worker', 3),
      createMockStep('hub', 4),
    ];

    const patterns = tracker.analyze(trajectory);

    expect(patterns.hubAgents.length).toBeGreaterThanOrEqual(1);
    expect(patterns.graphDensity).toBeGreaterThan(0);
    expect(patterns.cyclicalityScore).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// Utility Functions Tests
// =============================================================================

describe('calculateCompactionScore', () => {
  it('returns 0 for no hubs', () => {
    const score = calculateCompactionScore([]);
    expect(score).toBe(0);
  });

  it('sums hub percentages', () => {
    const hubs = [
      { agentId: 'a', activationCount: 3, percentage: 0.3 },
      { agentId: 'b', activationCount: 2, percentage: 0.2 },
    ];
    const score = calculateCompactionScore(hubs);
    expect(score).toBe(0.5);
  });

  it('caps at 1.0', () => {
    const hubs = [
      { agentId: 'a', activationCount: 8, percentage: 0.8 },
      { agentId: 'b', activationCount: 4, percentage: 0.4 },
    ];
    const score = calculateCompactionScore(hubs);
    expect(score).toBe(1.0);
  });
});

describe('hasStrongCompaction', () => {
  it('returns false for no hubs', () => {
    expect(hasStrongCompaction([])).toBe(false);
  });

  it('returns true when hub has >50% traffic', () => {
    const hubs = [{ agentId: 'a', activationCount: 6, percentage: 0.6 }];
    expect(hasStrongCompaction(hubs)).toBe(true);
  });

  it('returns false when no hub has >50% traffic', () => {
    const hubs = [
      { agentId: 'a', activationCount: 4, percentage: 0.4 },
      { agentId: 'b', activationCount: 3, percentage: 0.3 },
    ];
    expect(hasStrongCompaction(hubs)).toBe(false);
  });
});

describe('hasStrongCyclicality', () => {
  it('returns false for low cyclicality', () => {
    expect(hasStrongCyclicality(0.2)).toBe(false);
    expect(hasStrongCyclicality(0.4)).toBe(false);
  });

  it('returns true for high cyclicality', () => {
    expect(hasStrongCyclicality(0.5)).toBe(true);
    expect(hasStrongCyclicality(0.8)).toBe(true);
  });
});
