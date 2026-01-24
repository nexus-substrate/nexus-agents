/**
 * nexus-agents/cli - Research Index Types
 *
 * Type definitions for the research index CLI command.
 *
 * @see Issue #367 - Deterministic RESEARCH_INDEX.md generation
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Research index command action.
 */
export type ResearchIndexAction = 'generate' | 'validate' | 'check';

/**
 * Options for the research index command.
 */
export interface ResearchIndexOptions {
  /** Action to perform */
  readonly action: ResearchIndexAction;
  /** Output path for generate action */
  readonly output?: string;
  /** Output format for validate action */
  readonly format?: 'text' | 'json';
  /** Treat warnings as errors in validate */
  readonly strict?: boolean;
  /** Check integration file existence */
  readonly checkFiles?: boolean;
  /** Silent mode (only exit code) */
  readonly silent?: boolean;
}

/**
 * Result of the research index command.
 */
export interface ResearchIndexResult {
  readonly success: boolean;
  readonly message: string;
  readonly exitCode: number;
}

/**
 * Mutable state for parsing research index arguments.
 * @internal
 */
export interface ParseState {
  action: ResearchIndexAction;
  output: string | undefined;
  format: 'text' | 'json';
  strict: boolean;
  checkFiles: boolean;
  silent: boolean;
}
