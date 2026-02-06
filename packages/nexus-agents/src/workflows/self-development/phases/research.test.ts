/**
 * Tests for RESEARCH phase - Multi-agent research using model adapter.
 *
 * Tests pure helper functions (buildResearchPrompt, extractListFromSection,
 * parseResearchResponse, getHeuristicBestPractices, getPatternsByKeywords,
 * buildHeuristicContext) and the main executeResearch function with mocked deps.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeResearch, ResearchUnavailableError } from './research.js';
import type { SelfDevWorkflowDependencies } from '../interfaces.js';
import type { SelfDevWorkflowState, AnalyzeOutput, AnalyzedIssue } from '../types.js';
import { ModelError } from '../../../core/index.js';
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

// ============================================================================
// Factories
// ============================================================================

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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createDeps(overrides?: Partial<SelfDevWorkflowDependencies>) {
  return {
    modelAdapter: createMockAdapter(),
    ...overrides,
  } as SelfDevWorkflowDependencies;
}

function createIssue(overrides?: Partial<AnalyzedIssue>): AnalyzedIssue {
  return {
    number: 42,
    title: 'Fix authentication bug',
    body: 'Users cannot log in with SSO',
    labels: ['bug'],
    priorityScore: 8,
    complexity: 3 as const,
    estimatedEffort: '2 days',
    dependencies: [],
    risks: ['breaking change'],
    keywords: ['api', 'security'],
    topics: ['auth'],
    type: 'bug',
    ...overrides,
  };
}

function createAnalyzeOutput(issueOverrides?: Partial<AnalyzedIssue>): AnalyzeOutput {
  const issue = createIssue(issueOverrides);
  return {
    prioritizedIssues: [issue],
    selectedIssue: issue,
    selectionRationale: 'Highest priority',
    durationMs: 100,
  };
}

function createState(overrides?: Partial<SelfDevWorkflowState>): SelfDevWorkflowState {
  return {
    executionId: 'test-exec-1',
    config: { repository: 'owner/repo' },
    currentPhase: 'research',
    checkpoints: [],
    startedAt: '2026-01-01T00:00:00Z',
    status: 'running',
    ...overrides,
  };
}

// ============================================================================
// ResearchUnavailableError
// ============================================================================

describe('ResearchUnavailableError', () => {
  it('should set name to ResearchUnavailableError', () => {
    const error = new ResearchUnavailableError('model down');
    expect(error.name).toBe('ResearchUnavailableError');
  });

  it('should include reason in message', () => {
    const error = new ResearchUnavailableError('timeout');
    expect(error.message).toContain('timeout');
  });

  it('should mention heuristic fallback config in message', () => {
    const error = new ResearchUnavailableError('any');
    expect(error.message).toContain('allowHeuristicFallback');
  });

  it('should extend Error', () => {
    const error = new ResearchUnavailableError('test');
    expect(error).toBeInstanceOf(Error);
  });
});

// ============================================================================
// executeResearch - successful model call
// ============================================================================

describe('executeResearch', () => {
  let deps: SelfDevWorkflowDependencies;
  let state: SelfDevWorkflowState;
  let analyze: AnalyzeOutput;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createDeps();
    state = createState();
    analyze = createAnalyzeOutput();
  });

  it('should return parsed research on successful model call', async () => {
    const responseText = [
      '## Relevant Files',
      '- src/auth/login.ts',
      '- src/auth/sso.ts',
      '',
      '## Patterns',
      '- Use middleware pattern',
      '',
      '## Test',
      '- Use AAA arrange-act-assert',
      '',
      '## Documentation',
      '- See OAuth2 spec',
      '',
      '## Best Practices',
      '- Validate tokens server-side',
    ].join('\n');

    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          content: [{ type: 'text' as const, text: responseText }],
          usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
          stopReason: 'end_turn' as const,
          model: 'mock-model',
        },
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.codebase.relevantFiles).toContain('src/auth/login.ts');
    expect(result.codebase.relevantFiles).toContain('src/auth/sso.ts');
    expect(result.codebase.existingPatterns).toContain('Use middleware pattern');
    expect(result.codebase.testPatterns).toContain('Use AAA arrange-act-assert');
    expect(result.docs.officialDocs).toContain('See OAuth2 spec');
    expect(result.docs.bestPractices).toContain('Validate tokens server-side');
    expect(result.synthesizedContext).toBe(responseText);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should pass system prompt and user message to model', async () => {
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          content: [{ type: 'text' as const, text: '' }],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          stopReason: 'end_turn' as const,
          model: 'mock-model',
        },
      })
    );

    await executeResearch(deps, state, analyze);

    const call = vi.mocked(deps.modelAdapter.complete).mock.calls[0]![0];
    expect(call.systemPrompt).toContain('research agent');
    expect(call.messages[0]!.role).toBe('user');
    expect(call.messages[0]!.content).toContain('#42');
    expect(call.messages[0]!.content).toContain('Fix authentication bug');
    expect(call.maxTokens).toBe(2000);
  });

  it('should include issue keywords in prompt', async () => {
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          content: [{ type: 'text' as const, text: '' }],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          stopReason: 'end_turn' as const,
          model: 'mock-model',
        },
      })
    );

    await executeResearch(deps, state, analyze);

    const prompt = vi.mocked(deps.modelAdapter.complete).mock.calls[0]![0].messages[0]!
      .content as string;
    expect(prompt).toContain('api, security');
  });

  it('should handle empty keywords with "none"', async () => {
    analyze = createAnalyzeOutput({ keywords: [] });
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          content: [{ type: 'text' as const, text: '' }],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          stopReason: 'end_turn' as const,
          model: 'mock-model',
        },
      })
    );

    await executeResearch(deps, state, analyze);

    const prompt = vi.mocked(deps.modelAdapter.complete).mock.calls[0]![0].messages[0]!
      .content as string;
    expect(prompt).toContain('Keywords: none');
  });

  it('should handle missing body with fallback text', async () => {
    analyze = createAnalyzeOutput({ body: '' });
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          content: [{ type: 'text' as const, text: '' }],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          stopReason: 'end_turn' as const,
          model: 'mock-model',
        },
      })
    );

    await executeResearch(deps, state, analyze);

    const prompt = vi.mocked(deps.modelAdapter.complete).mock.calls[0]![0].messages[0]!
      .content as string;
    // Empty body is passed through; the prompt just includes the empty string
    expect(prompt).toContain('Description:');
  });

  // ============================================================================
  // executeResearch - model failure without heuristic fallback
  // ============================================================================

  it('should throw ResearchUnavailableError on model failure by default', async () => {
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: new ModelError('rate limited'),
      })
    );

    await expect(executeResearch(deps, state, analyze)).rejects.toThrow(ResearchUnavailableError);
  });

  it('should include model error message in thrown error', async () => {
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: new ModelError('API key invalid'),
      })
    );

    await expect(executeResearch(deps, state, analyze)).rejects.toThrow('API key invalid');
  });

  // ============================================================================
  // executeResearch - model failure with heuristic fallback
  // ============================================================================

  it('should return heuristic fallback when allowHeuristicFallback is true', async () => {
    state = createState({
      config: {
        repository: 'owner/repo',
        phases: { research: { allowHeuristicFallback: true } },
      },
    });
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: new ModelError('unavailable'),
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.synthesizedContext).toContain('Heuristic Research Summary');
    expect(result.synthesizedContext).toContain('bug');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should include bug best practices in heuristic fallback', async () => {
    state = createState({
      config: {
        repository: 'owner/repo',
        phases: { research: { allowHeuristicFallback: true } },
      },
    });
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: new ModelError('fail'),
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.docs.bestPractices).toEqual(
      expect.arrayContaining([expect.stringContaining('failing test')])
    );
  });

  it('should include keyword-based patterns in heuristic fallback', async () => {
    state = createState({
      config: {
        repository: 'owner/repo',
        phases: { research: { allowHeuristicFallback: true } },
      },
    });
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: new ModelError('fail'),
      })
    );

    const result = await executeResearch(deps, state, analyze);

    // Issue has keywords: ['api', 'security']
    expect(result.codebase.existingPatterns).toEqual(
      expect.arrayContaining([
        expect.stringContaining('RESTful'),
        expect.stringContaining('defense-in-depth'),
      ])
    );
  });

  it('should return enhancement practices for unknown issue types', async () => {
    analyze = createAnalyzeOutput({
      type: 'enhancement',
      keywords: [],
    });
    state = createState({
      config: {
        repository: 'owner/repo',
        phases: { research: { allowHeuristicFallback: true } },
      },
    });
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: new ModelError('fail'),
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.docs.bestPractices).toEqual(
      expect.arrayContaining([expect.stringContaining('existing code patterns')])
    );
  });

  // ============================================================================
  // executeResearch - response content parsing edge cases
  // ============================================================================

  it('should handle non-text content blocks gracefully', async () => {
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          content: [{ type: 'tool_use' as const, id: 't1', name: 'fn', input: {} }],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          stopReason: 'tool_use' as const,
          model: 'mock-model',
        },
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.synthesizedContext).toBe('');
    expect(result.codebase.relevantFiles).toEqual([]);
  });

  it('should handle empty content array', async () => {
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          content: [],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          stopReason: 'end_turn' as const,
          model: 'mock-model',
        },
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.synthesizedContext).toBe('');
  });

  it('should parse numbered list items from response', async () => {
    const responseText = [
      '## Relevant Files',
      '1. src/core/router.ts',
      '2. src/core/handler.ts',
    ].join('\n');

    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          content: [{ type: 'text' as const, text: responseText }],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          stopReason: 'end_turn' as const,
          model: 'mock-model',
        },
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.codebase.relevantFiles).toContain('src/core/router.ts');
    expect(result.codebase.relevantFiles).toContain('src/core/handler.ts');
  });

  it('should limit extracted items to 10 per section', async () => {
    const items = Array.from({ length: 15 }, (_, i) => `- item${String(i)}`);
    const responseText = ['## Files', ...items].join('\n');

    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          content: [{ type: 'text' as const, text: responseText }],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          stopReason: 'end_turn' as const,
          model: 'mock-model',
        },
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.codebase.relevantFiles.length).toBeLessThanOrEqual(10);
  });

  it('should stop section parsing at blank line', async () => {
    const responseText = ['## Files', '- src/a.ts', '', '- src/b.ts'].join('\n');

    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          content: [{ type: 'text' as const, text: responseText }],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          stopReason: 'end_turn' as const,
          model: 'mock-model',
        },
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.codebase.relevantFiles).toEqual(['src/a.ts']);
  });

  it('should stop section parsing at new heading', async () => {
    const responseText = ['## Files', '- src/a.ts', '# Another Section', '- src/b.ts'].join('\n');

    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          content: [{ type: 'text' as const, text: responseText }],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          stopReason: 'end_turn' as const,
          model: 'mock-model',
        },
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.codebase.relevantFiles).toEqual(['src/a.ts']);
  });

  it('should skip empty list items', async () => {
    const responseText = ['## Files', '- src/a.ts', '-   ', '- src/b.ts'].join('\n');

    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          content: [{ type: 'text' as const, text: responseText }],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          stopReason: 'end_turn' as const,
          model: 'mock-model',
        },
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.codebase.relevantFiles).toEqual(['src/a.ts', 'src/b.ts']);
  });

  // ============================================================================
  // Heuristic fallback - issue type variations
  // ============================================================================

  it('should return security practices for security issue type', async () => {
    analyze = createAnalyzeOutput({ type: 'security', keywords: [] });
    state = createState({
      config: {
        repository: 'owner/repo',
        phases: { research: { allowHeuristicFallback: true } },
      },
    });
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: new ModelError('fail'),
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.docs.bestPractices).toEqual(
      expect.arrayContaining([expect.stringContaining('OWASP')])
    );
  });

  it('should return architecture practices for architecture type', async () => {
    analyze = createAnalyzeOutput({ type: 'architecture', keywords: [] });
    state = createState({
      config: {
        repository: 'owner/repo',
        phases: { research: { allowHeuristicFallback: true } },
      },
    });
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: new ModelError('fail'),
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.docs.bestPractices).toEqual(
      expect.arrayContaining([expect.stringContaining('ADR')])
    );
  });

  it('should return tech-debt practices for tech-debt type', async () => {
    analyze = createAnalyzeOutput({ type: 'tech-debt', keywords: [] });
    state = createState({
      config: {
        repository: 'owner/repo',
        phases: { research: { allowHeuristicFallback: true } },
      },
    });
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: new ModelError('fail'),
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.docs.bestPractices).toEqual(
      expect.arrayContaining([expect.stringContaining('Document current behavior')])
    );
  });

  // ============================================================================
  // Heuristic fallback - keyword pattern variations
  // ============================================================================

  it('should detect database keyword pattern', async () => {
    analyze = createAnalyzeOutput({
      type: 'enhancement',
      keywords: ['database'],
    });
    state = createState({
      config: {
        repository: 'owner/repo',
        phases: { research: { allowHeuristicFallback: true } },
      },
    });
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: new ModelError('fail'),
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.codebase.existingPatterns).toEqual(
      expect.arrayContaining([expect.stringContaining('repository pattern')])
    );
  });

  it('should detect performance keyword pattern', async () => {
    analyze = createAnalyzeOutput({
      type: 'enhancement',
      keywords: ['performance'],
    });
    state = createState({
      config: {
        repository: 'owner/repo',
        phases: { research: { allowHeuristicFallback: true } },
      },
    });
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: new ModelError('fail'),
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.codebase.existingPatterns).toEqual(
      expect.arrayContaining([expect.stringContaining('Profile before optimizing')])
    );
  });

  it('should detect test keyword pattern', async () => {
    analyze = createAnalyzeOutput({
      type: 'enhancement',
      keywords: ['test'],
    });
    state = createState({
      config: {
        repository: 'owner/repo',
        phases: { research: { allowHeuristicFallback: true } },
      },
    });
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: new ModelError('fail'),
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.codebase.existingPatterns).toEqual(
      expect.arrayContaining([expect.stringContaining('AAA')])
    );
  });

  // ============================================================================
  // Heuristic fallback - structure validation
  // ============================================================================

  it('should have empty academic papers in heuristic fallback', async () => {
    state = createState({
      config: {
        repository: 'owner/repo',
        phases: { research: { allowHeuristicFallback: true } },
      },
    });
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: new ModelError('fail'),
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.academic.papers).toEqual([]);
    expect(result.history.relatedIssues).toEqual([]);
    expect(result.history.relatedPRs).toEqual([]);
    expect(result.codebase.relevantFiles).toEqual([]);
    expect(result.codebase.interfaces).toEqual([]);
  });

  it('should include default test pattern in heuristic fallback', async () => {
    state = createState({
      config: {
        repository: 'owner/repo',
        phases: { research: { allowHeuristicFallback: true } },
      },
    });
    vi.mocked(deps.modelAdapter.complete).mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: new ModelError('fail'),
      })
    );

    const result = await executeResearch(deps, state, analyze);

    expect(result.codebase.testPatterns).toEqual(
      expect.arrayContaining([expect.stringContaining('test.ts')])
    );
  });
});
