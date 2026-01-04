/**
 * nexus-agents/agents - Collaboration Types Tests
 */

import { describe, it, expect } from 'vitest';
import {
  CollaborationPatternSchema,
  SessionStatusSchema,
  VoteDecisionSchema,
  CollaborationConfigSchema,
  ExpertParticipationSchema,
  VoteMessageSchema,
  ReviewResponseMessageSchema,
  DEFAULT_TIMEOUTS,
  DEFAULT_MAX_RETRIES,
  MIN_EXPERTS_FOR_PATTERN,
} from './collaboration-types.js';

describe('CollaborationPatternSchema', () => {
  it('should validate all valid patterns', () => {
    expect(CollaborationPatternSchema.safeParse('sequential').success).toBe(true);
    expect(CollaborationPatternSchema.safeParse('parallel').success).toBe(true);
    expect(CollaborationPatternSchema.safeParse('review').success).toBe(true);
    expect(CollaborationPatternSchema.safeParse('consensus').success).toBe(true);
  });

  it('should reject invalid patterns', () => {
    expect(CollaborationPatternSchema.safeParse('invalid').success).toBe(false);
    expect(CollaborationPatternSchema.safeParse('').success).toBe(false);
    expect(CollaborationPatternSchema.safeParse(123).success).toBe(false);
  });
});

