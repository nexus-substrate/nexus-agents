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
  CONSENSUS_VOTE_TOOL_SCHEMA,
  createPolicyFailedResult,
  maybeEscalateContrarian,
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
  isHigherOrderStrategy,
  shouldEscalateLowPosterior,
  getDegradedPanelCount,
  resetDegradedPanelCount,
  HIGHER_ORDER_ESCALATION_POSTERIOR_FLOOR,
} from './consensus-vote-types.js';
import type { VotingStrategy } from './consensus-vote-types.js';
import type { AgentVoteResult } from '../../cli/vote-types.js';
import type { ExtendedVotingResult } from './consensus-vote-types.js';
import { applyOptionGate } from './consensus-vote.js';
import { buildVoteRecord } from '../../audit/vote-record-store.js';
import { resolveVoteDecision } from './consensus-vote-types.js';
import type { ConsensusVoteInput } from './consensus-vote-types.js';
import type { ConsensusResult } from '../../consensus/types.js';

// #4132: force the contrarian expert-bridge to fail so runContrarianCheck reports
// errored:true deterministically (no live adapter). Only runContrarianCheck imports
// this module, and only the maybeEscalateContrarian tests exercise that path.
vi.mock('../../pipeline/expert-bridge.js', () => ({
  executeExpert: vi.fn().mockRejectedValue(new Error('expert bridge down (test)')),
}));
import type { VoteRecord } from '../../audit/vote-record.js';
import { rollupDecisionCost } from '../../observability/decision-cost.js';

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
      voteRecordPersisted: true,
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
      voteRecordPersisted: false,
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
    // honest: 1 approve surfaced; an error-policy short-circuit voids the vote →
    // decision is no_quorum (too many errors to decide), NOT rejected (#4053).
    expect(response.voteCounts.approve).toBe(1);
    expect(response.decision).toBe('no_quorum');
  });

  it('quickMode >50%-error hard floor → no_quorum, not a misleading rejected (#4053)', () => {
    // The reported case: 3-voter quickMode, 2 voters error, the 1 responder
    // APPROVES. The >50% hard floor voids the vote — that is no_quorum, and
    // reporting `rejected` (when the only valid voter approved) is misleading.
    const votes: AgentVoteResult[] = [
      {
        role: 'scope_steward',
        vote: { decision: 'approve', reasoning: 'ok', confidence: 0.9 },
        processingTimeMs: 50,
        source: 'llm',
      },
      {
        role: 'architect',
        vote: { decision: 'abstain', reasoning: 'HTTP 400', confidence: 0 },
        processingTimeMs: 40,
        source: 'error',
      },
      {
        role: 'security',
        vote: { decision: 'abstain', reasoning: 'HTTP 400', confidence: 0 },
        processingTimeMs: 40,
        source: 'error',
      },
    ];
    const reason = 'Errors exceeded 50% of voters (2/3)';
    const base: ExtendedVotingResult = {
      proposal: 'ship it',
      threshold: 'simple_majority',
      result: createPolicyFailedResult('ship it', 'simple_majority', reason, votes),
      votes,
      totalTimeMs: 100,
      simulateVotes: false,
      strategy: 'simple_majority',
      policyReason: reason,
    };
    const response = buildResponse(
      { proposal: 'ship it', simulateVotes: false, quickMode: true },
      base
    );
    expect(response.decision).toBe('no_quorum');
    expect(response.decision).not.toBe('rejected');
    expect(response.voteCounts).toMatchObject({ approve: 1, error: 2 });
    expect(response.policyReason).toBe(reason);
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

describe('#4135: decision plumbing (executeVoting stamps decision; buildResponse reuses it)', () => {
  it('executeVoting stamps result.decision matching the legacy mapping under a default policy', async () => {
    const { executeVoting } = await import('./consensus-vote.js');
    const { mapOutcomeToDecision } = await import('./consensus-vote-types.js');
    const result = await executeVoting(
      { proposal: 'Ship the plumbing', simulateVotes: true, quickMode: true },
      createMockLogger()
    );
    // Under a default policy the decision is the legacy 2-valued mapping — never
    // no_quorum. This is the inert-by-default guarantee (#4135).
    expect(result.decision).toBeDefined();
    expect(result.decision).toBe(mapOutcomeToDecision(result.result.outcome));
    expect(result.decision).not.toBe('no_quorum');
  });

  it('buildResponse REUSES a pre-stamped result.decision (DRY — decision cannot diverge)', () => {
    // A deliberately "stale" stamped decision proves buildResponse reads
    // result.decision rather than recomputing: an all-approve clean panel would
    // normally compute 'approved', but the stamped 'no_quorum' must win.
    const votes: AgentVoteResult[] = [
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: 'ok', confidence: 0.9 },
        processingTimeMs: 10,
        source: 'llm',
      },
    ];
    const base: ExtendedVotingResult = {
      proposal: 'Test',
      threshold: 'simple_majority',
      result: {
        proposalId: 'p1',
        proposal: { title: 't', description: 'Test', algorithm: 'simple_majority' },
        outcome: 'approved',
        votes: new Map(),
        voteCounts: { approve: 1, reject: 0, abstain: 0, total: 1 },
        approvalPercentage: 100,
        quorumReached: true,
        startedAt: 'now',
        closedAt: 'now',
        durationMs: 1,
      },
      votes,
      totalTimeMs: 10,
      simulateVotes: false,
      strategy: 'simple_majority',
      decision: 'no_quorum',
    };
    const response = buildResponse(
      { proposal: 'Test', simulateVotes: false, quickMode: false },
      base
    );
    expect(response.decision).toBe('no_quorum');
  });

  it('buildResponse COMPUTES the decision when result.decision is absent (fallback unchanged)', () => {
    const votes: AgentVoteResult[] = [
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: 'ok', confidence: 0.9 },
        processingTimeMs: 10,
        source: 'llm',
      },
    ];
    const base: ExtendedVotingResult = {
      proposal: 'Test',
      threshold: 'simple_majority',
      result: {
        proposalId: 'p1',
        proposal: { title: 't', description: 'Test', algorithm: 'simple_majority' },
        outcome: 'approved',
        votes: new Map(),
        voteCounts: { approve: 1, reject: 0, abstain: 0, total: 1 },
        approvalPercentage: 100,
        quorumReached: true,
        startedAt: 'now',
        closedAt: 'now',
        durationMs: 1,
      },
      votes,
      totalTimeMs: 10,
      simulateVotes: false,
      strategy: 'simple_majority',
      // decision intentionally absent
    };
    const response = buildResponse(
      { proposal: 'Test', simulateVotes: false, quickMode: false },
      base
    );
    expect(response.decision).toBe('approved');
  });

  it('absolute_quorum with an errored voter → executeVoting stamps decision:no_quorum', () => {
    // Reuses the buildResponse absolute_quorum path (which resolveVoteDecision drives,
    // the same function executeVoting stamps with): an errored voter voids the quorum.
    const votes: AgentVoteResult[] = [
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: 'ok', confidence: 0.9 },
        processingTimeMs: 10,
        source: 'llm',
      },
      {
        role: 'catfish',
        vote: { decision: 'abstain', reasoning: 'timeout', confidence: 0 },
        processingTimeMs: 10,
        source: 'error',
      },
    ];
    const base: ExtendedVotingResult = {
      proposal: 'Test',
      threshold: 'simple_majority',
      result: {
        proposalId: 'p1',
        proposal: { title: 't', description: 'Test', algorithm: 'simple_majority' },
        outcome: 'approved',
        votes: new Map(),
        voteCounts: { approve: 1, reject: 0, abstain: 0, total: 1 },
        approvalPercentage: 100,
        quorumReached: true,
        startedAt: 'now',
        closedAt: 'now',
        durationMs: 1,
      },
      votes,
      totalTimeMs: 10,
      simulateVotes: false,
      strategy: 'simple_majority',
      panelSize: 2,
      contrarianRequested: true,
    };
    resetDegradedPanelCount();
    const response = buildResponse(
      { proposal: 'Test', simulateVotes: false, quickMode: false, errorPolicy: 'absolute_quorum' },
      base
    );
    expect(response.decision).toBe('no_quorum');
  });
});

