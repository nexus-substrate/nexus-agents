/**
 * nexus-agents/cli - Research Index Types
 *
 * Type definitions for the research index CLI command.
 *
 * @see Issue #367 - Deterministic RESEARCH_INDEX.md generation
 */

import type { CommandResult } from '../core/index.js';

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
 * Extends CommandResult base pattern (Issue #584).
 */
export interface ResearchIndexResult extends CommandResult {
  /** Always present - human-readable message */
  readonly message: string;
  /** Exit code for CLI */
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
