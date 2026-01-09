/**
 * Self-Development Workflow Types
 *
 * Type definitions for the meta-workflow that enables nexus-agents
 * to analyze issues, plan implementations, achieve consensus, and
 * execute code changes with human oversight.
 *
 * @module workflows/self-development/types
 * (Source: docs/workflows/SELF_DEVELOPMENT_WORKFLOW.md)
 */

import type { TrinityResult, TrinityConfig } from '../../agents/collaboration/trinity-types.js';
import type {
  ReflexionConfig,
  ReflexionResult,
} from '../../agents/collaboration/reflexion-types.js';
import type { VoteMessage } from '../../agents/collaboration/collaboration-types.js';
import type { SelfDebugConfig } from '../../agents/collaboration/self-debug-types.js';
import type { SelfRefineConfig } from '../../agents/collaboration/self-refine-protocol.js';

// =============================================================================
// Workflow Configuration
// =============================================================================

/**
 * Configuration for the self-development workflow.
 */
export interface SelfDevWorkflowConfig {
  /** GitHub repository in owner/repo format */
  readonly repository: string;
  /** Working directory for git and shell operations (defaults to cwd) */
  readonly workingDirectory?: string;
  /** Labels to filter issues by */
  readonly issueLabels?: string[];
  /** Labels to exclude from consideration */
  readonly excludeLabels?: string[];
  /** Maximum issues to analyze */
  readonly maxIssues?: number;
  /** Automatically create branch and PR */
  readonly autoCommit?: boolean;
  /** Phase-specific configurations */
  readonly phases?: PhaseConfigs;
}

/**
 * Phase-specific configuration overrides.
 */
export interface PhaseConfigs {
  readonly analyze?: AnalyzeConfig;
  readonly research?: ResearchConfig;
  readonly plan?: TrinityConfig;
  readonly refine?: ReflexionConfig;
  readonly vote?: VoteConfig;
  readonly implement?: ImplementConfig;
  readonly verify?: VerifyConfig;
}

// =============================================================================
// Phase 1: ANALYZE
// =============================================================================

/**
 * Configuration for issue analysis phase.
 */
export interface AnalyzeConfig {
  /** Timeout for analysis (default: 60000ms) */
  readonly timeout?: number;
  /** Scoring weights */
  readonly scoring?: PriorityScoringWeights;
}

/**
 * Weights for priority scoring formula.
 */
export interface PriorityScoringWeights {
  /** Weight for alignment with project goals (default: 3) */
  readonly alignmentWeight: number;
  /** Weight for urgency (default: 2) */
  readonly urgencyWeight: number;
  /** Weight for feasibility (default: 2) */
  readonly feasibilityWeight: number;
  /** Penalty for risk (default: 1.5) */
  readonly riskPenalty: number;
  /** Penalty for complexity (default: 0.5) */
  readonly complexityPenalty: number;
}

/**
 * Analyzed GitHub issue.
 */
export interface AnalyzedIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly labels: string[];
  readonly priorityScore: number;
  readonly complexity: 1 | 2 | 3 | 4 | 5;
  readonly estimatedEffort: string;
  readonly dependencies: string[];
  readonly risks: string[];
  readonly keywords: string[];
  readonly topics: string[];
  readonly type: 'bug' | 'enhancement' | 'architecture' | 'security' | 'tech-debt';
}

/**
 * Output from analysis phase.
 */
export interface AnalyzeOutput {
  readonly prioritizedIssues: AnalyzedIssue[];
  readonly selectedIssue: AnalyzedIssue;
  readonly selectionRationale: string;
  readonly durationMs: number;
}

// =============================================================================
// Phase 2: RESEARCH
// =============================================================================

/**
 * Configuration for research phase.
 */
export interface ResearchConfig {
  /** Timeout per research agent (default: 60000ms) */
  readonly agentTimeout?: number;
  /** Maximum papers to retrieve */
  readonly maxPapers?: number;
  /** Search depth for codebase */
  readonly codebaseSearchDepth?: number;
}

/**
 * Findings from codebase research.
 */
export interface CodebaseFindings {
  readonly relevantFiles: string[];
  readonly existingPatterns: string[];
  readonly interfaces: string[];
  readonly testPatterns: string[];
}

/**
 * Findings from academic research.
 */
export interface AcademicFindings {
  readonly papers: {
    readonly arxivId: string;
    readonly title: string;
    readonly relevance: string;
    readonly techniques: string[];
  }[];
}

/**
 * Findings from documentation search.
 */
export interface DocFindings {
  readonly officialDocs: string[];
  readonly bestPractices: string[];
  readonly relatedGuides: string[];
}

/**
 * Findings from Git history.
 */
