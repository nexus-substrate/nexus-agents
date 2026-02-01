/**
 * nexus-agents vote command types
 *
 * Type definitions for the consensus voting CLI command.
 *
 * (Source: Issue #212, Process Automation Epic #209)
 */

import type { ConsensusAlgorithm, Vote, ConsensusResult } from '../consensus/types.js';

/**
 * Options for the vote command.
 */
export interface VoteCommandOptions {
  readonly proposal: string;
  readonly threshold?: 'majority' | 'supermajority' | 'unanimous';
  /** Use simulated votes instead of LLM execution (maps from --dry-run CLI flag) */
  readonly dryRun?: boolean;
  readonly quick?: boolean;
  readonly verbose?: boolean;
  readonly createIssue?: boolean;
  readonly issueNumber?: number;
  /** Timeout per vote in milliseconds (default: 90000 per Issue #607) */
  readonly timeoutMs?: number;
}

/**
 * Voter agent role definitions.
 */
export type VoterRole = 'architect' | 'security' | 'devex' | 'ai_ml' | 'pm';

/**
 * Maps threshold names to consensus algorithms.
 */
export const THRESHOLD_MAP: Record<string, ConsensusAlgorithm> = {
  majority: 'simple_majority',
  supermajority: 'supermajority',
  unanimous: 'unanimous',
};

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