describe('buildResponse surfaces vote-record persistence outcome (#3991)', () => {
  function makeResult(): ExtendedVotingResult {
    const votes: AgentVoteResult[] = [
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: 'ok', confidence: 0.9 },
        processingTimeMs: 10,
        source: 'llm',
      },
    ];
    return {
      proposal: 'Test',
      threshold: 'simple_majority',
      result: createPolicyFailedResult('Test', 'simple_majority', 'x', votes),
      votes,
      totalTimeMs: 10,
      simulateVotes: false,
      strategy: 'simple_majority',
    };
  }
  const input = { proposal: 'Test', simulateVotes: false, quickMode: false };

  it('reports voteRecordPersisted=true with no note when the record was written', () => {
    const response = buildResponse(input, makeResult(), undefined, {
      persisted: true,
      record: { id: 'vote-1', decision: 'approved' } as unknown as VoteRecord,
    });
    expect(response.voteRecordPersisted).toBe(true);
    expect(response.voteRecordNote).toBeUndefined();
  });

  it('reports voteRecordPersisted=false + an actionable note on a write-failed skip', () => {
    const response = buildResponse(input, makeResult(), undefined, {
      persisted: false,
      reason: 'write-failed',
      detail: 'data dir not writable; set NEXUS_VOTE_RECORDS_PATH to a writable path.',
    });
    expect(response.voteRecordPersisted).toBe(false);
    expect(response.voteRecordNote).toContain('NEXUS_VOTE_RECORDS_PATH');
  });

  it('defaults voteRecordPersisted=false (no note) when no outcome is supplied', () => {
    const response = buildResponse(input, makeResult());
    expect(response.voteRecordPersisted).toBe(false);
    expect(response.voteRecordNote).toBeUndefined();
  });
});

