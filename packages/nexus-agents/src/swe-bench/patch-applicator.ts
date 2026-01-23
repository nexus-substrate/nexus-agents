/**
 * nexus-agents/swe-bench - Patch Applicator
 *
 * Applies and validates patches for SWE-bench evaluation.
 * Handles git-style unified diffs with fuzz matching and rollback support.
 *
 * @module swe-bench/patch-applicator
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import type {
  IPatchApplicator,
  PatchValidationResult,
  PatchApplicationResult,
  PatchApplicationOptions,
  PatchFormat,
} from './patch-applicator-types.js';
import { DEFAULT_PATCH_OPTIONS } from './patch-applicator-types.js';

const execAsync = promisify(exec);

// ============================================================================
// Constants
// ============================================================================

/** Maximum output buffer size for patch commands. */
const MAX_OUTPUT_BUFFER = 5 * 1024 * 1024; // 5MB

/** Regex patterns for patch parsing. */
const PATCH_PATTERNS = {
  unifiedHeader: /^---\s+\S+/m,
  gitHeader: /^diff --git\s+/m,
  contextHeader: /^\*\*\*\s+\S+/m,
  hunkHeader: /^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/gm,
  filePathUnified: /^(?:---|\+\+\+)\s+([ab]\/)?(\S+)/gm,
  filePathGit: /^diff --git\s+a\/(\S+)\s+b\/(\S+)/gm,
} as const;

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
    const errors: string[] = [];
    const warnings: string[] = [];

    if (patch.trim().length === 0) {
      return {
        valid: false,
        format: 'unknown',
        hunkCount: 0,
        affectedFiles: [],
        errors: ['Patch is empty'],
        warnings: [],
      };
    }

    const format = this.detectFormat(patch);
    if (format === 'unknown') {
      errors.push('Unrecognized patch format');
    }

    const hunkCount = this.countHunks(patch);
    if (hunkCount === 0) {
      errors.push('No valid hunks found in patch');
    }

    const affectedFiles = this.extractAffectedFiles(patch, format);
    if (affectedFiles.length === 0) {
      warnings.push('Could not determine affected files from patch headers');
    }

    this.checkPatchQuality(patch, warnings);

    return {
      valid: errors.length === 0,
      format,
      hunkCount,
      affectedFiles,
      errors,
      warnings,
    };
  }

  /**
   * Applies a patch to the working directory.
   */
  async apply(patch: string, options: PatchApplicationOptions): Promise<PatchApplicationResult> {
    const opts = { ...DEFAULT_PATCH_OPTIONS, ...options };

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
    const patchPath = await this.writeTempPatch(patch, opts.workDir);

    try {
      const result = await this.executePatch(patchPath, opts, false);
      return result;
    } finally {
      await this.cleanupTempFile(patchPath);
    }
  }

  /**
   * Reverts a previously applied patch.
   */
  async revert(patch: string, options: PatchApplicationOptions): Promise<PatchApplicationResult> {
    const opts = { ...DEFAULT_PATCH_OPTIONS, ...options };

    this.logger.info('Reverting patch', { workDir: opts.workDir });

    const patchPath = await this.writeTempPatch(patch, opts.workDir);

    try {
      const result = await this.executePatch(patchPath, opts, true);
      return result;
    } finally {
      await this.cleanupTempFile(patchPath);
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
   * Detects the format of a patch.
   */
  private detectFormat(patch: string): PatchFormat {
    if (PATCH_PATTERNS.gitHeader.test(patch)) {
      return 'git';
    }
    if (PATCH_PATTERNS.unifiedHeader.test(patch)) {
      return 'unified';
    }
    if (PATCH_PATTERNS.contextHeader.test(patch)) {
      return 'context';
    }
    return 'unknown';
  }

  /**
   * Counts the number of hunks in a patch.
   */
  private countHunks(patch: string): number {
    const matches = patch.match(PATCH_PATTERNS.hunkHeader);
    return matches?.length ?? 0;
  }

  /**
   * Extracts affected file paths from a patch.
   */
  private extractAffectedFiles(patch: string, format: PatchFormat): string[] {
    const files = new Set<string>();

    if (format === 'git') {
      const gitMatches = patch.matchAll(PATCH_PATTERNS.filePathGit);
      for (const match of gitMatches) {
        const filePath = match[2];
        if (filePath !== undefined) {
          files.add(filePath);
        }
      }
    }

    // Also check unified diff headers
    const unifiedMatches = patch.matchAll(PATCH_PATTERNS.filePathUnified);
    for (const match of unifiedMatches) {
      const filePath = match[2];
      if (filePath !== undefined && filePath !== '/dev/null') {
        files.add(filePath);
      }
    }

    return Array.from(files);
  }

  /**
   * Checks patch quality and adds warnings.
   */
  private checkPatchQuality(patch: string, warnings: string[]): void {
    // Check for potentially problematic patterns
    if (patch.includes('\r\n')) {
      warnings.push('Patch contains Windows line endings (CRLF)');
    }

    if (patch.includes('\\ No newline at end of file')) {
      warnings.push('Patch involves files without trailing newline');
    }

    const lines = patch.split('\n');
    const largeHunks = lines.filter((l) => l.startsWith('@@') && this.isLargeHunk(l));
    if (largeHunks.length > 0) {
      warnings.push(`Patch contains ${String(largeHunks.length)} large hunk(s)`);
    }
  }

  /**
   * Checks if a hunk header indicates a large hunk (>100 lines).
   */
  private isLargeHunk(hunkHeader: string): boolean {
    const match = hunkHeader.match(/@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/);
    if (match) {
      const oldLines = parseInt(match[1] ?? '1', 10);
      const newLines = parseInt(match[2] ?? '1', 10);
      return oldLines > 100 || newLines > 100;
    }
    return false;
  }

  /**
   * Writes patch to a temporary file.
   */
  private async writeTempPatch(patch: string, workDir: string): Promise<string> {
    const tempPath = path.join(workDir, `.patch-${String(Date.now())}.patch`);
    await fs.writeFile(tempPath, patch, 'utf-8');
    return tempPath;
  }

  /**
   * Cleans up temporary patch file.
   */
  private async cleanupTempFile(patchPath: string): Promise<void> {
    try {
      await fs.unlink(patchPath);
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Executes the patch command.
   */
  private async executePatch(
    patchPath: string,
    options: Required<Omit<PatchApplicationOptions, 'workDir'>> & {
      workDir: string;
    },
    reverse: boolean
  ): Promise<PatchApplicationResult> {
    const args = this.buildPatchArgs(patchPath, options, reverse);
    const command = `patch ${args.join(' ')}`;

    this.logger.debug('Executing patch command', { command, cwd: options.workDir });

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: options.workDir,
        timeout: options.timeoutMs,
        maxBuffer: MAX_OUTPUT_BUFFER,
      });

      const output = `${stdout}\n${stderr}`.trim();
      const modifiedFiles = this.parseModifiedFiles(output);
      const appliedCleanly = !output.includes('Hunk') || !output.includes('FAILED');
      const fuzzFactor = this.extractFuzzFactor(output);

      const result: PatchApplicationResult = {
        success: true,
        modifiedFiles,
        failedFiles: [],
        appliedCleanly,
        output,
        backupCreated: options.createBackup && !options.dryRun,
      };

      if (fuzzFactor !== undefined) {
        return { ...result, fuzzFactor };
      }

      return result;
    } catch (err) {
      return this.handlePatchError(err, options);
    }
  }

  /**
   * Builds patch command arguments.
   */
  private buildPatchArgs(
    patchPath: string,
    options: Required<Omit<PatchApplicationOptions, 'workDir'>> & {
      workDir: string;
    },
    reverse: boolean
  ): string[] {
    const args: string[] = [];

    // Strip level for path prefixes
    args.push(`-p${String(options.stripLevel)}`);

    // Input file
    args.push('-i', patchPath);

    // Backup option
    if (options.createBackup && !options.dryRun) {
      args.push('-b');
    }

    // Dry run
    if (options.dryRun) {
      args.push('--dry-run');
    }

    // Fuzz handling
    if (options.allowFuzz) {
      args.push(`-F${String(options.maxFuzz)}`);
    } else {
      args.push('-F0');
    }

    // Reverse application
    if (reverse) {
      args.push('-R');
    }

    // Force application (don't ask questions)
    args.push('-f');

    // Verbose output
    args.push('-v');

    return args;
  }

  /**
   * Parses modified files from patch output.
   */
  private parseModifiedFiles(output: string): string[] {
    const files: string[] = [];
    const patchingPattern = /patching file ['"]?([^'"]+)['"]?/gi;
    let match: RegExpExecArray | null;

    while ((match = patchingPattern.exec(output)) !== null) {
      const filePath = match[1];
      if (filePath !== undefined) {
        files.push(filePath);
      }
    }

    return files;
  }

  /**
   * Extracts fuzz factor from patch output.
   */
  private extractFuzzFactor(output: string): number | undefined {
    const fuzzPattern = /Hunk #\d+ succeeded at \d+ with fuzz (\d+)/;
    const match = output.match(fuzzPattern);
    if (match?.[1] !== undefined) {
      return parseInt(match[1], 10);
    }
    return undefined;
  }

  /**
   * Handles patch command errors.
   */
  private handlePatchError(
    err: unknown,
    options: { dryRun: boolean; createBackup: boolean }
  ): PatchApplicationResult {
    const execError = err as {
      stdout?: string;
      stderr?: string;
      message?: string;
      killed?: boolean;
    };

    const output = [execError.stdout ?? '', execError.stderr ?? ''].join('\n').trim();
    const failedFiles = this.parseFailedFiles(output);
    const modifiedFiles = this.parseModifiedFiles(output);

    // Check if it was a timeout
    if (execError.killed === true) {
      return {
        success: false,
        modifiedFiles,
        failedFiles,
        appliedCleanly: false,
        error: 'Patch command timed out',
        output,
        backupCreated: options.createBackup && !options.dryRun,
      };
    }

    // Check if some hunks succeeded
    const partialSuccess = modifiedFiles.length > 0 && failedFiles.length > 0;

    return {
      success: false,
      modifiedFiles,
      failedFiles,
      appliedCleanly: false,
      error: partialSuccess
        ? `Partial failure: ${String(failedFiles.length)} file(s) failed`
        : (execError.message ?? 'Patch failed'),
      output,
      backupCreated: options.createBackup && !options.dryRun,
    };
  }

  /**
   * Parses failed files from patch output.
   */
  private parseFailedFiles(output: string): string[] {
    const files: string[] = [];
    const failPattern = /Hunk #\d+ FAILED at \d+/gi;
    const filePattern = /patching file ['"]?([^'"]+)['"]?/gi;

    // Find all file mentions and check if they have failures
    const lines = output.split('\n');
    let currentFile: string | undefined;

    for (const line of lines) {
      const fileMatch = filePattern.exec(line);
      if (fileMatch?.[1] !== undefined) {
        currentFile = fileMatch[1];
      }

      if (failPattern.test(line) && currentFile !== undefined) {
        if (!files.includes(currentFile)) {
          files.push(currentFile);
        }
      }

      // Reset patterns
      filePattern.lastIndex = 0;
      failPattern.lastIndex = 0;
    }

    return files;
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
  const applicator = createPatchApplicator();
  return applicator.validate(patch);
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
