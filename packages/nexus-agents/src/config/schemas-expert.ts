/**
 * nexus-agents/config - Expert Configuration Schemas
 *
 * Schemas for expert definitions, custom experts, and related constants.
 */

import { z } from 'zod';

/**
 * Valid model tiers for custom experts.
 */
export const VALID_EXPERT_TIERS = ['fast', 'balanced', 'powerful'] as const;
export type ExpertTier = (typeof VALID_EXPERT_TIERS)[number];

/**
 * Valid task domains for custom experts.
 */
export const VALID_EXPERT_DOMAINS = [
  'code',
  'security',
  'architecture',
  'documentation',
  'testing',
  'general',
] as const;
export type ExpertDomain = (typeof VALID_EXPERT_DOMAINS)[number];

/**
 * Maximum system prompt length (4000 characters).
 * This matches typical LLM system prompt limits while allowing detailed instructions.
 */
export const MAX_SYSTEM_PROMPT_LENGTH = 4000;

/**
 * Custom expert definition schema from YAML config.
 *
 * Defines a user-configurable expert with:
 * - systemPrompt: The expert's persona and instructions (max 4000 chars)
 * - tier: Model tier for routing (fast, balanced, powerful)
 * - domain: Primary domain of expertise
 * - capabilities: What this expert can do
 * - temperature: Model temperature (0-1)
 * - tools: Optional tool restrictions
 *
 * (Source: Issue #300)
 */
export const CustomExpertDefinitionSchema = z.object({
  /** System prompt defining the expert's persona (max 4000 characters) */
  systemPrompt: z
    .string()
    .min(1, 'System prompt is required')
    .max(
      MAX_SYSTEM_PROMPT_LENGTH,
      `System prompt must be at most ${String(MAX_SYSTEM_PROMPT_LENGTH)} characters`
    ),

  /** Model tier for routing */
  tier: z
    .enum(VALID_EXPERT_TIERS, {
      error: `Invalid tier. Valid options: ${VALID_EXPERT_TIERS.join(', ')}`,
    })
    .default('balanced'),

  /** Primary domain of expertise */
  domain: z
    .enum(VALID_EXPERT_DOMAINS, {
      error: `Invalid domain. Valid options: ${VALID_EXPERT_DOMAINS.join(', ')}`,
    })
    .default('general'),

  /** Secondary domains (optional) */
  secondaryDomains: z.array(z.enum(VALID_EXPERT_DOMAINS)).optional(),

  /** Expert capabilities */
  capabilities: z
    .array(z.string().min(1))
    .min(1, 'At least one capability is required')
    .default(['task_execution']),

  /** Model temperature (0-1) */
  temperature: z.number().min(0).max(1).default(0.3),

  /** Allowed tools (optional, unrestricted if not specified) */
  tools: z.array(z.string()).optional(),

  /** Human-readable description */
  description: z.string().optional(),

  /** Weight for expert selection scoring (0-1) */
  weight: z.number().min(0).max(1).default(1.0),

  /** Whether this expert is currently available */
  available: z.boolean().default(true),
});

export type CustomExpertDefinition = z.infer<typeof CustomExpertDefinitionSchema>;

/**
 * Legacy expert definition schema (for backwards compatibility).
 * Use CustomExpertDefinitionSchema for new implementations.
 */
export const ExpertDefinitionSchema = z.object({
  prompt: z.string().min(1),
  tier: z.enum(['fast', 'balanced', 'powerful']).default('balanced'),
  temperature: z.number().min(0).max(1).default(0.3),
  tools: z.array(z.string()).optional(),
});

export type ExpertDefinition = z.infer<typeof ExpertDefinitionSchema>;

/**
 * Expert configuration schema.
 */
export const ExpertConfigSchema = z.object({
  /** Enable built-in experts */
  builtin: z.boolean().default(true),

  /** Custom expert definitions keyed by expert ID */
  custom: z
    .record(
      z.string().regex(/^[a-z][a-z0-9_]*$/, {
        message:
          'Expert ID must start with a letter and contain only lowercase letters, numbers, and underscores',
      }),
      CustomExpertDefinitionSchema
    )
    .optional(),
});

export type ExpertConfig = z.infer<typeof ExpertConfigSchema>;