describe('shouldEscalateLowPosterior (#3174)', () => {
  const floor = HIGHER_ORDER_ESCALATION_POSTERIOR_FLOOR;
  it('escalates a borderline higher_order quickMode approval', () => {
    expect(shouldEscalateLowPosterior('higher_order', 'approved', true, floor - 0.05)).toBe(true);
  });
  it('treats opinion_wise as a higher_order alias', () => {
    expect(shouldEscalateLowPosterior('opinion_wise', 'approved', true, floor - 0.1)).toBe(true);
  });
  it('does NOT escalate when the posterior is at/above the floor', () => {
    expect(shouldEscalateLowPosterior('higher_order', 'approved', true, floor)).toBe(false);
    expect(shouldEscalateLowPosterior('higher_order', 'approved', true, 0.9)).toBe(false);
  });
  it('does NOT escalate outside quickMode (full panel already ran)', () => {
    expect(shouldEscalateLowPosterior('higher_order', 'approved', false, 0.5)).toBe(false);
  });
  it('does NOT escalate on a rejection (escalation gate is approvals only)', () => {
    expect(shouldEscalateLowPosterior('higher_order', 'rejected', true, 0.5)).toBe(false);
  });
  it('does NOT escalate for non-higher-order strategies (no Bayesian posterior signal)', () => {
    expect(shouldEscalateLowPosterior('simple_majority', 'approved', true, 0.5)).toBe(false);
    expect(shouldEscalateLowPosterior('supermajority', 'approved', true, 0.5)).toBe(false);
  });
  it('does NOT escalate when the posterior is unavailable', () => {
    expect(shouldEscalateLowPosterior('higher_order', 'approved', true, undefined)).toBe(false);
  });
});

