/**
 * nexus-agents/agents - Expert Selector Types
 *
 * Shared types for expert selection to avoid circular dependencies.
 *
 * @module agents/experts/expert-selector-types
 */

import { z } from 'zod';
import type { AgentRole } from '../../core/index.js';
import type { TaskDomain } from './task-analyzer.js';

// ============================================================================
// Collaboration Patterns
// ============================================================================

/** Collaboration patterns for multi-expert tasks. */
export const ExpertCollaborationPattern = {
  SEQUENTIAL: 'sequential',
  PARALLEL: 'parallel',
  REVIEW_CHAIN: 'review_chain',
  PAIR: 'pair',
} as const;

export type ExpertCollaborationPatternType =
  (typeof ExpertCollaborationPattern)[keyof typeof ExpertCollaborationPattern];

// ============================================================================
// Expert Definition Types
// ============================================================================

/**
 * Definition of an expert's capabilities and metadata.
 */
export interface ExpertDefinition {
  /** Unique expert identifier */
  id: string;
  /** Expert role type */
  role: AgentRole;
  /** Human-readable name */
  name: string;
  /** Description of expert's specialty */
  description: string;
  /** Core capabilities */
  capabilities: string[];
  /** Primary domain of expertise */
  primaryDomain: TaskDomain;
  /** Additional domains the expert can handle */
  secondaryDomains: TaskDomain[];
  /** Base weight for scoring (0-1) */
  weight: number;
  /** Whether the expert is currently available */
  available: boolean;
}

/** Registry of available experts. */
export interface ExpertRegistry {
  getAll(): ExpertDefinition[];
  getById(id: string): ExpertDefinition | undefined;
  getByRole(role: AgentRole): ExpertDefinition[];
  getByDomain(domain: TaskDomain): ExpertDefinition[];
  getAvailable(): ExpertDefinition[];
}

/**
 * Breakdown of how the match score was calculated.
 */
export interface ScoreBreakdown {
  /** Score from capability matching (0-1) */
  capabilityScore: number;
  /** Score from domain alignment (0-1) */
  domainScore: number;
  /** Score from weight adjustment (0-1) */
  weightScore: number;
  /** Combined final score (0-1) */
  finalScore: number;
}

/**
 * Match result for a single expert.
 */
export interface ExpertMatch {
  /** Expert identifier */
  expertId: string;
  /** Match score (0-1) */
  score: number;
  /** Capabilities that matched the task */
  matchedCapabilities: string[];
  /** Human-readable reasoning for the match */
  reasoning: string;
  /** Breakdown of score components */
  scoreBreakdown: ScoreBreakdown;
}

/** Result of expert selection. */
export interface SelectionResult {
  primary: ExpertMatch;
  alternatives: ExpertMatch[];
  requiresCollaboration: boolean;
  suggestedPattern?: ExpertCollaborationPatternType;
  confidence: number;
}

/** Options for expert selection. */
export interface SelectionOptions {
  minScore?: number;
  maxAlternatives?: number;
  capabilityWeights?: Record<string, number>;
  preferredDomains?: TaskDomain[];
  excludeExperts?: string[];
  forceCollaboration?: boolean;
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const ScoreBreakdownSchema = z.object({
  capabilityScore: z.number().min(0).max(1),
  domainScore: z.number().min(0).max(1),
  weightScore: z.number().min(0).max(1),
  finalScore: z.number().min(0).max(1),
});

export const ExpertMatchSchema = z.object({
  expertId: z.string().min(1),
  score: z.number().min(0).max(1),
  matchedCapabilities: z.array(z.string()),
  reasoning: z.string(),
  scoreBreakdown: ScoreBreakdownSchema,
});

export const SelectionResultSchema = z.object({
  primary: ExpertMatchSchema,
  alternatives: z.array(ExpertMatchSchema),
  requiresCollaboration: z.boolean(),
  suggestedPattern: z.enum(['sequential', 'parallel', 'review_chain', 'pair']).optional(),
  confidence: z.number().min(0).max(1),
});

export const SelectionOptionsSchema = z.object({
  minScore: z.number().min(0).max(1).optional(),
  maxAlternatives: z.number().min(0).max(10).optional(),
  capabilityWeights: z.record(z.number().min(0).max(10)).optional(),
  preferredDomains: z
    .array(z.enum(['code', 'security', 'architecture', 'documentation', 'testing', 'general']))
    .optional(),
  excludeExperts: z.array(z.string()).optional(),
  forceCollaboration: z.boolean().optional(),
});
