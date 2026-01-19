/**
 * nexus-agents setup command
 *
 * Configures Claude CLI integration with nexus-agents MCP server.
 * Generates MCP configuration snippet and .claude/rules/nexus-agents.md.
 *
 * @module cli/setup-command
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 */

import { existsSync } from 'node:fs';
import type { SetupOptions, SetupResult, SetupStep, EnvironmentInfo } from './setup-types.js';
import { SetupOptionsSchema } from './setup-types.js';
import {
  detectEnvironment,
  generateMcpSnippet,
  generateRulesContent,
  createRulesFile,
  getRulesFilePath,
  formatStatus,
  formatHeader,
  formatCodeBlock,
  isInteractive,
} from './setup-helpers.js';
import { VERSION } from '../version.js';

// ============================================================================
// Output Helpers
// ============================================================================

/**
 * Writes a line to stdout.
 */
function writeLine(text: string): void {
  process.stdout.write(text + '\n');
}

/**
 * Writes an empty line.
 */
function writeEmptyLine(): void {
  process.stdout.write('\n');
}

/**
 * Prints MCP snippet section.
 */
function printMcpSnippet(snippet: string): void {
  writeLine(formatHeader('MCP Configuration'));
  writeLine('─'.repeat(40));
  writeLine('Add this to ~/.claude/mcp.json:');
  writeEmptyLine();
  writeLine(formatCodeBlock(snippet));
  writeEmptyLine();
  writeLine("Or run: claude mcp add-json nexus-agents '<snippet>'");
  writeEmptyLine();
}

/**
 * Prints rules file section.
 */
function printRulesFile(rulesPath: string): void {
  writeLine(formatHeader('Rules File'));
  writeLine('─'.repeat(40));
  writeLine(`Created: ${rulesPath}`);
  writeLine('Claude will now have context about nexus-agents tools.');
  writeEmptyLine();
}

/**
 * Prints warnings section.
 */
function printWarnings(warnings: readonly string[]): void {
  writeLine(formatHeader('Warnings'));
  writeLine('─'.repeat(40));
  for (const warning of warnings) {
    writeLine(`⚠ ${warning}`);
  }
  writeEmptyLine();
}

/**
 * Prints errors section.
 */
function printErrors(errors: readonly string[]): void {
  writeLine(formatHeader('Errors'));
  writeLine('─'.repeat(40));
  for (const error of errors) {
    writeLine(`✗ ${error}`);
  }
  writeEmptyLine();
}

/**
 * Prints next steps section.
 */
function printNextSteps(hasMcpSnippet: boolean): void {
  writeLine(formatHeader('Next Steps'));
  writeLine('─'.repeat(40));
  if (hasMcpSnippet) {
    writeLine('1. Add the MCP snippet to ~/.claude/mcp.json');
    writeLine('2. Restart Claude Desktop (if using)');
  }
  writeLine('3. Run: nexus-agents doctor');
  writeLine('4. Try: nexus-agents orchestrate "Hello World"');
  writeEmptyLine();
}

/**
 * Prints steps with status indicators.
 */
function printSteps(steps: readonly SetupStep[], verbose: boolean): void {
  for (const step of steps) {
    const status = formatStatus(step.status);
    const duration = step.durationMs !== undefined ? ` (${String(step.durationMs)}ms)` : '';
    writeLine(`${status} ${step.name}${verbose ? duration : ''}`);
    if (step.message !== undefined && (verbose || step.status === 'failed')) {
      writeLine(`  ${step.message}`);
    }
  }
  writeEmptyLine();
}

/**
 * Prints result summary line.
 */
function printSummary(success: boolean): void {
  const summary = success ? '✓ Setup completed successfully!' : '✗ Setup completed with errors';
  writeLine(success ? `\x1b[32m${summary}\x1b[0m` : `\x1b[31m${summary}\x1b[0m`);
  writeEmptyLine();
}

// ============================================================================
// Setup Steps
// ============================================================================

/**
 * Runs the environment detection step.
 */
function runDetectionStep(projectRoot: string): { env: EnvironmentInfo; step: SetupStep } {
  const startTime = Date.now();
  const env = detectEnvironment(projectRoot);

  return {
    env,
    step: {
      name: 'Environment Detection',
      status: 'success',
      message: `Platform: ${env.platform}, Claude CLI: ${env.claudeCli.installed ? (env.claudeCli.version ?? 'installed') : 'not found'}`,
      durationMs: Date.now() - startTime,
    },
  };
}

/**
 * Runs the MCP configuration step.
 */
