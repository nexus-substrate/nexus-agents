/**
 * @nexus-agents/agents - Expert Selector Types
 *
 * Shared types for expert selection to avoid circular dependencies.
 */

import type { AgentRole } from '../../core/index.js';
import type { TaskDomain } from './task-analyzer.js';

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
