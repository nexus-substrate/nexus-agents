#!/usr/bin/env npx tsx
/**
 * CLI-Based PR Review Script
 *
 * Uses locally authenticated CLI tools (Claude, Gemini, Codex) for PR review
 * instead of API calls. Leverages existing subscriptions at zero marginal cost.
 *
 * Usage:
 *   pnpm review <PR#|PR_URL> [--model=claude|gemini|codex] [--dry-run] [--all]
 *
 * @module scripts/review-pr
 * (Source: Issue #182, 5-0 consensus vote for CLI-based PR review)
 */

/* eslint-disable no-console */
// Console output is intentional for CLI user feedback

import {
  execSync,
  execFileSync,
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync, rmSync } from 'node:fs';
import { nexusMkdtempSync } from '../packages/nexus-agents/src/config/nexus-tmp-dir.js';
import { join } from 'node:path';

import { REVIEW_PROMPT } from './review-pr-prompt.js';

// Types
interface ReviewOptions {
  prNumber: number;
  model: 'claude' | 'gemini' | 'codex' | 'auto';
  dryRun: boolean;
  runAll: boolean;
  verbose: boolean;
}

interface CLIHealth {
  name: string;
  available: boolean;
  version?: string;
}

interface ReviewResult {
  model: string;
  decision: 'approve' | 'request_changes' | 'comment';
  summary: string;
  findings: string[];
  hash: string;
  timestamp: string;
  reviewer: string;
}

interface PRInfo {
  title: string;
  author: string;
  url: string;
}

// Constants

const MODEL_COMMANDS: Record<string, { cmd: string; args: string[] }> = {
  claude: { cmd: 'claude', args: ['-p', '--output-format', 'text'] },
  gemini: { cmd: 'gemini', args: [] },
  codex: { cmd: 'codex', args: ['exec'] },
};

const HELP_TEXT = `
CLI-Based PR Review

Usage: pnpm review <PR#|PR_URL> [options]

Options:
  --model=<name>   Use specific model (claude, gemini, codex, auto)
  --dry-run        Preview review without posting to GitHub
  --all            Run review with all available CLI tools
  --verbose, -v    Show detailed output

Examples:
  pnpm review 186
  pnpm review 186 --model=claude
  pnpm review https://github.com/owner/repo/pull/186 --dry-run
  pnpm review 186 --all

Model Selection Guidance:
  - claude: Best for security, architecture, complex reasoning
  - gemini: Best for large files (1M context), bulk analysis
  - codex:  Best for code quality, test coverage
`;

// Utility functions
function exec(command: string): string {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function checkCLI(name: string, versionCmd: string): CLIHealth {
  const version = exec(versionCmd);
  return {
    name,
    available: version.length > 0,
    ...(version.length > 0 ? { version } : {}),
  };
}

function getAvailableCLIs(): CLIHealth[] {
  return [
    checkCLI('claude', 'claude --version 2>/dev/null'),
    checkCLI('gemini', 'gemini --version 2>/dev/null'),
    checkCLI('codex', 'codex --version 2>/dev/null'),
  ];
}

function selectModel(preferred: string, available: CLIHealth[]): string | null {
  if (preferred !== 'auto') {
    const cli = available.find((c) => c.name === preferred);
    if (cli?.available === true) return preferred;
    console.error(`Error: ${preferred} CLI not available`);
    return null;
  }

  const priority = ['claude', 'gemini', 'codex'];
  for (const name of priority) {
    const cli = available.find((c) => c.name === name);
    if (cli?.available === true) return name;
  }

  console.error(
    'Error: No CLI tools available. Install and authenticate claude, gemini, or codex.'
  );
  return null;
}

function getPRDiff(prNumber: number): string {
  const diff = exec(`gh pr diff ${String(prNumber)}`);
  if (diff === '') {
    throw new Error(`Failed to get diff for PR #${String(prNumber)}. Is gh authenticated?`);
  }
  return diff;
}

function getPRInfo(prNumber: number): PRInfo {
  const json = exec(`gh pr view ${String(prNumber)} --json title,author,url`);
  if (json === '') {
    throw new Error(`Failed to get PR info for #${String(prNumber)}`);
  }
  const data = JSON.parse(json) as { title: string; author: { login: string }; url: string };
  return { title: data.title, author: data.author.login, url: data.url };
}

function collectOutput(
  child: ChildProcessWithoutNullStreams
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    child.on('close', () => {
      resolve({ stdout, stderr });
    });
  });
}

