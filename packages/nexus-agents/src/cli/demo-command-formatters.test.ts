/**
 * Tests for demo-command-formatters.ts
 *
 * Covers routing demo, expert list, workflow demo,
 * available workflows list, and live routing demo formatting.
 */

import { describe, it, expect } from 'vitest';
import {
  formatRoutingDemo,
  formatExpertListDemo,
  formatWorkflowDemo,
  formatAvailableWorkflows,
  formatLiveRoutingDemo,
} from './demo-command-formatters.js';
import type { MockRoutingResult, MockWorkflow, LiveRoutingResult } from './demo-command-types.js';

// ============================================================================
// Fixtures
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeRoutingResult(overrides: Partial<MockRoutingResult> = {}) {
  return {
    task: 'Implement authentication',
    taskProfile: {
      complexity: 'medium' as const,
      codeGeneration: true,
      reasoning: true,
      estimatedTokens: 5000,
    },
    budgetResults: [
      { model: 'claude', withinBudget: true, reason: 'Within limits' },
      { model: 'gpt4', withinBudget: false, reason: 'Exceeds token budget' },
    ],
    topsisRanking: [
      { model: 'claude', score: 0.92, quality: 9.5, cost: 8.0, latency: 7.5 },
      { model: 'gpt4', score: 0.85, quality: 9.0, cost: 6.0, latency: 8.0 },
    ],
    selectedModel: 'claude',
    selectionReason: 'Best overall score',
    ...overrides,
  } as MockRoutingResult;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockWorkflow(overrides: Partial<MockWorkflow> = {}) {
  return {
    name: 'code-review',
    description: 'Automated code review workflow',
    inputs: [
      { name: 'url', type: 'string', required: true },
      { name: 'depth', type: 'number', required: false },
    ],
    steps: [
      { id: 'analyze', agent: 'architecture_expert', description: 'Analyze codebase' },
      { id: 'review', agent: 'code_expert', description: 'Review changes' },
    ],
    ...overrides,
  } as MockWorkflow;
}

// ============================================================================
// formatRoutingDemo
// ============================================================================

describe('formatRoutingDemo', () => {
  it('includes task name', () => {
    const output = formatRoutingDemo(makeRoutingResult());
    expect(output).toContain('Implement authentication');
  });

  it('includes task profile details', () => {
    const output = formatRoutingDemo(makeRoutingResult());
    expect(output).toContain('medium');
    expect(output).toContain('5000');
  });

  it('includes budget results with PASS/FAIL', () => {
    const output = formatRoutingDemo(makeRoutingResult());
    expect(output).toContain('PASS');
    expect(output).toContain('FAIL');
  });

  it('includes TOPSIS ranking table', () => {
    const output = formatRoutingDemo(makeRoutingResult());
    expect(output).toContain('Model');
    expect(output).toContain('Score');
    expect(output).toContain('0.92');
  });

  it('includes selected model', () => {
    const output = formatRoutingDemo(makeRoutingResult());
    expect(output).toContain('Selected: claude');
    expect(output).toContain('Best overall score');
  });

  it('includes demo mode disclaimer', () => {
    const output = formatRoutingDemo(makeRoutingResult());
    expect(output).toContain('mock');
  });

  it('shows code generation yes/no', () => {
    const output = formatRoutingDemo(
      makeRoutingResult({
        taskProfile: {
          complexity: 'low',
          codeGeneration: false,
          reasoning: false,
          estimatedTokens: 100,
        },
      })
    );
    expect(output).toContain('no');
  });
});

// ============================================================================
// formatExpertListDemo
// ============================================================================

describe('formatExpertListDemo', () => {
  it('includes expert list header', () => {
    const output = formatExpertListDemo();
    expect(output).toContain('Expert List Demo');
  });

  it('includes built-in expert roles', () => {
    const output = formatExpertListDemo();
    expect(output).toContain('code_expert');
    expect(output).toContain('security_expert');
    expect(output).toContain('architecture_expert');
  });

  it('includes column headers', () => {
    const output = formatExpertListDemo();
    expect(output).toContain('Name');
    expect(output).toContain('Domain');
    expect(output).toContain('Capabilities');
  });

  it('returns non-empty string', () => {
    const output = formatExpertListDemo();
    expect(output.length).toBeGreaterThan(100);
  });
});

// ============================================================================
// formatWorkflowDemo
// ============================================================================

describe('formatWorkflowDemo', () => {
  it('includes workflow name in header', () => {
    const output = formatWorkflowDemo(makeMockWorkflow());
    expect(output).toContain('code-review');
  });

  it('includes workflow description', () => {
    const output = formatWorkflowDemo(makeMockWorkflow());
    expect(output).toContain('Automated code review workflow');
  });

  it('includes required inputs', () => {
    const output = formatWorkflowDemo(makeMockWorkflow());
    expect(output).toContain('url');
    expect(output).toContain('string');
    expect(output).toContain('required');
  });

  it('includes optional inputs', () => {
    const output = formatWorkflowDemo(makeMockWorkflow());
    expect(output).toContain('depth');
    expect(output).toContain('optional');
  });

  it('includes execution steps with IDs', () => {
    const output = formatWorkflowDemo(makeMockWorkflow());
    expect(output).toContain('[analyze]');
    expect(output).toContain('[review]');
    expect(output).toContain('Analyze codebase');
  });

  it('includes step agents', () => {
    const output = formatWorkflowDemo(makeMockWorkflow());
    expect(output).toContain('architecture_expert');
    expect(output).toContain('code_expert');
  });

  it('includes step numbering', () => {
    const output = formatWorkflowDemo(makeMockWorkflow());
    expect(output).toContain('1.');
    expect(output).toContain('2.');
  });

  it('includes dry-run hint', () => {
    const output = formatWorkflowDemo(makeMockWorkflow());
    expect(output).toContain('--dry-run');
  });
});

// ============================================================================
// formatAvailableWorkflows
// ============================================================================

describe('formatAvailableWorkflows', () => {
  it('lists workflow names', () => {
    const workflows = [
      { name: 'code-review', description: 'Review code' },
      { name: 'deploy', description: 'Deploy to prod' },
    ];
    const output = formatAvailableWorkflows(workflows);
    expect(output).toContain('code-review');
    expect(output).toContain('deploy');
  });

  it('lists workflow descriptions', () => {
    const workflows = [{ name: 'test', description: 'Run all tests' }];
    const output = formatAvailableWorkflows(workflows);
    expect(output).toContain('Run all tests');
  });

  it('includes header', () => {
    const output = formatAvailableWorkflows([]);
    expect(output).toContain('Available Workflows');
  });

  it('includes usage hint', () => {
    const output = formatAvailableWorkflows([]);
    expect(output).toContain('nexus-agents');
  });

  it('handles empty list', () => {
    const output = formatAvailableWorkflows([]);
    expect(output).toContain('Available Workflows');
    expect(typeof output).toBe('string');
  });
});

// ============================================================================
// formatLiveRoutingDemo
// ============================================================================

describe('formatLiveRoutingDemo', () => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  function makeLiveResult(overrides: Partial<LiveRoutingResult> = {}) {
    return {
      ...makeRoutingResult(),
      mode: 'live' as const,
      availableClis: [
        { name: 'claude', available: true, authenticated: true },
        { name: 'codex', available: true, authenticated: false },
        { name: 'gemini', available: false, authenticated: false },
      ],
      executionResult: 'Authentication module implemented successfully.',
      executionTime: 1234,
      ...overrides,
    } as LiveRoutingResult;
  }

  it('includes LIVE label', () => {
    const output = formatLiveRoutingDemo(makeLiveResult());
    expect(output).toContain('LIVE');
  });

  it('shows CLI availability status', () => {
    const output = formatLiveRoutingDemo(makeLiveResult());
    expect(output).toContain('claude');
    expect(output).toContain('authenticated');
    expect(output).toContain('not available');
  });

  it('includes execution result when present', () => {
    const output = formatLiveRoutingDemo(makeLiveResult());
    expect(output).toContain('Execution Result');
    expect(output).toContain('implemented successfully');
  });

  it('includes execution time', () => {
    const output = formatLiveRoutingDemo(makeLiveResult());
    expect(output).toContain('1234');
  });

  it('handles missing execution result', () => {
    const output = formatLiveRoutingDemo(
      makeLiveResult({ executionResult: undefined, executionTime: undefined })
    );
    expect(output).toContain('not performed');
    expect(output).toContain('doctor');
  });

  it('includes task profile', () => {
    const output = formatLiveRoutingDemo(makeLiveResult());
    expect(output).toContain('medium');
    expect(output).toContain('5000');
  });
});
