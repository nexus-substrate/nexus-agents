/**
 * nexus-agents hello command
 *
 * Minimal "hello world" command that works WITHOUT API keys.
 * Shows welcome message, version, system info, and quick start steps.
 *
 * (Source: Issue #423)
 */

import { VERSION } from '../version.js';

/** API key environment variable names. */
const API_KEY_VARS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_API_KEY'] as const;

/** ANSI color codes for terminal output. */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const;

/**
 * Hello command result containing system information.
 */
export interface HelloResult {
  readonly version: string;
  readonly nodeVersion: string;
  readonly platform: string;
  readonly arch: string;
  readonly apiKeysConfigured: number;
  readonly apiKeysTotal: number;
}

/**
 * Gathers system information for the hello command.
 * Does NOT require API keys or external dependencies.
 */
export function gatherSystemInfo(): HelloResult {
  const apiKeysConfigured = API_KEY_VARS.filter(
    (key) => typeof process.env[key] === 'string' && process.env[key] !== ''
  ).length;

  return {
    version: VERSION,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    apiKeysConfigured,
    apiKeysTotal: API_KEY_VARS.length,
  };
}

/**
 * Prints the hello command output.
 */
export function printHelloResult(result: HelloResult): void {
  const write = (text: string): void => {
    process.stdout.write(text + '\n');
  };

  write('');
  write(`${colors.bold}${colors.green}Welcome to Nexus Agents!${colors.reset}`);
  write('');

  // Version and system info
  write(`${colors.cyan}Version:${colors.reset}  v${result.version}`);
  write(`${colors.cyan}Node.js:${colors.reset}  ${result.nodeVersion}`);
  write(`${colors.cyan}Platform:${colors.reset} ${result.platform} (${result.arch})`);
  write(
    `${colors.cyan}API Keys:${colors.reset} ${String(result.apiKeysConfigured)} of ${String(result.apiKeysTotal)} configured`
  );
  write('');

  // Quick start steps
  write(`${colors.bold}Quick Start:${colors.reset}`);
  write(
    `  1. Run ${colors.cyan}nexus-agents setup${colors.reset} to configure Claude CLI integration`
  );
  write(`  2. Run ${colors.cyan}nexus-agents doctor${colors.reset} to check system health`);
  write(`  3. Run ${colors.cyan}nexus-agents --help${colors.reset} for all commands`);
  write('');

  // API key hint if none configured
  if (result.apiKeysConfigured === 0) {
    write(
      `${colors.yellow}Tip:${colors.reset} Set ANTHROPIC_API_KEY to enable orchestration features.`
    );
    write('');
  }

  write(
    `${colors.dim}Documentation: https://github.com/williamzujkowski/nexus-agents${colors.reset}`
  );
  write('');
}

/**
 * Runs the hello command.
 * Always returns exit code 0 (success).
 */
export function helloCommand(): number {
  const result = gatherSystemInfo();
  printHelloResult(result);
  return 0;
}
