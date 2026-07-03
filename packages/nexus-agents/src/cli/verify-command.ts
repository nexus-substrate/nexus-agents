/**
 * nexus-agents/cli - Verify Command
 *
 * Quick verification that installation works correctly.
 * No API keys required - runs offline checks only.
 *
 * @module cli/verify-command
 * (Source: Issue #253 - Quick verification step after installation)
 */

import { VERSION } from '../version.js';
import { getTimeProvider } from '../core/index.js';
import { defaultConfig } from '../config/index.js';
import { BUILT_IN_EXPERTS } from '../agents/experts/expert-config.js';
import { colors, symbols } from './ansi-output.js';
import { checkSqlite, checkDataDirectory, checkApiKeys } from './doctor.js';
import { probeAllClis } from './cli-auth-probe.js';

/**
 * Verify command options.
 */
export interface VerifyOptions {
  readonly verbose: boolean;
}

/**
 * Severity of a failed check.
 *
 * - `hard`: functionality is broken (e.g. Node version too low, core exports
 *   missing). Exit code 1.
 * - `warn`: functionality is degraded but usable (e.g. better-sqlite3 missing
 *   → only some memory backends unavailable; no CLI adapters detected →
 *   orchestrator still works via API keys). Exit code 0.
 *
 * Unused on passing checks.
 */
export type VerifySeverity = 'hard' | 'warn';

/**
 * Single verification check result.
 */
export interface VerifyCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly message: string;
  readonly fix?: string;
  /**
   * Severity for failed checks. Defaults to `hard` when omitted. Passing
   * checks ignore this field.
   */
  readonly severity?: VerifySeverity;
}

/**
 * Complete verification result.
 */
export interface VerifyResult {
  readonly version: string;
  readonly nodeVersion: string;
  readonly checks: readonly VerifyCheck[];
  /** True when every check passed. */
  readonly allPassed: boolean;
  /**
   * True when no check failed with `severity: 'hard'`. Drives the exit code:
   * warnings alone do not fail verification (exit 0 with warnings printed).
   */
  readonly noHardFailures: boolean;
  readonly durationMs: number;
}

/**
 * Checks if Node.js version is supported.
 */
function checkNodeVersion(): VerifyCheck {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0] ?? '0', 10);

  if (major >= 22) {
    return {
      name: 'Node.js Version',
      passed: true,
      message: `${version} (LTS)`,
    };
  }

  if (major >= 18) {
    return {
      name: 'Node.js Version',
      passed: true,
      message: `${version} (supported, recommend 22.x LTS)`,
    };
  }

  return {
    name: 'Node.js Version',
    passed: false,
    message: `${version} (unsupported)`,
    fix: 'Install Node.js 22.x LTS from https://nodejs.org',
  };
}

/**
 * Checks if package exports are accessible.
 */
function checkPackageExports(): VerifyCheck {
  try {
    // Check if we can access core exports
    const hasVersion = typeof VERSION === 'string' && VERSION.length > 0;
    const hasConfig = typeof defaultConfig === 'object';
    const hasBuiltInExperts = typeof BUILT_IN_EXPERTS === 'object';

    if (hasVersion && hasConfig && hasBuiltInExperts) {
      return {
        name: 'Package Exports',
        passed: true,
        message: 'All core modules accessible',
      };
    }

    return {
      name: 'Package Exports',
      passed: false,
      message: 'Some modules failed to load',
      fix: 'Try reinstalling: npm install -g nexus-agents',
    };
  } catch {
    return {
      name: 'Package Exports',
      passed: false,
      message: 'Failed to load core modules',
      fix: 'Try reinstalling: npm install -g nexus-agents',
    };
  }
}

/**
 * Checks if default configuration is accessible.
 */
function checkConfigLoading(): VerifyCheck {
  try {
    const hasModels = typeof defaultConfig.models === 'object';
    const hasSecurity = typeof defaultConfig.security === 'object';

    if (hasModels && hasSecurity) {
      return {
        name: 'Configuration',
        passed: true,
        message: 'Default config accessible',
      };
    }

    return {
      name: 'Configuration',
      passed: true, // Config errors are not fatal for verification
      message: 'Using default configuration',
    };
  } catch {
    // #4181: config breakage must SURFACE in the diagnostic instead of being
    // reported as a pass. Warn severity — degraded, not a hard gate (exit 0).
    return {
      name: 'Configuration',
      passed: false,
      severity: 'warn',
      message: 'Failed to load default configuration',
      fix: 'Reinstall nexus-agents (npm install -g nexus-agents); if a local config override exists, check it for syntax errors',
    };
  }
}