function spawnCLI(model: string, prompt: string): ChildProcessWithoutNullStreams {
  const config = MODEL_COMMANDS[model];
  if (config === undefined) {
    throw new Error(`Unknown model: ${model}`);
  }

  if (model === 'claude') {
    // Avoid shell interpolation entirely — pipe prompt via stdin instead of
    // building a shell-escaped echo command. The prior `replace(/"/g, '\\"')`
    // didn't escape backslashes (CodeQL js/incomplete-sanitization).
    const child = spawn(config.cmd, config.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.write(prompt);
    child.stdin.end();
    return child;
  }

  if (model === 'gemini') {
    return spawn(config.cmd, [prompt], { stdio: ['pipe', 'pipe', 'pipe'] });
  }

  // codex
  return spawn(config.cmd, [...config.args, prompt], { stdio: ['pipe', 'pipe', 'pipe'] });
}

async function runCLIReview(model: string, prompt: string): Promise<string> {
  const child = spawnCLI(model, prompt);
  const { stdout, stderr } = await collectOutput(child);

  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${model} exited with code ${String(code)}: ${stderr}`));
      }
    });
  });
}

function parseReviewOutput(output: string): {
  decision: ReviewResult['decision'];
  findings: string[];
} {
  const lines = output.split('\n');
  let decision: ReviewResult['decision'] = 'comment';
  const findings: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('DECISION:')) {
      const d = trimmed.replace('DECISION:', '').trim().toUpperCase();
      if (d.includes('APPROVE')) decision = 'approve';
      else if (d.includes('REQUEST') || d.includes('CHANGE')) decision = 'request_changes';
    } else if (trimmed.startsWith('- [')) {
      findings.push(trimmed);
    }
  }

  return { decision, findings };
}

function generateHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function formatGitHubComment(result: ReviewResult, prInfo: PRInfo): string {
  const emoji = { approve: '✅', request_changes: '🔴', comment: '💬' };
  const findings =
    result.findings.length > 0
      ? `### Findings\n\n${result.findings.join('\n')}\n\n`
      : '### Findings\n\nNo issues found.\n\n';

  return `## CLI Review: ${emoji[result.decision]} ${result.decision.replace('_', ' ').toUpperCase()}

**PR:** ${prInfo.title}
**Model:** ${result.model}
**Reviewer:** ${result.reviewer}
**Timestamp:** ${result.timestamp}

${findings}### Summary

${result.summary}

---
<details>
<summary>Review Metadata</summary>

- **Hash:** \`${result.hash}\`
- **Model:** ${result.model}
- **Generated:** ${result.timestamp}

This review was generated using locally authenticated CLI tools.
</details>
`;
}

function postReviewToGitHub(prNumber: number, comment: string, addLabel: boolean): void {
  // Write comment to a tempfile and use --body-file to avoid any shell
  // interpolation. The prior `replace(/"/g, '\\"')` didn't escape backslashes,
  // so an attacker-controlled comment with `\"` could escape the quoted block
  // and inject shell commands (CodeQL js/incomplete-sanitization).
  const dir = nexusMkdtempSync('nexus-review-');
  const file = join(dir, 'comment.md');
  writeFileSync(file, comment, { encoding: 'utf8', mode: 0o600 });
  try {
    execFileSync('gh', ['pr', 'comment', String(prNumber), '--body-file', file], {
      stdio: 'inherit',
    });
  } finally {
    // #4498: remove the DIRECTORY, not just the file. `nexusMkdtempSync`
    // creates a fresh dir per call; unlinking only its contents leaked one
    // directory per review — the #4489 leak class, in a file the
    // tmpdir-cleanup rule was not yet scanning.
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }

  if (addLabel) {
    applyReviewedLabel(prNumber);
  }
}

/**
 * Add the `cli-reviewed` label via REST.
 *
 * #4498: `gh pr edit` fails repo-wide against this repo — it fetches
 * `repository.pullRequest.projectCards`, which now hard-errors on the
 * Projects-classic deprecation — and the edit is NOT applied. The previous
 * code caught that failure and inferred "the label must not exist", so it ran
 * `gh label create` on an already-existing label; that threw *inside* the
 * catch, with no handler, and crashed the whole review.
 *
 * The REST endpoint is unaffected and creates the label implicitly if missing,
 * so no create-then-retry dance is needed. Labelling is a convenience: a
 * failure here must never discard a review that already posted.
 */
function applyReviewedLabel(prNumber: number): void {
  try {
    execFileSync(
      'gh',
      [
        'api',
        `repos/{owner}/{repo}/issues/${String(prNumber)}/labels`,
        '-X',
        'POST',
        '-f',
        'labels[]=cli-reviewed',
      ],
      { stdio: 'inherit' }
    );
  } catch (error) {
    console.warn(
      `Could not add the cli-reviewed label: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function parseArgs(args: string[]): ReviewOptions {
  const options: ReviewOptions = {
    prNumber: 0,
    model: 'auto',
    dryRun: false,
    runAll: false,
    verbose: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--model=')) {
      options.model = arg.replace('--model=', '') as ReviewOptions['model'];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--all') {
      options.runAll = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg.startsWith('--')) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    } else {
      const match = arg.match(/(\d+)$/);
      if (match?.[1] !== undefined) {
        options.prNumber = parseInt(match[1], 10);
      }
    }
  }

  return options;
}

function printCLIStatus(clis: CLIHealth[]): void {
  console.log('Available CLI tools:');
  for (const cli of clis) {
    const status = cli.available ? `✅ ${cli.version ?? 'available'}` : '❌ not found';
    console.log(`  ${cli.name}: ${status}`);
  }
  console.log('');
}

function selectModelsToRun(options: ReviewOptions, clis: CLIHealth[]): string[] {
  if (options.runAll) {
    return clis.filter((c) => c.available).map((c) => c.name);
  }

  const selected = selectModel(options.model, clis);
  if (selected === null) {
    process.exit(1);
  }
  return [selected];
}

async function runReviewForModel(
  model: string,
  diff: string,
  reviewer: string,
  timestamp: string
): Promise<ReviewResult | null> {
  console.log(`\n📝 Running ${model} review...`);

  try {
    const prompt = REVIEW_PROMPT + diff.slice(0, 100000);
    const output = await runCLIReview(model, prompt);
    const { decision, findings } = parseReviewOutput(output);
    const hash = generateHash(output + timestamp + reviewer);

    console.log(`  Decision: ${decision}`);
    console.log(`  Findings: ${String(findings.length)}`);

    return {
      model,
      decision,
      summary: output.split('\n').slice(-5).join('\n').trim(),
      findings,
      hash,
      timestamp,
      reviewer,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  Error: ${message}`);
    return null;
  }
}

function handleReviewResult(
  result: ReviewResult,
  prInfo: PRInfo,
  prNumber: number,
  dryRun: boolean,
  isLast: boolean
): void {
  const comment = formatGitHubComment(result, prInfo);

  if (dryRun) {
    console.log(`\n--- DRY RUN: Would post for ${result.model} ---`);
    console.log(comment);
    console.log('--- END DRY RUN ---\n');
  } else {
    console.log(`\n📤 Posting ${result.model} review to GitHub...`);
    postReviewToGitHub(prNumber, comment, isLast);
    console.log('  ✅ Posted successfully');
  }
}

async function collectReviewResults(
  modelsToRun: readonly string[],
  diff: string,
  reviewer: string,
  timestamp: string
): Promise<ReviewResult[]> {
  const results: ReviewResult[] = [];
  for (const model of modelsToRun) {
    const result = await runReviewForModel(model, diff, reviewer, timestamp);
    if (result !== null) {
      results.push(result);
    }
  }
  return results;
}

function processReviewResults(
  results: readonly ReviewResult[],
  prInfo: PRInfo,
  prNumber: number,
  dryRun: boolean
): void {
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result !== undefined) {
      handleReviewResult(result, prInfo, prNumber, dryRun, i === results.length - 1);
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.prNumber === 0) {
    console.log(HELP_TEXT);
    process.exit(1);
  }

  console.log(`\n🔍 PR Review #${String(options.prNumber)}\n`);

  const clis = getAvailableCLIs();
  printCLIStatus(clis);

  const modelsToRun = selectModelsToRun(options, clis);
  console.log(`Using model(s): ${modelsToRun.join(', ')}\n`);

  console.log('Fetching PR data...');
  const prInfo = getPRInfo(options.prNumber);
  const diff = getPRDiff(options.prNumber);

  if (options.verbose) {
    console.log(`PR: ${prInfo.title}`);
    console.log(`Author: ${prInfo.author}`);
    console.log(`Diff size: ${String(diff.length)} characters\n`);
  }

  const reviewer = exec('git config user.name') || exec('whoami') || 'unknown';
  const timestamp = new Date().toISOString();
  const results = await collectReviewResults(modelsToRun, diff, reviewer, timestamp);

  if (results.length === 0) {
    console.error('\nNo reviews completed successfully.');
    process.exit(1);
  }

  processReviewResults(results, prInfo, options.prNumber, options.dryRun);

  if (!options.dryRun) {
    console.log(`\n✅ Review complete! PR #${String(options.prNumber)} marked as cli-reviewed.\n`);
  }
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
