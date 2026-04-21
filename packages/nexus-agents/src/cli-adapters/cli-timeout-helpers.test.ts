/**
 * Tests for CLI Timeout Helpers.
 *
 * @module cli-adapters/cli-timeout-helpers.test
 */

import { describe, it, expect } from 'vitest';
import {
  estimateTaskComplexity,
  getAdaptiveTimeout,
  ADAPTIVE_TIMEOUT_MIN_SAMPLES,
  ADAPTIVE_TIMEOUT_MARGIN,
} from './cli-timeout-helpers.js';
import { OutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';

describe('estimateTaskComplexity', () => {
  describe('complex tasks', () => {
    it('returns complex for codebase-wide tasks', () => {
      expect(estimateTaskComplexity('Analyze the entire codebase for issues')).toBe('complex');
    });

    it('returns complex for architecture tasks', () => {
      expect(estimateTaskComplexity('Review the architecture of the system')).toBe('complex');
    });

    it('returns complex for refactoring tasks', () => {
      expect(estimateTaskComplexity('Refactor the authentication module')).toBe('complex');
    });

    it('returns complex for comprehensive analysis', () => {
      expect(estimateTaskComplexity('Do a comprehensive security audit')).toBe('complex');
    });

    it('returns complex for deep analysis', () => {
      expect(estimateTaskComplexity('Perform deep analysis of performance')).toBe('complex');
    });

    it('returns complex for system-wide tasks', () => {
      expect(estimateTaskComplexity('System-wide error handling review')).toBe('complex');
    });

    it('returns complex for all-files tasks', () => {
      expect(estimateTaskComplexity('Update all files with new header')).toBe('complex');
    });

    it('is case-insensitive', () => {
      expect(estimateTaskComplexity('ARCHITECTURE review')).toBe('complex');
      expect(estimateTaskComplexity('REFACTOR the module')).toBe('complex');
    });

    it('returns complex for security tasks (#1401)', () => {
      expect(estimateTaskComplexity('Run a security scan on the module')).toBe('complex');
    });

    it('returns complex for audit tasks (#1401)', () => {
      expect(estimateTaskComplexity('Audit the authentication flow')).toBe('complex');
    });

    it('returns complex for vulnerability tasks (#1401)', () => {
      expect(estimateTaskComplexity('Check for vulnerability in dependencies')).toBe('complex');
    });
  });

  describe('simple tasks', () => {
    it('returns simple for single-item tasks', () => {
      expect(estimateTaskComplexity('Fix a single typo in the readme')).toBe('simple');
    });

    it('returns simple for quick tasks', () => {
      expect(estimateTaskComplexity('Quick check on the build output')).toBe('simple');
    });

    it('returns simple for one-function tasks', () => {
      expect(estimateTaskComplexity('Update one function signature')).toBe('simple');
    });

    it('returns simple for explicitly simple tasks', () => {
      expect(estimateTaskComplexity('A simple rename of a variable')).toBe('simple');
    });

    it('returns simple for small tasks', () => {
      expect(estimateTaskComplexity('Make a small adjustment to config')).toBe('simple');
    });

    it('returns simple for brief tasks', () => {
      expect(estimateTaskComplexity('Brief review of the PR description')).toBe('simple');
    });

    it('returns simple for short tasks', () => {
      expect(estimateTaskComplexity('Short summary of changes')).toBe('simple');
    });
  });

  describe('standard tasks (default)', () => {
    it('returns standard for generic tasks', () => {
      expect(estimateTaskComplexity('Implement the new feature')).toBe('standard');
    });

    it('returns standard for empty description', () => {
      expect(estimateTaskComplexity('')).toBe('standard');
    });

    it('returns standard for moderate tasks', () => {
      expect(estimateTaskComplexity('Add tests for the router module')).toBe('standard');
    });

    it('returns standard for tasks with no keyword matches', () => {
      expect(estimateTaskComplexity('Debug the flaky test')).toBe('standard');
    });
  });

  describe('priority rules', () => {
    it('complex indicators take priority over simple', () => {
      // "simple" is present but "codebase" makes it complex
      expect(estimateTaskComplexity('Simple codebase scan')).toBe('complex');
    });

    it('complex indicators win when both present', () => {
      expect(estimateTaskComplexity('Quick architecture review')).toBe('complex');
    });
  });
});

// ============================================================================
// Adaptive Timeout (#1534)
// ============================================================================

/** Helper to create a TaskOutcome for testing. */
function makeOutcome(overrides: Partial<TaskOutcome>): TaskOutcome {
  return {
    id: `test-${String(Math.random())}`,
    cli: 'claude',
    category: 'code_generation',
    model: 'claude-sonnet-4-6',
    success: true,
    durationMs: 10_000,
    timestamp: new Date().toISOString(),
    source: 'delegate',
    ...overrides,
  };
}

describe('getAdaptiveTimeout (#1534)', () => {
  /** Creates a fresh store for each test — avoids singleton isolation issues. */
  function freshStore(): OutcomeStore {
    return new OutcomeStore();
  }

  it('exports ADAPTIVE_TIMEOUT_MIN_SAMPLES as 10', () => {
    expect(ADAPTIVE_TIMEOUT_MIN_SAMPLES).toBe(10);
  });

  it('exports ADAPTIVE_TIMEOUT_MARGIN as 1.2', () => {
    expect(ADAPTIVE_TIMEOUT_MARGIN).toBe(1.2);
  });

  it('returns static timeout when insufficient samples', () => {
    const store = freshStore();
    for (let i = 0; i < 5; i++) {
      store.append(makeOutcome({ cli: 'claude', category: 'code_generation', durationMs: 50_000 }));
    }

    const timeout = getAdaptiveTimeout('claude', 'Implement the feature', { store });
    expect(timeout).toBe(120_000);
  });

  it('returns static timeout when no category detected', () => {
    const timeout = getAdaptiveTimeout('claude', '');
    expect(timeout).toBe(120_000);
  });

  it('returns p95-based timeout when sufficient samples and p95 exceeds static', () => {
    const store = freshStore();
    // 10 at 50s, 10 at 200s — p95 index = ceil(20*0.95)-1 = 18, sorted[18] = 200s
    for (let i = 0; i < 10; i++) {
      store.append(makeOutcome({ cli: 'claude', category: 'code_generation', durationMs: 50_000 }));
    }
    for (let i = 0; i < 10; i++) {
      store.append(
        makeOutcome({ cli: 'claude', category: 'code_generation', durationMs: 200_000 })
      );
    }

    // p95 = 200s, p95 * 1.2 = 240s > 120s static → should return 240s
    const timeout = getAdaptiveTimeout('claude', 'Implement the authentication module', { store });
    expect(timeout).toBe(240_000);
  });

  it('never reduces timeout below static value', () => {
    const store = freshStore();
    for (let i = 0; i < 20; i++) {
      store.append(makeOutcome({ cli: 'claude', category: 'code_generation', durationMs: 10_000 }));
    }

    const timeout = getAdaptiveTimeout('claude', 'Implement the module', { store });
    expect(timeout).toBe(120_000);
  });

  it('only considers successful outcomes for p95', () => {
    const store = freshStore();
    for (let i = 0; i < 15; i++) {
      store.append(
        makeOutcome({
          cli: 'claude',
          category: 'code_generation',
          durationMs: 50_000,
          success: true,
        })
      );
    }
    for (let i = 0; i < 5; i++) {
      store.append(
        makeOutcome({
          cli: 'claude',
          category: 'code_generation',
          durationMs: 500_000,
          success: false,
        })
      );
    }

    const timeout = getAdaptiveTimeout('claude', 'Implement feature', { store });
    expect(timeout).toBe(120_000);
  });

  it('filters by CLI when computing p95', () => {
    const store = freshStore();
    for (let i = 0; i < 10; i++) {
      store.append(makeOutcome({ cli: 'claude', category: 'code_generation', durationMs: 50_000 }));
    }
    for (let i = 0; i < 10; i++) {
      store.append(makeOutcome({ cli: 'codex', category: 'code_generation', durationMs: 200_000 }));
    }

    const timeout = getAdaptiveTimeout('claude', 'Implement feature', { store });
    expect(timeout).toBe(120_000);
  });
});
