/**
 * Unit tests for recording modules:
 *  - consensus-vote-recording.ts
 *  - create-expert-recording.ts
 *  - execute-expert-recording.ts
 *
 * Verifies that success/error/outcome recording calls through to
 * tool-memory and outcome store correctly. All external deps mocked.
 *
 * @module mcp/tools/recording-modules.test
 * (Issue #1340)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getOutcomeStore,
  setOutcomeStore,
  OutcomeStore,
} from '../../orchestration/outcomes/index.js';

// ============================================================================
// Mocks
// ============================================================================

const mockRecordTask = vi.fn();
const mockRecordLearning = vi.fn();
const mockRecordError = vi.fn();
const mockRunPromotionPipeline = vi.fn().mockResolvedValue({
  learningsPromotedToBelief: 0,
  beliefsPromotedToAgentic: 0,
});

vi.mock('./tool-memory.js', () => ({
  getToolMemory: vi.fn(() => ({
    recordTask: mockRecordTask,
    recordLearning: mockRecordLearning,
    recordError: mockRecordError,
    runPromotionPipeline: mockRunPromotionPipeline,
  })),
}));

vi.mock('./research-auto-catalog.js', () => ({
  getAutoCatalog: vi.fn(() => ({ scanAndRecord: vi.fn() })),
}));

vi.mock('../../config/task-specialization.js', () => ({
  detectTaskCategory: vi.fn(() => ({
    category: 'code_generation',
    primaryCli: 'claude',
    confidence: 0.9,
  })),
}));

// ============================================================================
// consensus-vote-recording
// ============================================================================

describe('consensus-vote-recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunPromotionPipeline.mockResolvedValue({
      learningsPromotedToBelief: 0,
      beliefsPromotedToAgentic: 0,
    });
    setOutcomeStore(new OutcomeStore());
  });

  it('recordVoteSuccess records task and learning to memory', async () => {
    const { recordVoteSuccess } = await import('./consensus-vote-recording.js');
    recordVoteSuccess('Should we use X?', 'supermajority', 'approved', 5000);
    expect(mockRecordTask).toHaveBeenCalledOnce();
    expect(mockRecordTask).toHaveBeenCalledWith(
      expect.objectContaining({
        approach: expect.stringContaining('supermajority'),
        durationMs: 5000,
      })
    );
    expect(mockRecordLearning).toHaveBeenCalledOnce();
    expect(mockRecordLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        pattern: expect.stringContaining('approved'),
        source: 'consensus-vote',
      })
    );
  });

  it('recordVoteError records error to memory', async () => {
    const { recordVoteError } = await import('./consensus-vote-recording.js');
    recordVoteError('proposal text', 'timeout after 60s');
    expect(mockRecordError).toHaveBeenCalledOnce();
    expect(mockRecordError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('timeout after 60s'),
      })
    );
  });

  it('recordVoteSuccess truncates proposal in approach', async () => {
    const { recordVoteSuccess } = await import('./consensus-vote-recording.js');
    const longProposal = 'A'.repeat(100);
    recordVoteSuccess(longProposal, 'majority', 'rejected', 1000);
    const approachArg = mockRecordTask.mock.calls[0]?.[0]?.approach as string;
    expect(approachArg.length).toBeLessThan(100);
  });

  it('recordVoteSuccess skips memory + outcome writes when every vote is simulated (#2319)', async () => {
    const { recordVoteSuccess } = await import('./consensus-vote-recording.js');
    const store = getOutcomeStore();
    const initialSize = store.size;
    recordVoteSuccess('Demo proposal', 'majority', 'approved', 100, [
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: 'sim', confidence: 0.5 },
        source: 'simulation' as const,
        processingTimeMs: 0,
      },
      {
        role: 'security',
        vote: { decision: 'approve', reasoning: 'sim', confidence: 0.5 },
        source: 'simulation' as const,
        processingTimeMs: 0,
      },
    ]);
    expect(mockRecordTask).not.toHaveBeenCalled();
    expect(mockRecordLearning).not.toHaveBeenCalled();
    expect(store.size).toBe(initialSize);
  });

  it('recordVoteSuccess still records when at least one vote is from an LLM', async () => {
    const { recordVoteSuccess } = await import('./consensus-vote-recording.js');
    recordVoteSuccess('Mixed proposal', 'majority', 'approved', 100, [
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: 'real', confidence: 0.9 },
        source: 'llm' as const,
        processingTimeMs: 1000,
      },
      {
        role: 'security',
        vote: { decision: 'approve', reasoning: 'sim', confidence: 0.5 },
        source: 'simulation' as const,
        processingTimeMs: 0,
      },
    ]);
    expect(mockRecordTask).toHaveBeenCalledOnce();
    expect(mockRecordLearning).toHaveBeenCalledOnce();
  });

  it('recordVoteOutcomes records per-vote outcomes to OutcomeStore', async () => {
    const { recordVoteOutcomes } = await import('./consensus-vote-recording.js');
    const store = getOutcomeStore();
    const initialSize = store.size;

    recordVoteOutcomes([
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: 'Good design', confidence: 0.9 },
        source: 'llm' as const,
        processingTimeMs: 3000,
      },
      {
        role: 'catfish',
        vote: { decision: 'reject', reasoning: 'Simulated dissent', confidence: 0.5 },
        source: 'simulation' as const,
        processingTimeMs: 0,
      },
    ]);

    // Only LLM vote should be recorded, simulation skipped
    expect(store.size).toBe(initialSize + 1);
  });

  it('recordVoteOutcomes skips all simulation votes', async () => {
    const { recordVoteOutcomes } = await import('./consensus-vote-recording.js');
    const store = getOutcomeStore();
    const initialSize = store.size;

    recordVoteOutcomes([
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: 'Simulated', confidence: 0.5 },
        source: 'simulation' as const,
        processingTimeMs: 0,
      },
    ]);

    expect(store.size).toBe(initialSize);
  });

  it('recordVoteOutcomes captures errorMessage on failed votes (#1516)', async () => {
    const { recordVoteOutcomes } = await import('./consensus-vote-recording.js');
    const store = getOutcomeStore();

    recordVoteOutcomes([
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: '', confidence: 0 },
        source: 'error' as const,
        processingTimeMs: 500,
        error: 'Rate limit exceeded',
      },
    ]);

    const entries = store.query();
    const last = entries[entries.length - 1];
    expect(last?.success).toBe(false);
    expect(last?.errorMessage).toBe('Rate limit exceeded');
    expect(last?.failureCategory).toBeDefined();
  });
});

// ============================================================================
// create-expert-recording
// ============================================================================

describe('create-expert-recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunPromotionPipeline.mockResolvedValue({
      learningsPromotedToBelief: 0,
      beliefsPromotedToAgentic: 0,
    });
    setOutcomeStore(new OutcomeStore());
  });

  it('recordExpertCreated records task and learning', async () => {
    const { recordExpertCreated } = await import('./create-expert-recording.js');
    recordExpertCreated('security_expert', 'exp-123');
    expect(mockRecordTask).toHaveBeenCalledOnce();
    expect(mockRecordTask).toHaveBeenCalledWith(
      expect.objectContaining({
        approach: expect.stringContaining('security_expert'),
      })
    );
    expect(mockRecordLearning).toHaveBeenCalledOnce();
    expect(mockRecordLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        pattern: expect.stringContaining('security_expert'),
        context: expect.stringContaining('exp-123'),
      })
    );
  });

  it('recordExpertError records error to memory', async () => {
    const { recordExpertError } = await import('./create-expert-recording.js');
    recordExpertError('code_expert', 'No adapter available');
    expect(mockRecordError).toHaveBeenCalledOnce();
    expect(mockRecordError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('code_expert'),
      })
    );
  });

  it('recordExpertOutcome records to OutcomeStore', async () => {
    const { recordExpertOutcome } = await import('./create-expert-recording.js');
    const store = getOutcomeStore();
    const initialSize = store.size;

    recordExpertOutcome('testing_expert', true, 500);
    expect(store.size).toBe(initialSize + 1);

    const entries = store.query();
    const last = entries[entries.length - 1];
    expect(last?.success).toBe(true);
    expect(last?.durationMs).toBe(500);
    expect(last?.category).toBe('testing');
  });

  it('recordExpertOutcome maps role to correct category (#1402)', async () => {
    const { recordExpertOutcome } = await import('./create-expert-recording.js');
    const store = getOutcomeStore();

    recordExpertOutcome('security_expert', true, 100);
    const entries = store.query();
    const last = entries[entries.length - 1];
    expect(last?.category).toBe('security_review');
  });

  it('recordExpertOutcome records failures', async () => {
    const { recordExpertOutcome } = await import('./create-expert-recording.js');
    const store = getOutcomeStore();
    const initialSize = store.size;

    recordExpertOutcome('arch_expert', false, 0);
    expect(store.size).toBe(initialSize + 1);

    const entries = store.query();
    const last = entries[entries.length - 1];
    expect(last?.success).toBe(false);
  });

  it('recordExpertOutcome captures errorMessage on failure (#1516)', async () => {
    const { recordExpertOutcome } = await import('./create-expert-recording.js');
    const store = getOutcomeStore();

    recordExpertOutcome('security_expert', false, 100, 'Model adapter unavailable');

    const entries = store.query();
    const last = entries[entries.length - 1];
    expect(last?.success).toBe(false);
    expect(last?.errorMessage).toBe('Model adapter unavailable');
    expect(last?.failureCategory).toBeDefined();
  });
});

// ============================================================================
// execute-expert-recording
// ============================================================================

describe('execute-expert-recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunPromotionPipeline.mockResolvedValue({
      learningsPromotedToBelief: 0,
      beliefsPromotedToAgentic: 0,
    });
    setOutcomeStore(new OutcomeStore());
  });

  it('recordExpertOutcome records success to OutcomeStore', async () => {
    const { recordExpertOutcome } = await import('./execute-expert-recording.js');
    const store = getOutcomeStore();
    const initialSize = store.size;

    recordExpertOutcome({ task: 'Review code', success: true, durationMs: 2000 });
    expect(store.size).toBe(initialSize + 1);

    const entries = store.query();
    const last = entries[entries.length - 1];
    expect(last?.success).toBe(true);
    expect(last?.source).toBe('delegate');
  });

  it('recordExpertOutcome records failure with category', async () => {
    const { recordExpertOutcome } = await import('./execute-expert-recording.js');
    const store = getOutcomeStore();

    recordExpertOutcome({
      task: 'Audit security',
      success: false,
      durationMs: 5000,
      failureCategory: 'timeout',
    });

    const entries = store.query();
    const last = entries[entries.length - 1];
    expect(last?.success).toBe(false);
    expect(last?.failureCategory).toBe('timeout');
  });

  it('recordExpertSuccess records task and learning', async () => {
    const { recordExpertSuccess } = await import('./execute-expert-recording.js');
    recordExpertSuccess('exp-456', 'code_expert', 3000);
    expect(mockRecordTask).toHaveBeenCalledOnce();
    expect(mockRecordLearning).toHaveBeenCalledOnce();
    expect(mockRecordLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        pattern: expect.stringContaining('code_expert'),
      })
    );
  });

  it('recordExpertError records error to memory', async () => {
    const { recordExpertError } = await import('./execute-expert-recording.js');
    recordExpertError('exp-789', 'security_expert', 'Model timeout after 300s');
    expect(mockRecordError).toHaveBeenCalledOnce();
    expect(mockRecordError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('security_expert'),
      })
    );
  });

  it('handleExpertFailure returns error result with timeout hint', async () => {
    const { handleExpertFailure } = await import('./execute-expert-recording.js');
    const result = handleExpertFailure(
      'test task',
      { expertId: 'exp-1', role: 'code_expert', modelId: 'claude-opus' },
      'Expert timed out after 300s',
      300000
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('timed out');
    expect(result.error).toContain('Hint:');
    expect(result.error).toContain('claude-opus');
  });

  it('handleExpertFailure omits timeout hint for non-timeout errors', async () => {
    const { handleExpertFailure } = await import('./execute-expert-recording.js');
    const result = handleExpertFailure(
      'test task',
      { expertId: 'exp-1', role: 'code_expert' },
      'Model returned empty response',
      5000
    );
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain('Hint:');
    expect(result.error).toContain('default'); // no modelId → 'default'
  });

  it('recordExpertOutcome uses role-based category mapping', async () => {
    const { recordExpertOutcome } = await import('./execute-expert-recording.js');
    const store = getOutcomeStore();

    recordExpertOutcome({
      task: 'generic task description',
      role: 'security_expert',
      success: true,
      durationMs: 1000,
    });

    const entries = store.query();
    const last = entries[entries.length - 1];
    expect(last?.category).toBe('security_review');
  });

  it('recordExpertOutcome falls back to keyword detection without role', async () => {
    const { recordExpertOutcome } = await import('./execute-expert-recording.js');
    const store = getOutcomeStore();

    recordExpertOutcome({
      task: 'generic task without clear keywords',
      success: true,
      durationMs: 1000,
    });

    const entries = store.query();
    const last = entries[entries.length - 1];
    // Without role, falls back to detectTaskCategory or 'exploration'
    expect(last?.category).toBeDefined();
  });

  it('handleExpertSuccess records both memory and outcome', async () => {
    const { handleExpertSuccess } = await import('./execute-expert-recording.js');
    const store = getOutcomeStore();
    const initialSize = store.size;

    handleExpertSuccess(
      'test task',
      { expertId: 'exp-2', role: 'testing_expert', modelId: 'claude-sonnet' },
      1500
    );

    // Should record to memory
    expect(mockRecordTask).toHaveBeenCalledOnce();

    // Should record to outcome store
    expect(store.size).toBe(initialSize + 1);
    const entries = store.query();
    const last = entries[entries.length - 1];
    expect(last?.success).toBe(true);
    expect(last?.category).toBe('testing');
  });

  it('autoCatalogScan does not throw on error', async () => {
    const { autoCatalogScan } = await import('./execute-expert-recording.js');
    // getAutoCatalog is mocked, this should not throw
    expect(() => {
      autoCatalogScan('some output text', 'exp-1');
    }).not.toThrow();
  });
});
