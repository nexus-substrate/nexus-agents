/**
 * nexus-agents/agents - Agent Validation Schemas
 *
 * Zod schemas for validating agent-related data structures.
 */

import { z } from 'zod';
import { PruningStrategy } from './context-pruner.js';

/**
 * Zod schema for validating Task objects.
 */
export const TaskSchema = z.object({
  id: z.string().min(1, 'Task ID is required'),
  description: z.string().min(1, 'Task description is required'),
  context: z.object({
    workingDirectory: z.string().optional(),
    files: z.array(z.string()).optional(),
    history: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant', 'system']),
          content: z.string(),
          timestamp: z.string(),
        })
      )
      .optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  constraints: z
    .object({
      /** Maximum execution time in ms. ENFORCED via timeout mechanism. */
      maxDuration: z
        .number()
        .positive()
        .optional()
        .describe('ENFORCED: Task times out after this duration'),
      /** Maximum tokens to use. INFORMATIONAL only. */
      maxTokens: z
        .number()
        .positive()
        .optional()
        .describe('INFORMATIONAL: Agents can see but not enforced'),
      /** @deprecated Not enforced. Will be removed in v3.0. */
      outputFormat: z
        .enum(['text', 'json', 'markdown'])
        .optional()
        .describe('DEPRECATED: Not enforced'),
      /** @deprecated Not enforced. Will be removed in v3.0. */
      allowedTools: z.array(z.string()).optional().describe('DEPRECATED: Not enforced'),
    })
    .optional()
    .describe('Task constraints. See TaskConstraints type for enforcement status.'),
  /** Priority. INFORMATIONAL - Logged but not used for scheduling. */
  priority: z.number().optional().describe('INFORMATIONAL: Logged but not used for scheduling'),
});

/**
 * Zod schema for validating AgentMessage objects.
 */
export const AgentMessageSchema = z.object({
  id: z.string().min(1, 'Message ID is required'),
  from: z.string().min(1, 'Sender ID is required'),
  to: z.string().min(1, 'Recipient ID is required'),
  type: z.enum(['task', 'result', 'query', 'feedback', 'status']),
  payload: z.unknown(),
  timestamp: z.string(),
});

/**
 * Zod schema for validating ContextPrunerAgentConfig (Issue #306).
 * Configuration for automatic context pruning in BaseAgent.
 */
export const ContextPrunerAgentConfigSchema = z.object({
  /** Whether to enable automatic context pruning. Default: false (opt-in). */
  enabled: z.boolean().optional(),
  /** Pruning strategy to use. Default: 'priority_weighted_age'. */
  strategy: z
    .enum([
      PruningStrategy.OLDEST_FIRST,
      PruningStrategy.LOWEST_PRIORITY,
      PruningStrategy.PRIORITY_WEIGHTED_AGE,
      PruningStrategy.SUMMARIZE,
      PruningStrategy.SLIDING_WINDOW,
      PruningStrategy.HIERARCHICAL,
      PruningStrategy.SEMANTIC,
    ])
    .optional(),
  /** Maximum tokens before pruning is triggered. Default: 100000 (100K). */
  maxTokens: z.number().positive().optional(),
  /** Tokens reserved for response generation. Default: 10000 (10K). */
  reserveTokens: z.number().positive().optional(),
  /** Usage threshold (0-1) at which pruning is triggered. Default: 0.9 (90%). */
  triggerThreshold: z.number().min(0).max(1).optional(),
});

/**
 * Zod schema for validating BaseAgentOptions.
 */
export const BaseAgentOptionsSchema = z.object({
  id: z.string().min(1, 'Agent ID is required'),
  role: z.enum([
    'orchestrator',
    'tech_lead', // @deprecated - use 'orchestrator'
    'code_expert',
    'architecture_expert',
    'security_expert',
    'documentation_expert',
    'testing_expert',
    'devops_expert',
    'research_expert',
    'pm_expert',
    'ux_expert',
    'infrastructure_expert',
    'thinker',
    'worker',
    'verifier',
    'custom',
  ]),
  capabilities: z.array(
    z.enum([
      'task_execution',
      'delegation',
      'collaboration',
      'tool_use',
      'code_generation',
      'code_review',
      'research',
    ])
  ),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().positive().optional(),
  /** Configuration for automatic context pruning (Issue #306). */
  contextPruning: ContextPrunerAgentConfigSchema.optional(),
});
