/**
 * Tests for failure-lessons.ts (MetaClaw pattern).
 *
 * @module orchestration/failure-lessons.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { extractLessons, formatLessonsForPrompt } from './failure-lessons.js';
import { OutcomeStore, setOutcomeStore } from './outcomes/outcome-store.js';

function makeOutcome(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `test-${String(Math.random()).slice(2, 8)}`,
    cli: 'claude',
    category: 'code_generation',
    model: 'claude-sonnet',
    success: false,
    durationMs: 1000,
    timestamp: new Date().toISOString(),
    source: 'orchestration',
    failureCategory: 'execution',
    errorMessage: 'Task failed with generic error',
    ...overrides,
  };
}

describe('extractLessons', () => {
  beforeEach(() => {
    const store = new OutcomeStore();
    setOutcomeStore(store);
  });

  it('returns empty for no failures', () => {
    const lessons = extractLessons('code_generation', 'claude');
    expect(lessons).toHaveLength(0);
  });

  it('extracts lessons from failure patterns', () => {
    const store = new OutcomeStore();
    store.append(
      makeOutcome({ failureCategory: 'timeout', errorMessage: 'Execution timed out' }) as never
    );
    store.append(
      makeOutcome({ failureCategory: 'timeout', errorMessage: 'Execution timed out' }) as never
    );
    store.append(
      makeOutcome({ failureCategory: 'parse', errorMessage: 'Invalid JSON response' }) as never
    );
    setOutcomeStore(store);

    const lessons = extractLessons('code_generation', 'claude');
    expect(lessons.length).toBeGreaterThan(0);

    // Timeout should be first (2 occurrences > 1)
    expect(lessons[0].occurrences).toBe(2);
    expect(lessons[0].guidance).toContain('timed out');
  });

  it('caps at MAX_LESSONS (5)', () => {
    const store = new OutcomeStore();
    const categories = [
      'timeout',
      'parse',
      'rate_limit',
      'connection',
      'execution',
      'validation',
      'unknown',
    ];
    for (const cat of categories) {
      store.append(makeOutcome({ failureCategory: cat }) as never);
    }
    setOutcomeStore(store);

    const lessons = extractLessons();
    expect(lessons.length).toBeLessThanOrEqual(5);
  });

  it('sanitizes error messages', () => {
    const store = new OutcomeStore();
    store.append(
      makeOutcome({
        errorMessage: 'Error at /home/user/secret/path.ts: sk-abc123def456 leaked',
      }) as never
    );
    setOutcomeStore(store);

    const lessons = extractLessons();
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons[0].pattern).not.toContain('/home/user');
    expect(lessons[0].pattern).not.toContain('sk-abc123');
  });

  it('filters by category', () => {
    const store = new OutcomeStore();
    store.append(makeOutcome({ category: 'code_generation' }) as never);
    store.append(makeOutcome({ category: 'security_review' }) as never);
    setOutcomeStore(store);

    const codeOnly = extractLessons('code_generation');
    const secOnly = extractLessons('security_review');
    expect(codeOnly.length).toBe(1);
    expect(secOnly.length).toBe(1);
  });
});

describe('formatLessonsForPrompt', () => {
  it('returns empty string for no lessons', () => {
    expect(formatLessonsForPrompt([])).toBe('');
  });

  it('formats lessons as prompt section', () => {
    const lessons = [
      {
        pattern: 'timeout',
        occurrences: 3,
        context: 'claude/code_generation',
        guidance: 'Keep responses concise.',
      },
      {
        pattern: 'parse',
        occurrences: 1,
        context: 'claude/code_generation',
        guidance: 'Follow output format.',
      },
    ];
    const result = formatLessonsForPrompt(lessons);
    expect(result).toContain('Lessons from Recent Failures');
    expect(result).toContain('Keep responses concise');
    expect(result).toContain('Follow output format');
  });
});
