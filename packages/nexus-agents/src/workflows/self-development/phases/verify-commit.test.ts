/**
 * Tests for Verify and Commit Phases
 *
 * @module workflows/self-development/phases/verify-commit.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeVerify, executeCommit, CommitUnavailableError } from './verify-commit.js';
import type { SelfDevWorkflowDependencies, IGitClient, IGitHubClient } from '../interfaces.js';
import type { SelfDevWorkflowState } from '../types.js';
import type { SelfDevWorkflowResult } from '../self-dev-state-types.js';
import type { VerificationCheckResult } from '../shell-executor.js';
import type { TrinityResult } from '../../../agents/collaboration/trinity-types.js';

// Mock the shell-executor module
vi.mock('../shell-executor.js', () => ({
  runAllVerificationChecks: vi.fn(),
}));

// Mock the auto-merge module
vi.mock('./auto-merge.js', () => ({
  attemptAutoMerge: vi.fn(),
}));

import { runAllVerificationChecks } from '../shell-executor.js';
import { attemptAutoMerge } from './auto-merge.js';

/**
 * Create a minimal mock state for testing.
 */
function createMockState(overrides: Partial<SelfDevWorkflowState> = {}): SelfDevWorkflowState {
  return {
    executionId: 'test-exec-123',
    config: {
      repository: 'owner/repo',
      workingDirectory: '/test/workspace',
      autoMerge: false,
      mergeMethod: 'squash',
      ...overrides.config,
    },
    currentPhase: 'verify',
    checkpoints: [],
    startedAt: new Date().toISOString(),
    status: 'running',
    ...overrides,
  };
}

/**
 * Create a mock analyzed issue.
 */
function createMockAnalyzedIssue(
  overrides: Partial<{
    number: number;
    title: string;
    body: string;
    labels: string[];
    priorityScore: number;
    complexity: 1 | 2 | 3 | 4 | 5;
    estimatedEffort: string;
    dependencies: string[];
    risks: string[];
    keywords: string[];
    topics: string[];
    type: 'bug' | 'enhancement' | 'architecture' | 'security' | 'tech-debt';
  }> = {}
): {
  number: number;
  title: string;
  body: string;
  labels: string[];
  priorityScore: number;
  complexity: 1 | 2 | 3 | 4 | 5;
  estimatedEffort: string;
  dependencies: string[];
  risks: string[];
  keywords: string[];
  topics: string[];
  type: 'bug' | 'enhancement' | 'architecture' | 'security' | 'tech-debt';
} {
  return {
    number: 123,
    title: 'Test Issue Title',
    body: 'This is the issue body with some description of what needs to be done.',
    labels: ['enhancement'],
    priorityScore: 85,
    complexity: 2 as const,
    estimatedEffort: '4 hours',
    dependencies: [],
    risks: [],
    keywords: ['test', 'feature'],
    topics: ['testing'],
    type: 'enhancement' as const,
    ...overrides,
  };
}

/**
 * Create a mock TrinityResult with correct types.
 */
function createMockTrinityResult(): TrinityResult {
  return {
    success: true,
    finalOutput: 'Implementation plan',
    thinkerOutput: {
      problemAnalysis: 'Analysis of the problem',
      approach: 'Planned approach',
      considerations: ['Edge case 1'],
      successCriteria: ['Criteria 1'],
    },
    workerOutput: {
      implementation: 'Code implementation',
      stepsCompleted: ['Step 1'],
      deviations: [],
      questions: [],
    },
    verifierOutput: {
      verdict: 'pass',
      correctnessCheck: 'All correct',
      qualityCheck: 'High quality',
      issuesFound: [],
      recommendations: [],
    },
    iterations: 1,
    totalDurationMs: 1000,
    history: [],
    stopReason: 'verified',
  };
}

/**
 * Create mock workflow outputs for testing.
 */