export interface HistoryFindings {
  readonly relatedIssues: number[];
  readonly relatedPRs: number[];
  readonly previousAttempts: string[];
  readonly relevantCommits: string[];
}

/**
 * Output from research phase.
 */
export interface ResearchOutput {
  readonly codebase: CodebaseFindings;
  readonly academic: AcademicFindings;
  readonly docs: DocFindings;
  readonly history: HistoryFindings;
  readonly synthesizedContext: string;
  readonly durationMs: number;
}

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
 * Configuration for voting phase.
 */
export interface VoteConfig {
  /** Minimum votes required (default: 4) */
  readonly minVotes?: number;
  /** Require unanimous approval */
  readonly requireUnanimous?: boolean;
  /** Timeout for voting (default: 60000ms) */
  readonly timeout?: number;
}

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
 * Configuration for implementation phase.
 */
export interface ImplementConfig {
  readonly selfRefine?: SelfRefineConfig;
  readonly selfDebug?: SelfDebugConfig;
  /** Commands for code verification */
  readonly verifyCommands?: {
    readonly typecheck: string;
    readonly lint: string;
    readonly test: string;
  };
}

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
 * Configuration for verification phase.
 */
export interface VerifyConfig {
  /** Coverage threshold (default: 80) */
  readonly coverageThreshold?: number;
  /** Timeout per check (default: 120000ms) */
  readonly checkTimeout?: number;
}

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

// =============================================================================
// Workflow State & Results
// =============================================================================

/**
 * Current phase of the workflow.
 */
export type WorkflowPhase =
  | 'analyze'
  | 'research'
  | 'plan'
  | 'refine'
  | 'vote'
  | 'review'
  | 'implement'
  | 'verify'
  | 'commit';

/**
 * Workflow checkpoint for recovery.
 */
export interface WorkflowCheckpoint {
  readonly phase: WorkflowPhase;
  readonly timestamp: string;
  readonly inputs: unknown;
  readonly outputs: unknown;
  readonly status: 'completed' | 'failed' | 'skipped' | 'pending';
}

/**
 * Full workflow state.
 */
export interface SelfDevWorkflowState {
  readonly executionId: string;
  readonly config: SelfDevWorkflowConfig;
  readonly currentPhase: WorkflowPhase;
  readonly checkpoints: WorkflowCheckpoint[];
  readonly startedAt: string;
  readonly status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
}

/**
 * Workflow metrics.
 */
export interface SelfDevWorkflowMetrics {
  /** Total duration in ms */
  readonly totalDurationMs: number;
  /** Duration per phase */
  readonly phaseDurations: Record<WorkflowPhase, number>;
  /** Protocol iterations */
  readonly trinityIterations: number;
  readonly reflexionIterations: number;
  readonly selfDebugIterations: number;
  readonly selfRefineIterations: number;
  /** Quality metrics */
  readonly finalSeverity: number;
  readonly testCoverage: number;
  /** Consensus metrics */
  readonly approvalRate: number;
  readonly vetoCount: number;
  /** Human metrics */
  readonly humanReviewTime: number;
  readonly humanRevisions: number;
}

/**
 * Final workflow result.
 */
export interface SelfDevWorkflowResult {
  readonly executionId: string;
  readonly success: boolean;
  readonly phase: WorkflowPhase;
  readonly outputs: {
    readonly analyze?: AnalyzeOutput;
    readonly research?: ResearchOutput;
    readonly plan?: PlanOutput;
    readonly refine?: RefineOutput;
    readonly vote?: VoteOutput;
    readonly review?: ReviewOutput;
    readonly implement?: ImplementOutput;
    readonly verify?: VerifyOutput;
    readonly commit?: CommitOutput;
  };
  readonly metrics: SelfDevWorkflowMetrics;
  readonly error?: string;
}

// =============================================================================
// Workflow Engine Interface
// =============================================================================

/**
 * Interface for the self-development workflow engine.
 */
export interface ISelfDevWorkflowEngine {
  /**
   * Start a new self-development workflow.
   */
  start(config: SelfDevWorkflowConfig): Promise<SelfDevWorkflowState>;

  /**
   * Resume a paused workflow from checkpoint.
   */
  resume(executionId: string): Promise<SelfDevWorkflowState>;

  /**
   * Get current workflow state.
   */
  getState(executionId: string): SelfDevWorkflowState | undefined;

  /**
   * Cancel a running workflow.
   */
  cancel(executionId: string, reason: string): Promise<void>;

  /**
   * Submit human review decision.
   */
  submitReview(executionId: string, decision: HumanDecision, feedback?: string): Promise<void>;

  /**
   * Get workflow result (only available when completed).
   */
  getResult(executionId: string): SelfDevWorkflowResult | undefined;
}
