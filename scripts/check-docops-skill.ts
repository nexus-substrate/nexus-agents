/**
 * check-docops-skill.ts - Enforce DocOps skill synchronization
 *
 * This script enforces that changes to documentation pipeline files
 * require corresponding updates to the Documentation Management skill.
 *
 * Usage:
 *   pnpm exec tsx scripts/check-docops-skill.ts           # Check for violations
 *   pnpm exec tsx scripts/check-docops-skill.ts --verbose # Detailed output
 *
 * Exit codes:
 *   0 - No violations (pipeline unchanged or skill updated)
 *   1 - Violation (pipeline changed without skill update)
 *
 * Escape hatch: Include [skip-docops] in commit message
 *
 * (Source: Issue #626, Epic #625)
 */

/* eslint-disable no-console */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';

// ============================================================================
// Configuration
// ============================================================================

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'docs/ops/docops-manifest.json');

interface DocOpsManifest {
  version: string;
  pipeline_files: string[];
  skill_file: string;
}

interface CheckResult {
  success: boolean;
  manifest: DocOpsManifest | null;
  changedFiles: string[];
  changedPipelineFiles: string[];
  skillUpdated: boolean;
  escapeHatchUsed: boolean;
}

// ============================================================================
// Git Helpers
// ============================================================================

/**
 * Get list of changed files in the current commit or PR.
 * Uses git diff against the merge base for PRs, or HEAD~1 for direct commits.
 */
/**
 * GITHUB_BASE_REF is external input (the PR target branch name); accept only
 * plain ref characters before it reaches a shell string (#4171).
 */
function safeBaseRef(): string | undefined {
  const baseRef = process.env['GITHUB_BASE_REF'];
  if (baseRef === undefined || baseRef === '') return undefined;
  return /^[\w./-]+$/.test(baseRef) ? baseRef : undefined;
}

function getChangedFiles(): string[] {
  try {
    const baseRef = safeBaseRef();
    const base = baseRef !== undefined ? `origin/${baseRef}` : 'HEAD~1';

    const diffOutput = execSync(
      `git diff --name-only ${base}...HEAD 2>/dev/null || git diff --name-only HEAD~1`,
      {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
      }
    );

    return diffOutput
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
  } catch {
    // Fallback: check staged files
    try {
      const stagedOutput = execSync('git diff --cached --name-only', {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
      });
      return stagedOutput
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
    } catch {
      return [];
    }
  }
}

/**
 * True when a unified-diff for a pipeline file contains ONLY mechanical
 * GitHub Action version bumps — `uses: <action>@<ref>` lines (e.g. Dependabot
 * bumping `actions/checkout@<sha> # v6.0.2` → `@<sha> # v6.0.3`). Such bumps
 * change no step logic and need no Documentation Management skill update
 * (#3363). Conservative: any non-`uses:` added/removed line → not mechanical,
 * so the gate still fires for real pipeline changes.
 */
