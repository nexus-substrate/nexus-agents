/**
 * nexus-agents/agents - TechLead Types and Schemas
 *
 * Type definitions and Zod schemas for TechLead agent functionality.
 * Includes subtask, expert selection, and synthesis types.
 */

import { z } from 'zod';
import type { AgentRole } from '../core/index.js';
import type { ICTMConfig } from './ictm/ictm-types.js';
import { ICTMConfigSchema } from './ictm/ictm-types.js';

/**
 * Subtask priority levels.
 */
export type SubtaskPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Subtask status.
 */
export type SubtaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed';

/**
 * A subtask broken down from the main task.
 */
export interface SubTask {
  /** Unique subtask identifier */
  id: string;
  /** Parent task ID */
  parentTaskId: string;
  /** Description of what needs to be done */
  description: string;
  /** Expected output format or type */
  expectedOutput: string;
  /** Dependencies on other subtasks (by ID) */
  dependencies: string[];
  /** Priority level */
  priority: SubtaskPriority;
  /** Current status */
  status: SubtaskStatus;
  /** Assigned expert role (if any) */
  assignedRole?: AgentRole;
  /** Estimated complexity (1-10) */
  complexity: number;
  /** Required capabilities for this subtask */
  requiredCapabilities: string[];
}

/**
 * Result of task analysis.
 */
export interface TaskAnalysis {
  /** Task ID being analyzed */
  taskId: string;
  /** Overall complexity score (1-10) */
  complexity: number;
  /** Type of task (code, architecture, documentation, etc.) */
  taskType: string;
  /** Key requirements extracted from the task */
  requirements: string[];
  /** Identified risks or challenges */
  risks: string[];
  /** Whether task needs decomposition */
  needsDecomposition: boolean;
  /** Recommended approach */
  approach: string;
  /** Estimated total effort in relative units */
  estimatedEffort: number;
}

/**
 * Expert assignment for a subtask.
 */
export interface ExpertAssignment {
  /** Subtask ID */
  subtaskId: string;
  /** Assigned expert role */
  expertRole: AgentRole;
  /** Reason for selection */
  selectionReason: string;
  /** Confidence in the assignment (0-1) */
  confidence: number;
  /** ICTM configuration for dynamic sub-agent creation (Issue #756) */
  ictmConfig?: ICTMConfig;
}

/**
 * Collaboration metadata for synthesis (Issue #488).
 */
export interface CollaborationMetadata {
  /** Session ID from collaboration protocol */
  sessionId: string;
  /** Protocol pattern used */
  pattern: string;
  /** Number of participants */
  participantCount: number;
  /** Agreement level (0-1) */
  agreementLevel: number;
}

/**
 * Synthesis of multiple task results.
 */
export interface SynthesizedResult {
  /** Combined output from all results */
  combinedOutput: string;
  /** Summary of the synthesis process */
  summary: string;
  /** Individual result summaries */
  resultSummaries: ResultSummary[];
  /** Any conflicts detected between results */
  conflicts: Conflict[];
  /** Overall quality assessment */
  qualityScore: number;
  /** Recommendations for follow-up */
  recommendations: string[];
  /** Collaboration metadata if collaborative synthesis was used (Issue #488) */
  collaborationMetadata?: CollaborationMetadata | undefined;
}

/**
 * Summary of a single result.
 */
export interface ResultSummary {
  /** Subtask ID */
  subtaskId: string;
  /** Brief summary of the output */
  summary: string;
  /** Quality of this result (0-1) */
  quality: number;
  /** Key contributions to final output */
  contributions: string[];
}

/**
 * Conflict between results.
 */
export interface Conflict {
  /** First subtask ID */
  subtaskId1: string;
  /** Second subtask ID */
  subtaskId2: string;
  /** Description of the conflict */
  description: string;
  /** How the conflict was resolved */
  resolution: string;
}

/**
 * Options for the Orchestrator agent (coordination, decomposition, delegation).
 *
 * @remarks
 * Renamed from TechLeadOptions in Issue #759.
 * The old name is retained as a deprecated type alias.
 */
export interface OrchestratorOptions {
  /** Maximum number of subtasks to create */
  maxSubtasks?: number;
  /** Minimum complexity to trigger decomposition */
  decompositionThreshold?: number;
  /** Enable parallel execution hints */
  enableParallelHints?: boolean;
  /** Custom expert selection weights */
  expertWeights?: Partial<Record<AgentRole, number>>;
}

/**
 * Zod schema for SubtaskPriority.
 */
export const SubtaskPrioritySchema = z.enum(['critical', 'high', 'medium', 'low']);

/**
 * Zod schema for SubtaskStatus.
 */
export const SubtaskStatusSchema = z.enum([
  'pending',
  'assigned',
  'in_progress',
  'completed',
  'failed',
]);

/**
 * Zod schema for SubTask.
 */
export const SubTaskSchema = z.object({
  id: z.string().min(1, 'Subtask ID is required'),
  parentTaskId: z.string().min(1, 'Parent task ID is required'),
  description: z.string().min(1, 'Description is required'),
  expectedOutput: z.string().min(1, 'Expected output is required'),
  dependencies: z.array(z.string()),
  priority: SubtaskPrioritySchema,
  status: SubtaskStatusSchema,
  assignedRole: z
    .enum([
      'orchestrator',
      'tech_lead', // @deprecated - use 'orchestrator'
      'code_expert',
      'architecture_expert',
      'security_expert',
      'documentation_expert',
      'testing_expert',
      'custom',
    ])
    .optional(),
  complexity: z.number().min(1).max(10),
  requiredCapabilities: z.array(z.string()),
});

