/**
 * nexus-agents/swe-bench - Patch Applicator
 *
 * Applies and validates patches for SWE-bench evaluation.
 * Handles git-style unified diffs with fuzz matching and rollback support.
 *
 * @module swe-bench/patch-applicator
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import type {
  IPatchApplicator,
  PatchValidationResult,
  PatchApplicationResult,
  PatchApplicationOptions,
} from './patch-applicator-types.js';
import { DEFAULT_PATCH_OPTIONS } from './patch-applicator-types.js';
import { parsePatch } from './patch-applicator-parser.js';
import {
  writeTempPatch,
  cleanupTempFile,
  executePatch,
  type ResolvedPatchOptions,
} from './patch-applicator-executor.js';

// ============================================================================
// Re-exports for backward compatibility
// ============================================================================

export {
  PATCH_PATTERNS,
  detectPatchFormat,
  countPatchHunks,
  isLargeHunk,
  extractAffectedFiles,
  checkPatchQuality,
  parsePatch,
} from './patch-applicator-parser.js';

export {
  MAX_OUTPUT_BUFFER,
  writeTempPatch,
  cleanupTempFile,
  buildPatchArgs,
  parseModifiedFiles,
  extractFuzzFactor,
  parseFailedFiles,
  handlePatchError,
  executePatch,
  type ResolvedPatchOptions,
} from './patch-applicator-executor.js';

// ============================================================================
// Patch Applicator Implementation
// ============================================================================

/**
 * Applies patches using the system `patch` command.
 *
 * Supports:
 * - Git-style unified diffs
 * - Fuzz matching for imperfect patches
 * - Dry-run validation
 * - Rollback via reverse application
 */
export class PatchApplicator implements IPatchApplicator {
  private readonly logger: ILogger;

  constructor(logger?: ILogger) {
    this.logger = logger ?? createLogger({ component: 'patch-applicator' });
  }

  /**
   * Validates a patch without applying it.
   */
  validate(patch: string): PatchValidationResult {
    return parsePatch(patch);
  }

  /**
   * Applies a patch to the working directory.
   */
  async apply(patch: string, options: PatchApplicationOptions): Promise<PatchApplicationResult> {
    const opts = this.resolveOptions(options);

    this.logger.info('Applying patch', {
      workDir: opts.workDir,
      dryRun: opts.dryRun,
    });

    // First validate the patch
    const validation = this.validate(patch);
    if (!validation.valid) {
      return {
        success: false,
        modifiedFiles: [],
        failedFiles: [],
        appliedCleanly: false,
        error: `Invalid patch: ${validation.errors.join(', ')}`,
        output: '',
        backupCreated: false,
      };
    }

    // Write patch to temp file
    const patchPath = await writeTempPatch(patch, opts.workDir);

    try {
      return await executePatch(patchPath, opts, false, this.logger);
    } finally {
      await cleanupTempFile(patchPath);
    }
  }

  /**
   * Reverts a previously applied patch.
   */
  async revert(patch: string, options: PatchApplicationOptions): Promise<PatchApplicationResult> {
    const opts = this.resolveOptions(options);

    this.logger.info('Reverting patch', { workDir: opts.workDir });

    const patchPath = await writeTempPatch(patch, opts.workDir);

    try {
      return await executePatch(patchPath, opts, true, this.logger);
    } finally {
      await cleanupTempFile(patchPath);
    }
  }

  /**
   * Checks if a patch can be applied cleanly.
   */
  async canApply(patch: string, options: PatchApplicationOptions): Promise<boolean> {
    const dryRunOpts: PatchApplicationOptions = {
      ...options,
      dryRun: true,
      createBackup: false,
    };

    const result = await this.apply(patch, dryRunOpts);
    return result.success;
  }

  /**
   * Resolves partial options with defaults.
   */
  private resolveOptions(options: PatchApplicationOptions): ResolvedPatchOptions {
    return {
      workDir: options.workDir,
      allowFuzz: options.allowFuzz ?? DEFAULT_PATCH_OPTIONS.allowFuzz,
      maxFuzz: options.maxFuzz ?? DEFAULT_PATCH_OPTIONS.maxFuzz,
      createBackup: options.createBackup ?? DEFAULT_PATCH_OPTIONS.createBackup,
      dryRun: options.dryRun ?? DEFAULT_PATCH_OPTIONS.dryRun,
      stripLevel: options.stripLevel ?? DEFAULT_PATCH_OPTIONS.stripLevel,
      timeoutMs: options.timeoutMs ?? DEFAULT_PATCH_OPTIONS.timeoutMs,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a new patch applicator instance.
 */
export function createPatchApplicator(logger?: ILogger): PatchApplicator {
  return new PatchApplicator(logger);
}

/**
 * Validates a patch string.
 */
export function validatePatch(patch: string): PatchValidationResult {
  return parsePatch(patch);
}

/**
 * Quick helper to apply a patch.
 */
export async function applyPatch(
  patch: string,
  workDir: string,
  options?: Partial<PatchApplicationOptions>
): Promise<PatchApplicationResult> {
  const applicator = createPatchApplicator();
  return applicator.apply(patch, { workDir, ...options });
}

/**
 * Quick helper to check if a patch can be applied.
 */
export async function canApplyPatch(patch: string, workDir: string): Promise<boolean> {
  const applicator = createPatchApplicator();
  return applicator.canApply(patch, { workDir, dryRun: true });
}
