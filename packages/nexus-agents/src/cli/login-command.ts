/**
 * `nexus-agents login` — guided per-CLI auth status + fix instructions.
 *
 * Probes each AI CLI's real auth state (via cli-auth-probe.ts) and prints a
 * row per CLI: ✓ authenticated, ⚠ needs-login + fix command, or
 * ⊘ not-installed. When at least one CLI needs login, exit code is 1 so
 * scripts can detect the state.
 *
 * Source: Issue #2447 (round-14 onboarding audit). Uses the auth probe shared
 * with doctor (#2439).
 */

/* eslint-disable no-console */

import type { CliExitResult, ParsedCliArgs } from '../cli-types.js';
import { cliExit, EXIT_CODES } from '../cli-types.js';
import { probeAllClis } from './cli-auth-probe.js';
import type { AuthProbeResult } from './cli-auth-probe.js';

const EXIT_OK = EXIT_CODES.SUCCESS;
const EXIT_ERR = EXIT_CODES.SERVER_START_FAILED;

const STATE_GLYPH: Record<AuthProbeResult['state'], string> = {
  authenticated: '✓', // ✓
  'needs-login': '⚠', // ⚠
  'not-installed': '⊘', // ⊘
  error: '✗', // ✗
};

const STATE_LABEL: Record<AuthProbeResult['state'], string> = {
  authenticated: 'authenticated',
  'needs-login': 'needs login',
  'not-installed': 'not installed',
  error: 'error',
};

const CLI_DISPLAY: Record<string, string> = {
  claude: 'Claude Code   ',
  gemini: 'Gemini CLI    ',
  codex: 'Codex CLI     ',
  opencode: 'OpenCode CLI  ',
};

function printNextSteps(ordered: readonly AuthProbeResult[], actionable: readonly string[]): void {
  if (actionable.length === 0) return;
  console.log('');
  console.log('Next steps:');
  for (const cli of actionable) {
    const r = ordered.find((x) => x.cli === cli);
    if (r?.state !== 'needs-login') continue;
    printNextStepFor(r);
  }
}

function printNextStepFor(r: AuthProbeResult & { state: 'needs-login' }): void {
  console.log(`  ${CLI_DISPLAY[r.cli]?.trim() ?? r.cli}:  ${r.fixCommand}`);
  if (r.envFallback !== undefined) {
    const url = r.fixUrl !== undefined ? `  (${r.fixUrl})` : '';
    console.log(`    or set ${r.envFallback}=...${url}`);
    return;
  }
  if (r.fixUrl !== undefined) {
    console.log(`    docs: ${r.fixUrl}`);
  }
}

export async function handleLoginCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  // Deprecation hint when invoked via the standalone `login` command.
  // Routing through `auth status` is silent. Issue #2449.
  if (args.command === 'login') {
    console.error(
      "hint: 'nexus-agents login' is now 'nexus-agents auth status' — both work for one minor cycle."
    );
  }
  console.log('Nexus Agents — CLI authentication status');
  console.log('=========================================');
  console.log('');

  const ordered = orderForDisplay(await probeAllClis());
  for (const r of ordered) printRow(r);

  const summary = summarize(ordered);
  console.log('');
  console.log(summary.line);
  printNextSteps(ordered, summary.actionable);

  // #3942: RETURN the exit code; dispatcher owns process.exit. Mapping is
  // byte-identical: EXIT_OK (0) when authenticated or no action needed,
  // EXIT_ERR (1) when no CLI is authenticated AND there's a clear next action.
  if (summary.anyAuthenticated || summary.actionable.length === 0) {
    return cliExit(EXIT_OK);
  }
  return cliExit(EXIT_ERR);
}

/**
 * Sorts probe results into the canonical CLI display order. Exported so
 * tests can verify ordering without going through `console.log` mocking
 * (#2953 — the original file shipped with zero tests).
 */
export function orderForDisplay(results: readonly AuthProbeResult[]): readonly AuthProbeResult[] {
  // Stable order matching nexus-agents' canonical CLI list.
  const order: readonly string[] = ['claude', 'gemini', 'codex', 'opencode'];
  return [...results].sort((a, b) => order.indexOf(a.cli) - order.indexOf(b.cli));
}

function printRow(r: AuthProbeResult): void {
  const display = CLI_DISPLAY[r.cli] ?? r.cli;
  const glyph = STATE_GLYPH[r.state];
  const label = STATE_LABEL[r.state];

  if (r.state === 'authenticated') {
    const via = r.via === 'env-var' ? 'env var' : 'CLI credentials';
    console.log(`  ${glyph}  ${display} ${label.padEnd(15)} via ${via}`);
    return;
  }
  if (r.state === 'needs-login') {
    console.log(`  ${glyph}  ${display} ${label.padEnd(15)} ${r.reason}`);
    console.log(`     fix: ${r.fixCommand}`);
    return;
  }
  if (r.state === 'not-installed') {
    console.log(`  ${glyph}  ${display} ${label.padEnd(15)} ${r.reason}`);
    return;
  }
  console.log(`  ${glyph}  ${display} ${label.padEnd(15)} ${r.reason}`);
}

export interface Summary {
  readonly line: string;
  readonly actionable: readonly string[];
  readonly anyAuthenticated: boolean;
}

/**
 * Build the status summary that drives the printed footer + exit code.
 * Exported for tests (#2953): the consumer at line 86 has a 4-cell truth
 * table on `(anyAuthenticated, actionable.length)` and zero coverage
 * pre-fix.
 */
export function summarize(results: readonly AuthProbeResult[]): Summary {
  const authed = results.filter((r) => r.state === 'authenticated');
  const needsLogin = results.filter((r) => r.state === 'needs-login');
  const notInstalled = results.filter((r) => r.state === 'not-installed');

  const parts: string[] = [];
  if (authed.length > 0) parts.push(`${String(authed.length)} authenticated`);
  if (needsLogin.length > 0) parts.push(`${String(needsLogin.length)} need login`);
  if (notInstalled.length > 0) parts.push(`${String(notInstalled.length)} not installed`);

  return {
    line: `Status: ${parts.join(', ') || 'no CLIs detected'}`,
    actionable: needsLogin.map((r) => r.cli),
    anyAuthenticated: authed.length > 0,
  };
}
