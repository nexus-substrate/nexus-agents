/**
 * nexus-agents setup command
 *
 * Configures Claude CLI integration with nexus-agents MCP server.
 * Generates MCP configuration snippet and .claude/rules/nexus-agents.md.
 *
 * @module cli/setup-command
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 * (Source: Issue #425 - Interactive setup wizard)
 */

import { existsSync } from 'node:fs';
import type { SetupOptions, SetupResult, SetupStep, EnvironmentInfo } from './setup-types.js';
import { SetupOptionsSchema } from './setup-types.js';
import { getTimeProvider, getErrorMessage } from '../core/index.js';
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
  configureMcpServer,
  // Hook configuration (Issue #416)
  configureHooks,
  generateHookSnippet,
} from './setup-helpers.js';
import type { McpConfigResult, HookConfigResult } from './setup-helpers.js';
import { VERSION } from '../version.js';
import { runWizard } from './setup-wizard.js';

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
 * Prints MCP configuration result section.
 */
function printMcpResult(mcpResult: McpConfigResult, snippet: string | undefined): void {
  writeLine(formatHeader('MCP Configuration'));
  writeLine('─'.repeat(40));
  if (mcpResult.success) {
    writeLine(mcpResult.message);
    writeLine('Run `/mcp` in Claude Code to verify.');
  } else {
    writeLine(`Failed: ${mcpResult.message}`);
    if (snippet !== undefined) {
      writeEmptyLine();
      writeLine('Manual fallback - run:');
      writeEmptyLine();
      writeLine(formatCodeBlock(`claude mcp add-json nexus-agents '${snippet}'`));
    }
  }
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
 * Prints hooks configuration result section.
 * (Source: Issue #416)
 */
function printHooksResult(hookResult: HookConfigResult, snippet: string | undefined): void {
  writeLine(formatHeader('Hooks Configuration'));
  writeLine('─'.repeat(40));
  if (hookResult.success) {
    writeLine(hookResult.message);
    writeLine('Hooks will track sessions, metrics, and validate tool use.');
  } else {
    writeLine(`Note: ${hookResult.message}`);
    if (snippet !== undefined) {
      writeEmptyLine();
      writeLine('Manual fallback - add to ~/.claude/settings.json:');
      writeEmptyLine();
      writeLine(formatCodeBlock(snippet));
    }
  }
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
function printNextSteps(mcpConfigured: boolean, hasMcpSnippet: boolean): void {
  writeLine(formatHeader('Next Steps'));
  writeLine('─'.repeat(40));
  if (hasMcpSnippet && !mcpConfigured) {
    writeLine('1. Configure MCP manually (see above)');
    writeLine('2. Restart Claude Code');
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
  const time = getTimeProvider();
  const startTime = time.now();
  const env = detectEnvironment(projectRoot);

  return {
    env,
    step: {
      name: 'Environment Detection',
      status: 'success',
      message: `Platform: ${env.platform}, Claude CLI: ${env.claudeCli.installed ? (env.claudeCli.version ?? 'installed') : 'not found'}`,
      durationMs: time.now() - startTime,
    },
  };
}

/** MCP step result type. */
type McpStepResult = {
  step: SetupStep;
  snippet: string | undefined;
  mcpResult: McpConfigResult | undefined;
};

/** Creates an MCP step result. */
function makeMcpResult(
  status: SetupStep['status'],
  message: string,
  startTime: number,
  snippet?: string,
  mcpResult?: McpConfigResult
): McpStepResult {
  return {
    step: {
      name: 'MCP Configuration',
      status,
      message,
      durationMs: getTimeProvider().now() - startTime,
    },
    snippet,
    mcpResult,
  };
}

/**
 * Runs the MCP configuration step.
 */
function runMcpConfigStep(env: EnvironmentInfo, options: SetupOptions): McpStepResult {
  const startTime = getTimeProvider().now();

  if (options.skipMcp) {
    return makeMcpResult('skipped', 'Skipped (--skip-mcp)', startTime);
  }

  const useNpx = !env.claudeCli.installed;
  const snippet = generateMcpSnippet(useNpx);

  if (!env.claudeCli.installed) {
    const mcpResult: McpConfigResult = {
      success: false,
      alreadyConfigured: false,
      message: 'Claude CLI not installed',
    };
    return makeMcpResult(
      'warning',
      'Claude CLI not found - manual configuration required',
      startTime,
      snippet,
      mcpResult
    );
  }

  const mcpResult = configureMcpServer(useNpx, options.force);
  const status = mcpResult.success
    ? mcpResult.alreadyConfigured
      ? 'skipped'
      : 'success'
    : 'failed';
  return makeMcpResult(
    status,
    mcpResult.message,
    startTime,
    mcpResult.success ? undefined : snippet,
    mcpResult
  );
}

/** Creates a rules step result. */
function makeRulesResult(
  status: SetupStep['status'],
  message: string,
  startTime: number,
  rulesPath?: string
): { step: SetupStep; rulesPath: string | undefined } {
  return {
    step: { name: 'Rules File', status, message, durationMs: getTimeProvider().now() - startTime },
    rulesPath,
  };
}

/** Creates a hooks step result. */
function makeHooksResult(
  status: SetupStep['status'],
  message: string,
  startTime: number,
  hookResult?: HookConfigResult
): { step: SetupStep; hookSnippet: string | undefined; hookResult: HookConfigResult | undefined } {
  return {
    step: {
      name: 'Hooks Configuration',
      status,
      message,
      durationMs: getTimeProvider().now() - startTime,
    },
    hookSnippet: hookResult?.success === false ? generateHookSnippet() : undefined,
    hookResult,
  };
}

/**
 * Runs the rules file generation step.
 */
function runRulesStep(
  env: EnvironmentInfo,
  options: SetupOptions
): { step: SetupStep; rulesPath: string | undefined } {
  const startTime = getTimeProvider().now();

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
    const msg = getErrorMessage(error);
    return makeRulesResult('failed', `Failed to create rules file: ${msg}`, startTime);
  }
}

/**
 * Runs the hooks configuration step.
 * (Source: Issue #416 - Setup command hook configuration)
 */
function runHooksStep(
  env: EnvironmentInfo,
  options: SetupOptions
): { step: SetupStep; hookSnippet: string | undefined; hookResult: HookConfigResult | undefined } {
  const startTime = getTimeProvider().now();

  if (options.skipHooks) {
    return makeHooksResult('skipped', 'Skipped (--skip-hooks)', startTime);
  }

  // If Claude CLI is not installed, we can't configure automatically
  if (!env.claudeCli.installed) {
    return makeHooksResult(
      'warning',
      'Claude CLI not found - manual hook configuration required',
      startTime,
      {
        success: false,
        alreadyConfigured: false,
        message: 'Claude CLI not installed',
      }
    );
  }

  // If dry-run, just report what would happen
  if (options.dryRun) {
    return makeHooksResult(
      'success',
      'Would configure nexus-agents hooks in Claude Code settings',
      startTime
    );
  }

  // Configure using Claude CLI
  const hookResult = configureHooks(options.force);
  const status = hookResult.success
    ? hookResult.alreadyConfigured
      ? 'skipped'
      : 'success'
    : 'failed';

  return makeHooksResult(status, hookResult.message, startTime, hookResult);
}

// ============================================================================
// Main Command Helpers
// ============================================================================

/**
 * Adds Claude CLI warnings if not installed.
 */
function addClaudeCliWarnings(warnings: string[], installed: boolean): void {
  if (!installed) {
    warnings.push(
      'Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code'
    );
    warnings.push('The MCP snippet uses npx to run nexus-agents (works without global install).');
  }
}

/**
 * Collects errors from failed steps.
 */
function collectErrors(steps: readonly SetupStep[]): string[] {
  return steps.filter((s) => s.status === 'failed').map((s) => s.message ?? `${s.name} failed`);
}

/** Result context for building final result. */
interface SetupResultContext {
  startTime: number;
  steps: SetupStep[];
  warnings: string[];
  mcpResult: McpConfigResult | undefined;
  snippet: string | undefined;
  hookResult: HookConfigResult | undefined;
  hookSnippet: string | undefined;
  rulesPath: string | undefined;
}

/** Builds the final setup result from context. */
function buildSetupResult(ctx: SetupResultContext): SetupResult {
  const errors = collectErrors(ctx.steps);
  const mcpConfigured = ctx.mcpResult?.success === true && !ctx.mcpResult.alreadyConfigured;
  const hooksConfigured = ctx.hookResult?.success === true && !ctx.hookResult.alreadyConfigured;

  return {
    success: errors.length === 0,
    steps: ctx.steps,
    warnings: ctx.warnings,
    errors,
    durationMs: getTimeProvider().now() - ctx.startTime,
    ...(mcpConfigured && { mcpConfigured: true }),
    ...(ctx.snippet !== undefined && { mcpSnippet: ctx.snippet }),
    ...(hooksConfigured && { hooksConfigured: true }),
    ...(ctx.hookSnippet !== undefined && { hookSnippet: ctx.hookSnippet }),
    ...(ctx.rulesPath !== undefined && { rulesPath: ctx.rulesPath }),
  };
}

// ============================================================================
// Main Command
// ============================================================================

/**
 * Runs the setup command.
 */
export function runSetup(options: Partial<SetupOptions> = {}): SetupResult {
  const startTime = getTimeProvider().now();
  const parsedOptions = SetupOptionsSchema.parse(options);
  const projectRoot = process.cwd();

  const warnings: string[] = [];

  // Step 1: Environment Detection
  const { env, step: detectionStep } = runDetectionStep(projectRoot);
  addClaudeCliWarnings(warnings, env.claudeCli.installed);

  // Step 2: MCP Configuration
  const { step: mcpStep, snippet, mcpResult } = runMcpConfigStep(env, parsedOptions);

  // Step 3: Rules File
  const { step: rulesStep, rulesPath } = runRulesStep(env, parsedOptions);

  // Step 4: Hooks Configuration (Issue #416)
  const { step: hooksStep, hookSnippet, hookResult } = runHooksStep(env, parsedOptions);

  return buildSetupResult({
    startTime,
    steps: [detectionStep, mcpStep, rulesStep, hooksStep],
    warnings,
    mcpResult,
    snippet,
    hookResult,
    hookSnippet,
    rulesPath,
  });
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

  // Print MCP result if there's a snippet (fallback needed) or it was configured
  if (result.mcpSnippet !== undefined || result.mcpConfigured === true) {
    const mcpResult: McpConfigResult =
      result.mcpConfigured === true
        ? {
            success: true,
            alreadyConfigured: false,
            message: 'Added nexus-agents MCP server to Claude Code',
          }
        : { success: false, alreadyConfigured: false, message: 'Manual configuration required' };
    printMcpResult(mcpResult, result.mcpSnippet);
  }
  // Print hooks result if there's a snippet (fallback needed) or it was configured
  if (result.hookSnippet !== undefined || result.hooksConfigured === true) {
    const hookResult: HookConfigResult =
      result.hooksConfigured === true
        ? {
            success: true,
            alreadyConfigured: false,
            message: 'Configured nexus-agents hooks in Claude Code settings',
          }
        : { success: false, alreadyConfigured: false, message: 'Manual configuration required' };
    printHooksResult(hookResult, result.hookSnippet);
  }
  if (result.rulesPath !== undefined) printRulesFile(result.rulesPath);
  if (result.warnings.length > 0) printWarnings(result.warnings);
  if (result.errors.length > 0) printErrors(result.errors);
  printNextSteps(result.mcpConfigured === true, result.mcpSnippet !== undefined);

  printSummary(result.success);
}

/**
 * Setup command entry point (synchronous, non-interactive).
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

/** Extended options including interactive flag. */
export interface SetupCommandOptions extends Partial<SetupOptions> {
  interactive?: boolean;
}

/**
 * Setup command entry point with interactive wizard support.
 * (Source: Issue #425 - Interactive setup wizard)
 *
 * @returns Exit code (0 = success, 1 = failure)
 */
export async function setupCommandAsync(options: SetupCommandOptions = {}): Promise<number> {
  // Run interactive wizard if requested
  if (options.interactive === true) {
    const wizardOptions = await runWizard();

    if (wizardOptions === undefined) {
      // User cancelled the wizard
      return 1;
    }

    // Merge wizard options with any existing options (wizard options take precedence)
    const mergedOptions = { ...options, ...wizardOptions };
    delete (mergedOptions as SetupCommandOptions).interactive; // Remove interactive flag

    const result = runSetup(mergedOptions);
    printSetupResult(result, mergedOptions.verbose ?? false);
    return result.success ? 0 : 1;
  }

  // Fall back to synchronous command
  return setupCommand(options);
}

// ============================================================================
// Exports
// ============================================================================

export { generateMcpSnippet, generateRulesContent, detectEnvironment };
export { runWizard } from './setup-wizard.js';
export type { SetupOptions, SetupResult };
// SetupCommandOptions is already exported via interface definition above
export type { WizardAnswers, UsageMode } from './setup-wizard.js';
