/**
 * nexus-agents/swe-bench - Patch Executor
 *
 * Executes patch commands with the system `patch` utility.
 * Handles argument building, output parsing, and error recovery.
 *
 * @module swe-bench/patch-applicator-executor
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ILogger } from '../core/logger.js';
import type { PatchApplicationResult, PatchApplicationOptions } from './patch-applicator-types.js';

const execAsync = promisify(exec);

// ============================================================================
// Constants
// ============================================================================

/** Maximum output buffer size for patch commands. */
export const MAX_OUTPUT_BUFFER = 5 * 1024 * 1024; // 5MB

// ============================================================================
// Types
// ============================================================================

/** Full options with all required fields resolved. */
export type ResolvedPatchOptions = Required<Omit<PatchApplicationOptions, 'workDir'>> & {
  workDir: string;
};

// ============================================================================
// Temporary File Management
// ============================================================================

/**
 * Writes patch content to a temporary file.
 *
 * @param patch - The patch content to write
 * @param workDir - The working directory for the temp file
 * @returns Path to the created temporary file
 */
export async function writeTempPatch(patch: string, workDir: string): Promise<string> {
  const tempPath = path.join(workDir, `.patch-${String(Date.now())}.patch`);
  await fs.writeFile(tempPath, patch, 'utf-8');
  return tempPath;
}

/**
 * Cleans up a temporary patch file.
 *
 * @param patchPath - Path to the temp file to remove
 */
export async function cleanupTempFile(patchPath: string): Promise<void> {
  try {
    await fs.unlink(patchPath);
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Argument Building
// ============================================================================

/**
 * Builds command-line arguments for the patch command.
 *
 * @param patchPath - Path to the patch file
 * @param options - Resolved patch options
 * @param reverse - Whether to apply in reverse (revert)
 * @returns Array of command-line arguments
 */
export function buildPatchArgs(
  patchPath: string,
  options: ResolvedPatchOptions,
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

// ============================================================================
// Output Parsing
// ============================================================================

/**
 * Parses modified files from patch command output.
 *
 * @param output - The stdout/stderr from patch command
 * @returns Array of file paths that were modified
 */
export function parseModifiedFiles(output: string): string[] {
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
 * Extracts fuzz factor from patch command output.
 *
 * @param output - The stdout/stderr from patch command
 * @returns The fuzz factor used, or undefined if applied cleanly
 */
export function extractFuzzFactor(output: string): number | undefined {
  const fuzzPattern = /Hunk #\d+ succeeded at \d+ with fuzz (\d+)/;
  const match = output.match(fuzzPattern);
  if (match?.[1] !== undefined) {
    return parseInt(match[1], 10);
  }
  return undefined;
}

/**
 * Parses failed files from patch command output.
 *
 * @param output - The stdout/stderr from patch command
 * @returns Array of file paths that failed to patch
 */
export function parseFailedFiles(output: string): string[] {
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

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Handles patch command execution errors.
 *
 * @param err - The error from exec
 * @param options - The patch options used
 * @returns A PatchApplicationResult describing the failure
 */
export function handlePatchError(
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
  const failedFiles = parseFailedFiles(output);
  const modifiedFiles = parseModifiedFiles(output);

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

// ============================================================================
// Execution
// ============================================================================

/**
 * Executes the patch command.
 *
 * @param patchPath - Path to the patch file
 * @param options - Resolved patch options
 * @param reverse - Whether to apply in reverse (revert)
 * @param logger - Logger instance for debug output
 * @returns The result of the patch application
 */
export async function executePatch(
  patchPath: string,
  options: ResolvedPatchOptions,
  reverse: boolean,
  logger: ILogger
): Promise<PatchApplicationResult> {
  const args = buildPatchArgs(patchPath, options, reverse);
  const command = `patch ${args.join(' ')}`;

  logger.debug('Executing patch command', { command, cwd: options.workDir });

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: options.workDir,
      timeout: options.timeoutMs,
      maxBuffer: MAX_OUTPUT_BUFFER,
    });

    const output = `${stdout}\n${stderr}`.trim();
    const modifiedFiles = parseModifiedFiles(output);
    const appliedCleanly = !output.includes('Hunk') || !output.includes('FAILED');
    const fuzzFactor = extractFuzzFactor(output);

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
    return handlePatchError(err, options);
  }
}