/**
 * Zod schema for TaskAnalysis.
 */
/**
 * Zod schema for TaskAnalysis.
 * Uses coercion and transforms for numeric fields because LLMs
 * may return numbers as strings or descriptive words (Issue #663).
 */
export const TaskAnalysisSchema = z.object({
  taskId: z.string().min(1),
  complexity: z.union([z.number(), z.string()]).transform((v) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 5;
  }),
  taskType: z.string().min(1),
  requirements: z.array(z.string()),
  risks: z.array(z.string()),
  needsDecomposition: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true')),
  approach: z.string().min(1),
  estimatedEffort: z.union([z.number(), z.string()]).transform((v) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? Math.max(0, n) : 5;
  }),
});

/**
 * Zod schema for ExpertAssignment.
 */
export const ExpertAssignmentSchema = z.object({
  subtaskId: z.string().min(1),
  expertRole: z.enum([
    'orchestrator',
    'tech_lead', // @deprecated - use 'orchestrator'
    'code_expert',
    'architecture_expert',
    'security_expert',
    'documentation_expert',
    'testing_expert',
    'custom',
  ]),
  selectionReason: z.string().min(1),
  confidence: z.number().min(0).max(1),
  ictmConfig: ICTMConfigSchema.optional(),
});

/**
 * Zod schema for ResultSummary.
 */
export const ResultSummarySchema = z.object({
  subtaskId: z.string().min(1),
  summary: z.string().min(1),
  quality: z.number().min(0).max(1),
  contributions: z.array(z.string()),
});

/**
 * Zod schema for Conflict.
 */
export const ConflictSchema = z.object({
  subtaskId1: z.string().min(1),
  subtaskId2: z.string().min(1),
  description: z.string().min(1),
  resolution: z.string().min(1),
});

/**
 * Zod schema for CollaborationMetadata (Issue #488).
 */
export const CollaborationMetadataSchema = z.object({
  sessionId: z.string(),
  pattern: z.string(),
  participantCount: z.number(),
  agreementLevel: z.number().min(0).max(1),
});

/**
 * Zod schema for SynthesizedResult.
 */
export const SynthesizedResultSchema = z.object({
  combinedOutput: z.string(),
  summary: z.string().min(1),
  resultSummaries: z.array(ResultSummarySchema),
  conflicts: z.array(ConflictSchema),
  qualityScore: z.number().min(0).max(1),
  recommendations: z.array(z.string()),
  collaborationMetadata: CollaborationMetadataSchema.optional(),
});

/**
 * Zod schema for OrchestratorOptions.
 */
export const OrchestratorOptionsSchema = z.object({
  maxSubtasks: z.number().min(1).max(20).optional(),
  decompositionThreshold: z.number().min(1).max(10).optional(),
  enableParallelHints: z.boolean().optional(),
  expertWeights: z.record(z.number().min(0).max(10)).optional(),
});

/**
 * Expert role capabilities mapping.
 * Maps each expert role to their core capabilities.
 */
export const EXPERT_CAPABILITIES: Readonly<Record<AgentRole, readonly string[]>> = {
  orchestrator: ['task_execution', 'delegation', 'collaboration', 'research'],
  tech_lead: ['task_execution', 'delegation', 'collaboration', 'research'], // @deprecated - same as orchestrator
  code_expert: ['task_execution', 'code_generation', 'code_review', 'tool_use'],
  architecture_expert: ['task_execution', 'research', 'collaboration'],
  security_expert: ['task_execution', 'code_review', 'research'],
  documentation_expert: ['task_execution', 'research'],
  testing_expert: ['task_execution', 'code_generation', 'tool_use'],
  devops_expert: ['task_execution', 'code_generation', 'tool_use', 'collaboration'],
  research_expert: ['task_execution', 'research', 'tool_use'],
  pm_expert: ['task_execution', 'collaboration', 'research'],
  ux_expert: ['task_execution', 'collaboration', 'research'],
  infrastructure_expert: ['task_execution', 'code_generation', 'tool_use', 'collaboration'],
  custom: ['task_execution'],
  // TRINITY roles (arXiv:2512.04695)
  thinker: ['task_execution', 'research', 'collaboration'],
  worker: ['task_execution', 'code_generation', 'tool_use'],
  verifier: ['task_execution', 'code_review', 'research'],
};

/**
 * Task type to expert role mapping.
 * Maps common task types to their primary expert roles.
 */
export const TASK_TYPE_EXPERTS: Readonly<Record<string, AgentRole>> = {
  implementation: 'code_expert',
  refactoring: 'code_expert',
  code_review: 'code_expert',
  architecture: 'architecture_expert',
  design: 'architecture_expert',
  security_audit: 'security_expert',
  vulnerability: 'security_expert',
  documentation: 'documentation_expert',
  api_docs: 'documentation_expert',
  testing: 'testing_expert',
  test_coverage: 'testing_expert',
  general: 'code_expert',
};