function createMockOutputs(
  overrides: Partial<SelfDevWorkflowResult['outputs']> = {}
): SelfDevWorkflowResult['outputs'] {
  return {
    analyze: {
      prioritizedIssues: [createMockAnalyzedIssue()],
      selectedIssue: createMockAnalyzedIssue(),
      selectionRationale: 'Selected based on priority score',
      durationMs: 1000,
    },
    implement: {
      filesCreated: ['src/new-file.ts', 'src/new-file.test.ts'],
      filesModified: ['src/existing.ts'],
      selfRefineIterations: 2,
      selfDebugIterations: 1,
      success: true,
      summary: 'Implementation complete',
      durationMs: 5000,
    },
    plan: {
      trinityResult: createMockTrinityResult(),
      plan: {
        problemAnalysis: 'Analysis',
        successCriteria: ['Criteria 1'],
        files: [],
        interfaces: [],
        dependencies: [],
        testPlan: 'Run unit tests and integration tests',
      },
      iterations: 1,
      verified: true,
      durationMs: 2000,
    },
    verify: {
      checks: [
        { name: 'typecheck', command: 'pnpm typecheck', passed: true, durationMs: 1000 },
        { name: 'lint', command: 'pnpm lint', passed: true, durationMs: 500 },
        { name: 'test', command: 'pnpm test', passed: true, durationMs: 2000 },
        { name: 'build', command: 'pnpm build', passed: true, durationMs: 1500 },
      ],
      allPassed: true,
      coverage: 85,
      durationMs: 5000,
    },
    ...overrides,
  };
}

