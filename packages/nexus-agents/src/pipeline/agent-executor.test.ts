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
} = vi.hoisted(() => ({
  mockExecuteExpert: vi.fn(),
  mockGetOutcomeSummaryText: vi.fn(),
  mockGetOutcomeStore: vi.fn(() => ({ append: vi.fn(), query: vi.fn().mockReturnValue([]) })),
  mockGenerateWeatherReport: vi.fn(),
  mockDetectTrend: vi.fn().mockReturnValue('stable'),
  mockSearchLearnings: vi.fn().mockReturnValue([]),
  mockRecordExperience: vi.fn(),
  mockRecordLearning: vi.fn().mockReturnValue({ ok: true, value: undefined }),
  mockRecordError: vi.fn().mockReturnValue({ ok: true, value: undefined }),
  mockEndSession: vi.fn().mockReturnValue({ ok: true, value: {} }),
}));

vi.mock('./expert-bridge.js', () => ({
  executeExpert: mockExecuteExpert,
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
  getPipelineEventBus: () => ({ emit: vi.fn() }),
}));

vi.mock('./security-gate.js', () => ({
  checkSecurityScan: () => () => Promise.resolve({ verdict: 'pass', details: 'ok' }),
}));

import { createAgentStages } from './agent-executor.js';

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
  });

  describe('research stage (#1712)', () => {
    it('calls research_discover and research_analyze', async () => {
      mockExecuteExpert
        .mockResolvedValueOnce({
          success: true,
          text: 'Discovered: paper A',
          durationMs: 100,
          expertType: 'research',
        })
        .mockResolvedValueOnce({
          success: true,
          text: 'Gaps: missing X',
          durationMs: 50,
          expertType: 'research',
        });

      const stages = createAgentStages();
      const result = await stages.research('implement feature Z');

      expect(mockExecuteExpert).toHaveBeenCalledTimes(2);
      const firstCall = mockExecuteExpert.mock.calls[0] as [string, string];
      expect(firstCall[0]).toBe('research');
      expect(firstCall[1]).toContain('research_discover');
      const secondCall = mockExecuteExpert.mock.calls[1] as [string, string];
      expect(secondCall[0]).toBe('research');
      expect(secondCall[1]).toContain('research_analyze');
      expect(result).toContain('Discovered: paper A');
      expect(result).toContain('Gaps: missing X');
    });

    it('handles partial failure gracefully', async () => {
      mockExecuteExpert
        .mockResolvedValueOnce({
          success: false,
          text: '',
          durationMs: 10,
          error: 'timeout',
        })
        .mockResolvedValueOnce({
          success: true,
          text: 'Gaps found',
          durationMs: 50,
          expertType: 'research',
        });

      const stages = createAgentStages();
      const result = await stages.research('task');

      expect(result).toContain('Gaps found');
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
        recommendedMappings: [
          { category: 'code_generation', cli: 'claude' },
          { category: 'research', cli: 'gemini' },
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
    it('includes prior learnings in research prompt', async () => {
      mockSearchLearnings.mockReturnValue([
        { pattern: 'Use compositeRouter for routing', confidence: 0.9, context: '' },
      ]);
      mockExecuteExpert
        .mockResolvedValueOnce({
          success: true,
          text: 'Discovered',
          durationMs: 100,
          expertType: 'research',
        })
        .mockResolvedValueOnce({
          success: true,
          text: 'Analyzed',
          durationMs: 50,
          expertType: 'research',
        });

      const stages = createAgentStages();
      await stages.research('improve routing');

      const firstCall = mockExecuteExpert.mock.calls[0] as [string, string];
      expect(firstCall[1]).toContain('Prior Learnings');
      expect(firstCall[1]).toContain('compositeRouter');
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
});
