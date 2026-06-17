/**
 * nexus-agents vote command types
 *
 * Type definitions for the consensus voting CLI command.
 *
 * (Source: Issue #212, Process Automation Epic #209)
 */

import type { ConsensusAlgorithm, Vote, ConsensusResult } from '../consensus/types.js';
import type { ErrorPolicy, VoteThreshold } from '../mcp/tools/consensus-vote-types.js';

/**
 * Options for the vote command.
 */
export interface VoteCommandOptions {
  readonly proposal: string;
  readonly threshold?: VoteThreshold;
  /** Use simulated votes instead of LLM execution (maps from --dry-run CLI flag) */
  readonly dryRun?: boolean;
  readonly quick?: boolean;
  readonly verbose?: boolean;
  readonly createIssue?: boolean;
  readonly issueNumber?: number;
  /** Timeout per vote in milliseconds (default: 90000 per Issue #607) */
  readonly timeoutMs?: number;
  /**
   * How to treat voters that errored or timed out (#2630). When undefined,
   * the same per-strategy default `executeVoting` uses applies:
   * `fail_closed` for unanimous, `reduce_denominator` otherwise.
   */
  readonly errorPolicy?: ErrorPolicy;
}

/**
 * Voter agent role definitions.
 *
 * `scope_steward` (#2185) was added 2026-04-25 to address a build-vs-buy
 * blind spot in the original 6-role panel: the panel approved a proposal
 * to build a USB-flasher CLI without flagging that Rufus already solves
 * the problem. The scope-steward role explicitly checks for existing tools
 * + biases toward "don't build."
 */
export type VoterRole =
  | 'architect'
  | 'security'
  | 'devex'
  | 'ai_ml'
  | 'pm'
  | 'catfish'
  | 'scope_steward';

/**
 * Agent role descriptions for prompt generation.
 */
export const VOTER_ROLES: Record<VoterRole, string> = {
  architect: 'Software Architect - evaluates technical design, scalability, and maintainability',
  security:
    'Security Engineer - evaluates security implications, vulnerabilities, and attack vectors',
  devex: 'Developer Experience - evaluates usability, documentation, and developer workflow',
  ai_ml: 'AI/ML Engineer - evaluates AI/ML aspects, model selection, and learning capabilities',
  pm: 'Product Manager - evaluates business value, user impact, and resource allocation',
  catfish:
    'Contrarian Analyst - deliberately challenges proposals to prevent agreement bias (arXiv:2505.21503)',
  scope_steward:
    'Scope Steward - asks whether to build at all; checks existing tools, biases toward kill-the-feature (#2185)',
};

/**
 * Individual agent vote with metadata.
 */
export interface AgentVoteResult {
  readonly role: VoterRole;
  readonly vote: Vote;
  readonly processingTimeMs: number;
  /**
   * Source of the vote:
   * - 'llm': Real LLM execution
   * - 'simulation': Fallback simulation (opt-in only)
   * - 'error': Error during execution (Issue #523)
   */
  readonly source: 'llm' | 'simulation' | 'error';
  /** CLI that executed this vote (for adaptive routing feedback). */
  readonly cli?: string | undefined;
  /**
   * Model id that executed this vote, when known (e.g. 'claude-sonnet'). Carried
   * so per-decision cost aggregation can attribute spend per model (#3855). Absent
   * for error/simulation votes that never reached a model.
   */
  readonly model?: string | undefined;
  /** Error message if vote fell back to simulation or encountered an error */
  readonly error?: string;
}

/**
 * Full voting result.
 */
export interface VotingResult {
  readonly proposal: string;
  readonly threshold: ConsensusAlgorithm;
  readonly result: ConsensusResult;
  readonly votes: readonly AgentVoteResult[];
  readonly totalTimeMs: number;
  /** Whether simulated votes were used instead of LLM execution */
  readonly simulateVotes: boolean;
}

/**
 * Vote verification hash for audit trail.
 */
export interface VoteHash {
  readonly role: VoterRole;
  readonly hash: string;
  readonly timestamp: string;
}
