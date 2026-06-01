/**
 * nexus-agents/mcp - Consensus Vote Tool Tests
 * (Source: Issue #500 - Add missing MCP tool test files)
 */

import { describe, it, expect, vi } from 'vitest';
import type { ILogger } from '../../core/index.js';
import { RateLimiter } from '../middleware/index.js';
import {
  ConsensusVoteInputSchema,
  CONSENSUS_VOTE_OUTPUT_SCHEMA,
  createPolicyFailedResult,
  type ConsensusVoteDeps,
  type AgentVoteSummary,
  type ConsensusVoteResponse,
  type VoteDecisionStatus,
} from './consensus-vote.js';
import { z } from 'zod';
import {
  toAgentVoteSummary,
  buildResponse,
  getDefaultErrorPolicy,
} from './consensus-vote-types.js';
import type { AgentVoteResult } from '../../cli/vote-types.js';
import type { ExtendedVotingResult } from './consensus-vote-types.js';

/**
 * Creates a permissive rate limiter for tests.
 */
function createTestRateLimiter(): RateLimiter {
  return new RateLimiter({
    capacity: 1000,
    refillRate: 1000,
    refillIntervalMs: 1000,
  });
}

/**
 * Creates test dependencies.
 */
function createTestDeps(logger?: ILogger): ConsensusVoteDeps {
  const deps: ConsensusVoteDeps = {
    rateLimiter: createTestRateLimiter(),
  };
  if (logger !== undefined) {
    deps.logger = logger;
  }
  return deps;
}

/**
 * Creates a mock logger for tests.
 */
function createMockLogger(): ILogger {
  const mockLogger: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => mockLogger),
    setLevel: vi.fn(),
  };
  return mockLogger;
}

describe('ConsensusVoteInputSchema', () => {
  describe('proposal validation', () => {
    it('should accept valid proposal', () => {
      const input = { proposal: 'Should we implement feature X?' };
      const result = ConsensusVoteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.proposal).toBe('Should we implement feature X?');
      }
    });

    it('should reject empty proposal', () => {
      const input = { proposal: '' };
      const result = ConsensusVoteInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should reject proposal exceeding max length', () => {
      const input = { proposal: 'a'.repeat(4001) };
      const result = ConsensusVoteInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should accept proposal at max length', () => {
      const input = { proposal: 'a'.repeat(4000) };
      const result = ConsensusVoteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should reject missing proposal', () => {
      const input = {};
      const result = ConsensusVoteInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    // #3045 / epic #2631 Stage 4 — async-mode schema additions.
    it('accepts mode: "async" (#3045)', () => {
      const result = ConsensusVoteInputSchema.safeParse({
        proposal: 'Test proposal',
        mode: 'async',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.mode).toBe('async');
    });

    it('accepts mode: "sync" (#3045)', () => {
      const result = ConsensusVoteInputSchema.safeParse({
        proposal: 'Test proposal',
        mode: 'sync',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.mode).toBe('sync');
    });

    it('leaves mode undefined when omitted — backward-compat invariant (#3045)', () => {
      const result = ConsensusVoteInputSchema.safeParse({ proposal: 'Test proposal' });
      expect(result.success).toBe(true);
      if (result.success) {
        // Handler treats undefined as sync. Schema omits .default('sync')
        // so the inferred type stays optional — existing fixtures
        // continue to compile without churn.
        expect(result.data.mode).toBeUndefined();
      }
    });

    it('rejects unknown mode value (#3045)', () => {
      const result = ConsensusVoteInputSchema.safeParse({
        proposal: 'Test proposal',
        mode: 'queue',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('threshold validation', () => {
    it('should accept majority threshold', () => {
      const input = { proposal: 'Test proposal', threshold: 'majority' };
      const result = ConsensusVoteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.threshold).toBe('majority');
      }
    });

    it('should accept supermajority threshold', () => {
      const input = { proposal: 'Test proposal', threshold: 'supermajority' };
      const result = ConsensusVoteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.threshold).toBe('supermajority');
      }
    });

    it('should accept unanimous threshold', () => {
      const input = { proposal: 'Test proposal', threshold: 'unanimous' };
      const result = ConsensusVoteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.threshold).toBe('unanimous');
      }
    });

    it('should reject invalid threshold', () => {
      const input = { proposal: 'Test proposal', threshold: 'invalid' };
      const result = ConsensusVoteInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should not require threshold (optional field)', () => {
      const input = { proposal: 'Test proposal' };
      const result = ConsensusVoteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        // threshold is optional, defaults to undefined (simple_majority strategy used)
        expect(result.data.threshold).toBeUndefined();
      }
    });
  });

  describe('quickMode validation', () => {
    it('should accept quickMode true', () => {
      const input = { proposal: 'Test proposal', quickMode: true };
      const result = ConsensusVoteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quickMode).toBe(true);
      }
    });

    it('should accept quickMode false', () => {
      const input = { proposal: 'Test proposal', quickMode: false };
      const result = ConsensusVoteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quickMode).toBe(false);
      }
    });

    it('should default to false when not provided', () => {
      const input = { proposal: 'Test proposal' };
      const result = ConsensusVoteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quickMode).toBe(false);
      }
    });
  });

  describe('simulateVotes validation', () => {
    it('should accept simulateVotes true', () => {
      const input = { proposal: 'Test proposal', simulateVotes: true };
      const result = ConsensusVoteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.simulateVotes).toBe(true);
      }
    });

    it('should accept simulateVotes false', () => {
      const input = { proposal: 'Test proposal', simulateVotes: false };
      const result = ConsensusVoteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.simulateVotes).toBe(false);
      }
    });

    it('should default to false when not provided', () => {
      const input = { proposal: 'Test proposal' };
      const result = ConsensusVoteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.simulateVotes).toBe(false);
      }
    });
  });

  describe('complete input validation', () => {
    it('should accept all options together', () => {
      const input = {
        proposal: 'Should we refactor the authentication module?',
        threshold: 'supermajority' as const,
        quickMode: true,
        simulateVotes: false,
      };
      const result = ConsensusVoteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.proposal).toBe('Should we refactor the authentication module?');
        expect(result.data.threshold).toBe('supermajority');
        expect(result.data.quickMode).toBe(true);
        expect(result.data.simulateVotes).toBe(false);
      }
    });
  });
});

