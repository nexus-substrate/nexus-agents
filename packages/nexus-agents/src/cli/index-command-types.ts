/**
 * nexus-agents/cli - Index Command Types
 *
 * Type definitions for the codebase index CLI command.
 *
 * @module cli/index-command-types
 * (Source: Issue #240, extracted from index-command.ts for #272)
 */

import type { OutputFormat } from '../indexer/index.js';

/** Subcommand for the index CLI. */
export type IndexSubcommand =
  | 'generate'
  | 'check'
  | 'diagram'
  | 'validate'
  | 'entrypoints'
  | 'freshness'
  | 'links';

/** Options for the index command. */
export interface IndexCommandOptions {
  readonly subcommand: IndexSubcommand;
  readonly format?: OutputFormat;
  readonly output?: string;
  readonly verbose?: boolean;
  readonly module?: string;
  readonly inline?: boolean;
}

/** Result of the index command. */
export interface IndexCommandResult {
  readonly success: boolean;
  readonly message: string;
  readonly data?: {
    readonly filesIndexed?: number;
    readonly modulesFound?: number;
    readonly outputPath?: string;
    readonly validationResult?: {
      readonly valid: boolean;
      readonly missingFiles: readonly string[];
      readonly extraFiles: readonly string[];
      readonly modifiedFiles: readonly string[];
    };
    /** Link validation results. */
    readonly totalFiles?: number;
    readonly totalLinks?: number;
    readonly brokenLinks?: number;
    /** ARCHITECTURE.md validation results (Issue #445). */
    readonly documentedModules?: readonly string[];
    readonly actualModules?: readonly string[];
    readonly missingInDocs?: readonly string[];
    readonly missingInCode?: readonly string[];
    readonly modulesValidated?: number;
  };
}
