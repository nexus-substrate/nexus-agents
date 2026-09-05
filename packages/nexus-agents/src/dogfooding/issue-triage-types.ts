/**
 * nexus-agents/dogfooding - Issue Triage Types
 *
 * Type definitions for automated GitHub issue triage using
 * the security pipeline (trust classification, corroboration,
 * reputation model).
 *
 * @module dogfooding/issue-triage-types
 * (Source: Issue #828 — Wire remaining security modules)
 */

import { z } from 'zod';
import type { ReputationAssessment } from '../security/reputation-model.js';

// ============================================================================
// Issue Metadata
// ============================================================================

/**
 * GitHub issue metadata from the API.
 */
export interface IssueMetadata {
  /** Issue number */
  readonly number: number;
  /** Issue title */
  readonly title: string;
  /** Issue body/description */
  readonly body: string;
  /** Author username */
  readonly author: string;
  /** GitHub API author_association (e.g., 'OWNER', 'COLLABORATOR', 'NONE') */
  readonly authorAssociation: string;
  /** Repository owner */
  readonly owner: string;
  /** Repository name */
  readonly repo: string;
  /** Issue URL */
  readonly url: string;
  /** Issue state ('open' | 'closed') */
  readonly state: string;
  /** Issue labels */
  readonly labels: readonly string[];
  /** Creation timestamp (ISO 8601) */
  readonly createdAt: string;
}

/**
 * GitHub issue comment from the API.
 */
export interface IssueComment {
  /** Comment ID */
  readonly id: number;
  /** Comment body */
  readonly body: string;
  /** Author username */
  readonly author: string;
  /** GitHub API author_association */
  readonly authorAssociation: string;
  /** Creation timestamp (ISO 8601) */
  readonly createdAt: string;
}

// ============================================================================
// Issue Classification
// ============================================================================

/**
 * Issue category determined by keyword-based classification.
 */
export type IssueCategory =
  'bug' | 'feature' | 'question' | 'documentation' | 'security' | 'performance';

/**
 * Display names for issue categories.
 */
export const CATEGORY_DISPLAY_NAMES: Record<IssueCategory, string> = {
  bug: 'Bug Report',
  feature: 'Feature Request',
  question: 'Question',
  documentation: 'Documentation',
  security: 'Security',
  performance: 'Performance',
};

/**
 * Emoji for issue categories (GitHub markdown).
 */
export const CATEGORY_EMOJI: Record<IssueCategory, string> = {
  bug: ':bug:',
  feature: ':sparkles:',
  question: ':question:',
  documentation: ':books:',
  security: ':lock:',
  performance: ':zap:',
};

// ============================================================================
// Triage Configuration
// ============================================================================

/**
 * Configuration for issue triage.
 */
export interface IssueTriageConfig {
  /** Whether to run in dry-run mode (no GitHub mutations). Default: true */
  readonly dryRun: boolean;
  /** GitHub token for API access */
  readonly githubToken?: string | undefined;
  /** Maximum comments to fetch per issue */
  readonly maxComments: number;
  /** Whether to use reputation model for trust assessment */
  readonly enableReputation: boolean;
}

/**
 * Default issue triage configuration.
 * Read-only by default — proposes actions without executing them.
 */
export const DEFAULT_ISSUE_TRIAGE_CONFIG: IssueTriageConfig = {
  dryRun: true,
  maxComments: 50,
  enableReputation: true,
};

/**
 * Zod schema for issue triage configuration.
 */
export const IssueTriageConfigSchema = z.object({
  dryRun: z.boolean().default(true),
  githubToken: z.string().optional(),
  maxComments: z.number().int().min(1).max(100).default(50),
  enableReputation: z.boolean().default(true),
});

// ============================================================================
// Proposed Actions
// ============================================================================

/**
 * A proposed action from the triage pipeline.
 * All actions are validated through the security pipeline before output.
 */
export interface ProposedAction {
  /** Action type (matches AgentActionType from security/action-schema) */
  readonly type: string;
  /** Human-readable description of the proposed action */
  readonly description: string;
  /** Whether this action was approved by the policy gate */
  readonly policyApproved: boolean;
  /** Whether corroboration requirements were satisfied */
  readonly corroborated: boolean;
  /** Details specific to the action type */
  readonly details: Record<string, unknown>;
}

// ============================================================================
// Trust Assessment
// ============================================================================

/**
 * Trust assessment summary for the triage result.
 */
export interface TrustAssessment {
  /** Author's trust tier (1-4) */
  readonly trustTier: string;
  /** Author's GitHub role */
  readonly userRole: string;
  /**
   * Whether the author is on the maintainer allowlist — present only when an
   * allowlist was consulted (#4992). Absent means "no allowlist was consulted",
   * which is the state on every live path today; it was previously recorded
   * as `false` without being measured.
   */
  readonly isAllowlisted?: boolean;
  /**
   * Whether a durable `AuditLogger` was configured for this process (#4992
   * review). `configured` — the trust event was handed to it; delivery to the
   * hash chain is subject to the logger's own severity filter (trust events
   * are `info`), queue and fail-loud flush, and is not confirmed per call.
   * `none` — no audit logger (audit disabled, or the CLI path), so the event
   * exists only in the firewall's in-memory trail.
   */
  readonly auditSink: 'configured' | 'none';
  /** Reputation score (0-100) if reputation model is enabled */
  readonly reputationScore?: number | undefined;
  /** Coverage of reputation dimensions; `unmeasured` is distinct from zero activity. */
  readonly coverage?: ReputationAssessment['coverage'] | undefined;
  /** Suspicious signals detected */
  readonly suspiciousSignals: readonly string[];
  /** Whether the author is flagged as suspicious */
  readonly isSuspicious: boolean;
  /**
   * Tier the policy gate ACTUALLY enforced (#3122). Equals `trustTier` under
   * `audit`/`off`; equals `reputationReconciledTier` under `enforce`. This is
   * the tier `proposedActions[].policyApproved` was decided against.
   */
  readonly enforcedTrustTier?: string | undefined;
  /**
   * Tier reputation reconciliation computed — what `enforce` mode WOULD gate on
   * (#3122). May exceed `trustTier` (more restrictive) when reputation demotes.
   * Under `audit`/`off` this is reported for telemetry but NOT enforced — read
   * `enforcedTrustTier` for the tier actually in effect.
   */
  readonly reputationReconciledTier?: string | undefined;
  /** Reputation-gating rollout mode applied: `off` | `audit` | `enforce` (#3122). */
  readonly gatingMode?: string | undefined;
}

// ============================================================================
// Triage Result
// ============================================================================

/**
 * Complete triage result for a GitHub issue.
 */
export interface IssueTriageResult {
  /** Issue number */
  readonly issueNumber: number;
  /** Repository (owner/repo) */
  readonly repository: string;
  /** Proposed actions (validated through security pipeline) */
  readonly proposedActions: readonly ProposedAction[];
  /** Trust assessment of the issue author */
  readonly trustAssessment: TrustAssessment;
  /** Detected issue category */
  readonly category: IssueCategory;
  /** Category confidence (0-1) */
  readonly categoryConfidence: number;
  /** Total execution time in ms */
  readonly totalDurationMs: number;
  /** Timestamp of triage (ISO 8601) */
  readonly timestamp: string;
}