describe('Rate limiting', () => {
  it('should allow requests within rate limit', () => {
    const deps = createTestDeps();
    const acquired = deps.rateLimiter.tryAcquire();

    expect(acquired).toBe(true);
  });

  it('should track rate limit state', () => {
    const rateLimiter = new RateLimiter({
      capacity: 1,
      refillRate: 1,
      refillIntervalMs: 60000,
    });

    rateLimiter.tryAcquire();
    const state = rateLimiter.getState();

    expect(state.tokens).toBeLessThanOrEqual(1);
  });
});

describe('Logger integration', () => {
  it('should log vote start', () => {
    const mockLogger = createMockLogger();
    const deps = createTestDeps(mockLogger);

    deps.logger?.info('Starting consensus vote', {
      threshold: 'simple_majority',
      roleCount: 5,
      simulateVotes: false,
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Starting consensus vote',
      expect.objectContaining({
        threshold: 'simple_majority',
        roleCount: 5,
        simulateVotes: false,
      })
    );
  });

  it('should log vote completion', () => {
    const mockLogger = createMockLogger();
    const deps = createTestDeps(mockLogger);

    deps.logger?.info('Consensus vote completed', {
      outcome: 'approved',
      approvalPercentage: 80,
      durationMs: 5000,
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Consensus vote completed',
      expect.objectContaining({
        outcome: 'approved',
        approvalPercentage: 80,
        durationMs: 5000,
      })
    );
  });

  it('should log vote errors', () => {
    const mockLogger = createMockLogger();
    const deps = createTestDeps(mockLogger);
    const error = new Error('Vote collection failed');

    deps.logger?.error('Consensus vote failed', error);

    expect(mockLogger.error).toHaveBeenCalledWith('Consensus vote failed', error);
  });
});

describe('AgentVoteSummary structure', () => {
  it('should have correct structure for approve vote', () => {
    const summary: AgentVoteSummary = {
      role: 'architect',
      decision: 'approve',
      confidence: 0.85,
      reasoning: 'This aligns with our architecture goals',
      simulated: false,
      error: false,
    };

    expect(summary.decision).toBe('approve');
    expect(summary.confidence).toBeGreaterThanOrEqual(0);
    expect(summary.confidence).toBeLessThanOrEqual(1);
    expect(summary.simulated).toBe(false);
    expect(summary.error).toBe(false);
  });

  it('should have correct structure for reject vote', () => {
    const summary: AgentVoteSummary = {
      role: 'security',
      decision: 'reject',
      confidence: 0.9,
      reasoning: 'Security concerns with this approach',
      simulated: false,
      error: false,
    };

    expect(summary.decision).toBe('reject');
    expect(summary.confidence).toBe(0.9);
  });

  it('should have correct structure for abstain vote', () => {
    const summary: AgentVoteSummary = {
      role: 'devex',
      decision: 'abstain',
      confidence: 0.5,
      reasoning: 'Not enough information to decide',
      simulated: true,
      error: false,
    };

    expect(summary.decision).toBe('abstain');
    expect(summary.simulated).toBe(true);
  });

  it('should have error flag for error votes', () => {
    const summary: AgentVoteSummary = {
      role: 'architect',
      decision: 'abstain',
      confidence: 0,
      reasoning: 'Zod validation error',
      simulated: false,
      error: true,
    };

    expect(summary.error).toBe(true);
    expect(summary.simulated).toBe(false);
  });
});

describe('ConsensusVoteResponse structure', () => {
  it('should have correct structure for approved decision', () => {
    const response: ConsensusVoteResponse = {
      proposal: 'Test proposal',
      threshold: 'majority',
      strategy: 'simple_majority',
      decision: 'approved',
      approvalPercentage: 80,
      voteCounts: {
        approve: 4,
        reject: 1,
        abstain: 0,
        error: 0,
      },
      votes: [
        {
          role: 'architect',
          decision: 'approve',
          confidence: 0.85,
          reasoning: 'Good idea',
          simulated: false,
          error: false,
        },
      ],
      durationMs: 5000,
      simulateVotes: false,
    };

    expect(response.decision).toBe('approved');
    expect(response.approvalPercentage).toBe(80);
    expect(response.voteCounts.approve).toBe(4);
    expect(response.voteCounts.reject).toBe(1);
    expect(response.voteCounts.abstain).toBe(0);
    expect(response.voteCounts.error).toBe(0);
    expect(response.votes).toHaveLength(1);
  });

  it('should have correct structure for rejected decision', () => {
    const response: ConsensusVoteResponse = {
      proposal: 'Test proposal',
      threshold: 'unanimous',
      strategy: 'unanimous',
      decision: 'rejected',
      approvalPercentage: 60,
      voteCounts: {
        approve: 3,
        reject: 2,
        abstain: 0,
        error: 0,
      },
      votes: [],
      durationMs: 4500,
      simulateVotes: false,
    };

    expect(response.decision).toBe('rejected');
    expect(response.threshold).toBe('unanimous');
  });

  it('should truncate long proposals in response', () => {
    const longProposal = 'a'.repeat(300);
    const truncated = longProposal.length > 200 ? longProposal.slice(0, 200) + '...' : longProposal;

    expect(truncated).toHaveLength(203); // 200 + '...'
    expect(truncated.endsWith('...')).toBe(true);
  });
});

describe('Threshold mapping', () => {
  it('should recognize majority threshold', () => {
    const thresholds = ['majority', 'supermajority', 'unanimous'] as const;
    expect(thresholds).toContain('majority');
  });

  it('should recognize supermajority threshold', () => {
    const thresholds = ['majority', 'supermajority', 'unanimous'] as const;
    expect(thresholds).toContain('supermajority');
  });

  it('should recognize unanimous threshold', () => {
    const thresholds = ['majority', 'supermajority', 'unanimous'] as const;
    expect(thresholds).toContain('unanimous');
  });
});

describe('Voter roles', () => {
  // Default panel expanded to 7 roles 2026-04-25 (#2185) — added scope_steward
  // to catch build-vs-buy blind spots. QuickMode swaps pm for scope_steward.
  it('should use 7 roles in normal mode', () => {
    const normalRoles = [
      'architect',
      'security',
      'devex',
      'ai_ml',
      'pm',
      'catfish',
      'scope_steward',
    ];
    expect(normalRoles).toHaveLength(7);
  });

  it('should use 3 roles in quick mode', () => {
    const quickRoles = ['architect', 'security', 'scope_steward'];
    expect(quickRoles).toHaveLength(3);
  });

  it('should always include architect role', () => {
    const normalRoles = ['architect', 'security', 'devex', 'ai_ml', 'pm', 'scope_steward'];
    const quickRoles = ['architect', 'security', 'scope_steward'];

    expect(normalRoles).toContain('architect');
    expect(quickRoles).toContain('architect');
  });

  it('should always include security role', () => {
    const normalRoles = ['architect', 'security', 'devex', 'ai_ml', 'pm', 'scope_steward'];
    const quickRoles = ['architect', 'security', 'scope_steward'];

    expect(normalRoles).toContain('security');
    expect(quickRoles).toContain('security');
  });

  it('should always include scope_steward role (#2185)', () => {
    const normalRoles = ['architect', 'security', 'devex', 'ai_ml', 'pm', 'scope_steward'];
    const quickRoles = ['architect', 'security', 'scope_steward'];

    expect(normalRoles).toContain('scope_steward');
    expect(quickRoles).toContain('scope_steward');
  });

  it('keeps pm in normal mode but not quickMode (#2185)', () => {
    const normalRoles = ['architect', 'security', 'devex', 'ai_ml', 'pm', 'scope_steward'];
    const quickRoles = ['architect', 'security', 'scope_steward'];

    expect(normalRoles).toContain('pm');
    expect(quickRoles).not.toContain('pm');
  });
});

describe('Decision status mapping', () => {
  it('should recognize approved status', () => {
    const statuses: VoteDecisionStatus[] = [
      'approved',
      'rejected',
      'pending',
      'timeout',
      'no_quorum',
    ];
    expect(statuses).toContain('approved');
  });

  it('should recognize rejected status', () => {
    const statuses: VoteDecisionStatus[] = [
      'approved',
      'rejected',
      'pending',
      'timeout',
      'no_quorum',
    ];
    expect(statuses).toContain('rejected');
  });

  it('should recognize pending status', () => {
    const statuses: VoteDecisionStatus[] = [
      'approved',
      'rejected',
      'pending',
      'timeout',
      'no_quorum',
    ];
    expect(statuses).toContain('pending');
  });

  it('should recognize timeout status', () => {
    const statuses: VoteDecisionStatus[] = [
      'approved',
      'rejected',
      'pending',
      'timeout',
      'no_quorum',
    ];
    expect(statuses).toContain('timeout');
  });

  it('should recognize no_quorum status (Issue #1329)', () => {
    const statuses: VoteDecisionStatus[] = [
      'approved',
      'rejected',
      'pending',
      'timeout',
      'no_quorum',
    ];
    expect(statuses).toContain('no_quorum');
  });
});

describe('Memory bounds', () => {
  it('should enforce MAX_PROPOSAL_LENGTH of 4000', () => {
    const maxLength = 4000;
    const input = { proposal: 'a'.repeat(maxLength) };
    const result = ConsensusVoteInputSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  it('should reject proposals exceeding MAX_PROPOSAL_LENGTH', () => {
    const maxLength = 4000;
    const input = { proposal: 'a'.repeat(maxLength + 1) };
    const result = ConsensusVoteInputSchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});

describe('Timeout configuration', () => {
  it('should have default timeout of 300000ms (5 minutes)', () => {
    const defaultTimeout = 300000;
    expect(defaultTimeout).toBe(5 * 60 * 1000);
  });

  it('should be configurable via security config', () => {
    const deps = createTestDeps();
    deps.security = {
      timeout: {
        defaultTimeoutMs: 600000, // 10 minutes
      },
    } as ConsensusVoteDeps['security'];

    expect(deps.security?.timeout?.defaultTimeoutMs).toBe(600000);
  });
});

// ============================================================================
// Error-Abstention Distinction (Issue #815)
// ============================================================================

describe('toAgentVoteSummary (Issue #815)', () => {
  it('should set error=false for LLM votes', () => {
    const result: AgentVoteResult = {
      role: 'architect',
      vote: { decision: 'approve', reasoning: 'Solid design', confidence: 0.9 },
      processingTimeMs: 100,
      source: 'llm',
    };
    const summary = toAgentVoteSummary(result);

    expect(summary.error).toBe(false);
    expect(summary.simulated).toBe(false);
  });

  it('should set error=false for simulation votes', () => {
    const result: AgentVoteResult = {
      role: 'security',
      vote: { decision: 'reject', reasoning: 'Concerns', confidence: 0.7 },
      processingTimeMs: 50,
      source: 'simulation',
    };
    const summary = toAgentVoteSummary(result);

    expect(summary.error).toBe(false);
    expect(summary.simulated).toBe(true);
  });

  it('should set error=true for error votes', () => {
    const result: AgentVoteResult = {
      role: 'pm',
      vote: { decision: 'abstain', reasoning: 'Zod validation error', confidence: 0 },
      processingTimeMs: 10,
      source: 'error',
      error: 'Zod validation failed',
    };
    const summary = toAgentVoteSummary(result);

    expect(summary.error).toBe(true);
    expect(summary.simulated).toBe(false);
    expect(summary.decision).toBe('abstain');
  });

  // Issue #1213: Rejection categories in vote summary
  it('should forward rejectionCategories from vote to summary', () => {
    const result: AgentVoteResult = {
      role: 'catfish',
      vote: {
        decision: 'reject',
        reasoning: 'This is speculative and duplicates existing work',
        confidence: 0.85,
        rejectionCategories: ['YAGNI', 'DRY_VIOLATION'],
      },
      processingTimeMs: 150,
      source: 'llm',
    };
    const summary = toAgentVoteSummary(result);

    expect(summary.rejectionCategories).toEqual(['YAGNI', 'DRY_VIOLATION']);
    expect(summary.decision).toBe('reject');
  });

  it('should omit rejectionCategories when not present', () => {
    const result: AgentVoteResult = {
      role: 'architect',
      vote: { decision: 'approve', reasoning: 'Solid design', confidence: 0.9 },
      processingTimeMs: 100,
      source: 'llm',
    };
    const summary = toAgentVoteSummary(result);

    expect(summary.rejectionCategories).toBeUndefined();
  });
});

describe('createPolicyFailedResult honest counts (#3124)', () => {
  function vr(
    role: AgentVoteResult['role'],
    decision: 'approve' | 'reject' | 'abstain',
    source: AgentVoteResult['source'] = 'llm'
  ): AgentVoteResult {
    return {
      role,
      vote: { decision, reasoning: 'r', confidence: 0.8 },
      processingTimeMs: 10,
      source,
    };
  }

  it('reports the TRUE breakdown of responding voters, not all-zeros, when one errors', () => {
    const votes: AgentVoteResult[] = [
      vr('architect', 'approve'),
      vr('security', 'approve'),
      vr('devex', 'approve'),
      vr('ai_ml', 'approve'),
      vr('pm', 'approve'),
      vr('catfish', 'approve'),
      vr('scope_steward', 'abstain', 'error'), // timed out
    ];
    const result = createPolicyFailedResult('p', 'supermajority', 'fail_closed: 1 errored', votes);
    // The core #3124 fix: approve is 6, NOT 0.
    expect(result.voteCounts.approve).toBe(6);
    expect(result.voteCounts.reject).toBe(0);
    expect(result.voteCounts.total).toBe(6); // error excluded from the denominator
    expect(result.approvalPercentage).toBe(100);
    expect(result.votes.size).toBe(6); // error vote not in the map
    // The decision still fails closed (policy short-circuit), honestly reported.
    expect(result.outcome).toBe('rejected');
  });

  it('computes approvalPercentage over responders only (mixed decisions + >50% errors)', () => {
    const votes: AgentVoteResult[] = [
      vr('architect', 'approve'),
      vr('security', 'approve'),
      vr('devex', 'approve'),
      vr('ai_ml', 'reject'),
      vr('pm', 'abstain', 'error'),
      vr('catfish', 'abstain', 'error'),
      vr('scope_steward', 'abstain', 'error'),
    ];
    const result = createPolicyFailedResult('p', 'supermajority', 'errors > 50%', votes);
    expect(result.voteCounts).toMatchObject({ approve: 3, reject: 1, abstain: 0, total: 4 });
    expect(result.approvalPercentage).toBe(75);
  });

  it('does not divide by zero when every voter errored', () => {
    const votes: AgentVoteResult[] = [
      vr('architect', 'abstain', 'error'),
      vr('security', 'abstain', 'error'),
    ];
    const result = createPolicyFailedResult('p', 'supermajority', 'all errored', votes);
    expect(result.approvalPercentage).toBe(0);
    expect(result.voteCounts.total).toBe(0);
  });
});

describe('buildResponse surfaces policyReason (#3124)', () => {
  it('passes policyReason through to the response when set', () => {
    const base = makeShortCircuitResult();
    const input = { proposal: 'Test', simulateVotes: false, quickMode: false };
    const response = buildResponse(input, base);
    expect(response.policyReason).toBe('fail_closed: 1 voter(s) errored');
    // honest: 1 approve surfaced, decision still rejected
    expect(response.voteCounts.approve).toBe(1);
    expect(response.decision).toBe('rejected');
  });

  function makeShortCircuitResult(): ExtendedVotingResult {
    const votes: AgentVoteResult[] = [
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: 'ok', confidence: 0.9 },
        processingTimeMs: 50,
        source: 'llm',
      },
      {
        role: 'security',
        vote: { decision: 'abstain', reasoning: 'timeout', confidence: 0 },
        processingTimeMs: 60,
        source: 'error',
      },
    ];
    return {
      proposal: 'Test',
      threshold: 'higher_order',
      result: createPolicyFailedResult(
        'Test',
        'higher_order',
        'fail_closed: 1 voter(s) errored',
        votes
      ),
      votes,
      totalTimeMs: 100,
      simulateVotes: false,
      strategy: 'higher_order',
      policyReason: 'fail_closed: 1 voter(s) errored',
    };
  }
});

describe('buildResponse error counting (Issue #815)', () => {
  function makeVotingResult(votes: readonly AgentVoteResult[]): ExtendedVotingResult {
    return {
      proposal: 'Test proposal',
      threshold: 'simple_majority',
      result: {
        proposalId: 'test',
        proposal: { title: 'Test', description: 'Test', algorithm: 'simple_majority' },
        outcome: 'approved',
        votes: new Map(),
        voteCounts: { approve: 2, reject: 0, abstain: 0, total: 2 },
        approvalPercentage: 100,
        quorumReached: true,
        startedAt: new Date().toISOString(),
        closedAt: new Date().toISOString(),
        durationMs: 100,
      },
      votes,
      totalTimeMs: 200,
      simulateVotes: false,
      strategy: 'simple_majority',
    };
  }

  it('should count zero errors when all votes are LLM', () => {
    const votes: AgentVoteResult[] = [
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: 'ok', confidence: 0.9 },
        processingTimeMs: 50,
        source: 'llm',
      },
      {
        role: 'security',
        vote: { decision: 'approve', reasoning: 'ok', confidence: 0.8 },
        processingTimeMs: 60,
        source: 'llm',
      },
    ];
    const input = { proposal: 'Test', simulateVotes: false, quickMode: false };
    const response = buildResponse(input, makeVotingResult(votes));

    expect(response.voteCounts.error).toBe(0);
  });

  it('should count error votes separately from abstentions', () => {
    const votes: AgentVoteResult[] = [
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: 'ok', confidence: 0.9 },
        processingTimeMs: 50,
        source: 'llm',
      },
      {
        role: 'security',
        vote: { decision: 'abstain', reasoning: 'err', confidence: 0 },
        processingTimeMs: 10,
        source: 'error',
      },
      {
        role: 'pm',
        vote: { decision: 'abstain', reasoning: 'err', confidence: 0 },
        processingTimeMs: 10,
        source: 'error',
      },
    ];
    const input = { proposal: 'Test', simulateVotes: false, quickMode: false };
    const response = buildResponse(input, makeVotingResult(votes));

    expect(response.voteCounts.error).toBe(2);
    expect(response.votes[1]!.error).toBe(true);
    expect(response.votes[2]!.error).toBe(true);
    expect(response.votes[0]!.error).toBe(false);
  });

  it('should report all errors when every vote errored', () => {
    const votes: AgentVoteResult[] = [
      {
        role: 'architect',
        vote: { decision: 'abstain', reasoning: 'err', confidence: 0 },
        processingTimeMs: 10,
        source: 'error',
      },
      {
        role: 'security',
        vote: { decision: 'abstain', reasoning: 'err', confidence: 0 },
        processingTimeMs: 10,
        source: 'error',
      },
      {
        role: 'pm',
        vote: { decision: 'abstain', reasoning: 'err', confidence: 0 },
        processingTimeMs: 10,
        source: 'error',
      },
    ];
    const result = makeVotingResult(votes);
    result.result.outcome = 'rejected';
    result.result.quorumReached = false;
    result.result.voteCounts = { approve: 0, reject: 0, abstain: 0, total: 0 };
    result.result.approvalPercentage = 0;
    const input = { proposal: 'Test', simulateVotes: false, quickMode: false };
    const response = buildResponse(input, result);

    expect(response.voteCounts.error).toBe(3);
    expect(response.decision).toBe('no_quorum');
  });

  it('should return no_quorum when quorum not reached and all votes are errors (Issue #1329)', () => {
    const votes: AgentVoteResult[] = [
      {
        role: 'architect',
        vote: { decision: 'abstain', reasoning: 'Model adapter failed', confidence: 0 },
        processingTimeMs: 5,
        source: 'error',
      },
      {
        role: 'security',
        vote: { decision: 'abstain', reasoning: 'Timeout', confidence: 0 },
        processingTimeMs: 5,
        source: 'error',
      },
    ];
    const result = makeVotingResult(votes);
    result.result.outcome = 'rejected';
    result.result.quorumReached = false;
    result.result.voteCounts = { approve: 0, reject: 0, abstain: 0, total: 0 };
    result.result.approvalPercentage = 0;
    const input = { proposal: 'Test', simulateVotes: false, quickMode: false };
    const response = buildResponse(input, result);

    expect(response.decision).toBe('no_quorum');
    expect(response.voteCounts.error).toBe(2);
  });

  it('should return rejected (not no_quorum) when quorum reached but vote fails', () => {
    const votes: AgentVoteResult[] = [
      {
        role: 'architect',
        vote: { decision: 'reject', reasoning: 'Bad idea', confidence: 0.9 },
        processingTimeMs: 100,
        source: 'llm',
      },
      {
        role: 'security',
        vote: { decision: 'reject', reasoning: 'Insecure', confidence: 0.8 },
        processingTimeMs: 100,
        source: 'llm',
      },
      {
        role: 'pm',
        vote: { decision: 'abstain', reasoning: 'err', confidence: 0 },
        processingTimeMs: 5,
        source: 'error',
      },
    ];
    const result = makeVotingResult(votes);
    result.result.outcome = 'rejected';
    result.result.quorumReached = true;
    result.result.voteCounts = { approve: 0, reject: 2, abstain: 0, total: 2 };
    result.result.approvalPercentage = 0;
    const input = { proposal: 'Test', simulateVotes: false, quickMode: false };
    const response = buildResponse(input, result);

    expect(response.decision).toBe('rejected');
    expect(response.voteCounts.error).toBe(1);
  });
});

