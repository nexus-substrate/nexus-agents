/**
 * nexus-agents/swe-bench - Patch Applicator Types
 *
 * Type definitions for patch application and validation.
 *
 * @module swe-bench/patch-applicator-types
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

/**
 * Result of patch validation.
 */
export interface PatchValidationResult {
  /** Whether the patch is valid. */
  readonly valid: boolean;
  /** Format detected (unified, context, git). */
  readonly format: PatchFormat;
  /** Number of hunks in the patch. */
  readonly hunkCount: number;
  /** Files affected by the patch. */
  readonly affectedFiles: readonly string[];
  /** Validation errors if invalid. */
  readonly errors: readonly string[];
  /** Warnings that don't prevent application. */
  readonly warnings: readonly string[];
}

/**
 * Supported patch formats.
 */
export type PatchFormat = 'unified' | 'context' | 'git' | 'unknown';

/**
 * Result of applying a patch.
 */
export interface PatchApplicationResult {
  /** Whether the patch was applied successfully. */
  readonly success: boolean;
  /** Files that were modified. */
  readonly modifiedFiles: readonly string[];
  /** Files that failed to patch. */
  readonly failedFiles: readonly string[];
  /** Whether the patch applied cleanly (no fuzz/offset). */
  readonly appliedCleanly: boolean;
  /** Fuzz factor used if needed. */
  readonly fuzzFactor?: number;
  /** Error message if failed. */
  readonly error?: string;
  /** Detailed output from patch command. */
  readonly output: string;
  /** Whether a backup was created. */
  readonly backupCreated: boolean;
}

/**
 * Options for patch application.
 */
export interface PatchApplicationOptions {
  /** Working directory (repository root). */
  readonly workDir: string;
  /** Whether to allow fuzz matching (default: true). */
  readonly allowFuzz?: boolean;
  /** Maximum fuzz factor (default: 2). */
  readonly maxFuzz?: number;
  /** Whether to create backups (default: true). */
  readonly createBackup?: boolean;
  /** Whether to do a dry run (default: false). */
  readonly dryRun?: boolean;
  /** Strip path prefix level (default: 1 for git diffs). */
  readonly stripLevel?: number;
  /** Timeout in milliseconds (default: 30000). */
  readonly timeoutMs?: number;
}

/**
 * Default patch application options.
 */
export const DEFAULT_PATCH_OPTIONS: Required<Omit<PatchApplicationOptions, 'workDir'>> = {
  allowFuzz: true,
  maxFuzz: 2,
  createBackup: true,
  dryRun: false,
  stripLevel: 1,
  timeoutMs: 30_000,
};

/**
 * Error codes for patch operations.
 */
export type PatchErrorCode =
  | 'INVALID_PATCH'
  | 'PATCH_CONFLICT'
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'TIMEOUT'
  | 'EXECUTION_FAILED'
  | 'UNKNOWN';

/**
 * Patch applicator error.
 */
export class PatchApplicatorError extends Error {
  override readonly cause?: unknown;
  readonly code: PatchErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code: PatchErrorCode, cause?: unknown) {
    super(message);
    this.name = 'PatchApplicatorError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Interface for patch applicator implementations.
 */
export interface IPatchApplicator {
  /**
   * Validates a patch without applying it.
   */
  validate(patch: string): PatchValidationResult;

  /**
   * Applies a patch to the working directory.
   */
  apply(patch: string, options: PatchApplicationOptions): Promise<PatchApplicationResult>;

  /**
   * Reverts a previously applied patch.
   */
  revert(patch: string, options: PatchApplicationOptions): Promise<PatchApplicationResult>;

  /**
   * Checks if a patch can be applied cleanly.
   */
  canApply(patch: string, options: PatchApplicationOptions): Promise<boolean>;
}
