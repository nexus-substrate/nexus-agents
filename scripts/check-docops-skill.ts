#!/usr/bin/env npx tsx
/**
 * check-docops-skill.ts - Enforce DocOps skill synchronization
 *
 * This script enforces that changes to documentation pipeline files
 * require corresponding updates to the Documentation Management skill.
 *
 * Usage:
 *   npx tsx scripts/check-docops-skill.ts           # Check for violations
 *   npx tsx scripts/check-docops-skill.ts --verbose # Detailed output
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
import { execSync } from 'node:child_process';

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
function getChangedFiles(): string[] {
  try {
    const baseRef = process.env['GITHUB_BASE_REF'];
    const base = baseRef !== undefined && baseRef !== '' ? `origin/${baseRef}` : 'HEAD~1';

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
 * Get the latest commit message to check for escape hatch.
 */
function getLatestCommitMessage(): string {
  try {
    return execSync('git log -1 --pretty=%B', {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
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

  // Check for escape hatch
  const commitMessage = getLatestCommitMessage();
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

  // No pipeline changes = success
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
  npx tsx scripts/check-docops-skill.ts [options]

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

main();