describe('SessionStatusSchema', () => {
  it('should validate all valid statuses', () => {
    const statuses = [
      'pending',
      'in_progress',
      'awaiting_review',
      'voting',
      'finalizing',
      'completed',
      'failed',
      'timed_out',
    ];

    for (const status of statuses) {
      expect(SessionStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it('should reject invalid statuses', () => {
    expect(SessionStatusSchema.safeParse('unknown').success).toBe(false);
    expect(SessionStatusSchema.safeParse('running').success).toBe(false);
  });
});

describe('VoteDecisionSchema', () => {
  it('should validate all vote decisions', () => {
    expect(VoteDecisionSchema.safeParse('approve').success).toBe(true);
    expect(VoteDecisionSchema.safeParse('reject').success).toBe(true);
    expect(VoteDecisionSchema.safeParse('abstain').success).toBe(true);
  });

  it('should reject invalid decisions', () => {
    expect(VoteDecisionSchema.safeParse('yes').success).toBe(false);
    expect(VoteDecisionSchema.safeParse('no').success).toBe(false);
  });
});

describe('CollaborationConfigSchema', () => {
  const validConfig = {
    sessionId: 'session-1',
    pattern: 'parallel',
    experts: ['expert-1', 'expert-2'],
    task: {
      id: 'task-1',
      description: 'Test task',
      context: {},
    },
  };

  it('should validate a valid config', () => {
    const result = CollaborationConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('should validate config with optional fields', () => {
    const configWithOptionals = {
      ...validConfig,
      timeout: 60000,
      minVotes: 2,
      requireUnanimous: true,
      maxRetries: 3,
    };

    const result = CollaborationConfigSchema.safeParse(configWithOptionals);
    expect(result.success).toBe(true);
  });

  it('should reject empty session ID', () => {
    const config = { ...validConfig, sessionId: '' };
    const result = CollaborationConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject empty experts array', () => {
    const config = { ...validConfig, experts: [] };
    const result = CollaborationConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject invalid task', () => {
    const config = {
      ...validConfig,
      task: { id: '', description: '', context: {} },
    };
    const result = CollaborationConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject negative timeout', () => {
    const config = { ...validConfig, timeout: -1 };
    const result = CollaborationConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject maxRetries greater than 5', () => {
    const config = { ...validConfig, maxRetries: 10 };
    const result = CollaborationConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should validate task with constraints', () => {
    const config = {
      ...validConfig,
      task: {
        ...validConfig.task,
        constraints: {
          maxDuration: 5000,
          maxTokens: 1000,
          outputFormat: 'json',
          allowedTools: ['read', 'write'],
        },
      },
    };

    const result = CollaborationConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});

describe('ExpertParticipationSchema', () => {
  const validParticipation = {
    expertId: 'expert-1',
    role: 'code_expert',
    joinedAt: '2024-01-01T00:00:00Z',
    status: 'pending',
    retryCount: 0,
  };

  it('should validate valid participation', () => {
    const result = ExpertParticipationSchema.safeParse(validParticipation);
    expect(result.success).toBe(true);
  });

  it('should validate all roles', () => {
    const roles = [
      'tech_lead',
      'code_expert',
      'architecture_expert',
      'security_expert',
      'documentation_expert',
      'testing_expert',
      'custom',
    ];

    for (const role of roles) {
      const participation = { ...validParticipation, role };
      expect(ExpertParticipationSchema.safeParse(participation).success).toBe(true);
    }
  });

  it('should validate all statuses', () => {
    const statuses = ['pending', 'working', 'submitted', 'reviewing', 'voted', 'failed'];

    for (const status of statuses) {
      const participation = { ...validParticipation, status };
      expect(ExpertParticipationSchema.safeParse(participation).success).toBe(true);
    }
  });

  it('should validate with optional submittedAt', () => {
    const participation = {
      ...validParticipation,
      status: 'submitted',
      submittedAt: '2024-01-01T00:01:00Z',
    };

    const result = ExpertParticipationSchema.safeParse(participation);
    expect(result.success).toBe(true);
  });

  it('should reject negative retryCount', () => {
    const participation = { ...validParticipation, retryCount: -1 };
    const result = ExpertParticipationSchema.safeParse(participation);
    expect(result.success).toBe(false);
  });
});

describe('VoteMessageSchema', () => {
  const validVote = {
    type: 'vote',
    expertId: 'expert-1',
    decision: 'approve',
    reasoning: 'This looks good',
  };

  it('should validate valid vote message', () => {
    const result = VoteMessageSchema.safeParse(validVote);
    expect(result.success).toBe(true);
  });

  it('should validate vote with conditions', () => {
    const vote = {
      ...validVote,
      conditions: ['Add more tests', 'Fix typos'],
    };

    const result = VoteMessageSchema.safeParse(vote);
    expect(result.success).toBe(true);
  });

  it('should reject empty reasoning', () => {
    const vote = { ...validVote, reasoning: '' };
    const result = VoteMessageSchema.safeParse(vote);
    expect(result.success).toBe(false);
  });

  it('should reject invalid decision', () => {
    const vote = { ...validVote, decision: 'maybe' };
    const result = VoteMessageSchema.safeParse(vote);
    expect(result.success).toBe(false);
  });

  it('should reject wrong message type', () => {
    const vote = { ...validVote, type: 'feedback' };
    const result = VoteMessageSchema.safeParse(vote);
    expect(result.success).toBe(false);
  });
});

describe('ReviewResponseMessageSchema', () => {
  const validReview = {
    type: 'review_response',
    reviewerId: 'reviewer-1',
    requesterId: 'requester-1',
    approved: true,
    feedback: 'Looks good!',
  };

  it('should validate valid review response', () => {
    const result = ReviewResponseMessageSchema.safeParse(validReview);
    expect(result.success).toBe(true);
  });

  it('should validate with optional fields', () => {
    const review = {
      ...validReview,
      suggestions: ['Consider edge cases'],
      severity: 'minor',
    };

    const result = ReviewResponseMessageSchema.safeParse(review);
    expect(result.success).toBe(true);
  });

  it('should validate all severity levels', () => {
    const severities = ['none', 'minor', 'major', 'critical'];

    for (const severity of severities) {
      const review = { ...validReview, severity };
      expect(ReviewResponseMessageSchema.safeParse(review).success).toBe(true);
    }
  });

  it('should reject empty feedback', () => {
    const review = { ...validReview, feedback: '' };
    const result = ReviewResponseMessageSchema.safeParse(review);
    expect(result.success).toBe(false);
  });
});

describe('DEFAULT_TIMEOUTS', () => {
  it('should have timeouts for all patterns', () => {
    expect(DEFAULT_TIMEOUTS.sequential).toBe(5 * 60 * 1000);
    expect(DEFAULT_TIMEOUTS.parallel).toBe(3 * 60 * 1000);
    expect(DEFAULT_TIMEOUTS.review).toBe(2 * 60 * 1000);
    expect(DEFAULT_TIMEOUTS.consensus).toBe(5 * 60 * 1000);
  });
});

describe('DEFAULT_MAX_RETRIES', () => {
  it('should be 2', () => {
    expect(DEFAULT_MAX_RETRIES).toBe(2);
  });
});

describe('MIN_EXPERTS_FOR_PATTERN', () => {
  it('should have minimum experts for all patterns', () => {
    expect(MIN_EXPERTS_FOR_PATTERN.sequential).toBe(1);
    expect(MIN_EXPERTS_FOR_PATTERN.parallel).toBe(2);
    expect(MIN_EXPERTS_FOR_PATTERN.review).toBe(2);
    expect(MIN_EXPERTS_FOR_PATTERN.consensus).toBe(3);
  });
});
