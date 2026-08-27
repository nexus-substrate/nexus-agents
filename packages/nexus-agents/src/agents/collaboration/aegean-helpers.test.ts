/**
 * Tests for Aegean Protocol Helpers
 * @module agents/collaboration/aegean-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { IAgent } from '../../core/index.js';
import type {
  AegeanRound,
  AegeanResult,
  Proposal,
  QuorumStatus,
  AgentVote,
} from './aegean-types.js';
import type { CollaborationConfig } from './collaboration-types.js';
import {
  buildAegeanConfig,
  buildAegeanResult,
  tokensFromMetadata,
  createRoundData,
  determineIterationAction,
  determinePreRoundAction,
  createIterationContext,
  processIterationAction,
  buildLoopResult,
  validateAegeanSetup,
  buildSessionTaskResult,
} from './aegean-helpers.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../core/index.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getTimeProvider: () => ({ now: () => 2000 }),
  };
});

// ============================================================================
// Test Helpers
// ============================================================================

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    proposalId: 'prop-1',
    round: 1,
    leaderId: 'agent-1',
    value: 'Test proposal',
    timestamp: 1000,
    ...overrides,
  };
}

function makeVote(overrides: Partial<AgentVote> = {}): AgentVote {
  return {
    agentId: 'agent-1',
    proposalId: 'prop-1',
    status: 'accept',
    confidence: 0.8,
    reasoning: 'Looks good',
    timestamp: 1000,
    ...overrides,
  };
}

function makeQuorumStatus(overrides: Partial<QuorumStatus> = {}): QuorumStatus {
  return {
    required: 3,
    accepts: 3,
    rejects: 1,
    pending: 0,
    hasQuorum: true,
    consensusReached: true,
    ...overrides,
  };
}

function makeRound(overrides: Partial<AegeanRound> = {}): AegeanRound {
  return {
    roundNumber: 1,
    phase: 'voting',
    leaderId: 'agent-1',
    proposal: makeProposal(),
    votes: [makeVote()],
    quorumStatus: makeQuorumStatus(),
    startTime: 1000,
    endTime: 1500,
    ...overrides,
  };
}

function makeAgent(): IAgent {
  return {
    id: 'agent-1',
    role: 'code_expert',
    executeTask: vi.fn(),
  } as unknown as IAgent;
}

// ============================================================================
// buildAegeanConfig
// ============================================================================

describe('buildAegeanConfig', () => {
  it('returns default config with empty options', () => {
    const config = buildAegeanConfig({});
    expect(config.maxRounds).toBeGreaterThan(0);
    expect(config.byzantineTolerance).toBeGreaterThanOrEqual(0);
  });

  it('merges custom values with defaults', () => {
    const config = buildAegeanConfig({ aegeanConfig: { maxRounds: 10 } });
    expect(config.maxRounds).toBe(10);
  });

  it('throws for invalid config values', () => {
    expect(() => buildAegeanConfig({ aegeanConfig: { maxRounds: -5 } })).toThrow(
      'Invalid Aegean config'
    );
  });
});

// ============================================================================
// buildAegeanResult
// ============================================================================

describe('buildAegeanResult', () => {
  it('builds result with consensus reached', () => {
    const result = buildAegeanResult({
      rounds: [makeRound()],
      consensusValue: 'agreed answer',
      terminationReason: 'consensus',
      startTime: 1000,
      tokensUsed: 500,
      unmeasuredTokenContributions: 0,
    });

    expect(result.consensusReached).toBe(true);
    expect(result.consensusValue).toBe('agreed answer');
    expect(result.totalRounds).toBe(1);
    expect(result.tokensUsed).toBe(500);
    expect(result.terminationReason).toBe('consensus');
    expect(result.totalDurationMs).toBe(1000); // 2000 - 1000
  });

  it('builds result with no consensus', () => {
    const result = buildAegeanResult({
      rounds: [makeRound(), makeRound({ roundNumber: 2 })],
      consensusValue: null,
      terminationReason: 'max_rounds',
      startTime: 500,
      tokensUsed: 1000,
      unmeasuredTokenContributions: 0,
    });

    expect(result.consensusReached).toBe(false);
    expect(result.totalRounds).toBe(2);
    expect(result.terminationReason).toBe('max_rounds');
  });
});

// ============================================================================
// createRoundData
// ============================================================================

describe('createRoundData', () => {
  it('creates round data with consensus reached', () => {
    const round = createRoundData({
      roundNumber: 3,
      leaderId: 'agent-2',
      proposal: makeProposal({ value: 'Solution X' }),
      votes: [makeVote(), makeVote({ agentId: 'agent-2' })],
      quorumStatus: makeQuorumStatus({ consensusReached: true }),
      startTime: 1500,
    });

    expect(round.roundNumber).toBe(3);
    expect(round.leaderId).toBe('agent-2');
    expect(round.phase).toBe('done');
    expect(round.votes).toHaveLength(2);
    expect(round.endTime).toBe(2000);
  });

  it('creates round data without consensus', () => {
    const round = createRoundData({
      roundNumber: 1,
      leaderId: 'agent-1',
      proposal: makeProposal(),
      votes: [],
      quorumStatus: makeQuorumStatus({ consensusReached: false }),
      startTime: 1000,
    });

    expect(round.phase).toBe('voting');
  });
});

// ============================================================================
// determineIterationAction
// ============================================================================

describe('determineIterationAction', () => {
  it('returns cancelled when cancelled flag is set', () => {
    const action = determineIterationAction({
      cancelled: true,
      consensusReached: true,
      consensusValue: 'x',
      earlyTerminationEnabled: true,
      shouldEarlyTerminate: true,
    });
    expect(action.type).toBe('cancelled');
  });

  it('returns consensus when consensus reached', () => {
    const action = determineIterationAction({
      cancelled: false,
      consensusReached: true,
      consensusValue: 'agreed',
      earlyTerminationEnabled: false,
      shouldEarlyTerminate: false,
    });
    expect(action.type).toBe('consensus');
    if (action.type === 'consensus') {
      expect(action.value).toBe('agreed');
    }
  });

  it('returns early_termination when both flags set', () => {
    const action = determineIterationAction({
      cancelled: false,
      consensusReached: false,
      consensusValue: null,
      earlyTerminationEnabled: true,
      shouldEarlyTerminate: true,
    });
    expect(action.type).toBe('early_termination');
  });

  it('does not early terminate when only one flag set', () => {
    const action = determineIterationAction({
      cancelled: false,
      consensusReached: false,
      consensusValue: null,
      earlyTerminationEnabled: true,
      shouldEarlyTerminate: false,
    });
    expect(action.type).toBe('continue');
  });

  it('returns continue when no special conditions', () => {
    const action = determineIterationAction({
      cancelled: false,
      consensusReached: false,
      consensusValue: null,
      earlyTerminationEnabled: false,
      shouldEarlyTerminate: false,
    });
    expect(action.type).toBe('continue');
  });

  it('cancelled takes priority over consensus', () => {
    const action = determineIterationAction({
      cancelled: true,
      consensusReached: true,
      consensusValue: 'value',
      earlyTerminationEnabled: true,
      shouldEarlyTerminate: true,
    });
    expect(action.type).toBe('cancelled');
  });

  it('consensus takes priority over early termination', () => {
    const action = determineIterationAction({
      cancelled: false,
      consensusReached: true,
      consensusValue: 'value',
      earlyTerminationEnabled: true,
      shouldEarlyTerminate: true,
    });
    expect(action.type).toBe('consensus');
  });
});

// ============================================================================
// determinePreRoundAction
// ============================================================================

describe('determinePreRoundAction', () => {
  it('returns result when cancelled', () => {
    const result = determinePreRoundAction(true, [], 1000, 200, 0);
    expect(result).not.toBeNull();
    expect(result?.terminationReason).toBe('error');
    expect(result?.consensusReached).toBe(false);
  });

  it('returns null when not cancelled', () => {
    const result = determinePreRoundAction(false, [makeRound()], 1000, 200, 0);
    expect(result).toBeNull();
  });
});

// ============================================================================
// createIterationContext
// ============================================================================

describe('createIterationContext', () => {
  it('creates context with provided values', () => {
    const rounds = [makeRound()];
    const ctx = createIterationContext(rounds, 1000, 500, 0);
    expect(ctx.rounds).toBe(rounds);
    expect(ctx.startTime).toBe(1000);
    expect(ctx.tokensUsed).toBe(500);
  });
});

// ============================================================================
// processIterationAction
// ============================================================================

describe('processIterationAction', () => {
  const emitEvent = vi.fn();
  const ctx = {
    rounds: [makeRound()],
    startTime: 1000,
    tokensUsed: 300,
    unmeasuredTokenContributions: 0,
  };

  it('returns result for consensus action', () => {
    const result = processIterationAction({
      action: { type: 'consensus', value: 'answer' },
      round: 1,
      sessionId: 's1',
      maxRounds: 5,
      ctx,
      emitIterationEvent: emitEvent,
    });
    expect(result).not.toBeNull();
    expect(result?.consensusReached).toBe(true);
    expect(result?.consensusValue).toBe('answer');
    expect(emitEvent).toHaveBeenCalledWith(1, 'converged', 's1');
  });

  it('returns result for early_termination action', () => {
    const onEarlyTerm = vi.fn();
    const result = processIterationAction({
      action: { type: 'early_termination' },
      round: 3,
      sessionId: 's1',
      maxRounds: 5,
      ctx,
      emitIterationEvent: emitEvent,
      onEarlyTermination: onEarlyTerm,
    });
    expect(result).not.toBeNull();
    expect(result?.terminationReason).toBe('max_rounds');
    expect(onEarlyTerm).toHaveBeenCalledWith(3);
  });

  it('returns null for continue action', () => {
    const result = processIterationAction({
      action: { type: 'continue' },
      round: 2,
      sessionId: 's1',
      maxRounds: 5,
      ctx,
      emitIterationEvent: emitEvent,
    });
    expect(result).toBeNull();
    expect(emitEvent).toHaveBeenCalledWith(2, 'in_progress', 's1');
  });

  it('returns result for cancelled action', () => {
    const result = processIterationAction({
      action: { type: 'cancelled' },
      round: 1,
      sessionId: 's1',
      maxRounds: 5,
      ctx,
      emitIterationEvent: emitEvent,
    });
    expect(result).not.toBeNull();
    expect(result?.terminationReason).toBe('error');
  });
});

// ============================================================================
// buildLoopResult
// ============================================================================

describe('buildLoopResult', () => {
  it('delegates to buildAegeanResult', () => {
    const rounds = [makeRound()];
    const result = buildLoopResult({
      rounds,
      consensusValue: 'final',
      terminationReason: 'consensus',
      startTime: 1000,
      tokensUsed: 400,
      unmeasuredTokenContributions: 0,
    });
    expect(result.consensusReached).toBe(true);
    expect(result.consensusValue).toBe('final');
    expect(result.totalRounds).toBe(1);
    expect(result.tokensUsed).toBe(400);
  });
});

// ============================================================================
// validateAegeanSetup
// ============================================================================

describe('validateAegeanSetup', () => {
  it('validates with sufficient agents', () => {
    const agents = new Map<string, IAgent>([
      ['a1', makeAgent()],
      ['a2', makeAgent()],
      ['a3', makeAgent()],
      ['a4', makeAgent()],
    ]);
    const config = {
      sessionId: 'sess-1',
      pattern: 'aegean' as const,
      experts: ['a1', 'a2', 'a3', 'a4'],
      task: { id: 'task-1', input: 'test', type: 'code' },
    } as unknown as CollaborationConfig;
    const result = validateAegeanSetup({ config, agents, byzantineTolerance: 1 });
    expect(result.ok).toBe(true);
  });

  it('rejects when too few agents for tolerance', () => {
    const agents = new Map<string, IAgent>([
      ['a1', makeAgent()],
      ['a2', makeAgent()],
    ]);
    const config = {
      sessionId: 'sess-1',
      pattern: 'aegean' as const,
      experts: ['a1', 'a2'],
      task: { id: 'task-1', input: 'test', type: 'code' },
    } as unknown as CollaborationConfig;
    // f=1 requires 3*1+1=4 agents
    const result = validateAegeanSetup({ config, agents, byzantineTolerance: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('at least 4 agents');
    }
  });

  it('rejects when agent not found in map', () => {
    const agents = new Map<string, IAgent>([
      ['a1', makeAgent()],
      ['a2', makeAgent()],
      ['a3', makeAgent()],
      ['a4', makeAgent()],
    ]);
    const config = {
      sessionId: 'sess-1',
      pattern: 'aegean' as const,
      experts: ['a1', 'a2', 'a3', 'missing'],
      task: { id: 'task-1', input: 'test', type: 'code' },
    } as unknown as CollaborationConfig;
    const result = validateAegeanSetup({ config, agents, byzantineTolerance: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('missing');
    }
  });

  it('works with byzantineTolerance 0 (needs 1 agent)', () => {
    const agents = new Map<string, IAgent>([['a1', makeAgent()]]);
    const config = {
      sessionId: 'sess-1',
      pattern: 'aegean' as const,
      experts: ['a1'],
      task: { id: 'task-1', input: 'test', type: 'code' },
    } as unknown as CollaborationConfig;
    const result = validateAegeanSetup({ config, agents, byzantineTolerance: 0 });
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// buildSessionTaskResult
// ============================================================================

describe('buildSessionTaskResult', () => {
  it('builds task result from Aegean result', () => {
    const aegeanResult: AegeanResult = {
      consensusValue: 'final answer',
      consensusReached: true,
      totalRounds: 3,
      totalDurationMs: 5000,
      tokensUsed: 1200,
      unmeasuredTokenContributions: 0,
      rounds: [],
      terminationReason: 'consensus',
    };

    const taskResult = buildSessionTaskResult('task-1', aegeanResult, 1000);
    const output = taskResult.output as {
      consensusValue: string;
      aegean: { rounds: number; consensusReached: boolean };
    };
    expect(taskResult.taskId).toBe('task-1');
    expect(output.consensusValue).toBe('final answer');
    expect(output.aegean.rounds).toBe(3);
    expect(output.aegean.consensusReached).toBe(true);
    expect(taskResult.metadata.model).toBe('aegean-protocol');
    expect(taskResult.metadata.tokensUsed).toBe(1200);
    expect(taskResult.metadata.durationMs).toBe(1000); // 2000 - 1000
  });
});

// ============================================================================
// tokensFromMetadata (#4743)
// ============================================================================

describe('tokensFromMetadata (#4743)', () => {
  it('passes a measured figure through and counts nothing', () => {
    expect(tokensFromMetadata({ tokensUsed: 1200, tokensMeasured: true })).toEqual({
      tokens: 1200,
      unmeasured: 0,
    });
  });

  it('treats an absent flag as measured — only an explicit false is a disclosure', () => {
    // `tokensMeasured` is optional (#4734); absence is the pre-existing shape
    // and must not be read as "unmeasured", or every legacy adapter would
    // suddenly count as silent.
    expect(tokensFromMetadata({ tokensUsed: 900 })).toEqual({ tokens: 900, unmeasured: 0 });
  });

  it('contributes zero and counts one when the adapter reported no usage', () => {
    // The placeholder must not enter the sum: adding it under-counts, and
    // under-counting is the dangerous direction for anything cap-shaped.
    expect(tokensFromMetadata({ tokensUsed: 0, tokensMeasured: false })).toEqual({
      tokens: 0,
      unmeasured: 1,
    });
  });

  it('drops a non-zero placeholder rather than summing it', () => {
    // `tokensUsed` is meaningless when `tokensMeasured` is false, whatever it
    // holds — a stale or default value must not reach the total.
    expect(tokensFromMetadata({ tokensUsed: 4321, tokensMeasured: false })).toEqual({
      tokens: 0,
      unmeasured: 1,
    });
  });
});

// ============================================================================
// buildAegeanResult carries the unmeasured count (#4743)
// ============================================================================

describe('buildAegeanResult unmeasured disclosure (#4743)', () => {
  const base = {
    rounds: [],
    consensusValue: null,
    terminationReason: 'max_rounds' as const,
    startTime: 0,
  };

  it('reports the count so the total reads as a lower bound', () => {
    const result = buildAegeanResult({ ...base, tokensUsed: 500, unmeasuredTokenContributions: 3 });

    expect(result.unmeasuredTokenContributions).toBe(3);
  });

  it('does not silently zero a real count', () => {
    // The pair for the default above: `?? 0` applied to a supplied value would
    // satisfy the default test while discarding every measurement.
    expect(
      buildAegeanResult({ ...base, tokensUsed: 0, unmeasuredTokenContributions: 7 })
        .unmeasuredTokenContributions
    ).toBe(7);
  });
});

// ============================================================================
// The count becomes a tokensMeasured disclosure downstream (#4743)
// ============================================================================

describe('buildSessionTaskResult token disclosure (#4743)', () => {
  function aegeanResult(tokensUsed: number, unmeasured: number): AegeanResult {
    return {
      consensusValue: 'x',
      consensusReached: true,
      totalRounds: 1,
      totalDurationMs: 10,
      tokensUsed,
      unmeasuredTokenContributions: unmeasured,
      rounds: [],
      terminationReason: 'consensus',
    };
  }

  it('marks the total unmeasured when any contributor reported nothing', () => {
    // This is where the count has to land: `ResultMetadata.tokensMeasured` is
    // the disclosure the rest of the tree already reads (#4734). Without it the
    // count would stop at a type nothing downstream consults.
    const task = buildSessionTaskResult('t1', aegeanResult(500, 2), 0);

    expect(task.metadata.tokensMeasured).toBe(false);
  });

  it('marks it measured when every contributor reported', () => {
    // The pair: always-false would make every aegean total look untrustworthy.
    const task = buildSessionTaskResult('t1', aegeanResult(500, 0), 0);

    expect(task.metadata.tokensMeasured).toBe(true);
  });

  it('still passes the total through either way', () => {
    expect(buildSessionTaskResult('t1', aegeanResult(500, 2), 0).metadata.tokensUsed).toBe(500);
  });
});