function runMcpConfigStep(
  env: EnvironmentInfo,
  options: SetupOptions
): { step: SetupStep; snippet: string | undefined } {
  const startTime = Date.now();

  if (options.skipMcp) {
    return {
      step: {
        name: 'MCP Configuration',
        status: 'skipped',
        message: 'Skipped (--skip-mcp)',
        durationMs: Date.now() - startTime,
      },
      snippet: undefined,
    };
  }

  // Check if already configured
  if (env.existingMcpConfig?.hasNexusAgents === true && !options.force) {
    return {
      step: {
        name: 'MCP Configuration',
        status: 'skipped',
        message: 'nexus-agents already configured in mcp.json (use --force to update)',
        durationMs: Date.now() - startTime,
      },
      snippet: undefined,
    };
  }

  // Generate snippet for user to paste
  const snippet = generateMcpSnippet(!env.claudeCli.installed);

  return {
    step: {
      name: 'MCP Configuration',
      status: 'success',
      message: 'Generated MCP configuration snippet',
      durationMs: Date.now() - startTime,
    },
    snippet,
  };
}

/** Creates a rules step result. */
function makeRulesResult(
  status: SetupStep['status'],
  message: string,
  startTime: number,
  rulesPath?: string
): { step: SetupStep; rulesPath: string | undefined } {
  return {
    step: { name: 'Rules File', status, message, durationMs: Date.now() - startTime },
    rulesPath,
  };
}

/**
 * Runs the rules file generation step.
 */
function runRulesStep(
  env: EnvironmentInfo,
  options: SetupOptions
): { step: SetupStep; rulesPath: string | undefined } {
  const startTime = Date.now();

  if (options.skipRules) {
    return makeRulesResult('skipped', 'Skipped (--skip-rules)', startTime);
  }

  const rulesPath = getRulesFilePath(env.projectInfo.root);
  if (existsSync(rulesPath) && !options.force) {
    return makeRulesResult(
      'skipped',
      'Rules file already exists (use --force to overwrite)',
      startTime
    );
  }

  try {
    const createdPath = createRulesFile(env.projectInfo.root, options.dryRun);
    const msg = options.dryRun ? `Would create: ${createdPath}` : `Created: ${createdPath}`;
    return makeRulesResult('success', msg, startTime, createdPath);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return makeRulesResult('failed', `Failed to create rules file: ${msg}`, startTime);
  }
}

// ============================================================================
// Main Command
// ============================================================================

/**
 * Runs the setup command.
 */
export function runSetup(options: Partial<SetupOptions> = {}): SetupResult {
  const startTime = Date.now();
  const parsedOptions = SetupOptionsSchema.parse(options);
  const projectRoot = process.cwd();

  const steps: SetupStep[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  // Step 1: Environment Detection
  const { env, step: detectionStep } = runDetectionStep(projectRoot);
  steps.push(detectionStep);

  // Check Claude CLI availability
  if (!env.claudeCli.installed) {
    warnings.push(
      'Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code'
    );
    warnings.push('The MCP snippet uses npx to run nexus-agents (works without global install).');
  }

  // Step 2: MCP Configuration
  const { step: mcpStep, snippet } = runMcpConfigStep(env, parsedOptions);
  steps.push(mcpStep);

  // Step 3: Rules File
  const { step: rulesStep, rulesPath } = runRulesStep(env, parsedOptions);
  steps.push(rulesStep);

  // Check for any failed steps
  const hasFailures = steps.some((s) => s.status === 'failed');
  if (hasFailures) {
    const failedSteps = steps.filter((s) => s.status === 'failed');
    for (const s of failedSteps) {
      errors.push(s.message ?? `${s.name} failed`);
    }
  }

  // Build result with optional properties conditionally included
  const result: SetupResult = {
    success: !hasFailures,
    steps,
    warnings,
    errors,
    durationMs: Date.now() - startTime,
    ...(snippet !== undefined && { mcpSnippet: snippet }),
    ...(rulesPath !== undefined && { rulesPath }),
  };

  return result;
}

/**
 * Prints the setup result.
 */
export function printSetupResult(result: SetupResult, verbose: boolean): void {
  writeEmptyLine();
  writeLine(formatHeader(`Nexus Agents Setup v${VERSION}`));
  writeLine('═'.repeat(40));
  writeEmptyLine();

  printSteps(result.steps, verbose);

  // Print optional sections
  if (result.mcpSnippet !== undefined) printMcpSnippet(result.mcpSnippet);
  if (result.rulesPath !== undefined) printRulesFile(result.rulesPath);
  if (result.warnings.length > 0) printWarnings(result.warnings);
  if (result.errors.length > 0) printErrors(result.errors);
  printNextSteps(result.mcpSnippet !== undefined);

  printSummary(result.success);
}

/**
 * Setup command entry point.
 *
 * @returns Exit code (0 = success, 1 = failure)
 */
export function setupCommand(options: Partial<SetupOptions> = {}): number {
  const parsedOptions = SetupOptionsSchema.parse(options);

  // Check for non-interactive mode in CI
  if (!isInteractive() && !parsedOptions.nonInteractive) {
    writeLine('Non-interactive environment detected.');
    writeLine('Run with --non-interactive or set CI=true.');
    return 1;
  }

  const result = runSetup(options);
  printSetupResult(result, parsedOptions.verbose);

  return result.success ? 0 : 1;
}

// ============================================================================
// Exports
// ============================================================================

export { generateMcpSnippet, generateRulesContent, detectEnvironment };
export type { SetupOptions, SetupResult };
