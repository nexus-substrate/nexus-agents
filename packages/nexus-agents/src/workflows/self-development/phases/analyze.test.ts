/**
 * Tests for ANALYZE phase - Issue analysis and prioritization.
 *
 * Tests helper functions (scoring, complexity, type detection, extraction)
 * and the main executeAnalyze function with mocked dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAnalyze, AnalyzeUnavailableError } from './analyze.js';
import type { SelfDevWorkflowDependencies, IGitHubClient } from '../interfaces.js';
import type { SelfDevWorkflowState } from '../types.js';
import type { IModelAdapter } from '../../../core/index.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../../core/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../core/index.js')>();
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    getTimeProvider: () => ({
      now: vi.fn().mockReturnValue(1000),
    }),
  };
});

vi.mock('./shared.js', () => ({
  checkFailFast: vi.fn(),
}));

// ============================================================================
// Factories
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockGitHubClient(
  issues: Parameters<IGitHubClient['listIssues']> extends unknown[]
    ? ReturnType<IGitHubClient['listIssues']> extends Promise<infer R>
      ? R
      : never
    : never = []
) {
  return {
    listIssues: vi.fn().mockImplementation(() => Promise.resolve(issues)),
    getIssue: vi.fn(),
    createPR: vi.fn(),
    addComment: vi.fn(),
    addLabels: vi.fn(),
    mergePR: vi.fn(),
    getPRStatus: vi.fn(),
  } satisfies IGitHubClient;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockAdapter() {
  return {
    providerId: 'mock',
    modelId: 'mock-model',
    capabilities: ['completion'],
    complete: vi.fn(),
    stream: vi.fn(),
    countTokens: vi.fn(),
    validateConfig: vi.fn(),
  } as unknown as IModelAdapter;
}

function createDeps(githubClient?: IGitHubClient): SelfDevWorkflowDependencies {
  const deps: SelfDevWorkflowDependencies = {
    modelAdapter: createMockAdapter(),
  };
  if (githubClient !== undefined) {
    return { ...deps, githubClient };
  }
  return deps;
}

function createState(overrides: Partial<SelfDevWorkflowState> = {}): SelfDevWorkflowState {
  return {
    executionId: 'test-exec-1',
    config: {
      repository: 'owner/repo',
    },
    currentPhase: 'analyze',
    checkpoints: [],
    startedAt: '2026-01-01T00:00:00Z',
    status: 'running',
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createIssue(
  overrides: Partial<{
    number: number;
    title: string;
    body: string;
    labels: string[];
    author: string;
    createdAt: string;
  }> = {}
) {
  return {
    number: 42,
    title: 'Fix authentication bug',
    body: 'The login flow breaks on timeout.',
    labels: [] as string[],
    author: 'user1',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// AnalyzeUnavailableError
// ============================================================================

describe('AnalyzeUnavailableError', () => {
  it('should set name to AnalyzeUnavailableError', () => {
    const error = new AnalyzeUnavailableError('test reason');
    expect(error.name).toBe('AnalyzeUnavailableError');
  });

  it('should include reason in message', () => {
    const error = new AnalyzeUnavailableError('GitHub client not injected');
    expect(error.message).toContain('GitHub client not injected');
  });

  it('should mention allowPlaceholderFallback in message', () => {
    const error = new AnalyzeUnavailableError('API down');
    expect(error.message).toContain('allowPlaceholderFallback');
  });

  it('should be an instance of Error', () => {
    const error = new AnalyzeUnavailableError('reason');
    expect(error).toBeInstanceOf(Error);
  });
});

// ============================================================================
// executeAnalyze - No GitHub Client
// ============================================================================

describe('executeAnalyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when GitHub client is undefined', () => {
    it('should throw AnalyzeUnavailableError by default', async () => {
      const deps = createDeps(undefined);
      const state = createState();

      await expect(executeAnalyze(deps, state)).rejects.toThrow(AnalyzeUnavailableError);
    });

    it('should return placeholder when allowPlaceholderFallback is true', async () => {
      const deps = createDeps(undefined);
      const state = createState({
        config: {
          repository: 'owner/repo',
          phases: { analyze: { allowPlaceholderFallback: true } },
        },
      });

      const result = await executeAnalyze(deps, state);

      expect(result.prioritizedIssues).toEqual([]);
      expect(result.selectedIssue.number).toBe(0);
      expect(result.selectedIssue.title).toBe('No approved issues available');
      expect(result.selectedIssue.type).toBe('enhancement');
    });
  });

  // ============================================================================
  // executeAnalyze - Empty Issues
  // ============================================================================

  describe('when no approved issues exist', () => {
    it('should return placeholder output', async () => {
      const client = createMockGitHubClient([]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.prioritizedIssues).toEqual([]);
      expect(result.selectedIssue.number).toBe(0);
      expect(result.selectionRationale).toContain('No issues');
    });

    it('should call listIssues with self-development-approved label', async () => {
      const client = createMockGitHubClient([]);
      const deps = createDeps(client);
      const state = createState();

      await executeAnalyze(deps, state);

      expect(client.listIssues).toHaveBeenCalledWith(['self-development-approved']);
    });
  });

  // ============================================================================
  // executeAnalyze - Issue Enrichment and Selection
  // ============================================================================

  describe('issue enrichment', () => {
    it('should enrich single issue and select it', async () => {
      const issue = createIssue({ number: 10, title: 'Short title', body: 'Short body' });
      const client = createMockGitHubClient([issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.prioritizedIssues).toHaveLength(1);
      expect(result.selectedIssue.number).toBe(10);
      expect(result.selectionRationale).toContain('#10');
    });

    it('should select highest priority issue', async () => {
      const lowPriority = createIssue({ number: 1, title: 'Low', body: 'Low', labels: ['P3'] });
      const highPriority = createIssue({ number: 2, title: 'High', body: 'High', labels: ['P1'] });
      const client = createMockGitHubClient([lowPriority, highPriority]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.selectedIssue.number).toBe(2);
      expect(result.prioritizedIssues[0]!.number).toBe(2);
    });

    it('should assign bug type from labels', async () => {
      const issue = createIssue({ labels: ['bug'] });
      const client = createMockGitHubClient([issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.selectedIssue.type).toBe('bug');
    });

    it('should assign security type from labels', async () => {
      const issue = createIssue({ labels: ['security'] });
      const client = createMockGitHubClient([issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.selectedIssue.type).toBe('security');
    });

    it('should assign architecture type from labels', async () => {
      const issue = createIssue({ labels: ['architecture'] });
      const client = createMockGitHubClient([issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.selectedIssue.type).toBe('architecture');
    });

    it('should assign tech-debt type from refactor label', async () => {
      const issue = createIssue({ labels: ['refactor'] });
      const client = createMockGitHubClient([issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.selectedIssue.type).toBe('tech-debt');
    });

    it('should default to enhancement type', async () => {
      const issue = createIssue({ labels: ['feature'] });
      const client = createMockGitHubClient([issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.selectedIssue.type).toBe('enhancement');
    });

    it('should extract dependencies from body', async () => {
      const issue = createIssue({ body: 'This depends on #123 and depends on #456' });
      const client = createMockGitHubClient([issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.selectedIssue.dependencies).toContain('#123');
      expect(result.selectedIssue.dependencies).toContain('#456');
    });

    it('should extract risks from body', async () => {
      const issue = createIssue({ body: 'This is a breaking change with security implications' });
      const client = createMockGitHubClient([issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.selectedIssue.risks).toEqual(
        expect.arrayContaining([
          expect.stringContaining('breaking change'),
          expect.stringContaining('security'),
        ])
      );
    });

    it('should extract keywords from title and body', async () => {
      const issue = createIssue({
        title: 'Fix API test failures',
        body: 'Database connection drops',
      });
      const client = createMockGitHubClient([issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.selectedIssue.keywords).toContain('api');
      expect(result.selectedIssue.keywords).toContain('test');
      expect(result.selectedIssue.keywords).toContain('database');
    });

    it('should extract topics from topic: labels', async () => {
      const issue = createIssue({ labels: ['topic:auth', 'topic:api', 'bug'] });
      const client = createMockGitHubClient([issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.selectedIssue.topics).toContain('auth');
      expect(result.selectedIssue.topics).toContain('api');
      expect(result.selectedIssue.topics).not.toContain('bug');
    });
  });

  // ============================================================================
  // executeAnalyze - Priority Scoring
  // ============================================================================

  describe('priority scoring', () => {
    it('should give higher score to P1 than P3 issues', async () => {
      const p1Issue = createIssue({ number: 1, labels: ['P1'] });
      const p3Issue = createIssue({ number: 2, labels: ['P3'] });
      const client = createMockGitHubClient([p1Issue, p3Issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      const p1 = result.prioritizedIssues.find((i) => i.number === 1);
      const p3 = result.prioritizedIssues.find((i) => i.number === 2);
      expect(p1!.priorityScore).toBeGreaterThan(p3!.priorityScore);
    });

    it('should boost score for security label', async () => {
      const securityIssue = createIssue({ number: 1, labels: ['security'] });
      const plainIssue = createIssue({ number: 2, labels: [] });
      const client = createMockGitHubClient([securityIssue, plainIssue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      const sec = result.prioritizedIssues.find((i) => i.number === 1);
      const plain = result.prioritizedIssues.find((i) => i.number === 2);
      expect(sec!.priorityScore).toBeGreaterThan(plain!.priorityScore);
    });

    it('should cap priority score at 100', async () => {
      const issue = createIssue({
        labels: ['P1', 'security', 'bug', 'good first issue'],
        title: 'Short',
        body: 'Brief',
      });
      const client = createMockGitHubClient([issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.selectedIssue.priorityScore).toBeLessThanOrEqual(100);
    });
  });

  // ============================================================================
  // executeAnalyze - Complexity Estimation
  // ============================================================================

  describe('complexity estimation', () => {
    it('should use complexity label when present', async () => {
      const issue = createIssue({ labels: ['complexity:high'] });
      const client = createMockGitHubClient([issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.selectedIssue.complexity).toBe(5);
    });

    it('should increase complexity for long body text', async () => {
      const longBody = Array.from({ length: 600 }, () => 'word').join(' ');
      const longIssue = createIssue({ number: 1, body: longBody });
      const shortIssue = createIssue({ number: 2, body: 'Short body' });
      const client = createMockGitHubClient([longIssue, shortIssue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      const long = result.prioritizedIssues.find((i) => i.number === 1);
      const short = result.prioritizedIssues.find((i) => i.number === 2);
      expect(long!.complexity).toBeGreaterThanOrEqual(short!.complexity);
    });

    it('should increase complexity for complex keywords', async () => {
      const issue = createIssue({ body: 'We need a large refactor and architecture migration' });
      const client = createMockGitHubClient([issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.selectedIssue.complexity).toBeGreaterThanOrEqual(3);
    });

    it('should cap complexity at 5', async () => {
      const body =
        Array.from({ length: 1100 }, () => 'word').join(' ') +
        ' refactor architecture breaking migration';
      const issue = createIssue({ body });
      const client = createMockGitHubClient([issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.selectedIssue.complexity).toBeLessThanOrEqual(5);
    });
  });

  // ============================================================================
  // executeAnalyze - Effort Estimation
  // ============================================================================

  describe('effort estimation', () => {
    it('should map low complexity to short effort', async () => {
      const issue = createIssue({ labels: ['complexity:low'] });
      const client = createMockGitHubClient([issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.selectedIssue.estimatedEffort).toBe('1-2h');
    });

    it('should map high complexity to long effort', async () => {
      const issue = createIssue({ labels: ['complexity:high'] });
      const client = createMockGitHubClient([issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.selectedIssue.estimatedEffort).toBe('2-5d');
    });
  });

  // ============================================================================
  // executeAnalyze - GitHub API Errors
  // ============================================================================

  describe('when GitHub API fails', () => {
    it('should throw AnalyzeUnavailableError by default', async () => {
      const client = createMockGitHubClient();
      client.listIssues = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('API timeout')));
      const deps = createDeps(client);
      const state = createState();

      await expect(executeAnalyze(deps, state)).rejects.toThrow(AnalyzeUnavailableError);
    });

    it('should include API error message in thrown error', async () => {
      const client = createMockGitHubClient();
      client.listIssues = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('rate limited')));
      const deps = createDeps(client);
      const state = createState();

      await expect(executeAnalyze(deps, state)).rejects.toThrow('rate limited');
    });

    it('should return placeholder on API error when fallback enabled', async () => {
      const client = createMockGitHubClient();
      client.listIssues = vi.fn().mockImplementation(() => Promise.reject(new Error('API error')));
      const deps = createDeps(client);
      const state = createState({
        config: {
          repository: 'owner/repo',
          phases: { analyze: { allowPlaceholderFallback: true } },
        },
      });

      const result = await executeAnalyze(deps, state);

      expect(result.prioritizedIssues).toEqual([]);
      expect(result.selectedIssue.number).toBe(0);
    });

    it('should handle non-Error thrown values', async () => {
      const client = createMockGitHubClient();
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      client.listIssues = vi.fn().mockImplementation(() => Promise.reject('string error'));
      const deps = createDeps(client);
      const state = createState({
        config: {
          repository: 'owner/repo',
          phases: { analyze: { allowPlaceholderFallback: true } },
        },
      });

      const result = await executeAnalyze(deps, state);

      expect(result.prioritizedIssues).toEqual([]);
    });
  });

  // ============================================================================
  // executeAnalyze - Duration Tracking
  // ============================================================================

  describe('duration tracking', () => {
    it('should include durationMs in output', async () => {
      const issue = createIssue();
      const client = createMockGitHubClient([issue]);
      const deps = createDeps(client);
      const state = createState();

      const result = await executeAnalyze(deps, state);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
