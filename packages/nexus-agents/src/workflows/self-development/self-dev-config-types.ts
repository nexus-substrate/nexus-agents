/**
 * Self-Development Workflow Configuration Types
 *
 * Configuration and early phase type definitions (Analyze, Research).
 *
 * @module workflows/self-development/self-dev-config-types
 * (Source: docs/workflows/SELF_DEVELOPMENT_WORKFLOW.md)
 */

import type { TrinityConfig } from '../../agents/collaboration/trinity-types.js';
import type { ReflexionConfig } from '../../agents/collaboration/reflexion-types.js';
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
  /** Automatically merge PR after verification passes */
  readonly autoMerge?: boolean;
  /** Merge method for auto-merge (default: squash) */
  readonly mergeMethod?: 'merge' | 'squash' | 'rebase';
  /**
   * Fail immediately when dependencies are unavailable instead of using fallbacks.
   * When true, phases will throw errors if required dependencies (GitHub client,
   * TrinityCoordinator, ReflexionProtocol, ConsensusProtocol) are missing.
   * Default: false (use heuristic fallbacks)
   * (Source: Issue #455 - Fail-fast mode)
   */
  readonly failFast?: boolean;
  /** Phase-specific configurations */
  readonly phases?: PhaseConfigs;
}

/**
 * Extended configuration for PLAN phase with fail-safe option.
 * (Source: Issue #497 - Fail-safe planning)
 */
export interface SelfDevPlanConfig extends TrinityConfig {
  /**
   * Allow heuristic-based planning fallback when TrinityCoordinator is unavailable.
   * SECURITY WARNING: When true, returns a synthetic plan based on heuristics
   * instead of actual LLM-coordinated planning.
   * Default: false (fail with error if TrinityCoordinator unavailable)
   * (Source: Issue #497 - Fail-safe planning)
   */
  readonly allowHeuristicFallback?: boolean;
}

/**
 * Extended configuration for REFINE phase with fail-safe option.
 * (Source: Issue #503 - Fail-safe refinement)
 */
export interface SelfDevRefineConfig extends ReflexionConfig {
  /**
   * Allow heuristic-based critique fallback when ReflexionProtocol is unavailable.
   * SECURITY WARNING: When true, returns synthetic critiques based on heuristics
   * instead of actual multi-agent LLM critique.
   * Default: false (fail with error if ReflexionProtocol unavailable)
   * (Source: Issue #503 - Fail-safe refinement)
   */
  readonly allowHeuristicFallback?: boolean;
}

/**
 * Phase-specific configuration overrides.
 */
export interface PhaseConfigs {
  readonly analyze?: AnalyzeConfig;
  readonly research?: ResearchConfig;
  readonly plan?: SelfDevPlanConfig;
  readonly refine?: SelfDevRefineConfig;
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
  /**
   * Allow placeholder fallback when GitHub client is unavailable or API fails.
   * SECURITY WARNING: When true, returns a synthetic issue #0 with no real data.
   * This allows the workflow to continue without real issue input.
   * Default: false (fail with error if GitHub client unavailable)
   * (Source: Issue #496 - Fail-safe analysis)
   */
  readonly allowPlaceholderFallback?: boolean;
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
  /**
   * Allow heuristic-based research fallback when model adapter fails.
   * SECURITY WARNING: When true, returns synthetic research data based on
   * heuristics instead of actual LLM-generated analysis.
   * Default: false (fail with error if model call fails)
   * (Source: Issue #502 - Fail-safe research)
   */
  readonly allowHeuristicFallback?: boolean;
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
// Forward declarations for PhaseConfigs
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
  /**
   * Allow heuristic-based voting fallback when ConsensusProtocol is unavailable.
   * SECURITY WARNING: When true, votes are generated using rule-based criteria
   * analysis instead of actual agent LLM reasoning. This can lead to incorrect
   * decisions that don't account for nuanced concerns.
   * Default: false (fail with error if ConsensusProtocol unavailable)
   * (Source: Issue #501 - Fail-safe voting)
   */
  readonly allowHeuristicFallback?: boolean;
}

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
  /**
   * Allow placeholder fallback when model adapter fails.
   * SECURITY WARNING: When true, returns success=false with placeholder file list
   * from the plan instead of actual LLM-generated implementation.
   * Default: false (fail with error if model call fails)
   * (Source: Issue #504 - Fail-safe implementation)
   */
  readonly allowPlaceholderFallback?: boolean;
}

/**
 * Configuration for verification phase.
 */
export interface VerifyConfig {
  /** Coverage threshold (default: 80) */
  readonly coverageThreshold?: number;
  /** Timeout per check (default: 120000ms) */
  readonly checkTimeout?: number;
}