// ============================================================================
// Output Schema Validation (Issue #1246)
// ============================================================================

describe('CONSENSUS_VOTE_OUTPUT_SCHEMA validation (Issue #1246)', () => {
  const outputValidator = z.object(CONSENSUS_VOTE_OUTPUT_SCHEMA);

  function makeVotingResult(
    votes: readonly AgentVoteResult[],
    overrides?: { simulateVotes?: boolean }
  ): ExtendedVotingResult {
    return {
      proposal: 'Test proposal',
      threshold: 'simple_majority',
      result: {
        proposalId: 'test',
        proposal: { title: 'Test', description: 'Test', algorithm: 'simple_majority' },
        outcome: 'approved',
        votes: new Map(),
        voteCounts: { approve: 2, reject: 0, abstain: 0, total: 2 },
        approvalPercentage: 100,
        quorumReached: true,
        startedAt: new Date().toISOString(),
        closedAt: new Date().toISOString(),
        durationMs: 100,
      },
      votes,
      totalTimeMs: 200,
      simulateVotes: overrides?.simulateVotes ?? false,
      strategy: 'simple_majority',
    };
  }

  it('should validate buildResponse output with simulated votes', () => {
    const votes: AgentVoteResult[] = [
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: 'ok', confidence: 0.9 },
        processingTimeMs: 50,
        source: 'simulation',
      },
      {
        role: 'security',
        vote: {
          decision: 'reject',
          reasoning: 'concerns',
          confidence: 0.7,
          rejectionCategories: ['YAGNI'],
        },
        processingTimeMs: 60,
        source: 'simulation',
      },
    ];
    const result = makeVotingResult(votes, { simulateVotes: true });
    const input = { proposal: 'Test', simulateVotes: true, quickMode: false };
    const response = buildResponse(input, result);

    const parsed = outputValidator.safeParse(response);
    expect(parsed.success).toBe(true);
  });

  it('should validate buildResponse output with error votes', () => {
    const votes: AgentVoteResult[] = [
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: 'ok', confidence: 0.9 },
        processingTimeMs: 50,
        source: 'llm',
      },
      {
        role: 'security',
        vote: { decision: 'abstain', reasoning: 'err', confidence: 0 },
        processingTimeMs: 10,
        source: 'error',
      },
    ];
    const input = { proposal: 'Test', simulateVotes: false, quickMode: false };
    const response = buildResponse(input, makeVotingResult(votes));

    const parsed = outputValidator.safeParse(response);
    expect(parsed.success).toBe(true);
  });

  it('should validate buildResponse output with threshold', () => {
    const votes: AgentVoteResult[] = [
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: 'ok', confidence: 0.9 },
        processingTimeMs: 50,
        source: 'llm',
      },
    ];
    const input = {
      proposal: 'Test',
      simulateVotes: false,
      quickMode: false,
      threshold: 'supermajority' as const,
    };
    const response = buildResponse(input, makeVotingResult(votes));

    const parsed = outputValidator.safeParse(response);
    expect(parsed.success).toBe(true);
    expect(response.threshold).toBe('supermajority');
  });
});

describe('getDefaultErrorPolicy (#3167)', () => {
  it('strict strategies default to fail_closed — incl. opinion_wise (the higher_order alias)', () => {
    expect(getDefaultErrorPolicy('unanimous')).toBe('fail_closed');
    expect(getDefaultErrorPolicy('higher_order')).toBe('fail_closed');
    expect(getDefaultErrorPolicy('opinion_wise')).toBe('fail_closed');
    // opinion_wise must match its alias rather than silently diverging
    expect(getDefaultErrorPolicy('opinion_wise')).toBe(getDefaultErrorPolicy('higher_order'));
  });

  it('non-strict strategies default to reduce_denominator', () => {
    expect(getDefaultErrorPolicy('simple_majority')).toBe('reduce_denominator');
    expect(getDefaultErrorPolicy('supermajority')).toBe('reduce_denominator');
  });
});