/**
 * Checks expert system availability.
 */
function checkExpertSystem(): VerifyCheck {
  const expertTypes = Object.keys(BUILT_IN_EXPERTS);
  const count = expertTypes.length;

  if (count >= 5) {
    return {
      name: 'Expert System',
      passed: true,
      message: `${String(count)} expert types available`,
    };
  }

  return {
    name: 'Expert System',
    passed: false,
    message: 'Expert types not loaded',
    fix: 'Try reinstalling: npm install -g nexus-agents',
  };
}

/**
 * Checks that better-sqlite3 loads. Memory backends (agentic, adaptive, typed,
 * mobimem, decay) are unavailable if it's missing — functional degradation,
 * not a hard failure. Rebuilding the native module or reinstalling usually
 * fixes it.
 */
async function checkSqliteAvailability(): Promise<VerifyCheck> {
  const result = await checkSqlite();
  if (result.available) {
    return {
      name: 'SQLite Storage',
      passed: true,
      message: 'better-sqlite3 loaded (memory backends available)',
    };
  }
  return {
    name: 'SQLite Storage',
    passed: false,
    severity: 'warn',
    message: result.error ?? 'better-sqlite3 not available',
    fix: 'Run "pnpm rebuild better-sqlite3" or reinstall nexus-agents',
  };
}

/**
 * Checks that the nexus-agents data directories (per-repo + cross-repo
 * roots per epic #2872) exist and are writable.
 * `cli-commands.ts::dispatchCommand` initializes them lazily (#1398), so
 * missing dirs are a hard failure (persistence will silently drop writes).
 */
function checkDataDirs(): VerifyCheck {
  const result = checkDataDirectory();
  const unwritable = result.subdirectories.filter((s) => !s.exists || !s.writable);
  if (result.rootExists && unwritable.length === 0) {
    return {
      name: 'Data Directories',
      passed: true,
      message: `${result.rootPath} (all subdirectories writable)`,
    };
  }
  if (!result.rootExists) {
    return {
      name: 'Data Directories',
      passed: false,
      severity: 'warn',
      message: `${result.rootPath} does not exist`,
      fix: 'Run any nexus-agents command — directories auto-initialize on first run',
    };
  }
  return {
    name: 'Data Directories',
    passed: false,
    severity: 'warn',
    message: `${String(unwritable.length)} subdirectory(ies) unwritable: ${unwritable
      .map((s) => s.name)
      .join(', ')}`,
    fix: `Check filesystem permissions on ${result.rootPath}`,
  };
}

/**
 * Checks that at least one execution path is configured — either an API key
 * (direct adapter) or a CLI that's actually authenticated. Without either,
 * the orchestrator has nothing to dispatch to.
 *
 * #2437: previously only checked env vars, so verify reported "No API keys
 * configured / degraded" while doctor (post-#2448) correctly reported the
 * CLI as authed. Both were accurate but disagreed in tone, confusing
 * operators. Now verify uses the same auth probe doctor uses, so they
 * align on the available-paths question.
 */
async function checkAdapterAvailability(): Promise<VerifyCheck> {
  const keys = checkApiKeys();
  const configuredKeys = keys.filter((k) => k.configured);
  const authedClis = (await probeAllClis()).filter((p) => p.state === 'authenticated');

  if (configuredKeys.length > 0 || authedClis.length > 0) {
    const parts: string[] = [];
    if (configuredKeys.length > 0) {
      parts.push(
        `${String(configuredKeys.length)} API key(s): ${configuredKeys.map((k) => k.name).join(', ')}`
      );
    }
    if (authedClis.length > 0) {
      parts.push(
        `${String(authedClis.length)} authed CLI(s): ${authedClis.map((p) => p.cli).join(', ')}`
      );
    }
    return {
      name: 'Adapter Availability',
      passed: true,
      message: parts.join('; '),
    };
  }

  return {
    name: 'Adapter Availability',
    passed: false,
    severity: 'warn',
    message: 'No API keys and no authed CLIs detected',
    fix: 'Run "nexus-agents login" to see per-CLI status, then "claude /login" / "codex login" / etc., or set ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_AI_API_KEY',
  };
}

/**
 * Runs all verification checks.
 */
