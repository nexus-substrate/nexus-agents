/**
 * PLAN Phase Tests
 *
 * Tests for PlanUnavailableError, executePlan, and internal helper coverage
 * via integration through the exported entry point.
 *
 * @module workflows/self-development/phases/plan.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlanUnavailableError, executePlan } from './plan.js';
import type { SelfDevWorkflowDependencies } from '../interfaces.js';
import type {
  AnalyzeOutput,
  ResearchOutput,
  SelfDevWorkflowState,
  AnalyzedIssue,
} from '../types.js';
import type { TrinityResult } from '../../../agents/collaboration/trinity-types.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../../core/index.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  getTimeProvider: () => ({ now: () => 1000 }),
}));

vi.mock('./shared.js', () => ({
  createSimpleAgent: vi.fn(() => ({
    id: 'planner',
    role: 'thinker',
    state: 'idle',
    capabilities: [],
  })),
  checkFailFast: vi.fn(),
}));

// ============================================================================
// Factories
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createIssue(overrides: Partial<AnalyzedIssue> = {}) {
  return {
    number: 42,
    title: 'Fix auth bug',
    body: 'Auth tokens expire too quickly',
    labels: ['bug'],
    priorityScore: 8,
    complexity: 3 as const,
    estimatedEffort: '2 days',
    dependencies: [],
    risks: [],
    keywords: ['auth'],
    topics: ['security'],
    type: 'bug' as const,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createAnalyzeOutput(overrides: Partial<AnalyzeOutput> = {}) {
  const issue = createIssue();
  return {
    prioritizedIssues: [issue],
    selectedIssue: issue,
    selectionRationale: 'Highest priority',
    durationMs: 100,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createResearchOutput(overrides: Partial<ResearchOutput> = {}) {
  return {
    codebase: {
      relevantFiles: ['src/auth.ts', 'src/auth.test.ts'],
      existingPatterns: ['token-refresh'],
      interfaces: ['IAuthProvider'],
      testPatterns: ['describe auth'],
    },
    academic: { papers: [] },
    docs: { officialDocs: [], bestPractices: [], relatedGuides: [] },
    history: {
      relatedIssues: [],
      relatedPRs: [],
      previousAttempts: [],
      relevantCommits: [],
    },
    synthesizedContext: 'Auth module needs token refresh fix',
    durationMs: 200,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createState(overrides: Partial<SelfDevWorkflowState> = {}) {
  return {
    executionId: 'exec-1',
    config: { repository: 'owner/repo' },
    currentPhase: 'plan' as const,
    checkpoints: [],
    startedAt: '2025-01-01T00:00:00Z',
    status: 'running' as const,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createTrinityResult(overrides: Partial<TrinityResult> = {}) {
  return {
    success: true,
    finalOutput: 'Implementation guidance',
    thinkerOutput: {
      problemAnalysis: 'Auth tokens expire too quickly',
      approach: 'Extend token lifetime',
      considerations: ['backward compat'],
      successCriteria: ['tokens valid for 24h'],
    },
    workerOutput: {
      implementation:
        'modify src/auth.ts to extend TTL\ncreate src/auth-refresh.ts for refresh logic',
      stepsCompleted: ['Step 1: review auth code', 'Step 2: add test for token refresh'],
      deviations: [],
      questions: [],
    },
    verifierOutput: {
      verdict: 'pass' as const,
      correctnessCheck: 'Correct',
      qualityCheck: 'Good',
      issuesFound: [],
      recommendations: [],
    },
    iterations: 2,
    totalDurationMs: 5000,
    history: [],
    stopReason: 'verified' as const,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createDeps(overrides: Partial<SelfDevWorkflowDependencies> = {}) {
  return {
    modelAdapter: {
      complete: vi.fn(() =>
        Promise.resolve({ ok: true, value: { content: [], usage: { totalTokens: 0 } } })
      ),
      stream: vi.fn(),
      listModels: vi.fn(),
    },
    ...overrides,
  } as unknown as SelfDevWorkflowDependencies;
}

// ============================================================================
// PlanUnavailableError
// ============================================================================

describe('PlanUnavailableError', () => {
  it('sets name to PlanUnavailableError', () => {
    const err = new PlanUnavailableError('missing dep');
    expect(err.name).toBe('PlanUnavailableError');
  });

  it('includes reason in message', () => {
    const err = new PlanUnavailableError('TrinityCoordinator not injected');
    expect(err.message).toContain('TrinityCoordinator not injected');
  });

  it('includes fallback guidance in message', () => {
    const err = new PlanUnavailableError('test reason');
    expect(err.message).toContain('allowHeuristicFallback');
  });

  it('extends Error', () => {
    const err = new PlanUnavailableError('reason');
    expect(err).toBeInstanceOf(Error);
  });
});

// ============================================================================
// executePlan - TRINITY path
// ============================================================================

describe('executePlan with TRINITY', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns plan output on successful TRINITY execution', async () => {
    const trinityResult = createTrinityResult();
    const trinity = {
      execute: vi.fn(() => Promise.resolve({ ok: true, value: trinityResult })),
    };
    const deps = createDeps({ trinity } as unknown as Partial<SelfDevWorkflowDependencies>);
    const state = createState();
    const analyze = createAnalyzeOutput();
    const research = createResearchOutput();

    const result = await executePlan(deps, state, analyze, research);

    expect(result.trinityResult).toBe(trinityResult);
    expect(result.iterations).toBe(2);
    expect(result.verified).toBe(true);
    expect(typeof result.durationMs).toBe('number');
  });

  it('parses file paths from TRINITY worker output', async () => {
    const trinityResult = createTrinityResult({
      workerOutput: {
        implementation:
          'create src/new-module.ts for feature\nmodify src/existing.js for changes\nupdate config.json',
        stepsCompleted: ['wrote code'],
        deviations: [],
        questions: [],
      },
    });
    const trinity = {
      execute: vi.fn(() => Promise.resolve({ ok: true, value: trinityResult })),
    };
    const deps = createDeps({ trinity } as unknown as Partial<SelfDevWorkflowDependencies>);
    const state = createState();
    const analyze = createAnalyzeOutput();
    const research = createResearchOutput();

    const result = await executePlan(deps, state, analyze, research);

    expect(result.plan.files.length).toBeGreaterThanOrEqual(2);
    const createFile = result.plan.files.find((f) => f.path === 'src/new-module.ts');
    expect(createFile?.action).toBe('create');
    const modifyFile = result.plan.files.find((f) => f.path === 'src/existing.js');
    expect(modifyFile?.action).toBe('modify');
  });

  it('extracts test plan from worker steps containing test keywords', async () => {
    const trinityResult = createTrinityResult({
      workerOutput: {
        implementation: 'code here',
        stepsCompleted: [
          'Step 1: review code',
          'Step 2: write test for auth refresh',
          'Step 3: add spec for token validation',
        ],
        deviations: [],
        questions: [],
      },
    });
    const trinity = {
      execute: vi.fn(() => Promise.resolve({ ok: true, value: trinityResult })),
    };
    const deps = createDeps({ trinity } as unknown as Partial<SelfDevWorkflowDependencies>);
    const state = createState();

    const result = await executePlan(deps, state, createAnalyzeOutput(), createResearchOutput());

    expect(result.plan.testPlan).toContain('test');
    expect(result.plan.testPlan).toContain('spec');
  });

  it('provides default test plan when no test steps exist', async () => {
    const trinityResult = createTrinityResult({
      workerOutput: {
        implementation: 'no file refs',
        stepsCompleted: ['did some refactoring', 'updated config'],
        deviations: [],
        questions: [],
      },
    });
    const trinity = {
      execute: vi.fn(() => Promise.resolve({ ok: true, value: trinityResult })),
    };
    const deps = createDeps({ trinity } as unknown as Partial<SelfDevWorkflowDependencies>);
    const state = createState();

    const result = await executePlan(deps, state, createAnalyzeOutput(), createResearchOutput());

    expect(result.plan.testPlan).toBe('Add unit tests for new functionality');
  });

  it('sets verified to false when verifier verdict is fail', async () => {
    const trinityResult = createTrinityResult({
      verifierOutput: {
        verdict: 'fail',
        correctnessCheck: 'Incorrect',
        qualityCheck: 'Needs work',
        issuesFound: ['missing validation'],
        recommendations: ['add validation'],
      },
    });
    const trinity = {
      execute: vi.fn(() => Promise.resolve({ ok: true, value: trinityResult })),
    };
    const deps = createDeps({ trinity } as unknown as Partial<SelfDevWorkflowDependencies>);
    const state = createState();

    const result = await executePlan(deps, state, createAnalyzeOutput(), createResearchOutput());

    expect(result.verified).toBe(false);
  });

  it('throws PlanUnavailableError when TRINITY execution fails without fallback', async () => {
    const trinity = {
      execute: vi.fn(() => Promise.resolve({ ok: false, error: new Error('model timeout') })),
    };
    const deps = createDeps({ trinity } as unknown as Partial<SelfDevWorkflowDependencies>);
    const state = createState();

    await expect(
      executePlan(deps, state, createAnalyzeOutput(), createResearchOutput())
    ).rejects.toThrow(PlanUnavailableError);
  });

  it('falls back to heuristic plan when TRINITY fails and fallback allowed', async () => {
    const trinity = {
      execute: vi.fn(() => Promise.resolve({ ok: false, error: new Error('model down') })),
    };
    const deps = createDeps({ trinity } as unknown as Partial<SelfDevWorkflowDependencies>);
    const state = createState({
      config: {
        repository: 'owner/repo',
        phases: { plan: { allowHeuristicFallback: true } },
      },
    });

    const result = await executePlan(deps, state, createAnalyzeOutput(), createResearchOutput());

    expect(result.verified).toBe(true);
    expect(result.iterations).toBe(1);
    expect(result.trinityResult.stopReason).toBe('verified');
  });
});

// ============================================================================
// executePlan - Fallback path (no TRINITY)
// ============================================================================

describe('executePlan fallback (no TRINITY)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws PlanUnavailableError when TRINITY is undefined and fallback not allowed', async () => {
    const deps = createDeps();
    const state = createState();

    await expect(
      executePlan(deps, state, createAnalyzeOutput(), createResearchOutput())
    ).rejects.toThrow(PlanUnavailableError);
  });

  it('returns heuristic plan when fallback allowed and TRINITY missing', async () => {
    const deps = createDeps();
    const state = createState({
      config: {
        repository: 'owner/repo',
        phases: { plan: { allowHeuristicFallback: true } },
      },
    });
    const analyze = createAnalyzeOutput();
    const research = createResearchOutput();

    const result = await executePlan(deps, state, analyze, research);

    expect(result.verified).toBe(true);
    expect(result.iterations).toBe(1);
    expect(result.plan.problemAnalysis).toContain('#42');
  });

  it('includes risk mitigations in success criteria', async () => {
    const deps = createDeps();
    const issue = createIssue({ risks: ['data loss', 'downtime'] });
    const analyze = createAnalyzeOutput({ selectedIssue: issue });
    const state = createState({
      config: {
        repository: 'owner/repo',
        phases: { plan: { allowHeuristicFallback: true } },
      },
    });

    const result = await executePlan(deps, state, analyze, createResearchOutput());

    expect(result.plan.successCriteria).toContain('Risk mitigated: data loss');
    expect(result.plan.successCriteria).toContain('Risk mitigated: downtime');
  });

  it('maps relevant files from research to plan files', async () => {
    const deps = createDeps();
    const research = createResearchOutput({
      codebase: {
        relevantFiles: ['src/auth.ts', 'src/tokens.ts'],
        existingPatterns: [],
        interfaces: ['IAuth'],
        testPatterns: [],
      },
    });
    const state = createState({
      config: {
        repository: 'owner/repo',
        phases: { plan: { allowHeuristicFallback: true } },
      },
    });

    const result = await executePlan(deps, state, createAnalyzeOutput(), research);

    expect(result.plan.files).toHaveLength(2);
    expect(result.plan.files[0]!.action).toBe('modify');
    expect(result.plan.interfaces).toEqual(['IAuth']);
  });

  it('uses test patterns from research when available', async () => {
    const deps = createDeps();
    const research = createResearchOutput({
      codebase: {
        relevantFiles: [],
        existingPatterns: [],
        interfaces: [],
        testPatterns: ['vitest pattern A', 'vitest pattern B'],
      },
    });
    const state = createState({
      config: {
        repository: 'owner/repo',
        phases: { plan: { allowHeuristicFallback: true } },
      },
    });

    const result = await executePlan(deps, state, createAnalyzeOutput(), research);

    expect(result.plan.testPlan).toContain('vitest pattern A');
    expect(result.plan.testPlan).toContain('vitest pattern B');
  });

  it('provides default test plan when no test patterns in research', async () => {
    const deps = createDeps();
    const research = createResearchOutput({
      codebase: {
        relevantFiles: [],
        existingPatterns: [],
        interfaces: [],
        testPatterns: [],
      },
    });
    const state = createState({
      config: {
        repository: 'owner/repo',
        phases: { plan: { allowHeuristicFallback: true } },
      },
    });

    const result = await executePlan(deps, state, createAnalyzeOutput(), research);

    expect(result.plan.testPlan).toContain('src/**/*.test.ts');
  });

  it('generates bug-specific steps for bug type issues', async () => {
    const deps = createDeps();
    const issue = createIssue({ type: 'bug' });
    const analyze = createAnalyzeOutput({ selectedIssue: issue });
    const state = createState({
      config: {
        repository: 'owner/repo',
        phases: { plan: { allowHeuristicFallback: true } },
      },
    });

    const result = await executePlan(deps, state, analyze, createResearchOutput());
    const workerSteps = result.trinityResult.workerOutput.stepsCompleted;
    const hasReproduceStep = workerSteps.some((s) => s.includes('Reproduce'));

    expect(hasReproduceStep).toBe(true);
  });

  it('generates security-specific steps for security type issues', async () => {
    const deps = createDeps();
    const issue = createIssue({ type: 'security' });
    const analyze = createAnalyzeOutput({ selectedIssue: issue });
    const state = createState({
      config: {
        repository: 'owner/repo',
        phases: { plan: { allowHeuristicFallback: true } },
      },
    });

    const result = await executePlan(deps, state, analyze, createResearchOutput());
    const workerSteps = result.trinityResult.workerOutput.stepsCompleted;
    const hasSecurityStep = workerSteps.some((s) => s.includes('security'));

    expect(hasSecurityStep).toBe(true);
  });

  it('includes dependency info in thinker considerations', async () => {
    const deps = createDeps();
    const issue = createIssue({ dependencies: ['redis', 'postgres'] });
    const analyze = createAnalyzeOutput({ selectedIssue: issue });
    const state = createState({
      config: {
        repository: 'owner/repo',
        phases: { plan: { allowHeuristicFallback: true } },
      },
    });

    const result = await executePlan(deps, state, analyze, createResearchOutput());
    const considerations = result.trinityResult.thinkerOutput.considerations;
    const hasDeps = considerations.some((c) => c.includes('redis') && c.includes('postgres'));

    expect(hasDeps).toBe(true);
  });

  it('asks question about files when no relevant files exist', async () => {
    const deps = createDeps();
    const research = createResearchOutput({
      codebase: {
        relevantFiles: [],
        existingPatterns: [],
        interfaces: [],
        testPatterns: [],
      },
    });
    const state = createState({
      config: {
        repository: 'owner/repo',
        phases: { plan: { allowHeuristicFallback: true } },
      },
    });

    const result = await executePlan(deps, state, createAnalyzeOutput(), research);

    expect(result.trinityResult.workerOutput.questions).toContain(
      'Which files should be modified?'
    );
  });

  it('has no questions when relevant files exist', async () => {
    const deps = createDeps();
    const state = createState({
      config: {
        repository: 'owner/repo',
        phases: { plan: { allowHeuristicFallback: true } },
      },
    });

    const result = await executePlan(deps, state, createAnalyzeOutput(), createResearchOutput());

    expect(result.trinityResult.workerOutput.questions).toHaveLength(0);
  });

  it('uses issue body fallback when body is empty', async () => {
    const deps = createDeps();
    const issue = createIssue({ body: '' });
    const analyze = createAnalyzeOutput({ selectedIssue: issue });
    const state = createState({
      config: {
        repository: 'owner/repo',
        phases: { plan: { allowHeuristicFallback: true } },
      },
    });

    const result = await executePlan(deps, state, analyze, createResearchOutput());

    expect(result.trinityResult.thinkerOutput.problemAnalysis).toContain('No description');
  });
});