export function isMechanicalActionBumpDiff(diff: string): boolean {
  const changeLines = diff
    .split('\n')
    .filter(
      (l) =>
        (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---')
    );
  if (changeLines.length === 0) return false;
  // After dropping the leading +/-, every change line must be a `uses:`
  // reference to a pinned action (`<owner>/<repo>@<ref>` or `<action>@<ref>`).
  const usesRef = /^\s*(?:-\s*)?uses:\s*\S+@\S+/;
  return changeLines.every((l) => usesRef.test(l.slice(1)));
}

/** Diff a single changed pipeline file against the PR base; mechanical-bump check (#3363). */
function isMechanicalActionBump(file: string): boolean {
  try {
    // execFileSync array args: `file` is a PR-controlled path and baseRef is
    // external input — neither may reach a shell string (#4171).
    const baseRef = safeBaseRef();
    const range = baseRef !== undefined ? `origin/${baseRef}...HEAD` : 'HEAD~1';
    let diff: string;
    try {
      diff = execFileSync('git', ['diff', range, '--', file], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      diff = execFileSync('git', ['diff', 'HEAD~1', '--', file], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    }
    return isMechanicalActionBumpDiff(diff);
  } catch {
    // Can't determine the diff → treat as substantive so the gate still fires.
    return false;
  }
}

/**
 * Get commit messages for the escape-hatch check.
 *
 * On GitHub Actions PR events, actions/checkout creates a merge ref so
 * `git log -1` returns the auto-generated merge-commit subject, not the
 * developer's commit. We walk the full PR commit range so [skip-docops]
 * in any commit on the branch is honored. (#2411)
 */
function getCommitMessagesForEscapeHatch(cwd: string = REPO_ROOT): string {
  const baseRef = safeBaseRef();
  if (baseRef !== undefined) {
    try {
      // #5028: TWO dots. `origin/main...HEAD` is the SYMMETRIC difference, so
      // it also returns commits reachable from the base branch but not from
      // HEAD — including every `[skip-docops]` ever merged to main. Any branch
      // whose merge-base predates one of those inherited the marker and
      // silently disabled this gate. Six such commits are on main today; the
      // commit that introduced this range is one of them.
      return execFileSync('git', ['log', `origin/${baseRef}..HEAD`, '--pretty=%B'], {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      // fall through to HEAD-only
    }
  }
  try {
    return execSync('git log -1 --pretty=%B', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

// ============================================================================
// Manifest Loading
// ============================================================================

function loadManifest(): DocOpsManifest | null {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`✗ DocOps manifest not found: ${MANIFEST_PATH}`);
    return null;
  }

  try {
    const content = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    return JSON.parse(content) as DocOpsManifest;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`✗ Failed to parse manifest: ${message}`);
    return null;
  }
}

// ============================================================================
// Output Helpers
// ============================================================================

function printVerboseInfo(manifest: DocOpsManifest, changedFiles: string[]): void {
  console.log(`Manifest version: ${manifest.version}`);
  console.log(`Pipeline files: ${String(manifest.pipeline_files.length)}`);
  console.log(`Skill file: ${manifest.skill_file}\n`);
  console.log(`Changed files: ${String(changedFiles.length)}`);
  changedFiles.forEach((f) => {
    console.log(`  - ${f}`);
  });
  console.log('');
}

function printViolation(skillFile: string, changedPipelineFiles: string[]): void {
  console.log('✗ VIOLATION: Pipeline files changed but skill was NOT updated\n');
  console.log('Required action:');
  console.log(`  Update the Documentation Management skill:`);
  console.log(`  ${skillFile}\n`);
  console.log('Pipeline files that changed:');
  changedPipelineFiles.forEach((f) => {
    console.log(`  - ${f}`);
  });
  console.log('');
  console.log('The Documentation Management skill must be updated when any');
  console.log('documentation pipeline file changes. This ensures the operating');
  console.log('manual stays in sync with the actual pipeline.\n');
  console.log('Options:');
  console.log('  1. Update the skill file to reflect the pipeline changes');
  console.log('  2. Use [skip-docops] in commit message for emergency bypasses\n');
  console.log('See: docs/ops/docops-spec.md for enforcement rules');
}

// ============================================================================
// Main Logic
// ============================================================================

function performCheck(_verbose: boolean): CheckResult {
  const result: CheckResult = {
    success: false,
    manifest: null,
    changedFiles: [],
    changedPipelineFiles: [],
    skillUpdated: false,
    escapeHatchUsed: false,
  };

  // Load manifest
  result.manifest = loadManifest();
  if (result.manifest === null) {
    return result;
  }

  // Check for escape hatch — walks PR commit range when GITHUB_BASE_REF is set (#2411)
  const commitMessage = getCommitMessagesForEscapeHatch();
  if (commitMessage.includes('[skip-docops]')) {
    result.escapeHatchUsed = true;
    result.success = true;
    return result;
  }

  // Get changed files
  result.changedFiles = getChangedFiles();
  result.changedPipelineFiles = result.changedFiles.filter(
    (f) => result.manifest?.pipeline_files.includes(f) ?? false
  );

  // Exempt pipeline files whose diff is purely a mechanical action-version
  // bump (e.g. Dependabot `uses:` SHA bumps) — they change no step logic and
  // need no skill update (#3363). Keeps the gate green for those PRs instead
  // of forcing an unjustified skill edit or a [skip-docops] commit Dependabot
  // won't add.
  result.changedPipelineFiles = result.changedPipelineFiles.filter(
    (f) => !isMechanicalActionBump(f)
  );

  // No substantive pipeline changes = success
  if (result.changedPipelineFiles.length === 0) {
    result.success = true;
    return result;
  }

  // Check if skill was updated
  result.skillUpdated = result.changedFiles.includes(result.manifest.skill_file);
  result.success = result.skillUpdated;

  return result;
}

function checkDocOpsSkillSync(verbose: boolean): boolean {
  console.log('DocOps Skill Synchronization Check');
  console.log('==================================\n');

  const result = performCheck(verbose);

  if (result.manifest === null) {
    return false;
  }

  if (verbose) {
    printVerboseInfo(result.manifest, result.changedFiles);
  }

  if (result.escapeHatchUsed) {
    console.log('⚠ Escape hatch [skip-docops] detected in commit message');
    console.log('  Skipping DocOps skill sync check\n');
    console.log('✓ Check bypassed (escape hatch)');
    return true;
  }

  if (result.changedPipelineFiles.length === 0) {
    console.log('✓ No pipeline files changed');
    console.log('  DocOps skill update not required\n');
    return true;
  }

  console.log(`⚠ Pipeline files changed: ${String(result.changedPipelineFiles.length)}`);
  result.changedPipelineFiles.forEach((f) => {
    console.log(`  - ${f}`);
  });
  console.log('');

  if (result.skillUpdated) {
    console.log('✓ Documentation Management skill was updated');
    console.log(`  File: ${result.manifest.skill_file}\n`);
    console.log('✓ DocOps skill sync check passed');
    return true;
  }

  printViolation(result.manifest.skill_file, result.changedPipelineFiles);
  return false;
}

// ============================================================================
// CLI
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
check-docops-skill.ts - Enforce DocOps skill synchronization

Usage:
  pnpm exec tsx scripts/check-docops-skill.ts [options]

Options:
  --verbose, -v  Show detailed output
  --help, -h     Show this help message

Exit codes:
  0 - No violations
  1 - Violation detected

Escape hatch:
  Include [skip-docops] in commit message to bypass this check.
  Use sparingly for emergency fixes only.
`);
    process.exit(0);
  }

  const success = checkDocOpsSkillSync(verbose);
  process.exit(success ? 0 : 1);
}

export { getCommitMessagesForEscapeHatch };

const invokedDirectly = process.argv[1]?.endsWith('check-docops-skill.ts') === true;
if (invokedDirectly) {
  main();
}
