/**
 * nexus-agents/agents/resilience - Failure Types
 *
 * Type definitions for agent failure archetypes based on arxiv:2512.07497.
 * Defines four primary failure patterns: premature action, over-helpfulness,
 * context pollution, and fragile execution.
 */

import { z } from 'zod';

/**
 * The four primary agent failure archetypes from arxiv:2512.07497.
 */
export type FailureArchetype =
  | 'premature_action'
  | 'over_helpfulness'
  | 'context_pollution'
  | 'fragile_execution';

export const FailureArchetypeSchema = z.enum([
  'premature_action',
  'over_helpfulness',
  'context_pollution',
  'fragile_execution',
]);

/**
 * Severity levels for detected failures.
 */
export type FailureSeverity = 'low' | 'medium' | 'high' | 'critical';

export const FailureSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

/**
 * A detected failure instance with archetype and context.
 */
export interface DetectedFailure {
  readonly archetype: FailureArchetype;
  readonly severity: FailureSeverity;
  readonly description: string;
  readonly indicators: readonly string[];
  readonly confidence: number;
  readonly timestamp: number;
  readonly context?: Record<string, unknown>;
}

export const DetectedFailureSchema = z.object({
  archetype: FailureArchetypeSchema,
  severity: FailureSeveritySchema,
  description: z.string(),
  indicators: z.array(z.string()).readonly(),
  confidence: z.number().min(0).max(1),
  timestamp: z.number(),
  context: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Detection result from analyzing agent behavior.
 */
export interface DetectionResult {
  readonly hasFailure: boolean;
  readonly failures: readonly DetectedFailure[];
  readonly analysisMetadata: {
    readonly durationMs: number;
    readonly checksPerformed: number;
    readonly contentAnalyzed: number;
  };
}

export const DetectionResultSchema = z.object({
  hasFailure: z.boolean(),
  failures: z.array(DetectedFailureSchema).readonly(),
  analysisMetadata: z.object({
    durationMs: z.number(),
    checksPerformed: z.number(),
    contentAnalyzed: z.number(),
  }),
});

/**
 * Recovery action to take for a detected failure.
 */
export type RecoveryAction =
  | 'retry_with_inspection'
  | 'request_clarification'
  | 'context_reset'
  | 'tool_validation'
  | 'escalate'
  | 'abort';

export const RecoveryActionSchema = z.enum([
  'retry_with_inspection',
  'request_clarification',
  'context_reset',
  'tool_validation',
  'escalate',
  'abort',
]);

/**
 * Recovery strategy for a specific failure archetype.
 */
export interface RecoveryStrategy {
  readonly archetype: FailureArchetype;
  readonly action: RecoveryAction;
  readonly instructions: string;
  readonly maxRetries: number;
  readonly backoffMs: number;
}

export const RecoveryStrategySchema = z.object({
  archetype: FailureArchetypeSchema,
  action: RecoveryActionSchema,
  instructions: z.string(),
  maxRetries: z.number().int().min(0).max(10),
  backoffMs: z.number().int().min(0),
});

/**
 * Result of applying a recovery strategy.
 */
export interface RecoveryResult {
  readonly success: boolean;
  readonly action: RecoveryAction;
  readonly attemptNumber: number;
  readonly durationMs: number;
  readonly message: string;
  readonly newContext?: Record<string, unknown>;
}

export const RecoveryResultSchema = z.object({
  success: z.boolean(),
  action: RecoveryActionSchema,
  attemptNumber: z.number().int().min(1),
  durationMs: z.number(),
  message: z.string(),
  newContext: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Configuration for failure detection.
 */
export interface DetectorConfig {
  readonly enabledArchetypes: readonly FailureArchetype[];
  readonly confidenceThreshold: number;
  readonly maxHistoryItems: number;
  readonly enableHeuristics: boolean;
}

export const DetectorConfigSchema = z.object({
  enabledArchetypes: z.array(FailureArchetypeSchema).readonly(),
  confidenceThreshold: z.number().min(0).max(1),
  maxHistoryItems: z.number().int().min(1).max(1000),
  enableHeuristics: z.boolean(),
});

/** Default detector configuration. */
export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  enabledArchetypes: [
    'premature_action',
    'over_helpfulness',
    'context_pollution',
    'fragile_execution',
  ],
  confidenceThreshold: 0.6,
  maxHistoryItems: 50,
  enableHeuristics: true,
};

/**
 * Archetype descriptions for documentation and logging.
 */
export const ARCHETYPE_DESCRIPTIONS: Record<FailureArchetype, string> = {
  premature_action:
    'Agent guesses schemas or takes actions without proper inspection of available tools/data',
  over_helpfulness:
    'Agent substitutes plausible but incorrect alternatives when entities are missing',
  context_pollution:
    'Agent reasoning is corrupted by distractor data or irrelevant context information',
  fragile_execution:
    'Agent produces malformed tool calls, enters generation loops, or fails to complete actions',
};

/**
 * Default recovery strategies for each archetype.
 */
export const DEFAULT_RECOVERY_STRATEGIES: Record<FailureArchetype, RecoveryStrategy> = {
  premature_action: {
    archetype: 'premature_action',
    action: 'retry_with_inspection',
    instructions: 'Re-execute with explicit schema inspection before action',
    maxRetries: 2,
    backoffMs: 1000,
  },
  over_helpfulness: {
    archetype: 'over_helpfulness',
    action: 'request_clarification',
    instructions: 'Request explicit confirmation for substituted values',
    maxRetries: 1,
    backoffMs: 500,
  },
  context_pollution: {
    archetype: 'context_pollution',
    action: 'context_reset',
    instructions: 'Clear irrelevant context and retry with focused information',
    maxRetries: 2,
    backoffMs: 1000,
  },
  fragile_execution: {
    archetype: 'fragile_execution',
    action: 'tool_validation',
    instructions: 'Validate tool call format and retry with strict schema adherence',
    maxRetries: 3,
    backoffMs: 500,
  },
};
