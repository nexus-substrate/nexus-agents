/**
 * @nexus-agents/agents - Agent Validation Schemas
 *
 * Zod schemas for validating agent-related data structures.
 */

import { z } from 'zod';

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
      maxDuration: z.number().positive().optional(),
      maxTokens: z.number().positive().optional(),
      outputFormat: z.enum(['text', 'json', 'markdown']).optional(),
      allowedTools: z.array(z.string()).optional(),
    })
    .optional(),
  priority: z.number().optional(),
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
 * Zod schema for validating BaseAgentOptions.
 */
export const BaseAgentOptionsSchema = z.object({
  id: z.string().min(1, 'Agent ID is required'),
  role: z.enum([
    'tech_lead',
    'code_expert',
    'architecture_expert',
    'security_expert',
    'documentation_expert',
    'testing_expert',
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
});