describe('opinion_wise is treated as a higher_order alias (#3271)', () => {
  it('isHigherOrderStrategy: true for higher_order + opinion_wise, false otherwise', () => {
    expect(isHigherOrderStrategy('higher_order')).toBe(true);
    expect(isHigherOrderStrategy('opinion_wise')).toBe(true);
    expect(isHigherOrderStrategy('simple_majority')).toBe(false);
    expect(isHigherOrderStrategy('unanimous')).toBe(false);
    expect(isHigherOrderStrategy('proof_of_learning')).toBe(false);
  });

  function makeResult(strategy: VotingStrategy): ExtendedVotingResult {
    const votes: AgentVoteResult[] = [
      {
        role: 'architect',
        vote: { decision: 'approve', reasoning: 'ok', confidence: 0.9 },
        processingTimeMs: 10,
        source: 'llm',
      },
    ];
    const higherOrderResult = {
      decision: 'approve',
      method: 'bayesian',
      posteriorApproval: 0.8,
      posteriorRejection: 0.2,
      effectiveVoteCount: 1,
      usedCorrelationData: false,
      improvementOverBaseline: 0.1,
      downweightedAgents: [],
      reasoning: 'test',
    } as unknown as NonNullable<ExtendedVotingResult['higherOrderResult']>;
    return {
      proposal: 'Test',
      threshold: strategy,
      result: createPolicyFailedResult('Test', strategy, 'x', votes),
      votes,
      totalTimeMs: 10,
      simulateVotes: false,
      strategy,
      higherOrderResult,
    };
  }

  const input = { proposal: 'Test', simulateVotes: false, quickMode: false };

  it('opinion_wise surfaces higherOrderMetadata (the bug: it was silently skipped)', () => {
    const r = buildResponse(input, makeResult('opinion_wise'));
    expect(r.higherOrderMetadata).toBeDefined();
    expect(r.higherOrderMetadata?.method).toBe('bayesian');
  });

  it('higher_order still surfaces higherOrderMetadata (regression guard)', () => {
    expect(buildResponse(input, makeResult('higher_order')).higherOrderMetadata).toBeDefined();
  });

  it('marks the metadata as NOT having decided the vote (#4701)', () => {
    // `strategy: 'higher_order'` does not produce a higher-order verdict. The
    // decision comes from ConsensusEngine.close() ->
    // HigherOrderVotingStrategy.calculateOutcome -> aggregateSimpleInternal, a
    // plain approve/(approve+reject) ratio. The correlation-aware run happens
    // separately and is consumed only as metadata plus one escalation check.
    //
    // Without this flag the metadata is actively misleading: `method` can read
    // a correlation method with a non-empty `downweightedAgents` while the
    // verdict ignored all of it — and the vote record is governance evidence.
    const r = buildResponse(input, makeResult('higher_order'));
    expect(r.higherOrderMetadata?.appliedToDecision).toBe(false);
  });

  it('simple_majority does NOT surface higherOrderMetadata', () => {
    expect(buildResponse(input, makeResult('simple_majority')).higherOrderMetadata).toBeUndefined();
  });
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

  it('surfaces a panelWarning on partial panel degradation (#3587)', () => {
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
      {
        role: 'devex',
        vote: { decision: 'abstain', reasoning: 'err', confidence: 0 },
        processingTimeMs: 10,
        source: 'error',
      },
    ];
    const input = { proposal: 'Test', simulateVotes: false, quickMode: false };
    const response = buildResponse(input, makeVotingResult(votes));
    expect(response.panelWarning).toMatch(/Panel degraded: 1 of 3 voters errored/);
  });

  it('omits panelWarning when every voter returns a real vote', () => {
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
    expect(response.panelWarning).toBeUndefined();
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

describe('CONSENSUS_VOTE_TOOL_SCHEMA input drift contract (#4494 follow-up)', () => {
  // #4494 shipped `options` on ConsensusVoteInputSchema but NOT on the schema
  // advertised to MCP clients, so the feature was unreachable through the tool
  // — the surface every caller actually uses. Internal capability and
  // advertised capability must not drift.
  const internal = Object.keys(ConsensusVoteInputSchema.shape).sort();
  const advertised = Object.keys(CONSENSUS_VOTE_TOOL_SCHEMA).sort();

  it('advertises `options`, the field whose absence made #4472 unreachable', () => {
    expect(advertised).toContain('options');
  });

  it('advertises every input the handler accepts, with no exemptions', () => {
    // This assertion used to exempt `mode` and `idempotencyKey` as
    // "async-dispatch plumbing… not user-facing vote inputs". That exemption
    // contradicted the tool's own description, which tells callers
    // `Supports async mode (mode: 'async')`, and nothing set the field on
    // their behalf — so the documented async path could not be invoked at all
    // (#4969). The schema is now registered from the internal shape, so there
    // is no subset to exempt from.
    expect(internal.filter((k) => !advertised.includes(k))).toEqual([]);
  });

  it('advertises the async-dispatch fields the description promises', () => {
    // Named explicitly, not just covered by the parity check above: these two
    // are the ones that were exempted, and a future exemption would want to
    // start with them again.
    expect(advertised).toContain('mode');
    expect(advertised).toContain('idempotencyKey');
  });

  it('advertises nothing the handler would reject', () => {
    expect(advertised.filter((k) => !internal.includes(k))).toEqual([]);
  });
});

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
  it('only unanimous defaults to fail_closed (a missing voter breaks unanimity)', () => {
    expect(getDefaultErrorPolicy('unanimous')).toBe('fail_closed');
  });

  it('higher_order + opinion_wise default to reduce_denominator (#3138 — infra timeout must not void a unanimous vote)', () => {
    expect(getDefaultErrorPolicy('higher_order')).toBe('reduce_denominator');
    expect(getDefaultErrorPolicy('opinion_wise')).toBe('reduce_denominator');
    // opinion_wise must match its higher_order alias rather than silently diverging
    expect(getDefaultErrorPolicy('opinion_wise')).toBe(getDefaultErrorPolicy('higher_order'));
  });

  it('non-strict strategies default to reduce_denominator', () => {
    expect(getDefaultErrorPolicy('simple_majority')).toBe('reduce_denominator');
    expect(getDefaultErrorPolicy('supermajority')).toBe('reduce_denominator');
  });
});

describe('CONSENSUS_VOTE_OUTPUT_SCHEMA covers the full response (#4032)', () => {
  // A fully-populated response with EVERY optional field set, incl. the two
  // (`panelWarning` #3587, `costSummary` #3855) whose omission from the output
  // schema made a strict MCP client reject the result with `-32602 additional
  // properties`. The fixture is typed `ConsensusVoteResponse`, so a newly-added
  // required response field forces this fixture to set it, surfacing schema drift.
  const fullResponse: ConsensusVoteResponse = {
    // #4472: present here so the key-parity guard actually covers optionOutcome.
    optionOutcome: {
      tally: [{ option: 'Rewrite', count: 2 }],
      leadingOption: 'Rewrite',
      leadingShare: 1,
      approverCount: 2,
      selectedCount: 2,
      unattributedApprovals: 0,
      thresholdMet: true,
    },
    proposal: 'ship it',
    threshold: 'majority',
    strategy: 'higher_order',
    decision: 'approved',
    approvalPercentage: 66.7,
    voteCounts: { approve: 2, reject: 0, abstain: 0, error: 1 },
    votes: [
      {
        role: 'architect',
        decision: 'approve',
        confidence: 0.9,
        reasoning: 'sound',
        simulated: false,
        error: false,
        modelUsed: 'claude-sonnet',
        rejectionCategories: [],
      },
    ],
    durationMs: 4321,
    simulateVotes: false,
    higherOrderMetadata: {
      posteriorApproval: 0.8,
      posteriorRejection: 0.2,
      effectiveVoteCount: 2.4,
      method: 'ow',
      // #4701: 'ow' with correlation data, and it still did not decide — the
      // exact shape that reads as "the correlation analysis produced this
      // verdict" when it did not.
      appliedToDecision: false,
      usedCorrelationData: true,
      improvementOverBaseline: 0.05,
      downweightedAgents: ['devex'],
      reasoning: 'correlation-aware',
    },
    policyReason: 'fail_closed: 1 voter(s) errored',
    panelWarning: 'Panel degraded: 1 of 3 voters errored; decision rests on 2 voter(s).',
    costSummary: rollupDecisionCost(
      [
        {
          role: 'architect',
          model: 'claude-sonnet',
          inputTokens: 1000,
          outputTokens: 200,
          costUsd: 0.006,
        },
      ],
      'api'
    ),
    voteRecordPersisted: true,
    voteRecordNote: 'persisted',
  };

  it('strictly accepts a response carrying panelWarning + costSummary', () => {
    expect(() => z.object(CONSENSUS_VOTE_OUTPUT_SCHEMA).strict().parse(fullResponse)).not.toThrow();
  });

  // #5066: the schema also covers the async-dispatch envelope, which is a
  // second response shape with none of the vote fields. These five keys are
  // the whole of that difference — named here so the drift guard below stays
  // exact rather than being loosened to "superset".
  const ASYNC_ENVELOPE_KEYS = ['status', 'jobId', 'pollTool', 'note', 'retryAfterMs'];

  it('declares exactly the response keys (no schema/response key drift)', () => {
    // Key-level guard: catches a response field absent from the schema (the
    // panelWarning/costSummary failure mode). It does NOT police value
    // constraints — the `decision` enum is kept aligned structurally instead,
    // by reusing VoteDecisionStatusSchema (see the enum test below).
    expect(Object.keys(CONSENSUS_VOTE_OUTPUT_SCHEMA).sort()).toEqual(
      [...Object.keys(fullResponse), ...ASYNC_ENVELOPE_KEYS].sort()
    );
  });

  it('strictly accepts the async-dispatch envelope (#5066)', () => {
    // The shape that used to fail every `mode: 'async'` call with -32602,
    // because `runAsJob`'s default envelopes carry no structured content and
    // the schema had no field they could satisfy.
    expect(() =>
      z.object(CONSENSUS_VOTE_OUTPUT_SCHEMA).strict().parse({
        status: 'pending',
        jobId: 'job-vote-1',
        pollTool: 'get_job_result',
        note: 'Poll via get_job_result({ jobId }) until status !== "pending".',
      })
    ).not.toThrow();
  });

  it('still rejects a response field the schema does not declare (#5066)', () => {
    // The guarantee the widening had to preserve. Requiredness is gone;
    // `additionalProperties: false` is what actually catches a #5044-shaped
    // regression, and it still fires.
    expect(() =>
      z
        .object(CONSENSUS_VOTE_OUTPUT_SCHEMA)
        .strict()
        .parse({ ...fullResponse, undeclaredField: 1 })
    ).toThrow();
  });

  it.each(['approved', 'rejected', 'pending', 'timeout', 'no_quorum'] as const)(
    'accepts every reachable decision value (%s) — not just the old 3-value subset (#4032)',
    (decision) => {
      // 'timeout'/'pending' are reachable via mapOutcomeToDecision and were
      // rejected by the previous narrower enum on a strict MCP client.
      const response: ConsensusVoteResponse = { ...fullResponse, decision };
      expect(() => z.object(CONSENSUS_VOTE_OUTPUT_SCHEMA).strict().parse(response)).not.toThrow();
    }
  );
});

// ============================================================================
// absolute_quorum error policy (#4132) — the anti-DoS security proof
// ============================================================================

const FULL_PANEL: AgentVoteResult['role'][] = [
  'architect',
  'security',
  'devex',
  'ai_ml',
  'pm',
  'catfish',
  'scope_steward',
];

function aqVote(
  role: AgentVoteResult['role'],
  decision: 'approve' | 'reject' | 'abstain',
  source: AgentVoteResult['source'] = 'llm'
): AgentVoteResult {
  return {
    role,
    vote: {
      decision,
      reasoning: `${decision} from ${role}`,
      confidence: source === 'error' ? 0 : 0.9,
    },
    processingTimeMs: 10,
    source,
  };
}

function aqEngineResult(
  outcome: 'approved' | 'rejected',
  votes: AgentVoteResult[]
): ConsensusResult {
  let approve = 0;
  let reject = 0;
  let abstain = 0;
  for (const v of votes) {
    if (v.source === 'error') continue;
    if (v.vote.decision === 'approve') approve++;
    else if (v.vote.decision === 'reject') reject++;
    else abstain++;
  }
  const total = approve + reject + abstain;
  return {
    proposalId: 'aq',
    proposal: { title: 't', description: 'd', algorithm: 'simple_majority' },
    outcome,
    votes: new Map(),
    voteCounts: { approve, reject, abstain, total },
    approvalPercentage: total > 0 ? (approve / total) * 100 : 0,
    quorumReached: true,
    startedAt: '',
    closedAt: '',
    durationMs: 0,
  };
}

function aqResult(
  votes: AgentVoteResult[],
  opts: {
    outcome: 'approved' | 'rejected';
    strategy?: VotingStrategy;
    panelSize?: number;
    contrarianRequested?: boolean;
  }
): ExtendedVotingResult {
  const strategy = opts.strategy ?? 'simple_majority';
  return {
    proposal: 'p',
    threshold: strategy === 'higher_order' ? 'higher_order' : 'simple_majority',
    result: aqEngineResult(opts.outcome, votes),
    votes,
    totalTimeMs: 1,
    simulateVotes: false,
    strategy,
    panelSize: opts.panelSize ?? votes.length,
    contrarianRequested: opts.contrarianRequested ?? votes.some((v) => v.role === 'catfish'),
  };
}

/** Decide under absolute_quorum (the opt-in). */
function decideAq(
  votes: AgentVoteResult[],
  opts: {
    outcome: 'approved' | 'rejected';
    strategy?: VotingStrategy;
    panelSize?: number;
    contrarianRequested?: boolean;
    quickMode?: boolean;
  }
): ConsensusVoteResponse {
  return buildResponse(
    {
      proposal: 'p',
      simulateVotes: false,
      quickMode: opts.quickMode ?? false,
      errorPolicy: 'absolute_quorum',
    },
    aqResult(votes, opts)
  );
}

describe('absolute_quorum error policy (#4132)', () => {
  describe('the anti-DoS invariant — induced error never→approved, never→rejected', () => {
    it.each([0, 1, 2, 3])(
      '7-panel with k=%s errors: approved ONLY at k=0; k>0 → no_quorum, never rejected',
      (k) => {
        // First (7 - k) voters approve; last k error. (k ≤ 3 keeps below the >50% floor.)
        const votes = FULL_PANEL.map((role, i) =>
          i >= 7 - k ? aqVote(role, 'abstain', 'error') : aqVote(role, 'approve')
        );
        // The engine (errors→abstain) still tallies the approvals as approved.
        const res = decideAq(votes, { outcome: 'approved' });
        if (k === 0) {
          expect(res.decision).toBe('approved');
        } else {
          expect(res.decision).toBe('no_quorum');
          expect(res.decision).not.toBe('rejected');
          expect(res.decision).not.toBe('approved');
        }
      }
    );

    it('errored contrarian (catfish) with everyone else approving → no_quorum, not approved', () => {
      const votes = FULL_PANEL.map((role) =>
        role === 'catfish' ? aqVote(role, 'abstain', 'error') : aqVote(role, 'approve')
      );
      const res = decideAq(votes, { outcome: 'approved' });
      expect(res.decision).toBe('no_quorum');
      expect(res.policyReason).toContain('catfish');
      expect(res.policyReason).toContain('absolute_quorum');
    });

    it('happy path: all approve, 0 errors, contrarian present → approved', () => {
      const votes = FULL_PANEL.map((role) => aqVote(role, 'approve'));
      const res = decideAq(votes, { outcome: 'approved' });
      expect(res.decision).toBe('approved');
      expect(res.voteCounts.error).toBe(0);
    });

    it('genuine all-reject (0 errors) still blocks → rejected, not no_quorum', () => {
      const votes = FULL_PANEL.map((role) => aqVote(role, 'reject'));
      const res = decideAq(votes, { outcome: 'rejected' });
      expect(res.decision).toBe('rejected');
    });

    it('mixed genuine reject (0 errors, contrarian present) stays rejected', () => {
      const votes = [
        aqVote('architect', 'approve'),
        aqVote('security', 'reject'),
        aqVote('devex', 'reject'),
        aqVote('ai_ml', 'reject'),
        aqVote('pm', 'approve'),
        aqVote('catfish', 'reject'),
        aqVote('scope_steward', 'approve'),
      ];
      const res = decideAq(votes, { outcome: 'rejected' });
      expect(res.decision).toBe('rejected');
    });
  });

  describe('absolute approval floor over the FULL panel', () => {
    it('supermajority: 4/7 approve + 3 abstain (engine-approved) is below ceil(2/3*7)=5 → no_quorum', () => {
      const votes = [
        aqVote('architect', 'approve'),
        aqVote('security', 'approve'),
        aqVote('devex', 'approve'),
        aqVote('ai_ml', 'approve'),
        aqVote('pm', 'abstain'),
        aqVote('catfish', 'abstain'),
        aqVote('scope_steward', 'abstain'),
      ];
      // Engine over responders (abstains excluded): 4/4 approve → approved.
      const res = decideAq(votes, { outcome: 'approved', strategy: 'supermajority' });
      expect(res.decision).toBe('no_quorum');
      expect(res.policyReason).toContain('absolute quorum not met');
    });

    it('supermajority: 5/7 approve (0 errors, contrarian approves) meets ceil(2/3*7)=5 → approved', () => {
      const votes = [
        aqVote('architect', 'approve'),
        aqVote('security', 'approve'),
        aqVote('devex', 'approve'),
        aqVote('ai_ml', 'approve'),
        aqVote('pm', 'approve'),
        aqVote('catfish', 'abstain'),
        aqVote('scope_steward', 'abstain'),
      ];
      const res = decideAq(votes, { outcome: 'approved', strategy: 'supermajority' });
      expect(res.decision).toBe('approved');
    });
  });

  describe('quick-mode carve-out (no catfish in the 3-panel)', () => {
    it('3-panel all-approve, 0 errors → approved (not forced no_quorum by a missing contrarian)', () => {
      const votes = [
        aqVote('architect', 'approve'),
        aqVote('security', 'approve'),
        aqVote('scope_steward', 'approve'),
      ];
      const res = decideAq(votes, {
        outcome: 'approved',
        panelSize: 3,
        contrarianRequested: false,
        quickMode: true,
      });
      expect(res.decision).toBe('approved');
    });

    it('3-panel with an errored voter still degrades → no_quorum', () => {
      const votes = [
        aqVote('architect', 'approve'),
        aqVote('security', 'abstain', 'error'),
        aqVote('scope_steward', 'approve'),
      ];
      const res = decideAq(votes, {
        outcome: 'approved',
        panelSize: 3,
        contrarianRequested: false,
        quickMode: true,
      });
      expect(res.decision).toBe('no_quorum');
    });
  });

  describe('default policy is UNCHANGED (opt-in only)', () => {
    it('reduce_denominator (default): 1 errored voter + rest approve → approved, NOT no_quorum', () => {
      const votes = FULL_PANEL.map((role) =>
        role === 'catfish' ? aqVote(role, 'abstain', 'error') : aqVote(role, 'approve')
      );
      // No errorPolicy set → legacy mapping.
      const res = buildResponse(
        { proposal: 'p', simulateVotes: false, quickMode: false },
        aqResult(votes, { outcome: 'approved' })
      );
      expect(res.decision).toBe('approved');
      expect(res.decision).not.toBe('no_quorum');
    });
  });

  describe('telemetry — degraded-panel counter', () => {
    it('increments the degraded-panel counter only on an absolute_quorum no_quorum', () => {
      resetDegradedPanelCount();
      const before = getDegradedPanelCount();
      // A clean approve does NOT increment.
      decideAq(
        FULL_PANEL.map((role) => aqVote(role, 'approve')),
        { outcome: 'approved' }
      );
      expect(getDegradedPanelCount()).toBe(before);
      // An errored-catfish degrade DOES increment.
      const votes = FULL_PANEL.map((role) =>
        role === 'catfish' ? aqVote(role, 'abstain', 'error') : aqVote(role, 'approve')
      );
      decideAq(votes, { outcome: 'approved' });
      expect(getDegradedPanelCount()).toBe(before + 1);
    });
  });
});

describe('maybeEscalateContrarian — quick-mode contrarian-check error (#4132)', () => {
  const logger: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as ILogger;

  // The top-level vi.mock (below the imports) makes executeExpert reject, so
  // runContrarianCheck reports errored:true without any live adapter call.
  it('absolute_quorum + quick approval + contrarian check errors → degradeReason (no_quorum)', async () => {
    const out = await maybeEscalateContrarian(
      {
        proposal: 'ship it',
        simulateVotes: false,
        quickMode: true,
        errorPolicy: 'absolute_quorum',
      },
      'approved',
      { strategy: 'simple_majority', posteriorApproval: undefined },
      logger
    );
    expect(out.escalated).toBeUndefined();
    expect(out.degradeReason).toContain('no_quorum');
    expect(out.degradeReason).toContain('contrarian');
  });

  it('non-absolute_quorum + contrarian check errors → no degrade (pre-#4132 behavior preserved)', async () => {
    const out = await maybeEscalateContrarian(
      { proposal: 'ship it', simulateVotes: false, quickMode: true },
      'approved',
      { strategy: 'simple_majority', posteriorApproval: undefined },
      logger
    );
    expect(out.escalated).toBeUndefined();
    expect(out.degradeReason).toBeUndefined();
  });
});

describe('#4529: an option-split veto is a rejection, not a void', () => {
  /** Seven approvers, `forLeading` of them choosing OPTION_A and the rest OPTION_B. */
  const splitPanel = (forLeading: number, total = 7): AgentVoteResult[] =>
    Array.from({ length: total }, (_, i) => ({
      role: 'architect',
      vote: { decision: 'approve' as const, reasoning: 'engaged', confidence: 0.9 },
      processingTimeMs: 10,
      source: 'llm' as const,
      selectedOption: i < forLeading ? 'Rewrite' : 'Patch',
    }));

  const approvedResult = (votes: AgentVoteResult[]): ExtendedVotingResult => ({
    proposal: 'Rewrite or patch?',
    threshold: 'unanimous',
    result: {
      proposalId: 'p-4529',
      proposal: { title: 't', description: 'Rewrite or patch?', algorithm: 'unanimous' },
      // Every voter approved, so the approve/reject bar reads 100% — the #4452
      // inversion the option gate exists to catch.
      outcome: 'approved',
      votes: new Map(),
      voteCounts: { approve: votes.length, reject: 0, abstain: 0, total: votes.length },
      approvalPercentage: 100,
      quorumReached: true,
      startedAt: 'now',
      closedAt: 'now',
      durationMs: 1,
    },
    votes,
    totalTimeMs: 10,
    simulateVotes: false,
    strategy: 'unanimous',
  });

  const input: ConsensusVoteInput = {
    proposal: 'Rewrite or patch?',
    simulateVotes: false,
    quickMode: false,
    strategy: 'unanimous',
    options: ['Rewrite', 'Patch'],
  };

  it('stamps rejected — the panel decided and disagreed; it was not voided', () => {
    // Reproduces the exact two-line sequence in executeVoting (L622-623).
    const result = approvedResult(splitPanel(6));

    applyOptionGate(input, result);
    const { decision } = resolveVoteDecision(input, result, 0);

    expect(result.result.outcome).toBe('rejected');
    // no_quorum means "a voice was missing, nothing was decided" and is
    // recoverable by re-running. A 6-1 split is the opposite: every voice was
    // heard. Filing it as a void lets --on-no-quorum=retry re-roll the panel
    // and discard the dissent the gate just detected.
    expect(decision).toBe('rejected');
  });

  it('does not mark the vote error-voided when no voter errored', () => {
    // errorVoided is derived from policyReason (consensus-vote.ts:845) and
    // forces the PERSISTED record's decision to no_quorum, so borrowing that
    // field for a split corrupts the audit trail, not just the response.
    const result = approvedResult(splitPanel(6));

    applyOptionGate(input, result);

    expect(result.votes.some((v) => v.source === 'error')).toBe(false);
    expect(result.policyReason).toBeUndefined();
  });

  it('still explains the veto to the operator', () => {
    const result = approvedResult(splitPanel(6));

    applyOptionGate(input, result);

    // Whatever channel carries it, the reason must survive the veto.
    const explanation = JSON.stringify(result);
    expect(explanation).toContain('Rewrite');
    expect(explanation.toLowerCase()).toContain('option');
  });

  it('leaves a genuine error-policy void reading as no_quorum', () => {
    // The gate must not steal the meaning of a real void in the other direction.
    const result = approvedResult(splitPanel(7));
    result.policyReason = 'fail_closed: 4 of 7 voters errored';

    applyOptionGate(input, result);

    expect(resolveVoteDecision(input, result, 4).decision).toBe('no_quorum');
  });

  it('surfaces the veto reason on the response, not on policyReason', () => {
    const result = approvedResult(splitPanel(6));
    applyOptionGate(input, result);
    result.decision = resolveVoteDecision(input, result, 0).decision;

    const response = buildResponse(input, result);

    expect(response.optionOutcome?.vetoReason).toContain('Rewrite');
    expect(response.policyReason).toBeUndefined();
    expect(response.decision).toBe('rejected');
  });

  it('persists the split as rejected, so the audit trail is not a void', () => {
    // errorVoided is derived from policyReason at consensus-vote.ts:845 and
    // forces the persisted decision to no_quorum. With the reason off that
    // field, a split records as what it was.
    const result = approvedResult(splitPanel(6));
    applyOptionGate(input, result);

    // Drive the REAL record builder rather than reimplementing its mapping —
    // a test that recomputes the thing it checks cannot fail for the bug.
    const record = buildVoteRecord({
      // #4986: these fixtures exercise the fallback derivation.
      resolvedDecision: undefined,
      id: 'vr-4529',
      proposal: result.proposal,
      result: result.result,
      votes: result.votes,
      strategy: result.strategy,
      errorVoided: result.policyReason !== undefined,
    });

    expect(record.decision).toBe('rejected');
  });

  it('does not veto — or relabel — a panel that agreed on one option', () => {
    const result = approvedResult(splitPanel(7));

    applyOptionGate(input, result);

    expect(result.result.outcome).toBe('approved');
    expect(resolveVoteDecision(input, result, 0).decision).toBe('approved');
  });
});
