/**
 * Security Scan Tool (#1683)
 *
 * Runs a SAST scanner (Semgrep) against a local codebase and returns
 * structured findings via the SARIF parser. Part of the Proactive
 * Defensive Security epic (#1681).
 *
 * @module mcp/tools/security-scan
 */

import type { SecurityScanInput } from './security-scan-types.js';
import { parseSarif } from '../../security/sarif-parser.js';
import type { SarifParseResult } from '../../security/sarif-types.js';
import { createLogger } from '../../core/index.js';
import * as path from 'node:path';

const logger = createLogger({ component: 'security-scan' });

/** Timeout for scanner execution (5 minutes). */
const SCAN_TIMEOUT_MS = 300_000;

/** Check if semgrep is available. */
async function isSemgrepAvailable(): Promise<boolean> {
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);
    await exec('semgrep', ['--version'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/** Run semgrep and return raw SARIF JSON output. */
async function runSemgrep(targetDir: string, rulesets: readonly string[]): Promise<string> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);

  const args = ['--sarif', '--quiet', ...rulesets.flatMap((r) => ['--config', r]), targetDir];

  const { stdout } = await exec('semgrep', args, {
    timeout: SCAN_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024, // 10MB for large SARIF output
  });

  return stdout;
}

/**
 * Validate that target path is safe (no traversal).
 *
 * Security: the target must resolve inside the current working directory.
 * The previous check `resolved.startsWith(path.resolve('/'))` was
 * effectively a no-op on POSIX (every absolute path starts with `/`).
 * (#1913 Class D — path traversal gap.)
 */
function validateTargetPath(target: string): string {
  const root = path.resolve(process.cwd());
  const resolved = path.resolve(root, target);
  // Require resolved path to be inside cwd (or cwd itself).
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Invalid target path: must resolve inside ${root} (got ${resolved})`);
  }
  return resolved;
}

/**
 * Execute a security scan against a local codebase.
 *
 * @param input - Scan configuration
 * @returns Parsed SARIF findings or error message
 */
export async function executeSecurityScan(
  input: SecurityScanInput
): Promise<SarifParseResult | { error: string }> {
  let targetDir: string;
  try {
    targetDir = validateTargetPath(input.target);
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  logger.info('Starting security scan', {
    target: targetDir,
    scanner: input.scanner,
    rulesets: input.rulesets,
  });

  const available = await isSemgrepAvailable();
  if (!available) {
    return {
      error: 'semgrep is not installed. Install with: pip install semgrep',
    };
  }

  try {
    const sarifOutput = await runSemgrep(targetDir, input.rulesets);
    const result = parseSarif(sarifOutput, input.maxFindings);

    logger.info('Security scan completed', {
      scanner: result.scanner,
      findings: result.totalFindings,
      errors: result.errors.length,
    });

    return result;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn('Security scan failed', { error: msg });
    return { error: `Scan failed: ${msg.slice(0, 500)}` };
  }
}
