/**
 * Tests for the improvement-signal → remediation-task bridge (#3540 inc.1).
 */

import { describe, it, expect } from 'vitest';
import {
  improvementSignalToTask,
  improvementSignalsToTasks,
  remediationTaskId,
} from './improvement-remediation.js';
import type { ImprovementSignal, SignalCategory } from './improvement-review.js';

function signal(over: Partial<ImprovementSignal> = {}): ImprovementSignal {
  return {
    category: 'tech-debt',
    signalKey: 'fitness-floor',
    severity: 'warning',
    title: 'Fitness below floor',
    body: 'Score 82 < floor 90.',
    evidence: { observedValue: 82, threshold: 90 },
    ...over,
  };
}

describe('improvementSignalToTask', () => {
  it('maps a signal to a pending, suggest-only remediation task', () => {
    const task = improvementSignalToTask(signal());
    expect(task.id).toBe('improvement-fitness-floor');
    expect(task.title).toBe('Fitness below floor');
    expect(task.status).toBe('pending');
    expect(task.description).toContain('SUGGEST-ONLY');
    expect(task.description).toContain('Score 82 < floor 90.');
  });

  it('routes each category to a sensible seed role', () => {
    const cases: Array<[SignalCategory, string]> = [
      ['security', 'security'],
      ['bug', 'coder'],
      ['tech-debt', 'coder'],
      ['routing', 'researcher'],
      ['consensus', 'researcher'],
      ['tool-fitness', 'researcher'],
      ['perf-regression', 'coder'],
    ];
    for (const [category, role] of cases) {
      expect(improvementSignalToTask(signal({ category })).assignedTo).toBe(role);
    }
  });

  it('derives a stable id from the signalKey', () => {
    expect(remediationTaskId(signal({ signalKey: 'cli-floor:claude' }))).toBe(
      'improvement-cli-floor:claude'
    );
  });
});

describe('improvementSignalsToTasks', () => {
  it('preserves order and maps every signal', () => {
    const tasks = improvementSignalsToTasks([
      signal({ signalKey: 'a' }),
      signal({ signalKey: 'b' }),
    ]);
    expect(tasks.map((t) => t.id)).toEqual(['improvement-a', 'improvement-b']);
  });

  it('dedups against existing task ids', () => {
    const tasks = improvementSignalsToTasks(
      [signal({ signalKey: 'a' }), signal({ signalKey: 'b' })],
      new Set(['improvement-a'])
    );
    expect(tasks.map((t) => t.id)).toEqual(['improvement-b']);
  });

  it('returns [] for no signals (suggest-only, never throws)', () => {
    expect(improvementSignalsToTasks([])).toEqual([]);
  });
});
