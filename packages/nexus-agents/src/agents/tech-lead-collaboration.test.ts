/**
 * Tests for OrchestratorCollaborationHelper
 * @module agents/tech-lead-collaboration.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Task, TaskResult, IAgent } from '../core/index.js';
import type { TaskAnalysis } from './tech-lead-types.js';
import {
  OrchestratorCollaborationHelper,
  createOrchestratorCollaborationHelper,
} from './tech-lead-collaboration.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../core/index.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

// Hoisted so the execute call can be inspected (#4833). The recommendation
// is deliberately 'parallel', which DIFFERS from the 'consensus' pattern
// buildCollabConfig sets — with both the same, a test cannot tell whether the
// executed pattern came from the config or from the recommendation.
const { executeSelectorMock } = vi.hoisted(() => ({ executeSelectorMock: vi.fn() }));

vi.mock('./collaboration/adaptive-protocol-selector.js', () => ({
  createAdaptiveProtocolSelector: () => ({
    getRecommendation: vi.fn(() => ({
      recommendedPattern: 'parallel',
      taskType: 'synthesis',
      confidence: 0.9,
    })),
    execute: executeSelectorMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        value: {
          sessionId: 'test-session',
          pattern: 'consensus',
          aggregatedResult: { output: 'Synthesized answer', strategy: 'consensus' },
          expertResults: [
            {
              expertId: 'e1',
              role: 'code_expert',
              contributionScore: 0.8,
              executionTimeMs: 100,
              success: true,
            },
            {
              expertId: 'e2',
              role: 'security_expert',
              contributionScore: 0.7,
              executionTimeMs: 200,
              success: true,
            },
            {
              expertId: 'e3',
              role: 'testing_expert',
              contributionScore: 0.6,
              executionTimeMs: 150,
              success: true,
            },
          ],
          durationMs: 5000,
          success: true,
        },
      })
    ),
  }),
  AdaptiveProtocolSelector: vi.fn(),
}));

vi.mock('../utils/index.js', () => ({
  generateUUID: () => 'test-uuid-1234',
}));

// ============================================================================
// Test Helpers
// ============================================================================

function makeTaskResult(model: string, output: string): TaskResult {
  return {
    taskId: `task-${model}`,
    output,
    metadata: {
      model,
      tokensUsed: 100,
      durationMs: 500,
      toolsUsed: [],
    },
  };
}

function makeAnalysis(complexity: number): TaskAnalysis {
  return {
    taskId: 'task-1',
    complexity,
    taskType: 'code',
    requirements: ['req-1'],
    risks: [],
    needsDecomposition: complexity > 5,
    approach: 'standard',
    estimatedEffort: complexity,
  };
}

function makeTask(): Task {
  return {
    id: 'original-task',
    description: 'Build a feature',
    context: {},
  };
}

function makeAgentsMap(): Map<string, IAgent> {
  return new Map([
    ['e1', { id: 'e1', role: 'code_expert', executeTask: vi.fn() } as unknown as IAgent],
    ['e2', { id: 'e2', role: 'security_expert', executeTask: vi.fn() } as unknown as IAgent],
    ['e3', { id: 'e3', role: 'testing_expert', executeTask: vi.fn() } as unknown as IAgent],
  ]);
}

// ============================================================================
// shouldUseCollaboration
// ============================================================================

describe('shouldUseCollaboration', () => {
  it('returns true when all conditions met', () => {
    const helper = new OrchestratorCollaborationHelper();
    expect(helper.shouldUseCollaboration(makeAnalysis(8), 3)).toBe(true);
  });

  it('returns false when collaboration disabled', () => {
    const helper = new OrchestratorCollaborationHelper({ enableCollaborativeSynthesis: false });
    expect(helper.shouldUseCollaboration(makeAnalysis(8), 3)).toBe(false);
  });

  it('returns false when too few results', () => {
    const helper = new OrchestratorCollaborationHelper();
    expect(helper.shouldUseCollaboration(makeAnalysis(8), 2)).toBe(false);
  });

  it('returns false when complexity below threshold', () => {
    const helper = new OrchestratorCollaborationHelper();
    expect(helper.shouldUseCollaboration(makeAnalysis(3), 5)).toBe(false);
  });

  it('respects custom minExpertsForCollaboration', () => {
    const helper = new OrchestratorCollaborationHelper({ minExpertsForCollaboration: 5 });
    expect(helper.shouldUseCollaboration(makeAnalysis(8), 4)).toBe(false);
    expect(helper.shouldUseCollaboration(makeAnalysis(8), 5)).toBe(true);
  });

  it('respects custom complexityThreshold', () => {
    const helper = new OrchestratorCollaborationHelper({ complexityThreshold: 5 });
    expect(helper.shouldUseCollaboration(makeAnalysis(4), 3)).toBe(false);
    expect(helper.shouldUseCollaboration(makeAnalysis(5), 3)).toBe(true);
  });
});

// ============================================================================
// collaborativeSynthesis
// ============================================================================

describe('collaborativeSynthesis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when too few results', async () => {
    const helper = new OrchestratorCollaborationHelper();
    const result = await helper.collaborativeSynthesis(
      [makeTaskResult('e1', 'output 1'), makeTaskResult('e2', 'output 2')],
      makeAgentsMap(),
      makeTask()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('at least 3 results');
    }
  });

  it('synthesizes results using collaboration protocol', async () => {
    const helper = new OrchestratorCollaborationHelper();
    const results = [
      makeTaskResult('e1', 'Code review complete'),
      makeTaskResult('e2', 'Security audit done'),
      makeTaskResult('e3', 'Tests passing'),
    ];
    const result = await helper.collaborativeSynthesis(results, makeAgentsMap(), makeTask());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.combinedOutput).toBeTruthy();
      expect(result.value.summary).toContain('Collaborative synthesis');
      expect(result.value.resultSummaries).toHaveLength(3);
      expect(result.value.qualityScore).toBeGreaterThan(0);
    }
  });

  it('executes the configured pattern, not the recommended one (#4833)', async () => {
    // Before #4833, `getRecommendation` returned this call's own
    // `config.pattern`, so forwarding it into `execute` was a no-op and
    // adaptive selection never affected what ran. Now that the recommendation
    // is a real adaptive choice, forwarding it would silently activate that
    // selection in production, with nothing measuring whether it helps. The
    // mock recommends 'parallel'; buildCollabConfig sets 'consensus'.
    const helper = new OrchestratorCollaborationHelper();
    const results = [
      makeTaskResult('e1', 'out1'),
      makeTaskResult('e2', 'out2'),
      makeTaskResult('e3', 'out3'),
    ];

    await helper.collaborativeSynthesis(results, makeAgentsMap(), makeTask());

    expect(executeSelectorMock).toHaveBeenCalledWith(
      expect.objectContaining({ pattern: 'consensus' }),
      expect.anything()
    );
  });

  it('includes collaboration metadata', async () => {
    const helper = new OrchestratorCollaborationHelper();
    const results = [
      makeTaskResult('e1', 'out1'),
      makeTaskResult('e2', 'out2'),
      makeTaskResult('e3', 'out3'),
    ];
    const result = await helper.collaborativeSynthesis(results, makeAgentsMap(), makeTask());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.collaborationMetadata).toBeDefined();
      expect(result.value.collaborationMetadata?.sessionId).toBe('test-session');
      expect(result.value.collaborationMetadata?.pattern).toBe('consensus');
      expect(result.value.collaborationMetadata?.participantCount).toBe(3);
    }
  });
});

// ============================================================================
// getProtocolSelector
// ============================================================================

describe('getProtocolSelector', () => {
  it('returns the protocol selector instance', () => {
    const helper = new OrchestratorCollaborationHelper();
    const selector = helper.getProtocolSelector();
    expect(selector).toBeDefined();
    expect(selector.getRecommendation).toBeDefined();
  });
});

// ============================================================================
// createOrchestratorCollaborationHelper factory
// ============================================================================

describe('createOrchestratorCollaborationHelper', () => {
  it('creates helper with default config', () => {
    const helper = createOrchestratorCollaborationHelper();
    expect(helper).toBeInstanceOf(OrchestratorCollaborationHelper);
  });

  it('creates helper with custom config', () => {
    const helper = createOrchestratorCollaborationHelper({
      enableCollaborativeSynthesis: false,
      minExpertsForCollaboration: 5,
    });
    expect(helper.shouldUseCollaboration(makeAnalysis(10), 4)).toBe(false);
  });
});
