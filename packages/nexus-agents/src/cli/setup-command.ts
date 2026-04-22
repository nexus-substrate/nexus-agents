/* eslint-disable max-lines -- Cohesive setup command module (governance: 400-600 OK if cohesive) */
/**
 * nexus-agents setup command
 *
 * Configures Claude CLI integration with nexus-agents MCP server.
 * Generates MCP configuration snippet and .rules/nexus-agents.md.
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
import { initDataDirectories } from './setup-data-dir.js';
import type { DataDirInitResult } from './setup-data-dir.js';
import { runConfigInitSync } from './setup-config.js';
import { detectOpenCodeCli, configureOpenCode } from './setup-opencode.js';
import { detectGeminiCli, configureGemini } from './setup-gemini.js';
import { detectCodexCli, configureCodex } from './setup-codex.js';
import { VERSION } from '../version.js';
import { runWizard } from './setup-wizard.js';
import { generatePermissionsSnippet, buildPermissionsBanner } from './setup-permissions.js';
// #2137: post-setup health gate. Surfaces install-time issues that are easy
// to miss (better-sqlite3 native build, missing API keys, unwritable data
// dirs) inline at the end of setup, with copy-pasteable remediation.
import { runVerify } from './verify-command.js';
import { colors, symbols } from './ansi-output.js';

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

/** Minimum Node.js major version required. */
const REQUIRED_NODE_MAJOR = 22;

/**
 * Runs the prerequisite validation step.
 * Checks Node.js version and warns about missing package managers.
 */
