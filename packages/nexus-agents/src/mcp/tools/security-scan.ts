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

/** Validate that target path is safe (no traversal). */
function validateTargetPath(target: string): string {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve('/'))) {
    throw new Error('Invalid target path');
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
  const targetDir = validateTargetPath(input.target);

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
