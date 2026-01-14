/**
 * Self-Development Workflow Phase Types
 *
 * Type definitions for Plan, Refine, Vote, Review, Implement, Verify, and Commit phases.
 *
 * @module workflows/self-development/self-dev-phase-types
 * (Source: docs/workflows/SELF_DEVELOPMENT_WORKFLOW.md)
 */

import type { TrinityResult } from '../../agents/collaboration/trinity-types.js';
import type { ReflexionResult } from '../../agents/collaboration/reflexion-types.js';
import type { VoteMessage } from '../../agents/collaboration/collaboration-types.js';
import type { AnalyzedIssue } from './self-dev-config-types.js';

// =============================================================================
// Phase 3: PLAN (TRINITY)
// =============================================================================

/**
 * Implementation plan from TRINITY planning phase.
 */
export interface ImplementationPlan {
  readonly problemAnalysis: string;
  readonly successCriteria: string[];
  readonly files: FileChange[];
  readonly interfaces: string[];
  readonly dependencies: string[];
  readonly testPlan: string;
  readonly migrationSteps?: string[];
}

/**
 * File change specification.
 */
export interface FileChange {
  readonly path: string;
  readonly action: 'create' | 'modify' | 'delete';
  readonly description: string;
  readonly estimatedLines?: number;
}

/**
 * Output from planning phase.
 */
export interface PlanOutput {
  readonly trinityResult: TrinityResult;
  readonly plan: ImplementationPlan;
  readonly iterations: number;
  readonly verified: boolean;
  readonly durationMs: number;
}

// =============================================================================
// Phase 4: REFINE (Reflexion)
// =============================================================================

/**
 * Persona definition for multi-agent reflexion.
 */
export interface SelfDevPersona {
  readonly id: string;
  readonly role: string;
  readonly focusAreas: string[];
  readonly weight: number;
}

/**
 * Default personas for self-development refinement.
 */
export const SELF_DEV_PERSONAS: readonly SelfDevPersona[] = [
  {
    id: 'architect',
    role: 'Software Architect',
    focusAreas: ['design_quality', 'patterns', 'modularity', 'scalability'],
    weight: 0.25,
  },
  {
    id: 'security',
    role: 'Security Engineer',
    focusAreas: ['vulnerabilities', 'input_validation', 'secrets', 'access_control'],
    weight: 0.25,
  },
  {
    id: 'tester',
    role: 'QA Engineer',
    focusAreas: ['testability', 'coverage', 'edge_cases', 'regression'],
    weight: 0.2,
  },
  {
    id: 'devex',
    role: 'Developer Experience',
    focusAreas: ['usability', 'documentation', 'ergonomics', 'error_messages'],
    weight: 0.15,
  },
  {
    id: 'maintainer',
    role: 'Maintainer',
    focusAreas: ['tech_debt', 'long_term', 'upgrades', 'compatibility'],
    weight: 0.15,
  },
] as const;

/**
 * Critique from a persona.
 */
export interface PersonaCritique {
  readonly personaId: string;
  readonly role: string;
  readonly issues: string[];
  readonly suggestions: string[];
  readonly severity: number;
}

/**
 * Output from refinement phase.
 */
export interface RefineOutput {
  readonly reflexionResult: ReflexionResult;
  readonly refinedPlan: ImplementationPlan;
  readonly critiques: PersonaCritique[];
  readonly iterations: number;
  readonly converged: boolean;
  readonly finalSeverity: number;
  readonly durationMs: number;
}

// =============================================================================
// Phase 5: VOTE (Consensus)
// =============================================================================

/**
 * Voting thresholds by change type.
 */
export const VOTE_THRESHOLDS: Record<AnalyzedIssue['type'], number> = {
  bug: 0.5, // Simple majority
  enhancement: 0.8, // Supermajority
  architecture: 1.0, // Unanimous
  security: 0.8, // Supermajority + Security approve
  'tech-debt': 0.6, // Majority
} as const;

/**
 * Extended vote with agent metadata.
 */
export interface AgentVote extends VoteMessage {
  readonly agentRole: string;
  readonly hasVetoPower: boolean;
}

/**
 * Output from voting phase.
 */
export interface VoteOutput {
  readonly votes: AgentVote[];
  readonly approvalCount: number;
  readonly rejectCount: number;
  readonly abstainCount: number;
  readonly consensus: boolean;
  readonly vetoExercised: boolean;
  readonly vetoReason?: string;
  readonly verdict: 'APPROVED' | 'REJECTED' | 'REQUIRES_REVISION';
  readonly durationMs: number;
}

// =============================================================================
// Phase 6: REVIEW (Human Checkpoint)
// =============================================================================

/**
 * Human review request.
 */
export interface ReviewRequest {
  readonly issue: AnalyzedIssue;
  readonly plan: ImplementationPlan;
  readonly voteResult: VoteOutput;
  readonly estimatedImpact: ImpactAssessment;
  readonly formattedMessage: string;
}

/**
 * Impact assessment for human review.
 */
export interface ImpactAssessment {
  readonly filesChanged: number;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly testsAdded: number;
  readonly riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Human decision on review.
 */
export type HumanDecision = 'approved' | 'rejected' | 'revision_requested';

/**
 * Output from review phase.
 */
export interface ReviewOutput {
  readonly decision: HumanDecision;
  readonly feedback?: string;
  readonly timestamp: string;
  readonly reviewerId?: string;
  readonly durationMs: number;
}

// =============================================================================
// Phase 7: IMPLEMENT (Self-Debug + Self-Refine)
// =============================================================================

/**
 * Output from implementation phase.
 */
export interface ImplementOutput {
  readonly filesCreated: string[];
  readonly filesModified: string[];
  readonly selfRefineIterations: number;
  readonly selfDebugIterations: number;
  readonly success: boolean;
  readonly failedFiles?: FailedFile[];
  readonly summary: string;
  readonly durationMs: number;
}

/**
 * File that failed implementation.
 */
export interface FailedFile {
  readonly path: string;
  readonly error: string;
  readonly phase: 'self-refine' | 'self-debug';
  readonly iterations: number;
}

// =============================================================================
// Phase 8: VERIFY
// =============================================================================

/**
 * Single verification check result.
 */
export interface VerifyCheck {
  readonly name: string;
  readonly command: string;
  readonly passed: boolean;
  readonly output?: string;
  readonly durationMs: number;
}

/**
 * Output from verification phase.
 */
export interface VerifyOutput {
  readonly checks: VerifyCheck[];
  readonly allPassed: boolean;
  readonly coverage: number;
  readonly failureReport?: string;
  readonly durationMs: number;
}

// =============================================================================
// Phase 9: COMMIT
// =============================================================================

/**
 * Output from commit phase.
 */
export interface CommitOutput {
  readonly branch: string;
  readonly commitSha: string;
  readonly prNumber: number;
  readonly prUrl: string;
  readonly status: 'created' | 'merged' | 'closed';
  readonly durationMs: number;
}