export async function runVerify(): Promise<VerifyResult> {
  const time = getTimeProvider();
  const startTime = time.now();

  const checks: VerifyCheck[] = [
    checkNodeVersion(),
    checkPackageExports(),
    checkConfigLoading(),
    checkExpertSystem(),
    await checkSqliteAvailability(),
    checkDataDirs(),
    await checkAdapterAvailability(),
  ];

  const allPassed = checks.every((c) => c.passed);
  const noHardFailures = checks.every((c) => c.passed || c.severity === 'warn');
  const durationMs = time.now() - startTime;

  return {
    version: VERSION,
    nodeVersion: process.version,
    checks,
    allPassed,
    noHardFailures,
    durationMs,
  };
}

/**
 * Formats a single check result.
 *
 * Failed-but-warn checks render as yellow warnings (degraded). Failed hard
 * checks render as red crosses.
 */
function formatCheck(check: VerifyCheck): string {
  let symbol: string;
  if (check.passed) {
    symbol = `${colors.green}${symbols.check}${colors.reset}`;
  } else if (check.severity === 'warn') {
    symbol = `${colors.yellow}${symbols.warn}${colors.reset}`;
  } else {
    symbol = `${colors.red}${symbols.cross}${colors.reset}`;
  }

  let line = `  ${symbol} ${check.name}: ${check.message}`;

  if (!check.passed && check.fix !== undefined) {
    line += `\n     ${colors.dim}Fix: ${check.fix}${colors.reset}`;
  }

  return line;
}

/**
 * Prints verification results to stdout.
 */
export function printVerifyResult(result: VerifyResult, verbose: boolean): void {
  process.stdout.write('\n');
  process.stdout.write(`${colors.bold}nexus-agents verify${colors.reset}\n`);
  process.stdout.write('===================\n');
  process.stdout.write('\n');
  process.stdout.write(`Version: ${result.version}\n`);
  process.stdout.write(`Node.js: ${result.nodeVersion}\n`);
  process.stdout.write('\n');

  process.stdout.write(`${colors.cyan}Running checks...${colors.reset}\n`);
  process.stdout.write('\n');

  for (const check of result.checks) {
    process.stdout.write(formatCheck(check) + '\n');
  }

  process.stdout.write('\n');

  const warnCount = result.checks.filter((c) => !c.passed && c.severity === 'warn').length;
  const hardCount = result.checks.filter((c) => !c.passed && c.severity !== 'warn').length;

  if (result.allPassed) {
    process.stdout.write(
      `${colors.green}${colors.bold}Installation verified successfully!${colors.reset}\n`
    );
    process.stdout.write('\n');
    process.stdout.write(`${colors.cyan}Next steps:${colors.reset}\n`);
    process.stdout.write('  1. Run "nexus-agents doctor" to check external CLI integrations\n');
    process.stdout.write(
      '  2. Run "nexus-agents review --setup" to configure GitHub integration\n'
    );
    process.stdout.write('  3. Try "nexus-agents --help" for all available commands\n');
  } else if (hardCount === 0) {
    process.stdout.write(
      `${colors.yellow}${colors.bold}Verified with ${String(warnCount)} warning(s) — functional but degraded${colors.reset}\n`
    );
    process.stdout.write('\n');
    process.stdout.write('The warnings above indicate reduced functionality but will not\n');
    process.stdout.write('prevent nexus-agents from running. Fix them when convenient.\n');
  } else {
    process.stdout.write(
      `${colors.red}${colors.bold}Verification failed: ${String(hardCount)} blocking issue(s), ${String(warnCount)} warning(s)${colors.reset}\n`
    );
    process.stdout.write('\n');
    process.stdout.write('Please fix the blocking issues above and try again.\n');
  }

  process.stdout.write('\n');

  if (verbose) {
    process.stdout.write(`${colors.dim}Duration: ${String(result.durationMs)}ms${colors.reset}\n`);
    process.stdout.write('\n');
  }
}

/**
 * Runs the verify command and prints results.
 *
 * Exit codes:
 * - `0`: all checks passed, or only `warn`-severity checks failed (degraded
 *   but functional)
 * - `1`: at least one `hard`-severity check failed (broken install)
 */
export async function verifyCommand(options: VerifyOptions): Promise<number> {
  const result = await runVerify();
  printVerifyResult(result, options.verbose);
  return result.noHardFailures ? 0 : 1;
}
