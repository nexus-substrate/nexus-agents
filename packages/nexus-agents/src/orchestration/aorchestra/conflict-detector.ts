/**
 * Conflict Detector — detects overlapping file references in worker results.
 *
 * Detection-only: flags conflicts for human escalation, does not auto-resolve.
 * Extracts file paths from worker output text and identifies when multiple
 * workers reference the same file.
 *
 * @module orchestration/aorchestra/conflict-detector
 * (Source: Issue #1302, Epic #1299)
 */

import type { WorkerResult } from './worker-dispatcher.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A detected conflict where multiple workers reference the same file.
 */
export interface WorkerConflict {
  /** The file path referenced by multiple workers */
  readonly filePath: string;
  /** List of worker roles that reference this file */
  readonly workers: readonly string[];
}

// ============================================================================
// File Path Extraction
// ============================================================================

/**
 * Pattern matching common source file paths in worker output.
 * Matches paths like: src/auth.ts, packages/foo/bar.tsx, config.yaml
 * Avoids matching URLs, imports, or other non-file patterns.
 */
const FILE_PATH_PATTERN =
  /(?:^|[\s`"'(])([a-zA-Z0-9_./-]+\.(?:ts|tsx|js|jsx|json|yaml|yml|md|css|scss|html))\b/g;

/**
 * Extract file paths from worker output text.
 */
function extractFilePaths(output: string): readonly string[] {
  const paths = new Set<string>();
  let match: RegExpExecArray | null = FILE_PATH_PATTERN.exec(output);
  while (match !== null) {
    const captured = match[1];
    if (captured !== undefined) {
      paths.add(captured);
    }
    match = FILE_PATH_PATTERN.exec(output);
  }
  // Reset lastIndex for regex reuse
  FILE_PATH_PATTERN.lastIndex = 0;
  return [...paths];
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Detect file path conflicts between worker results.
 *
 * Scans successful worker outputs for file path references and identifies
 * cases where multiple workers reference the same file. These conflicts
 * should be escalated to a human for resolution.
 *
 * @param results - Worker results from dispatchWorkers
 * @returns Array of detected conflicts (empty if no overlaps)
 */
export function detectConflicts(results: readonly WorkerResult[]): readonly WorkerConflict[] {
  if (results.length === 0) return [];

  // Map: filePath → Set of worker roles
  const fileWorkerMap = new Map<string, Set<string>>();

  for (const result of results) {
    if (result.status !== 'success') continue;

    const paths = extractFilePaths(result.output);
    for (const filePath of paths) {
      const existing = fileWorkerMap.get(filePath);
      if (existing !== undefined) {
        existing.add(result.role);
      } else {
        fileWorkerMap.set(filePath, new Set([result.role]));
      }
    }
  }

  // Filter to only entries with 2+ workers
  const conflicts: WorkerConflict[] = [];
  for (const [filePath, workers] of fileWorkerMap) {
    if (workers.size >= 2) {
      conflicts.push({ filePath, workers: [...workers] });
    }
  }

  return conflicts;
}
