/**
 * nexus-agents/swe-bench - Patch Parser
 *
 * Parsing and validation utilities for git-style unified diffs.
 * Extracts format detection, hunk counting, and quality checks.
 *
 * @module swe-bench/patch-applicator-parser
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { PatchFormat, PatchValidationResult } from './patch-applicator-types.js';

// ============================================================================
// Constants
// ============================================================================

/** Regex patterns for patch parsing. */
export const PATCH_PATTERNS = {
  unifiedHeader: /^---\s+\S+/m,
  gitHeader: /^diff --git\s+/m,
  contextHeader: /^\*\*\*\s+\S+/m,
  hunkHeader: /^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/gm,
  filePathUnified: /^(?:---|\+\+\+)\s+([ab]\/)?(\S+)/gm,
  filePathGit: /^diff --git\s+a\/(\S+)\s+b\/(\S+)/gm,
} as const;

// ============================================================================
// Format Detection
// ============================================================================

/**
 * Detects the format of a patch string.
 *
 * @param patch - The patch content to analyze
 * @returns The detected format: 'git', 'unified', 'context', or 'unknown'
 */
export function detectPatchFormat(patch: string): PatchFormat {
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

// ============================================================================
// Hunk Analysis
// ============================================================================

/**
 * Counts the number of hunks in a patch.
 *
 * @param patch - The patch content to analyze
 * @returns The number of hunks found
 */
export function countPatchHunks(patch: string): number {
  const matches = patch.match(PATCH_PATTERNS.hunkHeader);
  return matches?.length ?? 0;
}

/**
 * Checks if a hunk header indicates a large hunk (>100 lines).
 *
 * @param hunkHeader - The hunk header line (e.g., "@@ -1,50 +1,150 @@")
 * @returns True if the hunk affects more than 100 lines
 */
export function isLargeHunk(hunkHeader: string): boolean {
  const match = hunkHeader.match(/@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/);
  if (match) {
    const oldLines = parseInt(match[1] ?? '1', 10);
    const newLines = parseInt(match[2] ?? '1', 10);
    return oldLines > 100 || newLines > 100;
  }
  return false;
}

// ============================================================================
// File Extraction
// ============================================================================

/**
 * Extracts affected file paths from a patch.
 *
 * @param patch - The patch content to analyze
 * @param format - The detected patch format
 * @returns Array of unique file paths affected by the patch
 */
export function extractAffectedFiles(patch: string, format: PatchFormat): string[] {
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

// ============================================================================
// Quality Checks
// ============================================================================

/**
 * Checks patch quality and returns warnings.
 *
 * @param patch - The patch content to analyze
 * @returns Array of warning messages about patch quality
 */
export function checkPatchQuality(patch: string): string[] {
  const warnings: string[] = [];

  // Check for potentially problematic patterns
  if (patch.includes('\r\n')) {
    warnings.push('Patch contains Windows line endings (CRLF)');
  }

  if (patch.includes('\\ No newline at end of file')) {
    warnings.push('Patch involves files without trailing newline');
  }

  const lines = patch.split('\n');
  const largeHunks = lines.filter((l) => l.startsWith('@@') && isLargeHunk(l));
  if (largeHunks.length > 0) {
    warnings.push(`Patch contains ${String(largeHunks.length)} large hunk(s)`);
  }

  return warnings;
}

// ============================================================================
// Full Validation
// ============================================================================

/**
 * Performs complete validation of a patch string.
 *
 * @param patch - The patch content to validate
 * @returns Complete validation result with format, hunks, files, errors, and warnings
 */
export function parsePatch(patch: string): PatchValidationResult {
  const errors: string[] = [];

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

  const format = detectPatchFormat(patch);
  if (format === 'unknown') {
    errors.push('Unrecognized patch format');
  }

  const hunkCount = countPatchHunks(patch);
  if (hunkCount === 0) {
    errors.push('No valid hunks found in patch');
  }

  const affectedFiles = extractAffectedFiles(patch, format);
  const warnings = checkPatchQuality(patch);

  if (affectedFiles.length === 0) {
    warnings.push('Could not determine affected files from patch headers');
  }

  return {
    valid: errors.length === 0,
    format,
    hunkCount,
    affectedFiles,
    errors,
    warnings,
  };
}
