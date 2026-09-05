/**
 * nexus-agents doctor — harness-alignment sub-check.
 *
 * Phase 3 of #2805 (option B federation of #2764). Walks the
 * harness-specific config files in the current working directory and
 * reports whether each one redirects to AGENTS.md (aligned), exists
 * with non-redirect content (drift), or is absent (missing).
 *
 * "Aligned" means the file mentions AGENTS.md somewhere in its content.
 * That's intentionally loose — we don't try to parse Cursor MDC frontmatter
 * or Aider YAML semantics; the federation invariant is "the file points
 * at AGENTS.md, never duplicates content." A grep for the literal string
 * is the right granularity.
 *
 * @module cli/doctor-harness-alignment
 * (Source: #2805 / #2764)
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { findRepoRoot } from '../config/repo-root-detection.js';

/** Per-harness alignment status. */
export interface HarnessFileStatus {
  /** Human label, e.g. "Cursor". */
  readonly harness: string;
  /** Repo-relative path to the discovery file. */
  readonly path: string;
  /** True if the file exists on disk. */
  readonly exists: boolean;
  /** True if the file's content mentions `AGENTS.md` (the federation invariant). */
  readonly redirectsToAgentsMd: boolean;
  /** First read/stat error encountered, if any. */
  readonly error: string | null;
}

/** Aggregated harness-alignment health. */
export interface HarnessAlignmentCheck {
  /** True iff cwd or an ancestor contains a package.json or .git marker. */
  readonly inProject: boolean;
  /** True iff AGENTS.md is the federated surface (canonical doc exists). */
  readonly agentsMdExists: boolean;
  /** Per-harness rows. */
  readonly files: readonly HarnessFileStatus[];
  /** Count of harnesses with a properly-redirected config. */
  readonly alignedCount: number;
  /** Count of harnesses with a config file that exists but doesn't redirect (drift). */
  readonly driftCount: number;
  /** Count of harnesses with no config file (acceptable; harness not in use). */
  readonly missingCount: number;
}

/**
 * Each harness's expected discovery file. Order matches the compatibility
 * matrix in `docs/architecture/AGENT_COMPATIBILITY.md`.
 */
const HARNESS_FILES: ReadonlyArray<{ harness: string; path: string }> = [
  { harness: 'Cursor', path: '.cursor/rules/agents.mdc' },
  { harness: 'Windsurf', path: '.windsurf/rules/agents.md' },
  { harness: 'Aider', path: '.aider.conf.yml' },
  { harness: 'Continue', path: '.continue/rules/agents.md' },
  { harness: 'Cline', path: '.clinerules/agents.md' },
  // Gemini CLI reads a root-level GEMINI.md natively (unlike the .rules/-dir
  // harnesses); it redirects to AGENTS.md per the federation (#3446 Phase 4).
  { harness: 'Gemini', path: 'GEMINI.md' },
];

/**
 * Walk every known harness discovery file at the given root (defaults
 * to `process.cwd()`) and report alignment status.
 */
export function checkHarnessAlignment(cwd: string = process.cwd()): HarnessAlignmentCheck {
  const inProject = findRepoRoot(cwd) !== null || hasPackageJsonAncestor(cwd);
  const agentsMdPath = join(cwd, 'AGENTS.md');
  const agentsMdExists = existsSync(agentsMdPath);

  const files: HarnessFileStatus[] = HARNESS_FILES.map(({ harness, path }) =>
    inspectFile(harness, path, join(cwd, path))
  );

  const alignedCount = files.filter((f) => f.exists && f.redirectsToAgentsMd).length;
  const driftCount = files.filter((f) => f.exists && !f.redirectsToAgentsMd).length;
  const missingCount = files.filter((f) => !f.exists).length;

  return {
    inProject,
    agentsMdExists,
    files,
    alignedCount,
    driftCount,
    missingCount,
  };
}

/** Returns whether the starting directory or an ancestor contains package.json. */
function hasPackageJsonAncestor(start: string): boolean {
  let current = resolve(start);
  for (;;) {
    if (existsSync(join(current, 'package.json'))) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function inspectFile(
  harness: string,
  relativePath: string,
  absolutePath: string
): HarnessFileStatus {
  if (!existsSync(absolutePath)) {
    return {
      harness,
      path: relativePath,
      exists: false,
      redirectsToAgentsMd: false,
      error: null,
    };
  }
  try {
    const content = readFileSync(absolutePath, 'utf-8');
    return {
      harness,
      path: relativePath,
      exists: true,
      redirectsToAgentsMd: content.includes('AGENTS.md'),
      error: null,
    };
  } catch (error: unknown) {
    return {
      harness,
      path: relativePath,
      exists: true,
      redirectsToAgentsMd: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