describe('verify-commit', () => {
  let mockGitClient: IGitClient;
  let mockGitHubClient: IGitHubClient;
  let deps: SelfDevWorkflowDependencies;

  beforeEach(() => {
    vi.resetAllMocks();

    mockGitClient = {
      createBranch: vi.fn().mockResolvedValue(undefined),
      checkout: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue('abc1234'),
      push: vi.fn().mockResolvedValue(undefined),
      tag: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockResolvedValue([]),
    };

    mockGitHubClient = {
      listIssues: vi.fn(),
      getIssue: vi.fn(),
      createPR: vi
        .fn()
        .mockResolvedValue({ number: 456, url: 'https://github.com/owner/repo/pull/456' }),
      addComment: vi.fn().mockResolvedValue(undefined),
      addLabels: vi.fn(),
      mergePR: vi.fn(),
      getPRStatus: vi.fn(),
    };

    deps = {
      modelAdapter: { complete: vi.fn() } as never,
      gitClient: mockGitClient,
      githubClient: mockGitHubClient,
    };
  });

  // ===========================================================================
  // Phase 8: VERIFY Tests
  // ===========================================================================

  describe('executeVerify', () => {
    it('returns all checks passed when verification succeeds', async () => {
      const mockResults: VerificationCheckResult[] = [
        { name: 'typecheck', command: 'pnpm typecheck', passed: true, durationMs: 1000 },
        { name: 'lint', command: 'pnpm lint', passed: true, durationMs: 500 },
        { name: 'test', command: 'pnpm test', passed: true, durationMs: 2000 },
        { name: 'build', command: 'pnpm build', passed: true, durationMs: 1500 },
      ];
      vi.mocked(runAllVerificationChecks).mockResolvedValue(mockResults);

      const state = createMockState();
      const result = await executeVerify(deps, state);

      expect(result.allPassed).toBe(true);
      expect(result.checks).toHaveLength(4);
      expect(result.failureReport).toBeUndefined();
      expect(runAllVerificationChecks).toHaveBeenCalledWith('/test/workspace');
    });

    it('returns failure report when checks fail', async () => {
      const mockResults: VerificationCheckResult[] = [
        { name: 'typecheck', command: 'pnpm typecheck', passed: true, durationMs: 1000 },
        {
          name: 'lint',
          command: 'pnpm lint',
          passed: false,
          durationMs: 500,
          error: 'Lint errors',
        },
      ];
      vi.mocked(runAllVerificationChecks).mockResolvedValue(mockResults);

      const state = createMockState();
      const result = await executeVerify(deps, state);

      expect(result.allPassed).toBe(false);
      expect(result.failureReport).toBe('Failed checks: lint');
    });

    it('includes multiple failed check names in failure report', async () => {
      const mockResults: VerificationCheckResult[] = [
        { name: 'typecheck', command: 'pnpm typecheck', passed: false, durationMs: 1000 },
        { name: 'lint', command: 'pnpm lint', passed: false, durationMs: 500 },
      ];
      vi.mocked(runAllVerificationChecks).mockResolvedValue(mockResults);

      const state = createMockState();
      const result = await executeVerify(deps, state);

      expect(result.allPassed).toBe(false);
      expect(result.failureReport).toBe('Failed checks: typecheck, lint');
    });

    it('uses current working directory when not specified in config', async () => {
      vi.mocked(runAllVerificationChecks).mockResolvedValue([]);

      const state = createMockState({ config: { repository: 'owner/repo' } });
      await executeVerify(deps, state);

      expect(runAllVerificationChecks).toHaveBeenCalledWith(process.cwd());
    });

    it('includes output in check results when available', async () => {
      const mockResults: VerificationCheckResult[] = [
        {
          name: 'test',
          command: 'pnpm test',
          passed: false,
          durationMs: 2000,
          output: 'Test output',
          error: 'Test error',
        },
      ];
      vi.mocked(runAllVerificationChecks).mockResolvedValue(mockResults);

      const state = createMockState();
      const result = await executeVerify(deps, state);

      expect(result.checks[0]!.output).toBe('Test output');
    });

    it('returns 0 coverage when no test output available', async () => {
      vi.mocked(runAllVerificationChecks).mockResolvedValue([]);

      const state = createMockState();
      const result = await executeVerify(deps, state);

      // Coverage defaults to 0 when not found in output (Issue #458)
      expect(result.coverage).toBe(0);
    });

    it('parses coverage from Vitest output format', async () => {
      vi.mocked(runAllVerificationChecks).mockResolvedValue([
        {
          name: 'test',
          command: 'pnpm test',
          passed: true,
          durationMs: 100,
          output: 'All files     |   85.5 |   75.2 |   90.1 |   85.5 |',
        },
      ]);

      const state = createMockState();
      const result = await executeVerify(deps, state);

      expect(result.coverage).toBe(85.5);
    });

    it('parses coverage from Jest/Istanbul format', async () => {
      vi.mocked(runAllVerificationChecks).mockResolvedValue([
        {
          name: 'test',
          command: 'pnpm test',
          passed: true,
          durationMs: 100,
          output: 'Statements   : 92.3%',
        },
      ]);

      const state = createMockState();
      const result = await executeVerify(deps, state);

      expect(result.coverage).toBe(92.3);
    });

    it('tracks duration of verification phase', async () => {
      vi.mocked(runAllVerificationChecks).mockResolvedValue([]);

      const state = createMockState();
      const result = await executeVerify(deps, state);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // Phase 9: COMMIT Tests
  // ===========================================================================

  describe('executeCommit', () => {
    it('creates branch, commits, and creates PR on success', async () => {
      const state = createMockState();
      const outputs = createMockOutputs();

      const result = await executeCommit(deps, state, outputs);

      expect(result.branch).toBe('self-dev/123-test-issue-title');
      expect(result.commitSha).toBe('abc1234');
      expect(result.prNumber).toBe(456);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/456');
      expect(result.status).toBe('created');

      expect(mockGitClient.createBranch).toHaveBeenCalledWith('self-dev/123-test-issue-title');
      expect(mockGitClient.checkout).toHaveBeenCalledWith('self-dev/123-test-issue-title');
      expect(mockGitClient.add).toHaveBeenCalledWith([
        'src/new-file.ts',
        'src/new-file.test.ts',
        'src/existing.ts',
      ]);
      expect(mockGitClient.commit).toHaveBeenCalled();
      expect(mockGitClient.push).toHaveBeenCalledWith('self-dev/123-test-issue-title');
    });

    it('throws CommitUnavailableError when git client not available', async () => {
      const depsWithoutGit: SelfDevWorkflowDependencies = {
        modelAdapter: { complete: vi.fn() } as never,
        githubClient: mockGitHubClient,
      };

      const state = createMockState();
      const outputs = createMockOutputs();

      await expect(executeCommit(depsWithoutGit, state, outputs)).rejects.toThrow(
        CommitUnavailableError
      );
      await expect(executeCommit(depsWithoutGit, state, outputs)).rejects.toThrow(
        'Git client not injected'
      );
    });

    it('returns placeholder when git client not available and fallback enabled', async () => {
      const depsWithoutGit: SelfDevWorkflowDependencies = {
        modelAdapter: { complete: vi.fn() } as never,
        githubClient: mockGitHubClient,
      };

      const state = {
        ...createMockState(),
        config: {
          ...createMockState().config,
          phases: { verify: { allowPlaceholderFallback: true } },
        },
      } as SelfDevWorkflowState;
      const outputs = createMockOutputs();

      const result = await executeCommit(depsWithoutGit, state, outputs);

      expect(result.commitSha).toBe('0000000');
      expect(result.prNumber).toBe(0);
      expect(result.status).toBe('created');
    });

    it('throws CommitUnavailableError when github client not available', async () => {
      const depsWithoutGitHub: SelfDevWorkflowDependencies = {
        modelAdapter: { complete: vi.fn() } as never,
        gitClient: mockGitClient,
      };

      const state = createMockState();
      const outputs = createMockOutputs();

      await expect(executeCommit(depsWithoutGitHub, state, outputs)).rejects.toThrow(
        CommitUnavailableError
      );
      await expect(executeCommit(depsWithoutGitHub, state, outputs)).rejects.toThrow(
        'GitHub client not injected'
      );
    });

    it('returns placeholder when github client not available and fallback enabled', async () => {
      const depsWithoutGitHub: SelfDevWorkflowDependencies = {
        modelAdapter: { complete: vi.fn() } as never,
        gitClient: mockGitClient,
      };

      const state = {
        ...createMockState(),
        config: {
          ...createMockState().config,
          phases: { verify: { allowPlaceholderFallback: true } },
        },
      } as SelfDevWorkflowState;
      const outputs = createMockOutputs();

      const result = await executeCommit(depsWithoutGitHub, state, outputs);

      expect(result.commitSha).toBe('abc1234');
      expect(result.prNumber).toBe(0);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/0');
    });

    it('throws CommitUnavailableError when git operation fails', async () => {
      mockGitClient.createBranch = vi.fn().mockRejectedValue(new Error('Branch already exists'));

      const state = createMockState();
      const outputs = createMockOutputs();

      await expect(executeCommit(deps, state, outputs)).rejects.toThrow(CommitUnavailableError);
      await expect(executeCommit(deps, state, outputs)).rejects.toThrow('Git operations failed');
    });

    it('returns placeholder when git operation fails and fallback enabled', async () => {
      mockGitClient.createBranch = vi.fn().mockRejectedValue(new Error('Branch already exists'));

      const state = {
        ...createMockState(),
        config: {
          ...createMockState().config,
          phases: { verify: { allowPlaceholderFallback: true } },
        },
      } as SelfDevWorkflowState;
      const outputs = createMockOutputs();

      const result = await executeCommit(deps, state, outputs);

      expect(result.commitSha).toBe('0000000');
      expect(result.prNumber).toBe(0);
    });

    it('handles PR creation failure gracefully', async () => {
      mockGitHubClient.createPR = vi.fn().mockRejectedValue(new Error('PR creation failed'));

      const state = createMockState();
      const outputs = createMockOutputs();

      const result = await executeCommit(deps, state, outputs);

      expect(result.commitSha).toBe('abc1234');
      expect(result.prNumber).toBe(0);
      // When PR creation fails, createPullRequest returns empty prUrl,
      // but handlePRAndMerge uses fallback URL when prUrl is empty
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/0');
    });

    it('adds comment to issue when PR is created', async () => {
      const state = createMockState();
      const outputs = createMockOutputs();

      await executeCommit(deps, state, outputs);

      expect(mockGitHubClient.addComment).toHaveBeenCalledWith(
        123,
        'Self-development workflow created PR #456'
      );
    });

    it('does not add comment when issue number is 0', async () => {
      const state = createMockState();
      const issueWithZeroNumber = createMockAnalyzedIssue({
        number: 0,
        title: 'Test',
        body: '',
        type: 'bug' as const,
      });
      const outputs = createMockOutputs({
        analyze: {
          prioritizedIssues: [issueWithZeroNumber],
          selectedIssue: issueWithZeroNumber,
          selectionRationale: 'Test rationale',
          durationMs: 1000,
        },
      });

      await executeCommit(deps, state, outputs);

      expect(mockGitHubClient.addComment).not.toHaveBeenCalled();
    });

    it('skips git add when no files changed', async () => {
      const state = createMockState();
      const outputs = createMockOutputs({
        implement: {
          filesCreated: [],
          filesModified: [],
          selfRefineIterations: 0,
          selfDebugIterations: 0,
          success: true,
          summary: 'No changes',
          durationMs: 100,
        },
      });

      await executeCommit(deps, state, outputs);

      expect(mockGitClient.add).not.toHaveBeenCalled();
    });

    it('uses default issue title when analyze output is missing', async () => {
      const state = createMockState();
      const outputs: SelfDevWorkflowResult['outputs'] = {
        implement: {
          filesCreated: ['file.ts'],
          filesModified: [],
          selfRefineIterations: 0,
          selfDebugIterations: 0,
          success: true,
          summary: 'Done',
          durationMs: 100,
        },
      };

      const result = await executeCommit(deps, state, outputs);

      expect(result.branch).toBe('self-dev/0-self-dev');
    });

    it('attempts auto-merge when config is enabled and verification passed', async () => {
      vi.mocked(attemptAutoMerge).mockResolvedValue({ merged: true });

      const state = createMockState({
        config: {
          repository: 'owner/repo',
          autoMerge: true,
          mergeMethod: 'squash',
        },
      });
      const outputs = createMockOutputs();

      const result = await executeCommit(deps, state, outputs);

      expect(attemptAutoMerge).toHaveBeenCalledWith(deps, 456, 'squash', 'Test Issue Title');
      expect(result.status).toBe('merged');
    });

    it('does not attempt auto-merge when verification failed', async () => {
      const state = createMockState({
        config: {
          repository: 'owner/repo',
          autoMerge: true,
          mergeMethod: 'squash',
        },
      });
      const outputs = createMockOutputs({
        verify: {
          checks: [{ name: 'test', command: 'pnpm test', passed: false, durationMs: 1000 }],
          allPassed: false,
          coverage: 50,
          failureReport: 'Tests failed',
          durationMs: 1000,
        },
      });

      const result = await executeCommit(deps, state, outputs);

      expect(attemptAutoMerge).not.toHaveBeenCalled();
      expect(result.status).toBe('created');
    });

    it('does not attempt auto-merge when autoMerge is disabled', async () => {
      const state = createMockState({
        config: {
          repository: 'owner/repo',
          autoMerge: false,
        },
      });
      const outputs = createMockOutputs();

      const result = await executeCommit(deps, state, outputs);

      expect(attemptAutoMerge).not.toHaveBeenCalled();
      expect(result.status).toBe('created');
    });

    it('returns created status when auto-merge fails', async () => {
      vi.mocked(attemptAutoMerge).mockResolvedValue({ merged: false, reason: 'CI failed' });

      const state = createMockState({
        config: {
          repository: 'owner/repo',
          autoMerge: true,
          mergeMethod: 'squash',
        },
      });
      const outputs = createMockOutputs();

      const result = await executeCommit(deps, state, outputs);

      expect(result.status).toBe('created');
    });

    it('uses default merge method when not specified', async () => {
      vi.mocked(attemptAutoMerge).mockResolvedValue({ merged: true });

      const state = createMockState({
        config: {
          repository: 'owner/repo',
          autoMerge: true,
        },
      });
      const outputs = createMockOutputs();

      await executeCommit(deps, state, outputs);

      expect(attemptAutoMerge).toHaveBeenCalledWith(deps, 456, 'squash', 'Test Issue Title');
    });

    it('tracks duration of commit phase', async () => {
      const state = createMockState();
      const outputs = createMockOutputs();

      const result = await executeCommit(deps, state, outputs);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // Helper Function Tests (via public API behavior)
  // ===========================================================================

  describe('branch name generation', () => {
    it('generates branch name from issue number and title', async () => {
      const state = createMockState();
      const issue = createMockAnalyzedIssue({
        number: 42,
        title: 'Add New Feature',
        body: 'Description',
        type: 'enhancement' as const,
      });
      const outputs = createMockOutputs({
        analyze: {
          prioritizedIssues: [issue],
          selectedIssue: issue,
          selectionRationale: 'Test rationale',
          durationMs: 100,
        },
      });

      const result = await executeCommit(deps, state, outputs);

      expect(result.branch).toBe('self-dev/42-add-new-feature');
    });

    it('truncates long titles in branch name', async () => {
      const state = createMockState();
      const issue = createMockAnalyzedIssue({
        number: 99,
        title: 'This is a very long issue title that should be truncated in the branch name',
        body: 'Description',
        type: 'enhancement' as const,
      });
      const outputs = createMockOutputs({
        analyze: {
          prioritizedIssues: [issue],
          selectedIssue: issue,
          selectionRationale: 'Test rationale',
          durationMs: 100,
        },
      });

      const result = await executeCommit(deps, state, outputs);

      // Should be truncated to 30 chars after slugging
      expect(result.branch.length).toBeLessThanOrEqual(50); // self-dev/ + number + - + 30 chars
      expect(result.branch).toMatch(/^self-dev\/99-/);
    });

    it('converts special characters to hyphens in branch name', async () => {
      const state = createMockState();
      const issue = createMockAnalyzedIssue({
        number: 77,
        title: 'Fix: Bug #123 & Issue [critical]',
        body: 'Description',
        type: 'bug' as const,
      });
      const outputs = createMockOutputs({
        analyze: {
          prioritizedIssues: [issue],
          selectedIssue: issue,
          selectionRationale: 'Test rationale',
          durationMs: 100,
        },
      });

      const result = await executeCommit(deps, state, outputs);

      expect(result.branch).toBe('self-dev/77-fix-bug-123-issue-critical-');
      expect(result.branch).not.toMatch(/[^a-z0-9\-\/]/);
    });
  });

  describe('commit message generation', () => {
    it('includes issue title in commit message', async () => {
      const state = createMockState();
      const outputs = createMockOutputs();

      await executeCommit(deps, state, outputs);

      const commitCall = mockGitClient.commit as ReturnType<typeof vi.fn>;
      const commitMessage = commitCall.mock.calls[0]![0] as string;

      expect(commitMessage).toContain('feat(self-dev): Test Issue Title');
    });

    it('includes file counts in commit message', async () => {
      const state = createMockState();
      const outputs = createMockOutputs();

      await executeCommit(deps, state, outputs);

      const commitCall = mockGitClient.commit as ReturnType<typeof vi.fn>;
      const commitMessage = commitCall.mock.calls[0]![0] as string;

      expect(commitMessage).toContain('Files created: 2');
      expect(commitMessage).toContain('Files modified: 1');
    });

    it('includes close reference in commit message', async () => {
      const state = createMockState();
      const outputs = createMockOutputs();

      await executeCommit(deps, state, outputs);

      const commitCall = mockGitClient.commit as ReturnType<typeof vi.fn>;
      const commitMessage = commitCall.mock.calls[0]![0] as string;

      expect(commitMessage).toContain('Closes #123');
    });

    it('includes workflow attribution in commit message', async () => {
      const state = createMockState();
      const outputs = createMockOutputs();

      await executeCommit(deps, state, outputs);

      const commitCall = mockGitClient.commit as ReturnType<typeof vi.fn>;
      const commitMessage = commitCall.mock.calls[0]![0] as string;

      expect(commitMessage).toContain('Generated by nexus-agents self-development workflow');
    });

    it('uses default body when issue body is empty', async () => {
      const state = createMockState();
      const issue = createMockAnalyzedIssue({
        number: 123,
        title: 'Test',
        body: '',
        type: 'enhancement' as const,
      });
      const outputs = createMockOutputs({
        analyze: {
          prioritizedIssues: [issue],
          selectedIssue: issue,
          selectionRationale: 'Test rationale',
          durationMs: 100,
        },
      });

      await executeCommit(deps, state, outputs);

      const commitCall = mockGitClient.commit as ReturnType<typeof vi.fn>;
      const commitMessage = commitCall.mock.calls[0]![0] as string;

      expect(commitMessage).toContain('Automated implementation from self-development workflow');
    });

    it('truncates long issue body in commit message', async () => {
      const longBody = 'A'.repeat(300);
      const state = createMockState();
      const issue = createMockAnalyzedIssue({
        number: 123,
        title: 'Test',
        body: longBody,
        type: 'enhancement' as const,
      });
      const outputs = createMockOutputs({
        analyze: {
          prioritizedIssues: [issue],
          selectedIssue: issue,
          selectionRationale: 'Test rationale',
          durationMs: 100,
        },
      });

      await executeCommit(deps, state, outputs);

      const commitCall = mockGitClient.commit as ReturnType<typeof vi.fn>;
      const commitMessage = commitCall.mock.calls[0]![0] as string;

      // Body should be truncated to 200 chars
      expect(commitMessage).not.toContain(longBody);
      expect(commitMessage).toContain('A'.repeat(200));
    });
  });

  describe('PR body generation', () => {
    it('includes summary section in PR body', async () => {
      const state = createMockState();
      const outputs = createMockOutputs();

      await executeCommit(deps, state, outputs);

      const prCall = mockGitHubClient.createPR as ReturnType<typeof vi.fn>;
      const prBody = prCall.mock.calls[0]![0].body as string;

      expect(prBody).toContain('## Summary');
    });

    it('includes changes section in PR body', async () => {
      const state = createMockState();
      const outputs = createMockOutputs();

      await executeCommit(deps, state, outputs);

      const prCall = mockGitHubClient.createPR as ReturnType<typeof vi.fn>;
      const prBody = prCall.mock.calls[0]![0].body as string;

      expect(prBody).toContain('## Changes');
      expect(prBody).toContain('Files created: 2');
      expect(prBody).toContain('Files modified: 1');
    });

    it('includes verification status in PR body', async () => {
      const state = createMockState();
      const outputs = createMockOutputs();

      await executeCommit(deps, state, outputs);

      const prCall = mockGitHubClient.createPR as ReturnType<typeof vi.fn>;
      const prBody = prCall.mock.calls[0]![0].body as string;

      expect(prBody).toContain('## Verification');
      expect(prBody).toContain('All verification checks passed');
    });

    it('includes failure report when verification failed', async () => {
      const state = createMockState();
      const outputs = createMockOutputs({
        verify: {
          checks: [],
          allPassed: false,
          coverage: 50,
          failureReport: 'Lint errors found',
          durationMs: 1000,
        },
      });

      await executeCommit(deps, state, outputs);

      const prCall = mockGitHubClient.createPR as ReturnType<typeof vi.fn>;
      const prBody = prCall.mock.calls[0]![0].body as string;

      expect(prBody).toContain('Lint errors found');
    });

    it('includes test plan in PR body', async () => {
      const state = createMockState();
      const outputs = createMockOutputs();

      await executeCommit(deps, state, outputs);

      const prCall = mockGitHubClient.createPR as ReturnType<typeof vi.fn>;
      const prBody = prCall.mock.calls[0]![0].body as string;

      expect(prBody).toContain('## Test Plan');
      expect(prBody).toContain('Run unit tests and integration tests');
    });

    it('uses default test plan when plan output is missing', async () => {
      const state = createMockState();
      const baseOutputs = createMockOutputs();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { plan: _plan, ...outputs } = baseOutputs;

      await executeCommit(deps, state, outputs);

      const prCall = mockGitHubClient.createPR as ReturnType<typeof vi.fn>;
      const prBody = prCall.mock.calls[0]![0].body as string;

      expect(prBody).toContain('See implementation for test coverage');
    });

    it('includes close reference in PR body', async () => {
      const state = createMockState();
      const outputs = createMockOutputs();

      await executeCommit(deps, state, outputs);

      const prCall = mockGitHubClient.createPR as ReturnType<typeof vi.fn>;
      const prBody = prCall.mock.calls[0]![0].body as string;

      expect(prBody).toContain('Closes #123');
    });

    it('includes workflow attribution in PR body', async () => {
      const state = createMockState();
      const outputs = createMockOutputs();

      await executeCommit(deps, state, outputs);

      const prCall = mockGitHubClient.createPR as ReturnType<typeof vi.fn>;
      const prBody = prCall.mock.calls[0]![0].body as string;

      expect(prBody).toContain('Generated by nexus-agents self-development workflow');
    });

    it('shows incomplete verification when verify output is missing', async () => {
      const state = createMockState();
      const baseOutputs = createMockOutputs();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { verify: _verify, ...outputs } = baseOutputs;

      await executeCommit(deps, state, outputs);

      const prCall = mockGitHubClient.createPR as ReturnType<typeof vi.fn>;
      const prBody = prCall.mock.calls[0]![0].body as string;

      expect(prBody).toContain('Verification incomplete');
    });

    it('truncates long issue body in PR summary', async () => {
      const longBody = 'B'.repeat(600);
      const state = createMockState();
      const issue = createMockAnalyzedIssue({
        number: 123,
        title: 'Test',
        body: longBody,
        type: 'enhancement' as const,
      });
      const outputs = createMockOutputs({
        analyze: {
          prioritizedIssues: [issue],
          selectedIssue: issue,
          selectionRationale: 'Test rationale',
          durationMs: 100,
        },
      });

      await executeCommit(deps, state, outputs);

      const prCall = mockGitHubClient.createPR as ReturnType<typeof vi.fn>;
      const prBody = prCall.mock.calls[0]![0].body as string;

      // Summary should be truncated to 500 chars
      expect(prBody).not.toContain(longBody);
      expect(prBody).toContain('B'.repeat(500));
    });
  });

  describe('PR creation options', () => {
    it('uses correct PR title format', async () => {
      const state = createMockState();
      const outputs = createMockOutputs();

      await executeCommit(deps, state, outputs);

      const prCall = mockGitHubClient.createPR as ReturnType<typeof vi.fn>;
      const options = prCall.mock.calls[0]![0];

      expect(options.title).toBe('feat(self-dev): Test Issue Title');
    });

    it('uses correct branch as head', async () => {
      const state = createMockState();
      const outputs = createMockOutputs();

      await executeCommit(deps, state, outputs);

      const prCall = mockGitHubClient.createPR as ReturnType<typeof vi.fn>;
      const options = prCall.mock.calls[0]![0];

      expect(options.head).toBe('self-dev/123-test-issue-title');
    });

    it('uses main as base branch', async () => {
      const state = createMockState();
      const outputs = createMockOutputs();

      await executeCommit(deps, state, outputs);

      const prCall = mockGitHubClient.createPR as ReturnType<typeof vi.fn>;
      const options = prCall.mock.calls[0]![0];

      expect(options.base).toBe('main');
    });
  });

  describe('edge cases', () => {
    it('handles missing implement output gracefully', async () => {
      const state = createMockState();
      const issue = createMockAnalyzedIssue({
        number: 1,
        title: 'Test',
        body: 'Body',
        type: 'enhancement' as const,
      });
      const outputs: SelfDevWorkflowResult['outputs'] = {
        analyze: {
          prioritizedIssues: [issue],
          selectedIssue: issue,
          selectionRationale: 'Test rationale',
          durationMs: 100,
        },
      };

      const result = await executeCommit(deps, state, outputs);

      expect(result.branch).toBe('self-dev/1-test');
      expect(mockGitClient.add).not.toHaveBeenCalled();
    });

    it('throws CommitUnavailableError on non-Error exceptions in git operations', async () => {
      mockGitClient.createBranch = vi.fn().mockRejectedValue('string error');

      const state = createMockState();
      const outputs = createMockOutputs();

      await expect(executeCommit(deps, state, outputs)).rejects.toThrow(CommitUnavailableError);
    });

    it('handles non-Error exceptions in git operations with fallback enabled', async () => {
      mockGitClient.createBranch = vi.fn().mockRejectedValue('string error');

      const state = {
        ...createMockState(),
        config: {
          ...createMockState().config,
          phases: { verify: { allowPlaceholderFallback: true } },
        },
      } as SelfDevWorkflowState;
      const outputs = createMockOutputs();

      const result = await executeCommit(deps, state, outputs);

      expect(result.commitSha).toBe('0000000');
    });

    it('handles non-Error exceptions in PR creation', async () => {
      mockGitHubClient.createPR = vi.fn().mockRejectedValue('string error');

      const state = createMockState();
      const outputs = createMockOutputs();

      const result = await executeCommit(deps, state, outputs);

      expect(result.prNumber).toBe(0);
    });

    it('uses fallback PR URL when creation fails', async () => {
      mockGitHubClient.createPR = vi.fn().mockRejectedValue(new Error('Failed'));

      const state = createMockState();
      const outputs = createMockOutputs();

      const result = await executeCommit(deps, state, outputs);

      // handlePRAndMerge uses fallback URL when createPullRequest returns empty prUrl
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/0');
    });

    it('throws CommitUnavailableError when git operations fail', async () => {
      mockGitClient.createBranch = vi.fn().mockRejectedValue(new Error('Failed'));

      const state = createMockState();
      const outputs = createMockOutputs();

      await expect(executeCommit(deps, state, outputs)).rejects.toThrow(CommitUnavailableError);
    });

    it('uses fallback PR URL when git operations fail with fallback enabled', async () => {
      mockGitClient.createBranch = vi.fn().mockRejectedValue(new Error('Failed'));

      const state = {
        ...createMockState(),
        config: {
          ...createMockState().config,
          phases: { verify: { allowPlaceholderFallback: true } },
        },
      } as SelfDevWorkflowState;
      const outputs = createMockOutputs();

      const result = await executeCommit(deps, state, outputs);

      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/0');
    });
  });
});
