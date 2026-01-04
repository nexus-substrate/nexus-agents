/**
 * nexus-agents/agents - Collaboration Schemas
 *
 * Zod schemas for collaboration protocol validation.
 */

import { z } from 'zod';

/**
 * Zod schema for CollaborationPattern.
 */
export const CollaborationPatternSchema = z.enum(['sequential', 'parallel', 'review', 'consensus']);

/**
 * Zod schema for SessionStatus.
 */
export const SessionStatusSchema = z.enum([
  'pending',
  'in_progress',
  'awaiting_review',
  'voting',
  'finalizing',
  'completed',
  'failed',
  'timed_out',
]);

/**
 * Zod schema for VoteDecision.
 */
export const VoteDecisionSchema = z.enum(['approve', 'reject', 'abstain']);

/**
 * Zod schema for CollaborationConfig.
 */
export const CollaborationConfigSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  pattern: CollaborationPatternSchema,
  experts: z.array(z.string().min(1)).min(1, 'At least one expert is required'),
  task: z.object({
    id: z.string().min(1),
    description: z.string().min(1),
    context: z.record(z.unknown()),
    constraints: z
      .object({
        maxDuration: z.number().positive().optional(),
        maxTokens: z.number().positive().optional(),
        outputFormat: z.enum(['text', 'json', 'markdown']).optional(),
        allowedTools: z.array(z.string()).optional(),
      })
      .optional(),
    priority: z.number().optional(),
  }),
  timeout: z.number().positive().optional(),
  minVotes: z.number().positive().optional(),
  requireUnanimous: z.boolean().optional(),
  maxRetries: z.number().min(0).max(5).optional(),
});

/**
 * Zod schema for ExpertParticipation.
 */
export const ExpertParticipationSchema = z.object({
  expertId: z.string().min(1),
  role: z.enum([
    'tech_lead',
    'code_expert',
    'architecture_expert',
    'security_expert',
    'documentation_expert',
    'testing_expert',
    'custom',
  ]),
  joinedAt: z.string().datetime(),
  status: z.enum(['pending', 'working', 'submitted', 'reviewing', 'voted', 'failed']),
  submittedAt: z.string().datetime().optional(),
  retryCount: z.number().min(0),
});

/**
 * Zod schema for VoteMessage.
 */
export const VoteMessageSchema = z.object({
  type: z.literal('vote'),
  expertId: z.string().min(1),
  decision: VoteDecisionSchema,
  reasoning: z.string().min(1, 'Vote reasoning is required'),
  conditions: z.array(z.string()).optional(),
});

/**
 * Zod schema for ReviewResponseMessage.
 */
export const ReviewResponseMessageSchema = z.object({
  type: z.literal('review_response'),
  reviewerId: z.string().min(1),
  requesterId: z.string().min(1),
  approved: z.boolean(),
  feedback: z.string().min(1),
  suggestions: z.array(z.string()).optional(),
  severity: z.enum(['none', 'minor', 'major', 'critical']).optional(),
});

/**
 * Default collaboration timeouts.
 */
export const DEFAULT_TIMEOUTS = {
  sequential: 5 * 60 * 1000, // 5 minutes
  parallel: 3 * 60 * 1000, // 3 minutes
  review: 2 * 60 * 1000, // 2 minutes
  consensus: 5 * 60 * 1000, // 5 minutes
} as const;

/**
 * Default retry counts.
 */
export const DEFAULT_MAX_RETRIES = 2;

/**
 * Minimum number of experts for each pattern.
 */
export const MIN_EXPERTS_FOR_PATTERN = {
  sequential: 1,
  parallel: 2,
  review: 2,
  consensus: 3,
} as const;
