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

// ============================================================================
// Section Heading Extraction
// ============================================================================

/**
 * Pattern matching markdown section headings (## or ###).
 * Captures the heading text for semantic overlap detection.
 */
const SECTION_HEADING_PATTERN = /^#{2,3}\s+(.+)$/gm;

/** Extract markdown section headings from worker output. */
function extractSectionHeadings(output: string): readonly string[] {
  const headings = new Set<string>();
  let match: RegExpExecArray | null = SECTION_HEADING_PATTERN.exec(output);
  while (match !== null) {
    const captured = match[1];
    if (captured !== undefined) {
      headings.add(captured.trim());
    }
    match = SECTION_HEADING_PATTERN.exec(output);
  }
  SECTION_HEADING_PATTERN.lastIndex = 0;
  return [...headings];
}

// ============================================================================
// File Path Extraction
// ============================================================================

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
// Helpers
// ============================================================================

/** Add a worker role to the overlap map for a given identifier. */
function addToOverlapMap(map: Map<string, Set<string>>, key: string, role: string): void {
  const existing = map.get(key);
  if (existing !== undefined) {
    existing.add(role);
  } else {
    map.set(key, new Set([role]));
  }
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

  // Map: identifier → Set of worker roles
  // Identifiers are either file paths or "section:Heading Name"
  const overlapMap = new Map<string, Set<string>>();

  for (const result of results) {
    if (result.status !== 'success') continue;

    // File path overlaps
    for (const filePath of extractFilePaths(result.output)) {
      addToOverlapMap(overlapMap, filePath, result.role);
    }

    // Section heading overlaps (#1507)
    for (const heading of extractSectionHeadings(result.output)) {
      addToOverlapMap(overlapMap, `section:${heading}`, result.role);
    }
  }

  // Filter to only entries with 2+ workers
  const conflicts: WorkerConflict[] = [];
  for (const [filePath, workers] of overlapMap) {
    if (workers.size >= 2) {
      conflicts.push({ filePath, workers: [...workers] });
    }
  }

  return conflicts;
}
