/**
 * Tests for Reflexion Helpers
 * @module agents/collaboration/reflexion-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { Task } from '../../core/index.js';
import type { Persona, PersonaCritique, ReflexionResult } from './reflexion-types.js';
import {
  SyntheticCritiqueError,
  REFLEXION_DEFAULTS,
  buildReflexionConfig,
  formatRefinementTask,
  createFinalResultPayload,
  generatePersonaCritique,
  categorizeIssues,
  calculateAverageSeverity,
  extractActionItems,
  runDebate,
  createReflexionRound,
} from './reflexion-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: 'persona-1',
    role: 'Architect',
    perspective: 'System design',
    focusAreas: ['architecture', 'patterns'],
    ...overrides,
  } as Persona;
}

function makeCritique(overrides: Partial<PersonaCritique> = {}): PersonaCritique {
  return {
    personaId: 'persona-1',
    role: 'Architect',
    critique: 'Some feedback',
    suggestedImprovement: 'Improve design',
    severity: 0.5,
    issues: ['Issue A'],
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    description: 'Test task',
    ...overrides,
  } as Task;
}

// ============================================================================
// SyntheticCritiqueError
// ============================================================================

describe('SyntheticCritiqueError', () => {
  it('creates error with reason', () => {
    const error = new SyntheticCritiqueError('no adapter');
    expect(error.name).toBe('SyntheticCritiqueError');
    expect(error.message).toContain('no adapter');
    expect(error.message).toContain('allowSyntheticCritiques');
  });
});

// ============================================================================
// REFLEXION_DEFAULTS
// ============================================================================

describe('REFLEXION_DEFAULTS', () => {
  it('has expected defaults', () => {
    expect(REFLEXION_DEFAULTS.maxIterations).toBe(3);
    expect(REFLEXION_DEFAULTS.severityThreshold).toBe(0.3);
    expect(REFLEXION_DEFAULTS.allowSyntheticCritiques).toBe(false);
  });
});

// ============================================================================
// buildReflexionConfig
// ============================================================================

describe('buildReflexionConfig', () => {
  it('returns defaults when no config', () => {
    const config = buildReflexionConfig();
    expect(config.maxIterations).toBe(3);
    expect(config.severityThreshold).toBe(0.3);
  });

  it('overrides with provided values', () => {
    const config = buildReflexionConfig({ maxIterations: 5, severityThreshold: 0.5 });
    expect(config.maxIterations).toBe(5);
    expect(config.severityThreshold).toBe(0.5);
  });

  it('throws on invalid config', () => {
    expect(() => buildReflexionConfig({ maxIterations: -1 })).toThrow();
  });
});

// ============================================================================
// formatRefinementTask
// ============================================================================

describe('formatRefinementTask', () => {
  it('creates refinement task with debate feedback', () => {
    const debate = {
      synthesizedReflection: 'Needs improvement',
      consensusSeverity: 0.5,
      agreements: ['agree on A'],
      disagreements: [],
      actionItems: ['Fix X'],
    };
    const task = formatRefinementTask(makeTask(), 'original output', debate);
    expect(task.description).toContain('original output');
    expect(task.description).toContain('Needs improvement');
    expect(task.description).toContain('Fix X');
    expect(task.id).toContain('refinement');
  });

  it('handles non-string output', () => {
    const debate = {
      synthesizedReflection: 'ok',
      consensusSeverity: 0,
      agreements: [],
      disagreements: [],
      actionItems: [],
    };
    const task = formatRefinementTask(makeTask(), { key: 'value' }, debate);
    expect(task.description).toContain('key');
  });
});

// ============================================================================
// createFinalResultPayload
// ============================================================================

describe('createFinalResultPayload', () => {
  it('creates result payload', () => {
    const reflexionResult: ReflexionResult = {
      finalOutput: 'final',
      totalIterations: 2,
      converged: true,
      terminationReason: 'converged',
      rounds: [],
      totalDurationMs: 5000,
    };
    const result = createFinalResultPayload('task-1', reflexionResult, 5000);
    expect(result.taskId).toBe('task-1');
    expect(result.metadata?.durationMs).toBe(5000);
    const output = result.output as Record<string, unknown>;
    expect(output['result']).toBe('final');
  });
});

// ============================================================================
// generatePersonaCritique
// ============================================================================

describe('generatePersonaCritique', () => {
  it('flags short output as needing improvement', () => {
    const critique = generatePersonaCritique(makePersona(), 'short', makeTask());
    expect(critique.severity).toBeGreaterThan(0.3);
    expect(critique.issues.length).toBeGreaterThan(0);
  });

  it('approves adequate output', () => {
    const longOutput = 'x'.repeat(100);
    const critique = generatePersonaCritique(makePersona(), longOutput, makeTask());
    expect(critique.severity).toBeLessThan(0.3);
    expect(critique.issues).toEqual([]);
  });

  it('includes persona role', () => {
    const critique = generatePersonaCritique(makePersona({ role: 'Tester' }), 'short', makeTask());
    expect(critique.role).toBe('Tester');
    expect(critique.critique).toContain('Tester');
  });
});

// ============================================================================
// categorizeIssues
// ============================================================================

describe('categorizeIssues', () => {
  it('categorizes shared issues as agreements', () => {
    const critiques = [
      makeCritique({ issues: ['A', 'B'] }),
      makeCritique({ issues: ['A', 'C'] }),
      makeCritique({ issues: ['A'] }),
    ];
    // threshold = 3/2 = 1.5; A=3 (agreement), B=1 (disagreement), C=1 (disagreement)
    const { agreements, disagreements } = categorizeIssues(critiques);
    expect(agreements).toContain('A');
    expect(disagreements).toContain('B');
    expect(disagreements).toContain('C');
  });

  it('returns empty for no issues', () => {
    const { agreements, disagreements } = categorizeIssues([makeCritique({ issues: [] })]);
    expect(agreements).toEqual([]);
    expect(disagreements).toEqual([]);
  });
});

// ============================================================================
// calculateAverageSeverity
// ============================================================================

describe('calculateAverageSeverity', () => {
  it('returns 0 for empty critiques', () => {
    expect(calculateAverageSeverity([])).toBe(0);
  });

  it('computes average', () => {
    const critiques = [makeCritique({ severity: 0.4 }), makeCritique({ severity: 0.6 })];
    expect(calculateAverageSeverity(critiques)).toBeCloseTo(0.5);
  });
});

// ============================================================================
// extractActionItems
// ============================================================================

describe('extractActionItems', () => {
  it('extracts from high-severity critiques', () => {
    const critiques = [
      makeCritique({ severity: 0.5, suggestedImprovement: 'Fix A' }),
      makeCritique({ severity: 0.1, suggestedImprovement: 'Fix B' }),
    ];
    const items = extractActionItems(critiques);
    expect(items).toContain('Fix A');
    expect(items).not.toContain('Fix B');
  });

  it('excludes no-improvement messages', () => {
    const critiques = [
      makeCritique({ severity: 0.5, suggestedImprovement: 'No major improvements needed.' }),
    ];
    expect(extractActionItems(critiques)).toEqual([]);
  });
});

// ============================================================================
// runDebate
// ============================================================================

describe('runDebate', () => {
  it('synthesizes debate from critiques', () => {
    const critiques = [
      makeCritique({ severity: 0.5, issues: ['A'], suggestedImprovement: 'Fix A' }),
      makeCritique({ severity: 0.3, issues: ['A', 'B'], suggestedImprovement: 'Fix B' }),
    ];
    const debate = runDebate(critiques);
    expect(debate.agreements).toContain('A');
    expect(debate.consensusSeverity).toBeCloseTo(0.4);
    expect(debate.synthesizedReflection).toContain('agreement');
  });

  it('handles empty critiques', () => {
    const debate = runDebate([]);
    expect(debate.consensusSeverity).toBe(0);
    expect(debate.actionItems).toEqual([]);
  });
});

// ============================================================================
// createReflexionRound
// ============================================================================

describe('createReflexionRound', () => {
  it('creates a round with duration', () => {
    const debate = {
      synthesizedReflection: 'ok',
      consensusSeverity: 0,
      agreements: [],
      disagreements: [],
      actionItems: [],
    };
    const round = createReflexionRound(
      1,
      { original: 'v1', improved: 'v2' },
      [makeCritique()],
      debate,
      Date.now() - 100
    );
    expect(round.iteration).toBe(1);
    expect(round.originalOutput).toBe('v1');
    expect(round.improvedOutput).toBe('v2');
    expect(round.durationMs).toBeGreaterThanOrEqual(0);
  });
});
