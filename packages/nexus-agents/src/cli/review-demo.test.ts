/**
 * Review Demo Command Tests
 *
 * @module cli/review-demo.test
 * (Source: Issue #258 - PR Review Demo Workflow)
 */

import { describe, it, expect } from 'vitest';
import type { SetupStatus, PreflightResult, ProgressStep } from './review-demo-types.js';
import {
  formatSetupStatus,
  formatPreflightResults,
  formatProgressStep,
  createProgressSteps,
  updateProgress,
  getSetupInstructions,
} from './review-demo-helpers.js';

describe('review-demo-helpers', () => {
  describe('formatSetupStatus', () => {
    it('should format status with valid token', () => {
      const status: SetupStatus = {
        hasGitHubToken: true,
        hasGhCli: true,
        tokenScopes: ['repo', 'read:org'],
        tokenValid: true,
        username: 'testuser',
      };

      const output = formatSetupStatus(status);

      expect(output).toContain('Setup Status:');
      expect(output).toContain('[OK] GitHub Token: Authenticated as @testuser');
      expect(output).toContain('[OK] GitHub CLI:   Installed');
      expect(output).toContain('[OK] Token Scopes: repo, read:org');
    });

    it('should format status with missing token', () => {
      const status: SetupStatus = {
        hasGitHubToken: false,
        hasGhCli: false,
        tokenScopes: [],
        tokenValid: false,
      };

      const output = formatSetupStatus(status);

      expect(output).toContain('[  ] GitHub Token: Not configured');
      expect(output).toContain('[  ] GitHub CLI:   Not found (optional)');
    });

    it('should format status with invalid token', () => {
      const status: SetupStatus = {
        hasGitHubToken: true,
        hasGhCli: true,
        tokenScopes: [],
        tokenValid: false,
      };

      const output = formatSetupStatus(status);

      expect(output).toContain('[!!] GitHub Token: Token invalid or expired');
    });
  });

  describe('formatPreflightResults', () => {
    it('should format all checks passing', () => {
      const results: PreflightResult = {
        passed: true,
        checks: [
          { name: 'GitHub Token', passed: true, message: 'Authenticated as @user' },
          { name: 'PR URL', passed: true, message: 'Valid: owner/repo#123' },
          { name: 'Token Scopes', passed: true, message: 'Scopes: repo' },
        ],
      };

      const output = formatPreflightResults(results);

      expect(output).toContain('Pre-flight Checks:');
      expect(output).toContain('[OK] GitHub Token: Authenticated as @user');
      expect(output).toContain('[OK] PR URL: Valid: owner/repo#123');
      expect(output).toContain('[OK] Token Scopes: Scopes: repo');
    });

    it('should format failed checks with suggestions', () => {
      const results: PreflightResult = {
        passed: false,
        checks: [
          {
            name: 'GitHub Token',
            passed: false,
            message: 'Not configured',
            suggestion: 'Set GITHUB_TOKEN environment variable',
          },
        ],
      };

      const output = formatPreflightResults(results);

      expect(output).toContain('[!!] GitHub Token: Not configured');
      expect(output).toContain('Set GITHUB_TOKEN environment variable');
    });
  });

  describe('formatProgressStep', () => {
    it('should format pending step', () => {
      const step: ProgressStep = { name: 'Fetching PR', status: 'pending' };
      const output = formatProgressStep(step, 0, 5);

      expect(output).toBe('(1/5) [ ] Fetching PR');
    });

    it('should format in-progress step', () => {
      const step: ProgressStep = { name: 'Running review', status: 'in_progress' };
      const output = formatProgressStep(step, 1, 5);

      expect(output).toBe('(2/5) [>] Running review');
    });

    it('should format completed step with duration', () => {
      const step: ProgressStep = {
        name: 'Security check',
        status: 'completed',
        durationMs: 1234,
        message: 'passed',
      };
      const output = formatProgressStep(step, 2, 5);

      expect(output).toBe('(3/5) [OK] Security check (1234ms) - passed');
    });

    it('should format failed step', () => {
      const step: ProgressStep = {
        name: 'Post review',
        status: 'failed',
        message: 'API error',
      };
      const output = formatProgressStep(step, 4, 5);

      expect(output).toBe('(5/5) [!!] Post review - API error');
    });
  });

  describe('createProgressSteps', () => {
    it('should create default progress steps', () => {
      const steps = createProgressSteps();

      expect(steps.length).toBe(7);
      expect(steps[0]?.name).toBe('Validating credentials');
      expect(steps[6]?.name).toBe('Posting review');
      expect(steps.every((s) => s.status === 'pending')).toBe(true);
    });
  });

  describe('updateProgress', () => {
    it('should update a specific step', () => {
      const steps = createProgressSteps();
      const updated = updateProgress(steps, 0, { status: 'completed', message: 'OK' });

      expect(updated[0]?.status).toBe('completed');
      expect(updated[0]?.message).toBe('OK');
      expect(updated[1]?.status).toBe('pending'); // Others unchanged
    });

    it('should preserve other steps', () => {
      const steps: ProgressStep[] = [
        { name: 'Step 1', status: 'completed' },
        { name: 'Step 2', status: 'in_progress' },
        { name: 'Step 3', status: 'pending' },
      ];

      const updated = updateProgress(steps, 1, { status: 'completed' });

      expect(updated[0]?.status).toBe('completed');
      expect(updated[1]?.status).toBe('completed');
      expect(updated[2]?.status).toBe('pending');
    });
  });

  describe('getSetupInstructions', () => {
    it('should return setup instructions', () => {
      const instructions = getSetupInstructions();

      expect(instructions).toContain('Setup Wizard');
      expect(instructions).toContain('STEP 1: Configure GitHub Authentication');
      expect(instructions).toContain('STEP 2: Run Your First Review');
      expect(instructions).toContain('STEP 3: Verify It Works');
      expect(instructions).toContain('gh auth login');
      expect(instructions).toContain('GITHUB_TOKEN');
    });
  });
});

describe('review-demo-types', () => {
  it('should have valid SetupStatus structure', () => {
    const status: SetupStatus = {
      hasGitHubToken: true,
      hasGhCli: true,
      tokenScopes: ['repo'],
      tokenValid: true,
      username: 'test',
    };

    expect(status.hasGitHubToken).toBe(true);
    expect(status.tokenScopes).toContain('repo');
  });

  it('should have valid PreflightResult structure', () => {
    const result: PreflightResult = {
      passed: true,
      checks: [{ name: 'Test', passed: true, message: 'OK' }],
    };

    expect(result.passed).toBe(true);
    expect(result.checks.length).toBe(1);
  });

  it('should have valid ProgressStep structure', () => {
    const step: ProgressStep = {
      name: 'Test step',
      status: 'completed',
      message: 'Done',
      durationMs: 100,
    };

    expect(step.status).toBe('completed');
    expect(step.durationMs).toBe(100);
  });
});
