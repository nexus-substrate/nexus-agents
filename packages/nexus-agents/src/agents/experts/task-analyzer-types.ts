/**
 * nexus-agents/agents - Task Analyzer Types
 *
 * Type definitions for task analysis.
 */

import { z } from 'zod';
import { NexusError, ErrorCode } from '../../core/index.js';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when task analysis fails.
 */
export class AnalysisError extends NexusError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message, { code: ErrorCode.VALIDATION_ERROR, ...options });
    this.name = 'AnalysisError';
  }
}

// ============================================================================
// Types and Constants
// ============================================================================

/**
 * Task domains for expert matching.
 */
export const TaskDomain = {
  CODE: 'code',
  SECURITY: 'security',
  ARCHITECTURE: 'architecture',
  DOCUMENTATION: 'documentation',
  TESTING: 'testing',
  INFRASTRUCTURE: 'infrastructure',
  GENERAL: 'general',
} as const;

export type TaskDomain = (typeof TaskDomain)[keyof typeof TaskDomain];

/**
 * Task complexity levels.
 */
export const TaskComplexity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;

export type TaskComplexity = (typeof TaskComplexity)[keyof typeof TaskComplexity];

/**
 * Result of analyzing a task for expert matching.
 */
export interface TaskAnalysisResult {
  /** Primary domain of the task */
  domain: TaskDomain;
  /** Task complexity level */
  complexity: TaskComplexity;
  /** Required capabilities for the task */
  requiredCapabilities: string[];
  /** Keywords extracted from the task */
  keywords: string[];
  /** Estimated effort on 1-10 scale */
  estimatedEffort: number;
  /** Secondary domains if task spans multiple areas */
  secondaryDomains: TaskDomain[];
  /** Confidence in the analysis (0-1) */
  confidence: number;
}

/**
 * Zod schema for TaskAnalysisResult.
 */
export const TaskAnalysisResultSchema = z.object({
  domain: z.enum([
    'code',
    'security',
    'architecture',
    'documentation',
    'testing',
    'infrastructure',
    'general',
  ]),
  complexity: z.enum(['low', 'medium', 'high']),
  requiredCapabilities: z.array(z.string()),
  keywords: z.array(z.string()),
  estimatedEffort: z.number().min(1).max(10),
  secondaryDomains: z.array(
    z.enum([
      'code',
      'security',
      'architecture',
      'documentation',
      'testing',
      'infrastructure',
      'general',
    ])
  ),
  confidence: z.number().min(0).max(1),
});