function runPrerequisiteStep(): { step: SetupStep; warnings: readonly string[] } {
  const time = getTimeProvider();
  const startTime = time.now();
  const warnings: string[] = [];

  const version = process.version;
  const major = Number(version.slice(1).split('.')[0]);
  const nodeOk = major >= REQUIRED_NODE_MAJOR;

  if (!nodeOk) {
    warnings.push(
      `Node.js ${version} detected — v${String(REQUIRED_NODE_MAJOR)}.x+ required. Some features may not work.`
    );
  }

  const status = nodeOk ? 'success' : 'warning';
  const message = nodeOk
    ? `Node.js ${version} (meets v${String(REQUIRED_NODE_MAJOR)}.x requirement)`
    : `Node.js ${version} — v${String(REQUIRED_NODE_MAJOR)}.x+ required`;

  return {
    step: {
      name: 'Prerequisite Check',
      status,
      message,
      durationMs: time.now() - startTime,
    },
    warnings,
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

  const mcpResult = configureMcpServer(useNpx, options.force, options.scope);
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

/**
 * Runs the OpenCode MCP configuration step (#1253).
 */
function runOpenCodeStep(options: SetupOptions): SetupStep {
  const startTime = getTimeProvider().now();
  if (options.skipOpencode) {
    return {
      name: 'OpenCode MCP',
      status: 'skipped',
      message: 'Skipped (--skip-opencode)',
      durationMs: 0,
    };
  }
  const cliInfo = detectOpenCodeCli();
  if (!cliInfo.installed) {
    return {
      name: 'OpenCode MCP',
      status: 'skipped',
      message: 'OpenCode CLI not installed',
      durationMs: getTimeProvider().now() - startTime,
    };
  }
  const result = configureOpenCode(options.force, options.dryRun);
  return {
    name: 'OpenCode MCP',
    status: result.success ? (result.alreadyConfigured ? 'skipped' : 'success') : 'failed',
    message: result.message,
    durationMs: getTimeProvider().now() - startTime,
  };
}

/**
 * Runs the Gemini CLI MCP configuration step (#1259).
 */
function runGeminiStep(options: SetupOptions): SetupStep {
  const startTime = getTimeProvider().now();
  if (options.skipGemini) {
    return {
      name: 'Gemini MCP',
      status: 'skipped',
      message: 'Skipped (--skip-gemini)',
      durationMs: 0,
    };
  }
  const cliInfo = detectGeminiCli();
  if (!cliInfo.installed) {
    return {
      name: 'Gemini MCP',
      status: 'skipped',
      message: 'Gemini CLI not installed',
      durationMs: getTimeProvider().now() - startTime,
    };
  }
  const result = configureGemini(options.force, options.dryRun, options.scope);
  return {
    name: 'Gemini MCP',
    status: result.success ? (result.alreadyConfigured ? 'skipped' : 'success') : 'failed',
    message: result.message,
    durationMs: getTimeProvider().now() - startTime,
  };
}

/**
 * Runs the data directory initialization step (#1249).
 */
function runDataDirStep(options: SetupOptions): { step: SetupStep; result: DataDirInitResult } {
  const startTime = getTimeProvider().now();
  const dataDirResult = initDataDirectories(options.dryRun);
  return {
    step: {
      name: 'Data Directory',
      status: dataDirResult.success
        ? dataDirResult.created.length > 0
          ? 'success'
          : 'skipped'
        : 'failed',
      message: dataDirResult.success
        ? dataDirResult.created.length > 0
          ? `Created ${String(dataDirResult.created.length)} directories`
          : 'All directories already exist'
        : `Failed: ${dataDirResult.error ?? 'Unknown error'}`,
      durationMs: getTimeProvider().now() - startTime,
    },
    result: dataDirResult,
  };
}

/**
 * Runs the Codex CLI MCP configuration step (#1263).
 */
function runCodexStep(options: SetupOptions): SetupStep {
  const startTime = getTimeProvider().now();
  if (options.skipCodex) {
    return {
      name: 'Codex MCP',
      status: 'skipped',
      message: 'Skipped (--skip-codex)',
      durationMs: 0,
    };
  }
  const cliInfo = detectCodexCli();
  if (!cliInfo.installed) {
    return {
      name: 'Codex MCP',
      status: 'skipped',
      message: 'Codex CLI not installed',
      durationMs: getTimeProvider().now() - startTime,
    };
  }
  const result = configureCodex(options.force, options.dryRun);
  return {
    name: 'Codex MCP',
    status: result.success ? (result.alreadyConfigured ? 'skipped' : 'success') : 'failed',
    message: result.message,
    durationMs: getTimeProvider().now() - startTime,
  };
}

/**
 * Runs the config file generation step (#1252).
 */
function runConfigStep(projectRoot: string, options: SetupOptions): SetupStep {
  const startTime = getTimeProvider().now();
  if (options.skipConfig) {
    return {
      name: 'Configuration',
      status: 'skipped',
      message: 'Skipped (--skip-config)',
      durationMs: 0,
    };
  }
  const result = runConfigInitSync(projectRoot, options.force, options.dryRun);
  return {
    name: 'Configuration',
    status: result.success ? (result.created ? 'success' : 'skipped') : 'failed',
    message: result.message,
    durationMs: getTimeProvider().now() - startTime,
  };
}

/** Checks a named step's status, returning a check or issue string. */
function checkStepStatus(steps: readonly SetupStep[], name: string, label: string): string {
  const step = steps.find((s) => s.name === name);
  const ok = step?.status === 'success' || step?.status === 'skipped';
  return ok ? `${label} OK` : `${label} failed`;
}

/**
 * Runs post-setup validation step (#1271).
 * Checks that critical setup outcomes are in place.
 */
function runValidationStep(steps: readonly SetupStep[]): SetupStep {
  const startTime = getTimeProvider().now();

  const mcpSteps = steps.filter((s) => s.name.includes('MCP'));
  const mcpFailed = mcpSteps.filter((s) => s.status === 'failed').length;
  const mcpCheck =
    mcpFailed > 0
      ? `${String(mcpFailed)} MCP config(s) failed`
      : `${String(mcpSteps.length)} MCP configs OK`;

  const results = [
    mcpCheck,
    checkStepStatus(steps, 'Data Directory', 'Data dirs'),
    checkStepStatus(steps, 'Configuration', 'Config'),
  ];
  const hasIssues = results.some((r) => r.includes('failed'));

  return {
    name: 'Validation',
    status: hasIssues ? 'warning' : 'success',
    message: `${results.join(', ')}. Run \`nexus-agents doctor\` for full health check`,
    durationMs: getTimeProvider().now() - startTime,
  };
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
  dataDirResult?: DataDirInitResult;
}

/** Checks if a config result represents a new (non-existing) success. */
function isNewSuccess(result: McpConfigResult | HookConfigResult | undefined): boolean {
  return result?.success === true && !result.alreadyConfigured;
}

/** Builds the final setup result from context. */
function buildSetupResult(ctx: SetupResultContext): SetupResult {
  const errors = collectErrors(ctx.steps);
  return {
    success: errors.length === 0,
    steps: ctx.steps,
    warnings: ctx.warnings,
    errors,
    durationMs: getTimeProvider().now() - ctx.startTime,
    ...(isNewSuccess(ctx.mcpResult) && { mcpConfigured: true }),
    ...(ctx.snippet !== undefined && { mcpSnippet: ctx.snippet }),
    ...(isNewSuccess(ctx.hookResult) && { hooksConfigured: true }),
    ...(ctx.hookSnippet !== undefined && { hookSnippet: ctx.hookSnippet }),
    ...(ctx.rulesPath !== undefined && { rulesPath: ctx.rulesPath }),
    ...(ctx.dataDirResult !== undefined && {
      dataDirPath: ctx.dataDirResult.rootPath,
      dataDirsCreated: ctx.dataDirResult.created.length,
    }),
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

  // Step 2: Prerequisite Validation
  const { step: prereqStep, warnings: prereqWarnings } = runPrerequisiteStep();
  warnings.push(...prereqWarnings);

  // Step 3: MCP Configuration
  const { step: mcpStep, snippet, mcpResult } = runMcpConfigStep(env, parsedOptions);

  // Step 4: Rules File
  const { step: rulesStep, rulesPath } = runRulesStep(env, parsedOptions);

  // Step 5: Hooks Configuration (Issue #416)
  const { step: hooksStep, hookSnippet, hookResult } = runHooksStep(env, parsedOptions);

  // Step 6: Data Directory Initialization (#1249)
  const { step: dataDirStep, result: dataDirResult } = runDataDirStep(parsedOptions);

  // Step 7: OpenCode MCP Configuration (#1253)
  const openCodeStep = runOpenCodeStep(parsedOptions);

  // Step 8: Gemini MCP Configuration (#1259)
  const geminiStep = runGeminiStep(parsedOptions);

  // Step 9: Codex MCP Configuration (#1263)
  const codexStep = runCodexStep(parsedOptions);

  const configStep = runConfigStep(projectRoot, parsedOptions); // Step 10
  const steps = [
    detectionStep,
    prereqStep,
    mcpStep,
    rulesStep,
    hooksStep,
    dataDirStep,
    openCodeStep,
    geminiStep,
    codexStep,
    configStep,
  ];
  steps.push(runValidationStep(steps)); // Step 11: Validation (#1271)

  return buildSetupResult({
    startTime,
    steps,
    warnings,
    mcpResult,
    snippet,
    hookResult,
    hookSnippet,
    rulesPath,
    dataDirResult,
  });
}

/** Prints optional detail sections (MCP, hooks, rules, data dir). */
function printDetailSections(result: SetupResult): void {
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
  if (result.dataDirPath !== undefined) printDataDirSection(result);
  printPermissionsSuggestion();
}

/** Prints the Claude Code permissions suggestion (#1945). */
function printPermissionsSuggestion(): void {
  const snippet = generatePermissionsSnippet('all');
  const banner = buildPermissionsBanner(snippet);
  writeLine(banner);
}

/** Prints the data directory section. */
function printDataDirSection(result: SetupResult): void {
  writeLine(formatHeader('Data Directory'));
  writeLine('─'.repeat(40));
  const count = result.dataDirsCreated ?? 0;
  const msg =
    count > 0
      ? `Created ${String(count)} directories under ${result.dataDirPath ?? ''}`
      : `All directories already exist at ${result.dataDirPath ?? ''}`;
  writeLine(msg);
  writeEmptyLine();
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
  printDetailSections(result);

  if (result.warnings.length > 0) printWarnings(result.warnings);
  if (result.errors.length > 0) printErrors(result.errors);
  printNextSteps(result.mcpConfigured === true, result.mcpSnippet !== undefined);
  printSummary(result.success);
}

/**
 * Runs the post-setup health gate (#2137).
 *
 * After setup writes its files, this runs the verify checks and prints a
 * structured health summary inline. Returns `true` when no `severity: 'hard'`
 * checks failed — warnings still pass the gate.
 *
 * In `--dry-run` mode, the gate is skipped entirely (the user is previewing,
 * not actually installing).
 */
async function runPostSetupHealthGate(dryRun: boolean): Promise<boolean> {
  if (dryRun) return true;

  const result = await runVerify();
  const passed = result.checks.filter((c) => c.passed).length;
  const total = result.checks.length;

  writeEmptyLine();
  writeLine(formatHeader(`Health check (${String(passed)}/${String(total)} passed)`));
  writeLine('─'.repeat(40));

  for (const check of result.checks) {
    let symbol: string;
    if (check.passed) {
      symbol = `${colors.green}${symbols.check}${colors.reset}`;
    } else if (check.severity === 'warn') {
      symbol = `${colors.yellow}${symbols.warn}${colors.reset}`;
    } else {
      symbol = `${colors.red}${symbols.cross}${colors.reset}`;
    }
    writeLine(`  ${symbol} ${check.name}: ${check.message}`);
    if (!check.passed && check.fix !== undefined) {
      writeLine(`     ${colors.dim}→ Fix: ${check.fix}${colors.reset}`);
    }
  }

  writeEmptyLine();
  if (!result.noHardFailures) {
    writeLine(
      `${colors.red}${colors.bold}Action required: fix the blocking issues above before using nexus-agents.${colors.reset}`
    );
  } else if (!result.allPassed) {
    const warnCount = result.checks.filter((c) => !c.passed).length;
    writeLine(
      `${colors.yellow}${colors.bold}Setup complete with ${String(warnCount)} warning(s) — nexus-agents will run but some features are degraded.${colors.reset}`
    );
  } else {
    writeLine(
      `${colors.green}${colors.bold}All health checks passed. nexus-agents is ready.${colors.reset}`
    );
  }

  return result.noHardFailures;
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
 * Also runs the post-setup health gate (#2137): after the configuration
 * steps complete, calls into `runVerify()` to surface install-time issues
 * that are easy to miss but break things at runtime (better-sqlite3 native
 * build, data dir writability, missing API keys). Health-gate warnings do
 * NOT fail setup — only `severity: 'hard'` failures do.
 *
 * @returns Exit code (0 = setup + no hard health failures, 1 = either failed)
 */
/**
 * Runs the interactive wizard branch and returns its exit code.
 * Extracted from `setupCommandAsync` to keep cyclomatic complexity ≤10.
 */
async function runInteractiveSetup(options: SetupCommandOptions): Promise<number> {
  const wizardOptions = await runWizard();
  if (wizardOptions === undefined) return 1; // User cancelled.

  const mergedOptions = { ...options, ...wizardOptions };
  delete mergedOptions.interactive;

  const result = runSetup(mergedOptions);
  printSetupResult(result, mergedOptions.verbose ?? false);
  const healthOk = await runPostSetupHealthGate(mergedOptions.dryRun ?? false);
  return result.success && healthOk ? 0 : 1;
}

export async function setupCommandAsync(options: SetupCommandOptions = {}): Promise<number> {
  if (options.interactive === true) {
    return runInteractiveSetup(options);
  }

  // Sync setup, then run the health gate.
  const setupExitCode = setupCommand(options);
  const healthOk = await runPostSetupHealthGate(options.dryRun ?? false);
  // Hard health failures override a successful setup; warnings don't.
  return setupExitCode !== 0 || !healthOk ? 1 : 0;
}

// ============================================================================
// Exports
// ============================================================================

export { generateMcpSnippet, generateRulesContent, detectEnvironment };
export { runWizard } from './setup-wizard.js';
export type { SetupOptions, SetupResult };
// SetupCommandOptions is already exported via interface definition above
export type { WizardAnswers, UsageMode } from './setup-wizard.js';
