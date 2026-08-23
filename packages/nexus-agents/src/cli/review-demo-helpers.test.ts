/**
 * Tests for Review Demo Helpers (pure functions only)
 * @module cli/review-demo-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { SetupStatus, ProgressStep, PreflightResult } from './review-demo-types.js';
import type { Result } from '../core/index.js';
import type { ScmToken } from '../scm/types.js';

// runPreflightChecks resolves a real GitHub token; stub the resolver so the
// preflight shape is testable without credentials or network. An empty token
// value is the "no token configured" path. Partial mock via importOriginal —
// other modules in this graph import `getTokenEnvVars` from here.
vi.mock('../scm/token-resolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scm/token-resolver.js')>();
  const noToken: Result<ScmToken, Error> = {
    ok: true,
    value: { value: '', strategy: 'env', platform: 'github' },
  };
  return { ...actual, resolveToken: vi.fn(() => Promise.resolve(noToken)) };
});

import {
  formatSetupStatus,
  formatPreflightResults,
  formatProgressStep,
  createProgressSteps,
  updateProgress,
  getSetupInstructions,
  runPreflightChecks,
} from './review-demo-helpers.js';

// ============================================================================
// formatSetupStatus
// ============================================================================

describe('formatSetupStatus', () => {
  it('shows valid token status', () => {
    const status: SetupStatus = {
      hasGitHubToken: true,
      hasGhCli: true,
      tokenScopes: ['repo'],
      tokenValid: true,
      username: 'testuser',
    };
    const result = formatSetupStatus(status);
    expect(result).toContain('Setup Status');
    expect(result).toContain('[OK]');
    expect(result).toContain('@testuser');
    expect(result).toContain('repo');
  });

  it('shows missing token', () => {
    const status: SetupStatus = {
      hasGitHubToken: false,
      hasGhCli: false,
      tokenScopes: [],
      tokenValid: false,
    };
    const result = formatSetupStatus(status);
    expect(result).toContain('Not configured');
    expect(result).toContain('Not found');
  });

  it('shows invalid token', () => {
    const status: SetupStatus = {
      hasGitHubToken: true,
      hasGhCli: true,
      tokenScopes: [],
      tokenValid: false,
    };
    const result = formatSetupStatus(status);
    expect(result).toContain('[!!]');
    expect(result).toContain('invalid or expired');
  });

  it('handles missing username', () => {
    const status: SetupStatus = {
      hasGitHubToken: true,
      hasGhCli: false,
      tokenScopes: [],
      tokenValid: true,
    };
    const result = formatSetupStatus(status);
    expect(result).toContain('@unknown');
  });
});

// ============================================================================
// formatPreflightResults
// ============================================================================

describe('formatPreflightResults', () => {
  it('formats passing checks', () => {
    const results: PreflightResult = {
      passed: true,
      checks: [
        { name: 'Token', passed: true, message: 'Valid' },
        { name: 'URL', passed: true, message: 'Valid format' },
      ],
    };
    const output = formatPreflightResults(results);
    expect(output).toContain('Pre-flight Checks');
    expect(output).toContain('[OK] Token');
    expect(output).toContain('[OK] URL');
  });

  it('formats failing checks with suggestions', () => {
    const results: PreflightResult = {
      passed: false,
      checks: [
        {
          name: 'Token',
          passed: false,
          message: 'Missing',
          suggestion: 'Set GITHUB_TOKEN',
        },
      ],
    };
    const output = formatPreflightResults(results);
    expect(output).toContain('[!!] Token');
    expect(output).toContain('Set GITHUB_TOKEN');
  });

  it('handles empty checks', () => {
    const results: PreflightResult = { passed: true, checks: [] };
    const output = formatPreflightResults(results);
    expect(output).toContain('Pre-flight Checks');
  });
});

// ============================================================================
// formatProgressStep
// ============================================================================

describe('formatProgressStep', () => {
  it('formats pending step', () => {
    const step: ProgressStep = { name: 'Fetch PR', status: 'pending' };
    const result = formatProgressStep(step, 0, 5);
    expect(result).toContain('(1/5)');
    expect(result).toContain('[ ]');
    expect(result).toContain('Fetch PR');
  });

  it('formats in-progress step', () => {
    const step: ProgressStep = { name: 'Reviewing', status: 'in_progress' };
    const result = formatProgressStep(step, 2, 7);
    expect(result).toContain('(3/7)');
    expect(result).toContain('[>]');
  });

  it('formats completed step with duration', () => {
    const step: ProgressStep = { name: 'Done', status: 'completed', durationMs: 1500 };
    const result = formatProgressStep(step, 4, 5);
    expect(result).toContain('[OK]');
    expect(result).toContain('1500ms');
  });

  it('formats failed step with message', () => {
    const step: ProgressStep = { name: 'Review', status: 'failed', message: 'Network error' };
    const result = formatProgressStep(step, 1, 3);
    expect(result).toContain('[!!]');
    expect(result).toContain('Network error');
  });

  it('omits duration when not present', () => {
    const step: ProgressStep = { name: 'Test', status: 'pending' };
    const result = formatProgressStep(step, 0, 1);
    expect(result).not.toContain('ms');
  });
});

// ============================================================================
// createProgressSteps
// ============================================================================

describe('createProgressSteps', () => {
  it('returns 7 steps', () => {
    const steps = createProgressSteps();
    expect(steps).toHaveLength(7);
  });

  it('all steps start as pending', () => {
    const steps = createProgressSteps();
    for (const step of steps) {
      expect(step.status).toBe('pending');
    }
  });

  it('first step is validating credentials', () => {
    const steps = createProgressSteps();
    expect(steps[0]?.name).toContain('Validating');
  });

  it('last step is posting review', () => {
    const steps = createProgressSteps();
    expect(steps[6]?.name).toContain('Posting');
  });
});

// ============================================================================
// updateProgress
// ============================================================================

describe('updateProgress', () => {
  it('updates status of specific step', () => {
    const steps = createProgressSteps();
    const updated = updateProgress(steps, 0, { status: 'completed' });
    expect(updated[0]?.status).toBe('completed');
    expect(updated[1]?.status).toBe('pending');
  });

  it('adds message to step', () => {
    const steps = createProgressSteps();
    const updated = updateProgress(steps, 2, { status: 'failed', message: 'Timed out' });
    expect(updated[2]?.status).toBe('failed');
    expect(updated[2]?.message).toBe('Timed out');
  });

  it('preserves other steps unchanged', () => {
    const steps = createProgressSteps();
    const updated = updateProgress(steps, 3, { status: 'in_progress' });
    expect(updated[0]?.status).toBe('pending');
    expect(updated[6]?.status).toBe('pending');
  });

  it('returns new array (immutable)', () => {
    const steps = createProgressSteps();
    const updated = updateProgress(steps, 0, { status: 'completed' });
    expect(updated).not.toBe(steps);
    expect(steps[0]?.status).toBe('pending');
  });
});

// ============================================================================
// getSetupInstructions
// ============================================================================

describe('getSetupInstructions', () => {
  it('includes setup wizard title', () => {
    const instructions = getSetupInstructions();
    expect(instructions).toContain('Setup Wizard');
  });

  it('includes step 1 for authentication', () => {
    const instructions = getSetupInstructions();
    expect(instructions).toContain('STEP 1');
    expect(instructions).toContain('GitHub Authentication');
  });

  it('includes gh auth login option', () => {
    const instructions = getSetupInstructions();
    expect(instructions).toContain('gh auth login');
  });

  it('includes step 2 for first review', () => {
    const instructions = getSetupInstructions();
    expect(instructions).toContain('STEP 2');
    expect(instructions).toContain('First Review');
  });

  it('includes dry-run option', () => {
    const instructions = getSetupInstructions();
    expect(instructions).toContain('--dry-run');
  });
});

// ============================================================================
// runPreflightChecks
// ============================================================================

describe('runPreflightChecks', () => {
  it('always reports the two unconditional checks, even when the token fails (#4581)', async () => {
    // The checks array is now built as a literal containing the token and URL
    // checks, so `checks.every(...)` can never run over an empty collection
    // and report a vacuous pass. The scope check is the only conditional one,
    // and it is skipped precisely when the token check has already failed.
    const result = await runPreflightChecks('https://github.com/owner/repo/pull/123');

    expect(result.checks.length).toBeGreaterThanOrEqual(2);
    expect(result.checks.map((c) => c.name)).toEqual(['GitHub Token', 'PR URL']);
    expect(result.passed).toBe(false);
  });
});
