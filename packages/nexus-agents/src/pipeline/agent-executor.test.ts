/**
 * Agent Executor Tests — Central Workflow Hub enrichment (#1711)
 *
 * Tests that createAgentStages integrates research_discover, weather_report,
 * and outcome store context into the pipeline stages.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockExecuteExpert,
  mockGetOutcomeSummaryText,
  mockGetOutcomeStore,
  mockGenerateWeatherReport,
  mockDetectTrend,
  mockSearchLearnings,
  mockRecordExperience,
  mockRecordLearning,
  mockRecordError,
  mockEndSession,
  mockEmit,
  mockExecuteDiscovery,
  mockAnalyzeGaps,
} = vi.hoisted(() => ({
  mockExecuteExpert: vi.fn(),
  mockExecuteDiscovery: vi.fn(),
  mockAnalyzeGaps: vi.fn(),
  mockGetOutcomeSummaryText: vi.fn(),
  mockGetOutcomeStore: vi.fn(() => ({ append: vi.fn(), query: vi.fn().mockReturnValue([]) })),
  mockGenerateWeatherReport: vi.fn(),
  mockDetectTrend: vi.fn().mockReturnValue('stable'),
  mockSearchLearnings: vi.fn().mockReturnValue([]),
  mockRecordExperience: vi.fn(),
  mockRecordLearning: vi.fn().mockReturnValue({ ok: true, value: undefined }),
  mockRecordError: vi.fn().mockReturnValue({ ok: true, value: undefined }),
  mockEndSession: vi.fn().mockReturnValue({ ok: true, value: {} }),
  mockEmit: vi.fn(),
}));

vi.mock('./expert-bridge.js', () => ({
  executeExpert: mockExecuteExpert,
}));

// #3372: the research stage now calls the research tools DIRECTLY. Fully stub the
// module (no importActual — that pulls the real research deps + the heavy
// outcome-store chain into this test). The stage calls
// `ResearchDiscoverInputSchema.parse({ topic })`, so the stub provides a
// passthrough `.parse`; the mocked executeDiscovery ignores its input anyway.
vi.mock('../mcp/tools/research-discover.js', () => ({
  executeDiscovery: mockExecuteDiscovery,
  ResearchDiscoverInputSchema: { parse: (x: unknown) => x },
}));

vi.mock('../mcp/tools/research-analyze.js', () => ({
  analyzeGaps: mockAnalyzeGaps,
}));

vi.mock('../orchestration/outcomes/outcome-store.js', () => ({
  getOutcomeStore: mockGetOutcomeStore,
  getOutcomeSummaryText: mockGetOutcomeSummaryText,
}));

vi.mock('../orchestration/outcomes/adaptive-thresholds.js', () => ({
  detectTrend: mockDetectTrend,
}));

vi.mock('../mcp/tools/weather-report.js', () => ({
  generateWeatherReport: mockGenerateWeatherReport,
}));

vi.mock('../context/session-memory.js', () => ({
  createSessionMemory: () => ({
    searchLearnings: mockSearchLearnings,
    startSession: vi.fn().mockReturnValue({ ok: true, value: [] }),
    recordLearning: mockRecordLearning,
    recordError: mockRecordError,
    endSession: mockEndSession,
  }),
}));

vi.mock('../config/learning-persistence.js', () => ({
  getLearningDir: () => '/tmp/test-learning',
}));

vi.mock('../context/routing-memory.js', () => ({
  createRoutingMemory: () => ({ recordExperience: mockRecordExperience }),
}));

vi.mock('./event-bus.js', () => ({
  getPipelineEventBus: () => ({ emit: mockEmit }),
}));

vi.mock('./security-gate.js', () => ({
  checkSecurityScan: () => () => Promise.resolve({ verdict: 'pass', details: 'ok' }),
}));

import { createAgentStages, buildVoteProposal } from './agent-executor.js';

describe('createAgentStages — central workflow hub', () => {
  beforeEach(() => {
    mockExecuteExpert.mockReset();
    mockGetOutcomeSummaryText.mockReset();
    mockGetOutcomeStore
      .mockReset()
      .mockReturnValue({ append: vi.fn(), query: vi.fn().mockReturnValue([]) });
    mockGenerateWeatherReport.mockReset();
    mockDetectTrend.mockReset().mockReturnValue('stable');
    mockSearchLearnings.mockReset().mockReturnValue([]);
    mockRecordExperience.mockReset();
    mockRecordLearning.mockReset().mockReturnValue({ ok: true, value: undefined });
    mockRecordError.mockReset().mockReturnValue({ ok: true, value: undefined });
    mockEndSession.mockReset().mockReturnValue({ ok: true, value: {} });
    mockEmit.mockReset();
    // #3372: safe defaults so any test calling research() has a structured source.
    mockExecuteDiscovery.mockReset().mockResolvedValue({
      topic: 't',
      sourcesQueried: [],
      failedSources: [],
      items: [],
      totalFound: 0,
      alreadyInRegistry: 0,
      newItems: 0,
      filteredByRelevance: 0,
    });
    mockAnalyzeGaps
      .mockReset()
      .mockResolvedValue({ focus: 'gaps', success: true, analysis: {}, recommendations: [] });
  });

  describe('research stage (#1712 / #3372 structured)', () => {
    it('calls research_discover + analyze DIRECTLY and returns deterministic structured text', async () => {
      mockExecuteDiscovery.mockResolvedValue({
        topic: 'implement feature z',
        sourcesQueried: ['arxiv'],
        failedSources: [],
        items: [
          {
            source: 'arxiv',
            title: 'Paper A',
            url: 'https://arxiv.org/abs/1',
            description: 'd',
            alreadyInRegistry: false,
            discoveredAt: '2026-01-01',
            relevanceScore: 0.9,
          },
        ],
        totalFound: 3,
        alreadyInRegistry: 1,
        newItems: 2,
        filteredByRelevance: 0,
      });
      mockAnalyzeGaps.mockResolvedValue({
        focus: 'gaps',
        success: true,
        analysis: {},
        recommendations: ['missing X'],
      });

      const stages = createAgentStages();
      const result = await stages.research('implement feature Z');

      // Direct calls — NOT the LLM expert path.
      expect(mockExecuteDiscovery).toHaveBeenCalledTimes(1);
      expect(mockAnalyzeGaps).toHaveBeenCalledTimes(1);
      expect(mockExecuteExpert).not.toHaveBeenCalled();
      // Deterministic text surfaces the structured maturity signals.
      expect(result).toContain('Paper A');
      expect(result).toMatch(/0\.9/);
      expect(result).toContain('missing X');
      expect(result).toMatch(/2 new/i);
    });

    it('fails gracefully when discovery throws (fail-safe text, never throws)', async () => {
      mockExecuteDiscovery.mockRejectedValue(new Error('arxiv down'));
      mockAnalyzeGaps.mockResolvedValue({
        focus: 'gaps',
        success: true,
        analysis: {},
        recommendations: [],
      });

      const stages = createAgentStages();
      const result = await stages.research('some task');

      expect(result).toContain('[Research failed]');
      expect(mockExecuteExpert).not.toHaveBeenCalled();
    });
  });

  describe('plan stage (#1713 + #1714)', () => {
    it('includes outcome context in plan prompt', async () => {
      mockGetOutcomeSummaryText.mockReturnValue(
        '## Outcome Context (50 tasks, 82% success)\nRecent failures:\ntimeout: codex timed out'
      );
      mockGenerateWeatherReport.mockReturnValue({
        overall: { totalTasks: 50, successRate: 0.82, avgDurationMs: 3000 },
        recommendedMappings: [{ category: 'code_generation', cli: 'claude' }],
      });
      mockExecuteExpert.mockResolvedValue({
        success: true,
        text: 'Plan: step 1',
        durationMs: 200,
        expertType: 'architecture',
      });

      const stages = createAgentStages();
      await stages.plan('implement X', 'research context', undefined);

      const call = mockExecuteExpert.mock.calls[0] as [string, string];
      expect(call[0]).toBe('architecture');
      expect(call[1]).toContain('82%');
      expect(call[1]).toContain('timeout');
    });

    it('includes weather recommended mappings in plan prompt', async () => {
      mockGetOutcomeSummaryText.mockReturnValue('');
      mockGenerateWeatherReport.mockReturnValue({
        overall: { totalTasks: 30, successRate: 0.9, avgDurationMs: 2000 },
        // Real RecommendedMapping shape — `recommendedCli`, not `cli`.
        // Pre-#2718 the consumer read `m.cli` (which doesn't exist on the
        // real type) and emitted "category → undefined"; this mock had
        // propagated the same wrong shape, hiding the bug from tests.
        recommendedMappings: [
          { category: 'code_generation', recommendedCli: 'claude' },
          { category: 'research', recommendedCli: 'gemini' },
        ],
      });
      mockExecuteExpert.mockResolvedValue({
        success: true,
        text: 'Plan ready',
        durationMs: 150,
        expertType: 'architecture',
      });

      const stages = createAgentStages();
      await stages.plan('task', 'research', undefined);

      const call = mockExecuteExpert.mock.calls[0] as [string, string];
      expect(call[1]).toContain('code_generation');
      expect(call[1]).toContain('claude');
      expect(call[1]).toContain('gemini');
      // Drift gate: the prompt must NOT contain the literal "undefined"
      // string the pre-fix consumer was producing.
      expect(call[1]).not.toContain('→ undefined');
    });

    it('handles empty outcome store gracefully', async () => {
      mockGetOutcomeSummaryText.mockReturnValue('');
      mockGenerateWeatherReport.mockReturnValue({
        overall: { totalTasks: 0, successRate: 0, avgDurationMs: 0 },
      });
      mockExecuteExpert.mockResolvedValue({
        success: true,
        text: 'Plan',
        durationMs: 100,
        expertType: 'architecture',
      });

      const stages = createAgentStages();
      const result = await stages.plan('task', 'research', undefined);

      expect(result).toBe('Plan');
    });

    it('includes feedback when revising plan', async () => {
      mockGetOutcomeSummaryText.mockReturnValue('');
      mockGenerateWeatherReport.mockReturnValue({
        overall: { totalTasks: 10, successRate: 0.7, avgDurationMs: 1000 },
        recommendedMappings: [],
      });
      mockExecuteExpert.mockResolvedValue({
        success: true,
        text: 'Revised plan',
        durationMs: 200,
        expertType: 'architecture',
      });

      const stages = createAgentStages();
      await stages.plan('task', 'research', 'need more detail on step 2');

      const call = mockExecuteExpert.mock.calls[0] as [string, string];
      expect(call[1]).toContain('Revise plan');
      expect(call[1]).toContain('need more detail on step 2');
    });
  });

  describe('memory context enrichment (#1716)', () => {
    it('appends prior learnings to the research result (#3372: no LLM prompt to seed)', async () => {
      mockSearchLearnings.mockReturnValue([
        { pattern: 'Use compositeRouter for routing', confidence: 0.9, context: '' },
      ]);

      const stages = createAgentStages();
      // #3372: research now calls the tools directly, so prior learnings are
      // appended to the returned text rather than seeded into an LLM prompt.
      const result = await stages.research('improve routing');

      expect(result).toContain('Prior Learnings');
      expect(result).toContain('compositeRouter');
    });

    it('includes trend warning in plan prompt when declining', async () => {
      mockGetOutcomeSummaryText.mockReturnValue('');
      mockGetOutcomeStore.mockReturnValue({
        append: vi.fn(),
        query: vi.fn().mockReturnValue(new Array(20).fill({ success: false })),
      });
      mockDetectTrend.mockReturnValue('declining');
      mockGenerateWeatherReport.mockReturnValue({
        overall: { totalTasks: 20, successRate: 0.4, avgDurationMs: 5000 },
        recommendedMappings: [],
      });
      mockExecuteExpert.mockResolvedValue({
        success: true,
        text: 'Plan',
        durationMs: 100,
        expertType: 'architecture',
      });

      const stages = createAgentStages();
      await stages.plan('task', 'research', undefined);

      const call = mockExecuteExpert.mock.calls[0] as [string, string];
      expect(call[1]).toContain('DECLINING');
    });
  });

  describe('routing memory write-back (#1718)', () => {
    it('records routing experience after implement stage', async () => {
      mockExecuteExpert.mockResolvedValue({
        success: true,
        text: 'implementation code',
        durationMs: 300,
        expertType: 'code',
      });

      const stages = createAgentStages();
      await stages.implement({
        id: 't1',
        title: 'Task',
        description: 'Desc',
        assignedTo: 'coder',
        status: 'pending',
      });

      // Allow async fire-and-forget to settle
      await new Promise((r) => {
        setTimeout(r, 10);
      });
      expect(mockRecordExperience).toHaveBeenCalledWith('code_generation', ['claude'], true, {
        durationMs: 300,
        tokensUsed: 0,
      });
    });
  });

  describe('memory write-back on QA outcomes (#1716)', () => {
    it('records learning on QA pass', async () => {
      mockExecuteExpert.mockResolvedValue({
        success: true,
        text: 'PASS: looks good',
        durationMs: 100,
        expertType: 'qa',
      });

      const stages = createAgentStages();
      await stages.qaReview(
        { id: 't1', title: 'My Task', description: '', assignedTo: 'coder', status: 'review' },
        'some implementation'
      );

      await new Promise((r) => {
        setTimeout(r, 10);
      });
      expect(mockRecordLearning).toHaveBeenCalled();
    });

    it('records error on QA rejection', async () => {
      mockExecuteExpert.mockResolvedValue({
        success: true,
        text: 'NEEDS_WORK: missing tests',
        durationMs: 100,
        expertType: 'qa',
      });

      const stages = createAgentStages();
      await stages.qaReview(
        { id: 't1', title: 'My Task', description: '', assignedTo: 'coder', status: 'review' },
        'some implementation'
      );

      await new Promise((r) => {
        setTimeout(r, 10);
      });
      expect(mockRecordError).toHaveBeenCalled();
    });
  });

  // #2823: regression coverage. recordOutcome used to hardcode `cli: 'claude'`,
  // poisoning the OutcomeStore + LinUCB cold-start warmStart on every run.
  // The threaded `cli` now comes from `r.cli` (executeExpert's resolved CLI);
  // when undefined (bridge failed before dispatch, or non-CLI stage like
  // local security scan) the record is skipped rather than fabricated.
  describe('recordOutcome cli threading (#2823)', () => {
    it('writes the actual cli from executeExpert, never hardcoded claude', async () => {
      const appendSpy = vi.fn();
      mockGetOutcomeStore.mockReturnValue({
        append: appendSpy,
        query: vi.fn().mockReturnValue([]),
      });
      mockExecuteExpert.mockResolvedValue({
        success: true,
        text: 'Plan v1',
        durationMs: 200,
        expertType: 'architecture',
        cli: 'gemini',
      });

      const stages = createAgentStages();
      await stages.plan('build feature A', '');

      const planRecord = appendSpy.mock.calls.find(
        (c: unknown[]) => (c[0] as { id?: string }).id?.startsWith('pipeline-plan-') === true
      );
      expect(planRecord).toBeDefined();
      expect((planRecord![0] as { cli: string }).cli).toBe('gemini');
    });

    it('skips the record when cli is undefined (bridge failed before dispatch)', async () => {
      const appendSpy = vi.fn();
      mockGetOutcomeStore.mockReturnValue({
        append: appendSpy,
        query: vi.fn().mockReturnValue([]),
      });
      // No `cli` field — bridge failed before any CLI ran (no adapter / circuit-open).
      mockExecuteExpert.mockResolvedValue({
        success: false,
        text: '',
        durationMs: 5,
        expertType: 'architecture',
        error: 'No adapters available',
      });

      const stages = createAgentStages();
      await stages.plan('build feature A', '');

      const planRecord = appendSpy.mock.calls.find(
        (c: unknown[]) => (c[0] as { id?: string }).id?.startsWith('pipeline-plan-') === true
      );
      // The whole point of #2823: no append at all, rather than a fabricated
      // `cli: 'claude'` record polluting routing learner.
      expect(planRecord).toBeUndefined();
    });

    it('threads each CLI distinctly across stages (#2823)', async () => {
      const appendSpy = vi.fn();
      mockGetOutcomeStore.mockReturnValue({
        append: appendSpy,
        query: vi.fn().mockReturnValue([]),
      });
      // Decompose returns codex; implement returns claude.
      mockExecuteExpert
        .mockResolvedValueOnce({
          success: true,
          text: '[{"id":"t1","title":"x","description":"y","assignedTo":"dev"}]',
          durationMs: 80,
          expertType: 'pm',
          cli: 'codex',
        })
        .mockResolvedValueOnce({
          success: true,
          text: 'implementation done',
          durationMs: 1200,
          expertType: 'code',
          cli: 'claude',
        });

      const stages = createAgentStages();
      const tasks = await stages.decompose('plan');
      await stages.implement(tasks[0]!);

      const decomposeRecord = appendSpy.mock.calls.find(
        (c: unknown[]) => (c[0] as { id?: string }).id?.startsWith('pipeline-decompose-') === true
      );
      const implRecord = appendSpy.mock.calls.find(
        (c: unknown[]) => (c[0] as { id?: string }).id?.startsWith('pipeline-t1-') === true
      );
      expect((decomposeRecord![0] as { cli: string }).cli).toBe('codex');
      expect((implRecord![0] as { cli: string }).cli).toBe('claude');
    });
  });

  describe('model.called emission (#3387)', () => {
    /** Find the model.called event among all emitted pipeline events. */
    function findModelCalled(): Record<string, unknown> | undefined {
      return mockEmit.mock.calls
        .map((c: unknown[]) => c[0] as Record<string, unknown>)
        .find((e) => e['type'] === 'model.called');
    }

    it('emits model.called with real cli/model/token attribution after a successful call', async () => {
      mockExecuteExpert.mockResolvedValue({
        success: true,
        text: 'Plan v1',
        durationMs: 200,
        expertType: 'architecture',
        cli: 'gemini',
        model: 'gemini-3-pro',
        tokensIn: 120,
        tokensOut: 80,
      });

      const stages = createAgentStages();
      await stages.plan('build feature A', '');

      const event = findModelCalled();
      expect(event).toMatchObject({
        type: 'model.called',
        executionId: 'plan',
        cli: 'gemini',
        model: 'gemini-3-pro',
        tokensIn: 120,
        tokensOut: 80,
        durationMs: 200,
      });
    });

    it('skips emission when token usage is absent (no zeros)', async () => {
      // CLI-subprocess path whose extractUsage() returned null: cli + model
      // known, but no tokensIn/tokensOut → skip rather than emit a zero event.
      mockExecuteExpert.mockResolvedValue({
        success: true,
        text: 'Plan v1',
        durationMs: 200,
        expertType: 'architecture',
        cli: 'gemini',
        model: 'gemini-3-pro',
      });

      const stages = createAgentStages();
      await stages.plan('build feature A', '');

      expect(findModelCalled()).toBeUndefined();
    });

    it('skips emission when the bridge failed before dispatch', async () => {
      mockExecuteExpert.mockResolvedValue({
        success: false,
        text: '',
        durationMs: 5,
        expertType: 'architecture',
        error: 'No adapters available',
      });

      const stages = createAgentStages();
      await stages.plan('build feature A', '');

      expect(findModelCalled()).toBeUndefined();
    });
  });
});

describe('buildVoteProposal (#3258)', () => {
  it('returns plan-only when research is empty (prior behavior)', () => {
    expect(buildVoteProposal('the plan', '')).toBe('the plan');
    expect(buildVoteProposal('the plan', '   ')).toBe('the plan');
  });

  it('appends research as a delimited, not-instructions block when present', () => {
    const out = buildVoteProposal('PLAN BODY', 'found 3 high-relevance papers');
    expect(out).toContain('PLAN BODY');
    expect(out).toContain('found 3 high-relevance papers');
    expect(out).toMatch(/Research context \(informational/);
    expect(out).toMatch(/NOT instructions/);
  });

  it('hard-caps the proposal at 4000 chars even with huge plan + research', () => {
    const out = buildVoteProposal('p'.repeat(10_000), 'r'.repeat(10_000));
    expect(out.length).toBeLessThanOrEqual(4000);
    // research is still represented (not crowded out) — its budget is reserved
    expect(out).toContain('Research context');
    expect(out).toContain('r'.repeat(100));
  });
});
