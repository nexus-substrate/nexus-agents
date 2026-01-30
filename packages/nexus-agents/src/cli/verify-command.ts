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

/**
 * Verify command options.
 */
export interface VerifyOptions {
  readonly verbose: boolean;
}

/**
 * Single verification check result.
 */
export interface VerifyCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly message: string;
  readonly fix?: string;
}

/**
 * Complete verification result.
 */
export interface VerifyResult {
  readonly version: string;
  readonly nodeVersion: string;
  readonly checks: readonly VerifyCheck[];
  readonly allPassed: boolean;
  readonly durationMs: number;
}

/**
 * ANSI color codes for terminal output.
 */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const;

/**
 * Symbols for status output.
 */
const symbols = {
  check: process.platform === 'win32' ? '[OK]' : '✓',
  cross: process.platform === 'win32' ? '[!!]' : '✗',
};

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
    return {
      name: 'Configuration',
      passed: true, // Still works with defaults
      message: 'Using default configuration',
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
 * Runs all verification checks.
 */
export function runVerify(): Promise<VerifyResult> {
  const time = getTimeProvider();
  const startTime = time.now();

  const checks: VerifyCheck[] = [
    checkNodeVersion(),
    checkPackageExports(),
    checkConfigLoading(),
    checkExpertSystem(),
  ];

  const allPassed = checks.every((c) => c.passed);
  const durationMs = time.now() - startTime;

  return Promise.resolve({
    version: VERSION,
    nodeVersion: process.version,
    checks,
    allPassed,
    durationMs,
  });
}

/**
 * Formats a single check result.
 */
function formatCheck(check: VerifyCheck): string {
  const symbol = check.passed
    ? `${colors.green}${symbols.check}${colors.reset}`
    : `${colors.red}${symbols.cross}${colors.reset}`;

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
  } else {
    const failedCount = result.checks.filter((c) => !c.passed).length;
    process.stdout.write(
      `${colors.red}${colors.bold}Verification failed: ${String(failedCount)} issue(s) found${colors.reset}\n`
    );
    process.stdout.write('\n');
    process.stdout.write('Please fix the issues above and try again.\n');
  }

  process.stdout.write('\n');

  if (verbose) {
    process.stdout.write(`${colors.dim}Duration: ${String(result.durationMs)}ms${colors.reset}\n`);
    process.stdout.write('\n');
  }
}

/**
 * Runs the verify command and prints results.
 * Returns exit code (0 = success, 1 = failure).
 */
export async function verifyCommand(options: VerifyOptions): Promise<number> {
  const result = await runVerify();
  printVerifyResult(result, options.verbose);
  return result.allPassed ? 0 : 1;
}
